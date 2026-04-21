# CLI Reference

This JavaScript port exposes 4 executable entry points:
- `node scraper.js`
- `node module/session-extractor.js`
- `node module/linkedin-search.js`
- `node tests/test-session.js`

## 1) `node scraper.js`

Main production CLI with automatic session management and JSON output.

## Usage

```bash
node scraper.js [keywords] [options]
```

## Arguments and Flags

- `keywords` positional search query.
- `-l, --location LOCATION` city or country query.
- `--cap CAP` max number of companies to fetch.
- `--all` fetch all visible results.
- `-o, --output OUTPUT` output JSON path.
- `--delay DELAY` delay between pages in seconds. Default `5`.
- `--max-retries MAX_RETRIES` retries per page. Default `3`.
- `--refresh-session` force fresh session before fetching.
- `--headless` run browser headless during session extraction.
- `--test-session` validate session and exit.
- `--list-geos` print built-in `GEO_URN_MAP` and exit.
- `--full` save full raw API pages. Default is minimal clean JSON.

## Examples

```bash
node scraper.js "Real Estate" --cap 20
node scraper.js "Software" -l "Bangalore" --cap 30
node scraper.js "AI" --cap 10 -o output/results/ai.json
node scraper.js "Fintech" --cap 10 --full
node scraper.js --test-session
node scraper.js --list-geos
```

## Behavior Notes

- If `--list-geos` is used, the scraper exits without requiring keywords.
- If `--test-session` is used, the scraper exits after session validation.
- If keywords are missing in normal search mode, help is shown and exit code is `1`.
- Location handling is interactive when the input is not in the built-in geo map:
  - LinkedIn geo typeahead is queried.
  - A single result is auto-selected.
  - Multiple results prompt for a selection.
  - In non-interactive mode, unresolved locations are skipped.
- On HTTP `401/403` during fetch, the scraper refreshes the session and retries once.

## Output Behavior

- Default output is minimal JSON in `output/results/`.
- With `--full`, the output includes raw paginated API responses:
  - `search_query`
  - `location`
  - `total_pages_fetched`
  - `total_companies`
  - `pages`

## 2) `node module/session-extractor.js`

Stealth Playwright login flow to create or refresh LinkedIn API session credentials.

## Usage

```bash
node module/session-extractor.js [options]
```

## Flags

- `--email EMAIL`
- `--password PASSWORD`
- `--headless`
- `--test`

## Side Effects

- Writes `LI_COOKIE` and `LI_CSRF_TOKEN` into `.env` in this JS project root.
- Writes browser storage JSON to `output/session/linkedin_session.json`.

## 3) `node module/linkedin-search.js`

Low-level search CLI for direct API calls and geo lookups.

## Usage

```bash
node module/linkedin-search.js [keywords] [options]
```

## Arguments and Flags

- `keywords` positional.
- `-l, --location LOCATION`
- `-s, --start START`
- `-c, --count COUNT`
- `--cookie COOKIE`
- `--csrf CSRF`
- `--all`
- `-o, --output OUTPUT`
- `--delay DELAY`
- `--geo LOCATION`
- `--minimal`

## Examples

```bash
node module/linkedin-search.js "Real Estate" -c 10
node module/linkedin-search.js --geo "chennai"
node module/linkedin-search.js "AI" --all -o output/results/ai.csv
```

## 4) `node tests/test-session.js`

Simple integration check that loads session credentials and performs a test search call.
