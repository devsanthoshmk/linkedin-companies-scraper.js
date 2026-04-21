#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

import {
  EntityResultViewModel,
  GEO_URN_MAP,
  _extractGeoCity,
  _extractLocationWords,
  matchesGeoFilter,
  printCompanies,
  searchCompanies,
  searchGeoLocations
} from "./module/linkedin-search.js";
import { RESULTS_DIR, PROJECT_ROOT } from "./module/paths.js";
import {
  extractSession,
  loadCredentials,
  testSessionWithApi
} from "./module/session-extractor.js";

dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });
dotenv.config();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envHasCredentials() {
  return Boolean(process.env.LI_COOKIE && process.env.LI_CSRF_TOKEN);
}

function getCredentials() {
  const cookie = process.env.LI_COOKIE ?? "";
  const csrf = process.env.LI_CSRF_TOKEN ?? "";
  if (!cookie || !csrf) {
    throw new Error("LI_COOKIE or LI_CSRF_TOKEN missing from .env");
  }
  return { cookie, csrf };
}

async function isSessionExpired(cookie, csrf) {
  if (!cookie || !csrf) {
    return true;
  }
  try {
    return !(await testSessionWithApi({ cookie, csrf }));
  } catch {
    return true;
  }
}

async function refreshSession(headless = true) {
  const { email, password } = loadCredentials();
  if (!email || !password) {
    throw new Error("LinkedIn credentials not found. Set LINKEDIN_EMAIL and LINKEDIN_PASSWORD.");
  }
  const session = await extractSession({ email, password, headless });
  dotenv.config({ path: path.join(PROJECT_ROOT, ".env"), override: true });
  return session;
}

export async function ensureSession({ headless = true, forceRefresh = false } = {}) {
  if (forceRefresh || !envHasCredentials()) {
    return refreshSession(headless);
  }

  const { cookie, csrf } = getCredentials();
  if (forceRefresh || (await isSessionExpired(cookie, csrf))) {
    return refreshSession(headless);
  }

  return { cookie, csrfToken: csrf };
}

export async function resolveLocationInteractive(locationQuery, { cookie, csrf } = {}) {
  const key = String(locationQuery).trim().toLowerCase();
  if (GEO_URN_MAP[key]) {
    const city = key.replace(/\b\w/g, (char) => char.toUpperCase());
    return { geoUrn: GEO_URN_MAP[key], geoFilterWords: _extractLocationWords(city) };
  }

  console.log(`\n🔍 Searching LinkedIn for geo locations matching: '${locationQuery}'`);
  let geoResponse;
  try {
    geoResponse = await searchGeoLocations({
      keywords: locationQuery,
      cookie,
      csrfToken: csrf
    });
  } catch (error) {
    console.log(`  ⚠ Geo search failed: ${error.message}`);
    console.log("  Proceeding without location filter.");
    return { geoUrn: null, geoFilterWords: null };
  }

  if (geoResponse.locations.length === 0) {
    console.log(`  ⚠ No geo locations found for '${locationQuery}'.`);
    console.log("  Proceeding without location filter.");
    return { geoUrn: null, geoFilterWords: null };
  }

  console.log(`\n  Found ${geoResponse.rawCount} location(s):\n`);
  console.log(`  ${"#".padEnd(4)} ${"Location".padEnd(45)} ${"Geo ID".padEnd(12)} FSD Geo URN`);
  console.log(`  ${"-".repeat(110)}`);
  geoResponse.locations.forEach((loc, index) => {
    console.log(
      `  ${String(index + 1).padEnd(4)} ${String(loc.title ?? "").padEnd(45)} ${String(
        loc.geoId
      ).padEnd(12)} ${String(loc.fsdGeoUrn ?? "")}`
    );
  });

  if (geoResponse.locations.length === 1) {
        const selected = geoResponse.locations[0];
        const city = _extractGeoCity(selected.title ?? "");
        return {
          geoUrn: selected.geoId || (selected.trackingUrn?.split(":").at(-1) ?? null),
          geoFilterWords: _extractLocationWords(city)
        };
  }

  if (!process.stdin.isTTY || process.env.LINKEDIN_SCRAPER_NONINTERACTIVE === "1") {
    return { geoUrn: null, geoFilterWords: null };
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const choice = (
        await rl.question(
          `\n  Select a location (1-${geoResponse.locations.length}) or 0 to skip: `
        )
      ).trim();
      if (choice === "0") {
        return { geoUrn: null, geoFilterWords: null };
      }
      const index = Number(choice) - 1;
      if (Number.isInteger(index) && index >= 0 && index < geoResponse.locations.length) {
        const selected = geoResponse.locations[index];
        const city = _extractGeoCity(selected.title ?? "");
        return {
          geoUrn: selected.geoId || (selected.trackingUrn?.split(":").at(-1) ?? null),
          geoFilterWords: _extractLocationWords(city)
        };
      }
    }
  } finally {
    rl.close();
  }
}

