#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

import { PROGRESS_DIR, PROJECT_ROOT, RESULTS_DIR } from "./paths.js";

dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });
dotenv.config();

export class EntityResultViewModel {
  constructor(data = {}) {
    Object.assign(this, data);
  }

  get name() {
    return this.title?.text ?? "";
  }

  get location() {
    return this.primarySubtitle?.text ?? "";
  }

  get followers() {
    return this.secondarySubtitle?.text ?? "";
  }

  get description() {
    return this.summary?.text ?? "";
  }

  get logoUrl() {
    if (!Array.isArray(this.image?.attributes)) {
      return "";
    }
    for (const attr of this.image.attributes) {
      const detail = attr?.detailData ?? {};
      const vectorArtifacts =
        detail.nonEntityCompanyLogo?.vectorImage?.artifacts ?? [];
      for (const artifact of vectorArtifacts) {
        if (artifact?.fileIdentifyingUrlPathSegment) {
          return artifact.fileIdentifyingUrlPathSegment;
        }
      }
      if (detail.imageUrl) {
        return detail.imageUrl;
      }
      if (detail.companyLogo?.imageUrl) {
        return detail.companyLogo.imageUrl;
      }
    }
    return "";
  }

  get companyId() {
    const urn = this.trackingUrn ?? "";
    return urn.includes(":") ? urn.split(":").at(-1) ?? "" : "";
  }

  toDict() {
    return {
      name: this.name,
      company_id: this.companyId,
      tracking_urn: this.trackingUrn ?? "",
      tracking_id: this.trackingId ?? "",
      entity_urn: this.entityUrn ?? "",
      description: this.description,
      followers: this.followers,
      location: this.location,
      url: this.navigationUrl ?? "",
      logo_url: this.logoUrl,
      bserp_entity_navigational_url: this.bserpEntityNavigationalUrl ?? "",
      template: this.template ?? "",
      badge_text: this.badgeText ?? "",
      actor_insights_count: Array.isArray(this.actorInsights)
        ? this.actorInsights.length
        : 0,
      primary_actions_count: Array.isArray(this.primaryActions)
        ? this.primaryActions.length
        : 0,
      add_entity_to_search_history: this.addEntityToSearchHistory ?? null,
      show_additional_cluster: this.showAdditionalCluster ?? null
    };
  }

  toMinimalDict() {
    return {
      company_name: this.name,
      industry_location: this.location,
      followers: this.followers,
      description: this.description,
      logo_url: this.logoUrl,
      company_page_url: this.navigationUrl ?? "",
      company_urn: this.trackingUrn ?? ""
    };
  }
}

export class GeoResult {
  constructor(data = {}) {
    Object.assign(this, data);
  }

  get geoId() {
    if (typeof this.fsdGeoUrn === "string" && this.fsdGeoUrn.includes(":")) {
      return this.fsdGeoUrn.split(":").at(-1) ?? "";
    }
    if (typeof this.trackingUrn === "string" && this.trackingUrn.includes(":")) {
      return this.trackingUrn.split(":").at(-1) ?? "";
    }
    return "";
  }
}

export const GEO_URN_MAP = {
  india: "105214829",
  mumbai: "106164952",
  delhi: "106166691",
  bengaluru: "105940533",
  bangalore: "105940533",
  chennai: "106888327",
  hyderabad: "106694358",
  pune: "106732087",
  kolkata: "105763473",
  ahmedabad: "105186582",
  kochi: "105968639",
  coimbatore: "106072425",
  jaipur: "105848183",
  chandigarh: "106094370",
  gurugram: "106165353",
  gurgaon: "106165353",
  noida: "106693232",
  thane: "106846986",
  "navi mumbai": "102956297",
  usa: "103644278",
  "united states": "103644278",
  "new york": "105080838",
  "san francisco bay area": "90000084",
  london: "101165590",
  "united kingdom": "101165590",
  singapore: "104738515",
  dubai: "106481873",
  uae: "106481873"
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function _resolveGeoUrn(location) {
  if (!location) {
    return null;
  }
  const stripped = String(location).trim();
  if (/^\d+$/.test(stripped)) {
    return stripped;
  }
  return GEO_URN_MAP[stripped.toLowerCase()] ?? null;
}

export function _extractGeoCity(geoTitle) {
  return String(geoTitle ?? "").split(",")[0].trim();
}

export function _extractLocationWords(text) {
  return new Set(
    String(text ?? "")
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.replace(/^[,\s.-]+|[,\s.-]+$/g, ""))
      .filter((word) => word.length >= 3)
  );
}

