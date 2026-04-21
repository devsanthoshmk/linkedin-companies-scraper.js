#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

import { PROJECT_ROOT, SESSION_DIR } from "./paths.js";
import { searchCompanies } from "./linkedin-search.js";

dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });
dotenv.config();

export const REALISTIC_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/133.0.0.0 Safari/537.36";

export const STEALTH_SCRIPT = `
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){} };
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) => (
  parameters.name === 'notifications'
    ? Promise.resolve({ state: Notification.permission })
    : originalQuery(parameters)
);
delete navigator.__proto__.webdriver;
`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function loadCredentials() {
  return {
    email: process.env.LINKEDIN_EMAIL ?? process.env.LINKEDIN_USERNAME ?? null,
    password: process.env.LINKEDIN_PASSWORD ?? null
  };
}

export function formatCookieString(cookies) {
  return cookies
    .map((cookie) => {
      let value = cookie.value ?? "";
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      return `${cookie.name}=${value}`;
    })
    .join("; ");
}

export async function updateEnvFile(cookieString, csrfToken) {
  const envPath = path.join(PROJECT_ROOT, ".env");
  let lines = [];

  try {
    lines = (await fs.readFile(envPath, "utf8")).split(/\r?\n/);
  } catch {
    lines = [];
  }

  const filtered = lines.filter(
    (line) => !line.startsWith("LI_COOKIE=") && !line.startsWith("LI_CSRF_TOKEN=")
  );

  filtered.push("");
  filtered.push("# LinkedIn API credentials (auto-generated from session)");
  filtered.push(`LI_COOKIE=${cookieString}`);
  filtered.push(`LI_CSRF_TOKEN=${csrfToken}`);

  await fs.writeFile(envPath, `${filtered.join("\n").replace(/\n+$/u, "\n")}`, "utf8");
}

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    throw new Error(
      `Playwright is required for session extraction. Install dependencies in ${PROJECT_ROOT}. (${error.message})`
    );
  }
}

async function humanTyping(page, selector, text) {
  const element = await page.waitForSelector(selector, { timeout: 10000 });
  await element.click();
  await sleep(200 + Math.random() * 300);
  for (const char of text) {
    await page.keyboard.type(char, { delay: 30 + Math.random() * 70 });
    await sleep(10 + Math.random() * 40);
  }
}

async function smoothMouseMove(page, x, y) {
  await page.mouse.move(x, y, { steps: 8 + Math.floor(Math.random() * 8) });
  await sleep(100 + Math.random() * 200);
}

async function warmUpBrowser(page) {
  const sites = ["https://www.google.com", "https://www.wikipedia.org"];
  for (const site of sites) {
    try {
      await smoothMouseMove(
        page,
        300 + Math.floor(Math.random() * 500),
        200 + Math.floor(Math.random() * 300)
      );
      await page.goto(site, { waitUntil: "domcontentloaded", timeout: 10000 });
      await sleep(1000 + Math.random() * 1000);
    } catch {
      continue;
    }
  }
}

