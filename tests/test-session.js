#!/usr/bin/env node

import process from "node:process";

import { testSessionWithApi } from "../module/session-extractor.js";

async function main() {
  const cookie = process.env.LI_COOKIE ?? null;
  const csrf = process.env.LI_CSRF_TOKEN ?? null;

  if (!cookie || !csrf) {
    console.log("❌ Session credentials not found in .env");
    console.log("Run: node module/session-extractor.js --test");
    console.log("\nNote: Ensure credentials exist in environment or .env");
    return 1;
  }

  console.log("Testing LinkedIn session...");
  console.log(`Cookie length: ${cookie.length}`);
  console.log(`CSRF token: ${csrf.slice(0, 20)}...`);

  const success = await testSessionWithApi({ cookie, csrf });
  if (success) {
    console.log("\n✅ Session is valid!");
    return 0;
  }

  console.log("\n❌ Session test failed");
  console.log("\nYour session may have expired.");
  console.log("Run: node module/session-extractor.js");
  return 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error.message);
    process.exitCode = 1;
  }
);