export function matchesGeoFilter(company, geoFilterWords) {
  const subtitle = company?.primarySubtitle?.text ?? company?.location ?? "";
  if (!subtitle) {
    return false;
  }
  const subtitleWords = _extractLocationWords(subtitle);
  const subtitleLower = subtitle.toLowerCase();
  for (const word of geoFilterWords) {
    if (subtitleWords.has(word) || subtitleLower.includes(word)) {
      return true;
    }
  }
  return false;
}

function hydrateCompany(item) {
  return new EntityResultViewModel(item);
}

function normalizeSearchResponse(raw) {
  const payload = raw?.data?.data?.searchDashClustersByAll ?? {};
  const included = Array.isArray(raw?.included) ? raw.included : [];
  const companies = included
    .filter((item) => String(item?.$type ?? "").includes("EntityResultViewModel"))
    .map(hydrateCompany);

  return {
    metadata: {
      totalResultCount: payload?.metadata?.totalResultCount ?? 0,
      searchId: payload?.metadata?.searchId ?? "",
      primaryResultType: payload?.metadata?.primaryResultType ?? null,
      filterAppliedCount: payload?.metadata?.filterAppliedCount ?? null,
      blockedQuery: payload?.metadata?.blockedQuery ?? null,
      queryType: payload?.metadata?.queryType ?? null,
      paginationToken: payload?.metadata?.paginationToken ?? null,
      entityActionButtonStyle: payload?.metadata?.entityActionButtonStyle ?? null,
      clusterTitleFontSize: payload?.metadata?.clusterTitleFontSize ?? null
    },
    paging: {
      count: payload?.paging?.count ?? 0,
      start: payload?.paging?.start ?? 0,
      total: payload?.paging?.total ?? 0
    },
    companies
  };
}

function normalizeGeoResponse(raw) {
  const dataSection = raw?.data?.data ?? {};
  const typeahead =
    dataSection.searchDashReusableTypeahead ??
    dataSection.searchDashReusableTypeaheadByType ??
    {};
  const elements = Array.isArray(typeahead.elements) ? typeahead.elements : [];
  return {
    locations: elements.map(
      (elem) =>
        new GeoResult({
          title:
            typeof elem?.title === "object" ? elem.title?.text ?? "" : String(elem?.title ?? ""),
          subtitle:
            typeof elem?.subtitle === "object"
              ? elem.subtitle?.text ?? ""
              : String(elem?.subtitle ?? ""),
          trackingUrn: elem?.trackingUrn ?? "",
          entityUrn: elem?.entityUrn ?? "",
          type: String(elem?.$type ?? "").split(".").at(-1) ?? "",
          fsdGeoUrn: elem?.target?.["*geo"] ?? ""
        })
    ),
    rawCount: elements.length
  };
}

function makeTrackPayload() {
  const timezones = ["Asia/Kolkata", "America/New_York", "Europe/London", "Asia/Tokyo"];
  const timezone = timezones[Math.floor(Math.random() * timezones.length)];
  const offsetMap = {
    "Asia/Kolkata": 5.5,
    "America/New_York": -5,
    "Europe/London": 0,
    "Asia/Tokyo": 9
  };
  const displayWidth = [1920, 2560, 1366, 1440][Math.floor(Math.random() * 4)];
  const displayHeight = [1080, 1440, 768, 900][Math.floor(Math.random() * 4)];
  return {
    clientVersion: "1.13.43510",
    mpVersion: "1.13.43510",
    osName: "web",
    timezoneOffset: offsetMap[timezone],
    timezone,
    deviceFormFactor: "DESKTOP",
    mpName: "voyager-web",
    displayDensity: displayWidth <= 1920 ? 1 : 2,
    displayWidth,
    displayHeight
  };
}

