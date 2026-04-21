import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import assert from "node:assert/strict";

import {
  formatCookieString,
  loadCredentials,
  testSessionWithApi
} from "../module/session-extractor.js";
import { PROJECT_ROOT } from "../module/paths.js";

const fixturesDir = path.join(process.cwd(), "tests", "fixtures");
const mockSearchResponse = path.join(fixturesDir, "mock-search-response.json");

test("loadCredentials reads LinkedIn env vars", () => {
  process.env.LINKEDIN_EMAIL = "user@example.com";
  process.env.LINKEDIN_PASSWORD = "secret";
  assert.deepEqual(loadCredentials(), {
    email: "user@example.com",
    password: "secret"
  });
});

test("formatCookieString strips quoted cookie values", () => {
  const cookieString = formatCookieString([
    { name: "li_at", value: "token" },
    { name: "JSESSIONID", value: '"ajax:123"' }
  ]);
  assert.equal(cookieString, "li_at=token; JSESSIONID=ajax:123");
});

test("testSessionWithApi succeeds when mock search response is configured", async () => {
  process.env.LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE = mockSearchResponse;
  process.env.LI_COOKIE = "li_at=token";
  process.env.LI_CSRF_TOKEN = "ajax:123";

  const valid = await testSessionWithApi();
  assert.equal(valid, true);

  delete process.env.LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE;
});

test("project root stays scoped to the JS port", async () => {
  const stats = await fs.stat(path.join(PROJECT_ROOT, "package.json"));
  assert.equal(stats.isFile(), true);
});
