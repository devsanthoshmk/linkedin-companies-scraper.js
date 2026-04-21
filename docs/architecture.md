# Architecture

## Core Idea

The port keeps the same separation of concerns as the Python project:
- orchestration in `scraper.js`
- low-level LinkedIn API access in `module/linkedin-search.js`
- session extraction and refresh in `module/session-extractor.js`
- path conventions in `module/paths.js`

## End-to-End Flow

1. User runs `node scraper.js ...`.
2. CLI checks the mode: info, session test, or search.
3. Search mode validates `LI_COOKIE` and `LI_CSRF_TOKEN`.
4. If missing, expired, or forced, session refresh runs through Playwright.
5. Optional location input resolves to a geo ID.
6. Fetch loop executes via `searchCompanies()` with pagination, deduplication, and retries.
7. If HTTP `401/403` appears mid-run, the session is refreshed and the search is retried once.
8. Results are written to disk:
   - minimal JSON by default
   - full raw page payloads with `--full`

## Testability

The JS port adds deterministic fixture-based test hooks for search and geo lookups so the docs and CLI behavior can be validated without live LinkedIn credentials.
