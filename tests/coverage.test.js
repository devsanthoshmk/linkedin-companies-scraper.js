import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";

import * as publicApi from "../module/index.js";
import {
  EntityResultViewModel,
  GeoResult,
  fetchAllCompanies,
  main as searchMain,
  printCompanies,
  printGeoResults,
  printResults,
  searchCompanies
} from "../module/linkedin-search.js";
import {
  REALISTIC_USER_AGENT,
  STEALTH_SCRIPT,
  extractSession,
  main as sessionMain,
  updateEnvFile
} from "../module/session-extractor.js";
import {
  ensureSession,
  main as scraperMain,
  resolveLocationInteractive
} from "../scraper.js";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const fixturesDir = path.join(root, "tests", "fixtures");
const mockSearchResponse = path.join(fixturesDir, "mock-search-response.json");
const mockGeoResponse = path.join(fixturesDir, "mock-geo-response.json");

function withMockEnv(overrides = {}) {
  return {
    ...process.env,
    LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE: mockSearchResponse,
    LINKEDIN_SCRAPER_MOCK_GEO_RESPONSE_FILE: mockGeoResponse,
    LINKEDIN_SCRAPER_DISABLE_SLEEP: "1",
    LINKEDIN_SCRAPER_NONINTERACTIVE: "1",
    LI_COOKIE: "li_at=token",
    LI_CSRF_TOKEN: "ajax:123",
    ...overrides
  };
}

async function runNode(args, env = {}) {
  return execFileAsync(process.execPath, args, {
    cwd: root,
    env: withMockEnv(env)
  });
}

test("public module index re-exports expected API surface", () => {
  const requiredExports = [
    "EntityResultViewModel",
    "GeoResult",
    "GEO_URN_MAP",
    "PROJECT_ROOT",
    "RESULTS_DIR",
    "PROGRESS_DIR",
    "SESSION_DIR",
    "searchCompanies",
    "searchGeoLocations",
    "fetchAllCompanies",
    "writeCompanies",
    "loadCredentials",
    "formatCookieString",
    "extractSession",
    "testSessionWithApi",
    "updateEnvFile"
  ];

  for (const key of requiredExports) {
    assert.ok(key in publicApi, `missing export: ${key}`);
  }
});

test("EntityResultViewModel and GeoResult serialize convenience fields", () => {
  const company = new EntityResultViewModel({
    title: { text: "Acme Realty" },
    primarySubtitle: { text: "Chennai, Tamil Nadu, India" },
    secondarySubtitle: { text: "10,000 followers" },
    summary: { text: "Commercial real estate company" },
    navigationUrl: "https://www.linkedin.com/company/acme-realty",
    trackingUrn: "urn:li:company:111",
    image: {
      attributes: [{ detailData: { imageUrl: "https://cdn.example.com/acme.png" } }]
    }
  });
  const geo = new GeoResult({
    title: "Chennai, Tamil Nadu, India",
    trackingUrn: "urn:li:geo:106888327",
    fsdGeoUrn: "urn:li:fsd_geo:106888327"
  });

  assert.equal(company.toMinimalDict().company_name, "Acme Realty");
  assert.equal(company.toDict().company_id, "111");
  assert.equal(geo.geoId, "106888327");
});

test("print helpers emit readable output", async () => {
  process.env.LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE = mockSearchResponse;
  process.env.LINKEDIN_SCRAPER_MOCK_GEO_RESPONSE_FILE = mockGeoResponse;
  const [result] = await searchCompanies({ keywords: "Real Estate" });
  const originalLog = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.join(" "));
  };
  try {
    printResults(result);
    printCompanies(result.companies, 0);
    printGeoResults({
      rawCount: 1,
      locations: [new GeoResult({ title: "Chennai", fsdGeoUrn: "urn:li:fsd_geo:106888327" })]
    });
  } finally {
    console.log = originalLog;
    delete process.env.LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE;
    delete process.env.LINKEDIN_SCRAPER_MOCK_GEO_RESPONSE_FILE;
  }

  const output = lines.join("\n");
  assert.match(output, /Total results:/);
  assert.match(output, /Acme Realty/);
  assert.match(output, /Geo locations matching keywords/);
});

test("fetchAllCompanies returns deduplicated records under mock response", async () => {
  process.env.LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE = mockSearchResponse;
  process.env.LINKEDIN_SCRAPER_DISABLE_SLEEP = "1";
  const companies = await fetchAllCompanies({
    keywords: "Real Estate",
    delay: 0,
    maxRetries: 1
  });
  assert.equal(companies.length, 2);
  delete process.env.LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE;
  delete process.env.LINKEDIN_SCRAPER_DISABLE_SLEEP;
});

test("updateEnvFile writes LI_COOKIE and LI_CSRF_TOKEN in project root env file", async () => {
  const envPath = path.join(root, ".env");
  const previous = await fs.readFile(envPath, "utf8");
  try {
    await updateEnvFile("li_at=test-token", "ajax:test-token");
    const current = await fs.readFile(envPath, "utf8");
    assert.match(current, /LI_COOKIE=li_at=test-token/);
    assert.match(current, /LI_CSRF_TOKEN=ajax:test-token/);
  } finally {
    await fs.writeFile(envPath, previous, "utf8");
  }
});