export async function extractSession({
  email = null,
  password = null,
  headless = false,
  outputDir = null
} = {}) {
  const creds = loadCredentials();
  const resolvedEmail = email ?? creds.email;
  const resolvedPassword = password ?? creds.password;

  if (!resolvedEmail || !resolvedPassword) {
    throw new Error(
      "LinkedIn credentials not found. Set LINKEDIN_EMAIL and LINKEDIN_PASSWORD in .env"
    );
  }

  const sessionDir = outputDir ?? SESSION_DIR;
  await fs.mkdir(sessionDir, { recursive: true });

  const { chromium } = await importPlaywright();
  const browser = await chromium.launch({
    headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-features=IsolateOrigins,site-per-process"
    ]
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: REALISTIC_USER_AGENT,
      locale: "en-US",
      timezoneId: "Asia/Kolkata"
    });
    await context.addInitScript(STEALTH_SCRIPT);
    const page = await context.newPage();

    await warmUpBrowser(page);
    await smoothMouseMove(page, 600, 400);
    await page.goto("https://www.linkedin.com/login", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    await sleep(1000 + Math.random() * 1000);

    await humanTyping(page, "#username", resolvedEmail);
    await sleep(300 + Math.random() * 500);
    await humanTyping(page, "#password", resolvedPassword);
    await sleep(300 + Math.random() * 500);

    await smoothMouseMove(page, 500, 600);
    const submitButton = await page.waitForSelector('button[type="submit"]', {
      timeout: 10000
    });
    await submitButton.click();

    try {
      await page.waitForURL(
        (url) =>
          ["feed", "checkpoint", "challenge", "authwall"].some((token) =>
            url.toString().includes(token)
          ),
        { timeout: 60000 }
      );
    } catch {
      // Fall through to URL checks below.
    }

    const currentUrl = page.url();
    if (["checkpoint", "challenge"].some((token) => currentUrl.includes(token))) {
      for (let attempt = 0; attempt < 300; attempt += 1) {
        if (page.url().includes("feed")) {
          break;
        }
        await sleep(1000);
      }
      if (!page.url().includes("feed")) {
        throw new Error("Manual login timed out");
      }
    }

    if (currentUrl.includes("authwall") || currentUrl.includes("login")) {
      throw new Error(`Login failed. Current URL: ${currentUrl}. Check your credentials.`);
    }

    await sleep(2000);
    const cookies = await context.cookies();
    const cookieString = formatCookieString(cookies);
    const jsessionCookie = cookies.find((cookie) => cookie.name === "JSESSIONID");

    if (!jsessionCookie) {
      throw new Error("JSESSIONID cookie not found");
    }

    let csrfToken = jsessionCookie.value ?? "";
    if (csrfToken.startsWith('"') && csrfToken.endsWith('"')) {
      csrfToken = csrfToken.slice(1, -1);
    }

    const sessionPath = path.join(sessionDir, "linkedin_session.json");
    const storage = await context.storageState();
    await fs.writeFile(sessionPath, `${JSON.stringify(storage, null, 2)}\n`, "utf8");
    await updateEnvFile(cookieString, csrfToken);

    return { cookie: cookieString, csrfToken };
  } finally {
    await browser.close();
  }
}

export async function testSessionWithApi({ cookie = null, csrf = null } = {}) {
  const resolvedCookie = cookie ?? process.env.LI_COOKIE ?? null;
  const resolvedCsrf = csrf ?? process.env.LI_CSRF_TOKEN ?? null;
  if (!resolvedCookie || !resolvedCsrf) {
    throw new Error("Session credentials not found in .env");
  }
  try {
    const [result] = await searchCompanies({
      keywords: "test",
      start: 0,
      count: 1,
      cookie: resolvedCookie,
      csrfToken: resolvedCsrf
    });
    return Boolean(result.metadata.totalResultCount >= 0);
  } catch {
    return false;
  }
}

function printHelp() {
  console.log(`Extract LinkedIn session via stealth login

Usage:
  node module/session-extractor.js [options]

Options:
      --email EMAIL       LinkedIn email
      --password PASSWORD LinkedIn password
      --headless          Run headless
      --test              Test session after extraction
  -h, --help              Show help
`);
}

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    allowPositionals: true,
    args: argv,
    options: {
      email: { type: "string" },
      password: { type: "string" },
      headless: { type: "boolean", default: false },
      test: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false }
    }
  });

  if (values.help) {
    printHelp();
    return 0;
  }

  const session = await extractSession({
    email: values.email ?? null,
    password: values.password ?? null,
    headless: values.headless
  });

  if (values.test) {
    const success = await testSessionWithApi({
      cookie: session.cookie,
      csrf: session.csrfToken
    });
    return success ? 0 : 1;
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