function buildAntiBotHeaders({ keywords, pageInstance, geoUrn } = {}) {
  let resolvedPageInstance = pageInstance;
  if (!resolvedPageInstance) {
    resolvedPageInstance = Buffer.from("j8aQsSy5Q4OMnvQZbAdDTA==", "base64")
      .toString("hex")
      .slice(0, 20);
  }

  const headers = {
    Accept: "application/vnd.linkedin.normalized+json+2.1",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    Pragma: "no-cache",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64; rv:148.0) Gecko/20100101 Firefox/148.0",
    "x-li-lang": "en_US",
    "x-li-page-instance": `urn:li:page:d_flagship3_search_srp_companies;${resolvedPageInstance}`,
    "x-li-pem-metadata": "Voyager - Companies SRP=search-results",
    "x-li-track": JSON.stringify(makeTrackPayload()),
    "x-restli-protocol-version": "2.0.0"
  };

  if (keywords) {
    if (geoUrn) {
      headers.Referer =
        `https://www.linkedin.com/search/results/companies/?companyHqGeo=%5B%22${geoUrn}%22%5D` +
        `&keywords=${keywords}&origin=FACETED_SEARCH&sid=E%40a`;
    } else {
      headers.Referer =
        `https://www.linkedin.com/search/results/companies/?keywords=${keywords}` +
        "&origin=GLOBAL_SEARCH_HEADER";
    }
  }

  return headers;
}

async function maybeLoadMockResponse(type) {
  const envKey =
    type === "search"
      ? "LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE"
      : "LINKEDIN_SCRAPER_MOCK_GEO_RESPONSE_FILE";
  const mockPath = process.env[envKey];
  if (!mockPath) {
    return null;
  }
  const content = await fs.readFile(mockPath, "utf8");
  return JSON.parse(content);
}