export async function fetchWithCap({
  keywords,
  location = null,
  cap = null,
  cookie = null,
  csrf = null,
  delay = 5,
  maxRetries = 3,
  verbose = true,
  geoFilterWords = null
}) {
  const result = {
    companies: [],
    totalAvailable: 0,
    fetched: 0,
    rawResponses: []
  };
  const seenUrls = new Set();
  let page = 0;
  const perPage = 10;
  let geoFilteredOut = 0;

  if (verbose) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔍 Searching: "${keywords}"`);
    if (location) {
      console.log(`📍 Location: ${location}`);
    }
    if (geoFilterWords?.size) {
      console.log(`🗺️  Geo filter: ${Array.from(geoFilterWords).sort().join(" ")}`);
    }
    console.log(cap ? `📊 Cap: ${cap} companies` : "📊 Fetching ALL results");
    console.log(`${"=".repeat(60)}\n`);
  }

  while (true) {
    if (cap && result.fetched >= cap) {
      break;
    }

    const remaining = cap ? cap - result.fetched : perPage;
    const requestCount = cap ? Math.min(perPage, remaining) : perPage;
    let fetched = false;
    let lastResponse = null;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const [response, raw] = await searchCompanies({
          keywords,
          location,
          start: page * perPage,
          count: requestCount,
          cookie,
          csrfToken: csrf
        });
        result.rawResponses.push(raw);
        lastResponse = response;

        if (page === 0) {
          result.totalAvailable = response.metadata.totalResultCount;
          if (verbose) {
            console.log(`Total results on LinkedIn: ${result.totalAvailable}\n`);
          }
        }

        const newCompanies = [];
        for (const company of response.companies) {
          const url = company.navigationUrl ?? "";
          if (!url || seenUrls.has(url)) {
            continue;
          }
          seenUrls.add(url);

          if (geoFilterWords?.size && !matchesGeoFilter(company, geoFilterWords)) {
            geoFilteredOut += 1;
            continue;
          }

          newCompanies.push(company);
          result.fetched += 1;

          if (cap && result.fetched >= cap) {
            break;
          }
        }

        result.companies.push(...newCompanies);
        if (verbose && newCompanies.length > 0) {
          printCompanies(newCompanies, result.fetched - newCompanies.length);
        }
        fetched = true;
        break;
      } catch (error) {
        const wait = delay * attempt * 1000;
        if (/HTTP 401|HTTP 403/u.test(error.message)) {
          throw error;
        }
        if (verbose) {
          console.log(`\n  ⚠ Error on page ${page + 1}, attempt ${attempt}: ${error.message}`);
          console.log(`  Retrying in ${wait / 1000}s...`);
        }
        await sleep(wait);
      }
    }

    if (!fetched) {
      break;
    }

    if (verbose && lastResponse) {
      const totalSkipped = lastResponse.companies.length - (result.companies.length - page * perPage);
      if (totalSkipped > 0) {
        const reasons = [];
        if (geoFilteredOut > 0) {
          reasons.push(`${geoFilteredOut} geo-filtered`);
        }
        const dupes = totalSkipped - geoFilteredOut;
        if (dupes > 0) {
          reasons.push(`${dupes} duplicates`);
        }
        if (reasons.length > 0) {
          console.log(`  (${reasons.join(", ")} skipped)`);
        }
      }
    }

    page += 1;
    if (page >= 100) {
      break;
    }

    if (lastResponse && lastResponse.companies.length < requestCount) {
      break;
    }

    if (verbose) {
      console.log(`\n${"—".repeat(60)}`);
      console.log(`Page ${page + 1} — ${result.fetched} unique so far`);
      await sleep(delay * 1000);
    }
  }

  if (verbose) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`✅ Done! Fetched ${result.fetched} unique companies.`);
    if (result.totalAvailable) {
      console.log(`   (LinkedIn shows ${result.totalAvailable} total — capped by visibility)`);
    }
    console.log(`${"=".repeat(60)}\n`);
  }

  return result;
}

function slugify(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "search";
}

export async function resolveOutputPath(output, { keywords, location, fmt = "json" } = {}) {
  if (!output) {
    const now = new Date();
    const stamp =
      `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
        now.getDate()
      ).padStart(2, "0")}` +
      `_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(
        2,
        "0"
      )}${String(now.getSeconds()).padStart(2, "0")}`;
    const parts = [];
    if (keywords) {
      parts.push(slugify(keywords));
    }
    if (location) {
      parts.push(slugify(location));
    }
    const base = parts.length > 0 ? parts.join("_") : "linkedin_companies";
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    output = path.join(RESULTS_DIR, `${base}_${stamp}.${fmt}`);
  }

  await fs.mkdir(path.dirname(output), { recursive: true });
  return output;
}

export async function saveResults(
  companies,
  {
    keywords = null,
    location = null,
    output = null,
    rawResponses = null,
    minimal = true,
    verbose = true
  } = {}
) {
  if (!companies.length) {
    return "";
  }

  const filePath = await resolveOutputPath(output, { keywords, location, fmt: "json" });
  const payload = minimal
    ? companies.map((company) => company.toMinimalDict())
    : rawResponses
      ? {
          search_query: keywords,
          location,
          total_pages_fetched: rawResponses.length,
          total_companies: companies.length,
          pages: rawResponses
        }
      : companies.map((company) => company.toDict());

  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  if (verbose) {
    console.log(`💾 Saved ${companies.length} companies -> ${filePath}`);
  }
  return filePath;
}

function printHelp() {
  console.log(`LinkedIn Company Scraper with automatic session management