test("extractSession fails clearly when credentials are unavailable", async () => {
  const originalEmail = process.env.LINKEDIN_EMAIL;
  const originalUsername = process.env.LINKEDIN_USERNAME;
  const originalPassword = process.env.LINKEDIN_PASSWORD;
  delete process.env.LINKEDIN_EMAIL;
  delete process.env.LINKEDIN_USERNAME;
  delete process.env.LINKEDIN_PASSWORD;

  try {
    await assert.rejects(
      () => extractSession({ headless: true }),
      /LinkedIn credentials not found/
    );
  } finally {
    if (originalEmail !== undefined) process.env.LINKEDIN_EMAIL = originalEmail;
    if (originalUsername !== undefined) process.env.LINKEDIN_USERNAME = originalUsername;
    if (originalPassword !== undefined) process.env.LINKEDIN_PASSWORD = originalPassword;
  }
});

test("session extractor constants remain populated", () => {
  assert.match(REALISTIC_USER_AGENT, /Mozilla/);
  assert.match(STEALTH_SCRIPT, /webdriver/);
});

test("ensureSession succeeds when tokens already exist and API test passes", async () => {
  process.env.LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE = mockSearchResponse;
  process.env.LI_COOKIE = "li_at=token";
  process.env.LI_CSRF_TOKEN = "ajax:123";
  const session = await ensureSession({ headless: true, forceRefresh: false });
  assert.equal(session.cookie, "li_at=token");
  assert.equal(session.csrfToken, "ajax:123");
  delete process.env.LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE;
});

test("resolveLocationInteractive covers built-in and typeahead branches", async () => {
  const builtIn = await resolveLocationInteractive("chennai", {
    cookie: "li_at=token",
    csrf: "ajax:123"
  });
  assert.equal(builtIn.geoUrn, "106888327");
  assert.ok(builtIn.geoFilterWords.has("chennai"));

  process.env.LINKEDIN_SCRAPER_MOCK_GEO_RESPONSE_FILE = mockGeoResponse;
  process.env.LINKEDIN_SCRAPER_NONINTERACTIVE = "1";
  const resolved = await resolveLocationInteractive("somewhere", {
    cookie: "li_at=token",
    csrf: "ajax:123"
  });
  assert.equal(resolved.geoUrn, "106888327");
  assert.ok(resolved.geoFilterWords.has("chennai"));
  delete process.env.LINKEDIN_SCRAPER_MOCK_GEO_RESPONSE_FILE;
  delete process.env.LINKEDIN_SCRAPER_NONINTERACTIVE;
});

test("programmatic main functions return expected exit codes for help and missing-args branches", async () => {
  assert.equal(await searchMain(["--help"]), 0);
  assert.equal(await searchMain([]), 1);
  assert.equal(await sessionMain(["--help"]), 0);
  assert.equal(await scraperMain(["--help"]), 0);
  assert.equal(await scraperMain([]), 1);
});

test("scraper CLI flags work together with mock inputs", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "linkedin-scraper-cli-"));
  const minimalPath = path.join(tempDir, "minimal.json");
  const fullPath = path.join(tempDir, "full.json");

  const singlePage = await runNode([
    "scraper.js",
    "Real Estate",
    "-l",
    "chennai",
    "--cap",
    "1",
    "--delay",
    "0",
    "--max-retries",
    "1",
    "-o",
    minimalPath
  ]);
  const fullMode = await runNode([
    "scraper.js",
    "Real Estate",
    "--cap",
    "2",
    "--full",
    "-o",
    fullPath
  ]);
  const sessionTest = await runNode(["scraper.js", "--test-session"]);

  assert.match(singlePage.stdout, /Saved 1 companies/);
  assert.match(fullMode.stdout, /Saved 2 companies/);
  assert.equal(sessionTest.stdout.trim(), "");

  const minimalJson = JSON.parse(await fs.readFile(minimalPath, "utf8"));
  const fullJson = JSON.parse(await fs.readFile(fullPath, "utf8"));
  assert.equal(minimalJson.length, 1);
  assert.equal(fullJson.total_companies, 2);
});

test("module linkedin-search CLI flags work with mock inputs", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "linkedin-module-cli-"));
  const jsonPath = path.join(tempDir, "single.json");
  const csvPath = path.join(tempDir, "all.csv");

  const singlePage = await runNode([
    "module/linkedin-search.js",
    "Real Estate",
    "-l",
    "chennai",
    "-s",
    "0",
    "-c",
    "2",
    "--cookie",
    "li_at=token",
    "--csrf",
    "ajax:123",
    "--minimal",
    "-o",
    jsonPath
  ]);
  const allPages = await runNode([
    "module/linkedin-search.js",
    "Real Estate",
    "--all",
    "--delay",
    "0",
    "-o",
    csvPath
  ]);

  assert.match(singlePage.stdout, /Total results:/);
  assert.match(allPages.stdout, /Done! Fetched 2 unique companies/);

  const json = JSON.parse(await fs.readFile(jsonPath, "utf8"));
  const csv = await fs.readFile(csvPath, "utf8");
  assert.equal(json.length, 2);
  assert.match(csv, /Acme Realty/);
});
