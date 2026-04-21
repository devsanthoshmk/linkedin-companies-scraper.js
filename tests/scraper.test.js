import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import assert from "node:assert/strict";

import { fetchWithCap, resolveOutputPath, saveResults } from "../scraper.js";
import { searchCompanies } from "../module/linkedin-search.js";

const fixturesDir = path.join(process.cwd(), "tests", "fixtures");
const mockSearchResponse = path.join(fixturesDir, "mock-search-response.json");

test("fetchWithCap honors cap and accumulates raw responses", async () => {
  process.env.LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE = mockSearchResponse;
  const result = await fetchWithCap({
    keywords: "Real Estate",
    cap: 1,
    delay: 0,
    verbose: false
  });

  assert.equal(result.fetched, 1);
  assert.equal(result.companies.length, 1);
  assert.equal(result.rawResponses.length, 1);
  delete process.env.LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE;
});

test("resolveOutputPath generates results path and saveResults writes minimal and full JSON", async () => {
  process.env.LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE = mockSearchResponse;
  const [searchResult, raw] = await searchCompanies({ keywords: "Real Estate" });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "linkedin-scraper-js-out-"));
  const minimalPath = path.join(tempDir, "minimal.json");
  const fullPath = path.join(tempDir, "full.json");

  const generatedPath = await resolveOutputPath(null, {
    keywords: "Real Estate",
    location: "Chennai"
  });
  assert.match(generatedPath, /output\/results\/real-estate_chennai_/);

  await saveResults(searchResult.companies, {
    keywords: "Real Estate",
    location: "Chennai",
    output: minimalPath,
    minimal: true,
    verbose: false
  });
  await saveResults(searchResult.companies, {
    keywords: "Real Estate",
    location: "Chennai",
    output: fullPath,
    rawResponses: [raw],
    minimal: false,
    verbose: false
  });

  const minimalJson = JSON.parse(await fs.readFile(minimalPath, "utf8"));
  const fullJson = JSON.parse(await fs.readFile(fullPath, "utf8"));

  assert.equal(minimalJson.length, 2);
  assert.equal(fullJson.total_companies, 2);
  assert.equal(fullJson.total_pages_fetched, 1);

  delete process.env.LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE;
});