Usage:
  node scraper.js [keywords] [options]

Options:
  -l, --location LOCATION   City or country query
      --cap N               Maximum number of companies to fetch
      --all                 Fetch all visible results
  -o, --output PATH         Output JSON path
      --delay FLOAT         Delay between pages in seconds (default: 5)
      --max-retries INT     Retries per page (default: 3)
      --refresh-session     Force a fresh session before searching
      --headless            Run browser headless during refresh
      --test-session        Validate session and exit
      --list-geos           Print built-in geo map and exit
      --full                Save full raw API pages instead of minimal JSON
  -h, --help                Show help
`);
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      location: { type: "string", short: "l" },
      cap: { type: "string" },
      all: { type: "boolean", default: false },
      output: { type: "string", short: "o" },
      delay: { type: "string", default: "5" },
      "max-retries": { type: "string", default: "3" },
      "refresh-session": { type: "boolean", default: false },
      headless: { type: "boolean", default: false },
      "test-session": { type: "boolean", default: false },
      "list-geos": { type: "boolean", default: false },
      full: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false }
    }
  });

  if (values.help) {
    printHelp();
    return 0;
  }

  if (values["list-geos"]) {
    console.log("\n📍 Supported Geo Locations:\n");
    console.log(`${"Location".padEnd(30)} URN ID`);
    console.log("-".repeat(60));
    Object.entries(GEO_URN_MAP)
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([location, urn]) => {
        console.log(`${location.padEnd(30)} ${urn}`);
      });
    return 0;
  }

  if (values["test-session"]) {
    let cookie;
    let csrf;
    if (!envHasCredentials()) {
      const refreshed = await refreshSession(values.headless);
      cookie = refreshed.cookie;
      csrf = refreshed.csrfToken;
    } else {
      ({ cookie, csrf } = getCredentials());
    }
    return (await testSessionWithApi({ cookie, csrf })) ? 0 : 1;
  }

  const keywords = positionals[0];
  if (!keywords) {
    printHelp();
    return 1;
  }

  const session = await ensureSession({
    headless: values.headless,
    forceRefresh: values["refresh-session"]
  });

  let geoUrn = null;
  let geoFilterWords = null;
  const locationDisplay = values.location ?? null;
  if (values.location) {
    const resolved = await resolveLocationInteractive(values.location, {
      cookie: session.cookie,
      csrf: session.csrfToken
    });
    geoUrn = resolved.geoUrn;
    geoFilterWords = resolved.geoFilterWords;
  }

  let result;
  try {
    result = await fetchWithCap({
      keywords,
      location: geoUrn,
      cap: values.cap ? Number(values.cap) : null,
      cookie: session.cookie,
      csrf: session.csrfToken,
      delay: Number(values.delay),
      maxRetries: Number(values["max-retries"]),
      geoFilterWords
    });
  } catch (error) {
    if (/HTTP 401|HTTP 403/u.test(error.message)) {
      const refreshed = await refreshSession(values.headless);
      result = await fetchWithCap({
        keywords,
        location: geoUrn,
        cap: values.cap ? Number(values.cap) : null,
        cookie: refreshed.cookie,
        csrf: refreshed.csrfToken,
        delay: Number(values.delay),
        maxRetries: Number(values["max-retries"]),
        geoFilterWords
      });
    } else {
      throw error;
    }
  }

  if (result.companies.length > 0) {
    await saveResults(result.companies, {
      keywords,
      location: locationDisplay,
      output: values.output ?? null,
      rawResponses: result.rawResponses,
      minimal: !values.full
    });
  }

  return 0;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error.message);
      process.exitCode = 1;
    }
  );
}