async function requestJson(url, { headers }) {
  const response = await fetch(url, { headers, method: "GET" });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} — ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON response: ${error.message}`);
  }
}

export async function searchGeoLocations({
  keywords,
  cookie,
  csrfToken
}) {
  const mock = await maybeLoadMockResponse("geo");
  if (mock) {
    return normalizeGeoResponse(mock);
  }

  if (process.env.LINKEDIN_SCRAPER_DISABLE_SLEEP !== "1") {
    await sleep(500 + Math.random() * 1500);
  }

  const variablesRaw =
    `(keywords:${keywords},query:(typeaheadFilterQuery:(geoSearchTypes:List(` +
    "MARKET_AREA,COUNTRY_REGION,ADMIN_DIVISION_1,CITY))),type:GEO)";
  const variablesEncoded = variablesRaw.replaceAll(" ", "%20");
  const url =
    "https://www.linkedin.com/voyager/api/graphql" +
    `?variables=${variablesEncoded}` +
    "&queryId=voyagerSearchDashReusableTypeahead.4c7caa85341b17b470153ad3d1a29caf";

  const headers = buildAntiBotHeaders();
  headers.Cookie = cookie ?? process.env.LI_COOKIE ?? "";
  if (csrfToken ?? process.env.LI_CSRF_TOKEN) {
    headers["csrf-token"] = csrfToken ?? process.env.LI_CSRF_TOKEN ?? "";
  }

  const raw = await requestJson(url, { headers });
  return normalizeGeoResponse(raw);
}

export async function searchCompanies({
  keywords,
  location = null,
  start = 0,
  count = 10,
  cookie,
  csrfToken
}) {
  const mock = await maybeLoadMockResponse("search");
  if (mock) {
    return [normalizeSearchResponse(mock), mock];
  }

  const geoUrn = _resolveGeoUrn(location);
  const queryParts = [];
  if (geoUrn) {
    queryParts.push(`(key:companyHqGeo,value:List(${geoUrn}))`);
  }
  queryParts.push("(key:resultType,value:List(COMPANIES))");
  const params = `,queryParameters:List(${queryParts.join(",")})`;
  const origin = geoUrn ? "FACETED_SEARCH" : "GLOBAL_SEARCH_HEADER";

  const variablesRaw =
    `(start:${start},origin:${origin},query:(keywords:${keywords},` +
    `flagshipSearchIntent:SEARCH_SRP${params},includeFiltersInResponse:false))`;
  const variablesEncoded = variablesRaw.replaceAll(" ", "%20");
  const url =
    "https://www.linkedin.com/voyager/api/graphql" +
    `?includeWebMetadata=true&variables=${variablesEncoded}` +
    "&queryId=voyagerSearchDashClusters.843215f2a3455f1bed85762a45d71be8";

  if (process.env.LINKEDIN_SCRAPER_DISABLE_SLEEP !== "1") {
    await sleep(500 + Math.random() * 1500);
  }

  const headers = buildAntiBotHeaders({ keywords, geoUrn });
  headers.Cookie = cookie ?? process.env.LI_COOKIE ?? "";
  if (csrfToken ?? process.env.LI_CSRF_TOKEN) {
    headers["csrf-token"] = csrfToken ?? process.env.LI_CSRF_TOKEN ?? "";
  }

  const raw = await requestJson(url, { headers });
  return [normalizeSearchResponse(raw), raw];
}

export function printGeoResults(results) {
  console.log(`\n📍 Geo locations matching keywords: ${results.rawCount} found`);
  console.log("─".repeat(110));
  console.log(
    `${"#".padEnd(4)} ${"Name".padEnd(35)} ${"Geo ID".padEnd(12)} ${"Tracking URN".padEnd(25)} FSD Geo URN`
  );
  console.log("-".repeat(130));
  results.locations.forEach((loc, index) => {
    console.log(
      `${String(index + 1).padEnd(4)} ${String(loc.title ?? "").padEnd(35)} ${String(
        loc.geoId
      ).padEnd(12)} ${String(loc.trackingUrn ?? "").padEnd(25)} ${String(loc.fsdGeoUrn ?? "")}`
    );
  });
}

export function printResults(results) {
  console.log(`\nTotal results: ${results.metadata.totalResultCount}`);
  console.log(`Search ID: ${results.metadata.searchId}`);
  if (results.metadata.primaryResultType) {
    console.log(`Result type: ${results.metadata.primaryResultType}`);
  }
  if (results.metadata.filterAppliedCount) {
    console.log(`Filters applied: ${results.metadata.filterAppliedCount}`);
  }
  console.log(
    `Showing: ${results.paging.start + 1}–${results.paging.start + results.companies.length}\n`
  );

  results.companies.forEach((company, index) => {
    const data = company.toDict();
    console.log("─".repeat(80));
    console.log(`  #${index + 1}`);
    console.log(`  Name:          ${data.name}`);
    console.log(`  Company ID:    ${data.company_id}`);
    console.log(`  Followers:     ${data.followers}`);
    console.log(`  Location:      ${data.location}`);
    const description =
      data.description.length > 120
        ? `${data.description.slice(0, 120)}...`
        : data.description;
    console.log(`  Description:   ${description}`);
    console.log(`  URL:           ${data.url}`);
    console.log(`  Logo:          ${data.logo_url}`);
    console.log(`  Tracking URN:  ${data.tracking_urn}`);
    console.log(`  Entity URN:    ${data.entity_urn}`);
    console.log(`  Template:      ${data.template}`);
    if (data.badge_text) {
      console.log(`  Badge:         ${data.badge_text}`);
    }
    console.log(`  Insights:      ${data.actor_insights_count}`);
  });
}

export function printCompanies(companies, start = 0) {
  console.log(
    `${"#".padEnd(4)} ${"Company".padEnd(45)} ${"Followers".padEnd(14)} ${"Location".padEnd(
      35
    )} ${"ID".padEnd(12)} URL`
  );
  console.log("-".repeat(160));
  companies.forEach((company, index) => {
    console.log(
      `${String(start + index + 1).padEnd(4)} ${company.name.padEnd(45)} ${company.followers.padEnd(
        14
      )} ${company.location.padEnd(35)} ${company.companyId.padEnd(12)} ${company.navigationUrl ?? ""}`
    );
  });
}

export async function fetchAllCompanies({
  keywords,
  location = null,
  cookie,
  csrfToken,
  delay = 5,
  maxRetries = 3
}) {
  const allCompanies = [];
  const seenUrls = new Set();
  let page = 0;
  const perPage = 10;

  while (true) {
    let fetched = false;
    let result;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        [result] = await searchCompanies({
          keywords,
          location,
          start: page * perPage,
          count: perPage,
          cookie,
          csrfToken
        });

        if (page === 0) {
          console.log(`\nFetching all companies for '${keywords}'`);
          console.log(`Total results: ${result.metadata.totalResultCount}`);
          console.log("");
          printCompanies(result.companies, 0);
        }

        let newCount = 0;
        for (const company of result.companies) {
          const url = company.navigationUrl ?? "";
          if (url && !seenUrls.has(url)) {
            seenUrls.add(url);
            allCompanies.push(company);
            newCount += 1;
          }
        }

        if (newCount < result.companies.length) {
          console.log(`  (${result.companies.length - newCount} duplicates skipped)`);
        }

        fetched = true;
        break;
      } catch (error) {
        const wait = delay * attempt * 2000;
        console.log(`\n  ⚠ Error on page ${page + 1}, attempt ${attempt}: ${error.message}`);
        console.log(`  Retrying in ${wait / 1000}s...`);
        await sleep(wait);
      }
    }

    if (!fetched) {
      console.log("\n  ✗ Failed after retries. Stopping.");
      console.log(`  Fetched ${allCompanies.length} companies before failure.`);
      break;
    }

    page += 1;

    if (page % 20 === 0 && allCompanies.length > 0) {
      await fs.mkdir(PROGRESS_DIR, { recursive: true });
      const tmpPath = path.join(PROGRESS_DIR, "companies_progress.csv");
      await writeCompanies(allCompanies, { outputPath: tmpPath, fmt: "csv" });
      console.log(`\n  [Progress saved: ${allCompanies.length} companies -> ${tmpPath}]`);
    }

    if (result.companies.length < perPage || page >= 100) {
      break;
    }

    console.log(`\n${"—".repeat(60)}`);
    console.log(`Page ${page + 1} (fetched ${allCompanies.length} unique so far)`);
    printCompanies(result.companies, page * perPage);
    await sleep(delay * 1000);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `Done! Fetched ${allCompanies.length} unique companies total across ${page} pages.`
  );
  return allCompanies;
}

