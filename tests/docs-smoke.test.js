import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const searchFixture = path.join(root, "tests", "fixtures", "mock-search-response.json");
const geoFixture = path.join(root, "tests", "fixtures", "mock-geo-response.json");

async function runNode(args, extraEnv = {}) {
  return execFileAsync(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE: searchFixture,
      LINKEDIN_SCRAPER_MOCK_GEO_RESPONSE_FILE: geoFixture,
      LINKEDIN_SCRAPER_DISABLE_SLEEP: "1",
      LI_COOKIE: "li_at=token",
      LI_CSRF_TOKEN: "ajax:123",
      ...extraEnv
    }
  });
}

test("documented scraper CLI help works", async () => {
  const { stdout } = await runNode(["scraper.js", "--help"]);
  assert.match(stdout, /Usage:/);
  assert.match(stdout, /--test-session/);
});

test("documented scraper list geos works", async () => {
  const { stdout } = await runNode(["scraper.js", "--list-geos"]);
  assert.match(stdout, /Supported Geo Locations/);
  assert.match(stdout, /chennai/);
});

test("documented module geo lookup works", async () => {
  const { stdout } = await runNode(["module/linkedin-search.js", "--geo", "chennai"]);
  assert.match(stdout, /Geo locations matching keywords/);
  assert.match(stdout, /106888327/);
});

test("documented session test script works with mock fixtures", async () => {
  const { stdout } = await runNode(["tests/test-session.js"]);
  assert.match(stdout, /Session is valid/);
});
