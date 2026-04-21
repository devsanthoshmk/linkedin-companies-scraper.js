import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  _extractGeoCity,
  _extractLocationWords,
  _resolveGeoUrn,
  EntityResultViewModel,
  GEO_URN_MAP,
  matchesGeoFilter,
  searchCompanies,
  searchGeoLocations,
  writeCompanies
} from "../module/linkedin-search.js";

const fixturesDir = path.join(process.cwd(), "tests", "fixtures");
const mockSearchResponse = path.join(fixturesDir, "mock-search-response.json");
const mockGeoResponse = path.join(fixturesDir, "mock-geo-response.json");

test("geo helpers match Python behavior", () => {
  assert.equal(_resolveGeoUrn("chennai"), GEO_URN_MAP.chennai);
  assert.equal(_resolveGeoUrn("106888327"), "106888327");
  assert.equal(_extractGeoCity("New York, New York, United States"), "New York");
  assert.deepEqual([..._extractLocationWords("Chennai, Tamil Nadu")].sort(), [
    "chennai",
    "nadu",
    "tamil"
  ]);
});

test("searchCompanies normalizes entity results from mock raw response", async () => {
  process.env.LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE = mockSearchResponse;
  const [result, raw] = await searchCompanies({ keywords: "Real Estate", count: 10 });

  assert.equal(raw.included.length, 2);
  assert.equal(result.metadata.totalResultCount, 2);
  assert.equal(result.metadata.searchId, "mock-search-id");
  assert.equal(result.companies.length, 2);
  assert.equal(result.companies[0].name, "Acme Realty");
  assert.equal(result.companies[0].companyId, "111");
  assert.equal(result.companies[0].logoUrl, "https://cdn.example.com/acme.png");
  delete process.env.LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE;
});

test("searchGeoLocations reads mock typeahead response", async () => {
  process.env.LINKEDIN_SCRAPER_MOCK_GEO_RESPONSE_FILE = mockGeoResponse;
  const response = await searchGeoLocations({ keywords: "chennai" });
  assert.equal(response.rawCount, 1);
  assert.equal(response.locations[0].title, "Chennai, Tamil Nadu, India");
  assert.equal(response.locations[0].geoId, "106888327");
  delete process.env.LINKEDIN_SCRAPER_MOCK_GEO_RESPONSE_FILE;
});

test("matchesGeoFilter checks subtitle words and substrings", () => {
  const company = new EntityResultViewModel({
    primarySubtitle: { text: "Greater Chennai Area" }
  });
  assert.equal(matchesGeoFilter(company, new Set(["chennai"])), true);
  assert.equal(matchesGeoFilter(company, new Set(["mumbai"])), false);
});

test("writeCompanies supports minimal json and full csv", async () => {
  process.env.LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE = mockSearchResponse;
  const [result] = await searchCompanies({ keywords: "Real Estate", count: 10 });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "linkedin-scraper-js-"));
  const jsonPath = path.join(tempDir, "companies.json");
  const csvPath = path.join(tempDir, "companies.csv");

  await writeCompanies(result.companies, {
    outputPath: jsonPath,
    fmt: "json",
    minimal: true
  });
  await writeCompanies(result.companies, {
    outputPath: csvPath,
    fmt: "csv",
    minimal: false
  });

  const json = JSON.parse(await fs.readFile(jsonPath, "utf8"));
  const csv = await fs.readFile(csvPath, "utf8");

  assert.equal(json.length, 2);
  assert.equal(json[0].company_name, "Acme Realty");
  assert.match(csv, /Acme Realty/);
  assert.match(csv, /Bravo Estates/);

  delete process.env.LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE;
});