export async function writeCompanies(
  companies,
  { outputPath = null, fmt = "csv", minimal = false } = {}
) {
  let targetPath = outputPath;
  if (!targetPath) {
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    targetPath = path.join(RESULTS_DIR, `companies.${fmt}`);
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  if (fmt === "json") {
    const payload = minimal
      ? companies.map((company) => company.toMinimalDict())
      : companies.map((company) => ({
          ...company.toDict(),
          tracking_id: company.trackingId ?? "",
          actor_navigation_url: company.actorNavigationUrl ?? "",
          actor_tracking_urn: company.actorTrackingUrn ?? "",
          badge_data: company.badgeData ?? null,
          ring_status: company.ringStatus ?? null,
          insights_resolution_count: Array.isArray(company.insightsResolutionResults)
            ? company.insightsResolutionResults.length
            : 0,
          overflow_actions_count: Array.isArray(company.overflowActions)
            ? company.overflowActions.length
            : 0,
          lazy_loaded_actions: company["*lazyLoadedActions"] ?? null,
          search_action_type: company.searchActionType ?? null,
          control_name: company.controlName ?? null,
          entity_custom_tracking_info: company.entityCustomTrackingInfo ?? null,
          entity_embedded_object: company.entityEmbeddedObject ?? null,
          interstitial_component: company.interstitialComponent ?? null,
          unread_indicator_details: company.unreadIndicatorDetails ?? null
        }));
    await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } else if (fmt === "csv") {
    const headers = minimal
      ? [
          "company_name",
          "industry_location",
          "followers",
          "description",
          "logo_url",
          "company_page_url",
          "company_urn"
        ]
      : [
          "#",
          "Name",
          "Company ID",
          "Description",
          "Followers",
          "Location",
          "URL",
          "Logo URL",
          "Tracking URN",
          "Entity URN",
          "Tracking ID",
          "BSERP Navigational URL",
          "Actor Navigation URL",
          "Template",
          "Badge Text",
          "Badge Icon",
          "Actor Insights Count",
          "Primary Actions Count",
          "Add to Search History",
          "Show Additional Cluster"
        ];

    const rows = companies.map((company, index) => {
      if (minimal) {
        const data = company.toMinimalDict();
        return headers.map((header) => data[header] ?? "");
      }
      const data = company.toDict();
      return [
        index + 1,
        data.name,
        data.company_id,
        data.description,
        data.followers,
        data.location,
        data.url,
        data.logo_url,
        data.tracking_urn,
        data.entity_urn,
        company.trackingId ?? "",
        company.bserpEntityNavigationalUrl ?? "",
        company.actorNavigationUrl ?? "",
        company.template ?? "",
        company.badgeText ?? "",
        typeof company.badgeIcon === "string" ? company.badgeIcon : JSON.stringify(company.badgeIcon ?? ""),
        data.actor_insights_count,
        data.primary_actions_count,
        data.add_entity_to_search_history,
        data.show_additional_cluster
      ];
    });

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`)
          .join(",")
      )
      .join("\n");
    await fs.writeFile(targetPath, `${csv}\n`, "utf8");
  } else {
    throw new Error(`Unsupported format: ${fmt}. Use 'csv' or 'json'.`);
  }

  console.log(`Written ${companies.length} companies to ${targetPath}`);
  return targetPath;
}

function buildCliParser(argv = process.argv.slice(2)) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      location: { type: "string", short: "l" },
      start: { type: "string", short: "s", default: "0" },
      count: { type: "string", short: "c", default: "10" },
      cookie: { type: "string" },
      csrf: { type: "string" },
      all: { type: "boolean", default: false },
      output: { type: "string", short: "o" },
      delay: { type: "string", default: "3" },
      geo: { type: "string" },
      minimal: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false }
    }
  });
}

function printHelp() {
  console.log(`Search LinkedIn companies with anti-bot protection

Usage:
  node module/linkedin-search.js [keywords] [options]

Options:
  -l, --location LOCATION   City or country name
  -s, --start START         Pagination offset (default: 0)
  -c, --count COUNT         Results per page (default: 10)
      --cookie COOKIE       LinkedIn session cookie
      --csrf CSRF           CSRF token
      --all                 Fetch all results across pages
  -o, --output OUTPUT       Output file path
      --delay DELAY         Delay between pages in seconds (default: 3)
      --geo LOCATION        Look up geo URN via LinkedIn typeahead API
      --minimal             Write minimal fields when saving output
  -h, --help                Show help
`);
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = buildCliParser(argv);
  if (values.help) {
    printHelp();
    return 0;
  }

  if (values.geo) {
    console.log(`🔍 Searching geo locations for: '${values.geo}'`);
    const geoResults = await searchGeoLocations({
      keywords: values.geo,
      cookie: values.cookie,
      csrfToken: values.csrf
    });
    printGeoResults(geoResults);
    return 0;
  }

  const keywords = positionals[0];
  if (!keywords) {
    printHelp();
    return 1;
  }

  if (values.all) {
    const companies = await fetchAllCompanies({
      keywords,
      location: values.location ?? null,
      cookie: values.cookie,
      csrfToken: values.csrf,
      delay: Number(values.delay)
    });
    if (values.output) {
      const fmt = values.output.includes(".")
        ? values.output.split(".").at(-1)
        : "csv";
      await writeCompanies(companies, {
        outputPath: values.output,
        fmt,
        minimal: values.minimal
      });
    }
    return 0;
  }

  const [result] = await searchCompanies({
    keywords,
    location: values.location ?? null,
    start: Number(values.start),
    count: Number(values.count),
    cookie: values.cookie,
    csrfToken: values.csrf
  });
  printResults(result);
  if (values.output) {
    const fmt = values.output.includes(".") ? values.output.split(".").at(-1) : "csv";
    await writeCompanies(result.companies, {
      outputPath: values.output,
      fmt,
      minimal: values.minimal
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
