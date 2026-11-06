# LinkedIn company scraper JavaScript

A Node.js LinkedIn scraper for B2B company data extraction through the LinkedIn company search API.

## Purpose

This tool automates company search queries on LinkedIn and extracts structured company profiles into clean JSON. It runs as a command line interface or as an importable Node.js module. The tool handles authentication via Playwright, extracts session tokens, queries the internal Voyager GraphQL API, deduplicates companies across pages, and writes results to disk.

## Architecture

The project has four core parts:

- `scraper.js` is the primary command line interface. It coordinates authentication, location resolution, pagination, deduplication, retry loops, and file persistence.
- `module/session-extractor.js` manages browser authentication. It uses Playwright with stealth scripts to sign in to LinkedIn, extract session cookies, and save `LI_COOKIE` and `LI_CSRF_TOKEN` into `.env`.
- `module/linkedin-search.js` sends direct HTTP requests to LinkedIn Voyager GraphQL endpoints. It builds query parameters, attaches anti-bot headers, normalizes entity results, and queries typeahead locations.
- `module/paths.js` defines absolute paths for project directories, output files, logs, and sessions.
- `module/index.js` exports the public library functions.

```text
linkedin-scraper-js/
├── scraper.js
├── module/
│   ├── index.js
│   ├── linkedin-search.js
│   ├── paths.js
│   └── session-extractor.js
├── docs/
│   ├── architecture.md
│   ├── cli.md
│   ├── configuration.md
│   ├── contributing.md
│   ├── error-handling.md
│   ├── module.md
│   └── README.md
├── output/
│   ├── progress/
│   ├── results/
│   └── session/
└── tests/
    ├── coverage.test.js
    ├── docs-smoke.test.js
    ├── fixtures/
    ├── linkedin-search.test.js
    ├── scraper.test.js
    ├── session-extractor.test.js
    └── test-session.js
```

## Setup

### Prerequisites

- Node.js 20 or higher
- An active LinkedIn account

### Install dependencies

Clone the repository and install dependencies with npm or pnpm:

```bash
git clone https://github.com/devsanthoshmk/linkedin-companies-scraper.js.git
cd linkedin-companies-scraper.js
npm install
```

To install this package as a dependency in an external project:

```bash
npm install github:devsanthoshmk/linkedin-companies-scraper.js#main
```

### Configure credentials

Create a `.env` file in the project root:

```env
LINKEDIN_EMAIL=your_email@example.com
LINKEDIN_PASSWORD=your_password
```

Generate session cookies with the session extractor:

```bash
node module/session-extractor.js --headless --test
```

This script logs in, captures `LI_COOKIE` and `LI_CSRF_TOKEN`, and writes them to `.env`.

## Usage

### Quick start with the command line

Run a search query with a result limit:

```bash
node scraper.js "Real Estate" --cap 20
```

Search companies in a specific location:

```bash
node scraper.js "Software" -l "Bangalore" --cap 30
```

Export raw API page responses instead of minimal JSON:

```bash
node scraper.js "Fintech" --cap 10 --full
```

Check the active session without running a search:

```bash
node scraper.js --test-session
```

List built-in location mappings:

```bash
node scraper.js --list-geos
```

### Module usage in JavaScript

Import the package directly in Node.js applications:

```javascript
import { searchCompanies, extractSession } from 'linkedin-scraper-js';

// If working inside a local repository clone, use:
// import { searchCompanies, extractSession } from './module/index.js';

// Refresh session credentials when needed
await extractSession({ headless: true });

// Execute company search
const [results, rawPayload] = await searchCompanies({
  keywords: 'Real Estate',
  location: 'india',
  count: 10
});

for (const company of results.companies) {
  console.log(`${company.name} (${company.location})`);
  console.log(`URL: ${company.navigationUrl}`);
  console.log(`Followers: ${company.followers}`);
}
```

### Normalized company schema

Each company record contains the following properties:

- `company_name` is the official company name.
- `industry_location` holds the industry and headquarters location.
- `followers` is the formatted follower count string.
- `description` contains the summary snippet from search results.
- `logo_url` is the image URL for the company logo.
- `company_page_url` links directly to the LinkedIn company profile.
- `company_urn` is the tracking URN identifier from LinkedIn.

### Additional command line entry points

The repository provides standalone scripts for specific workflows:

```bash
# Query LinkedIn company search API directly
node module/linkedin-search.js "AI" -c 10

# Search geo location URNs with LinkedIn typeahead
node module/linkedin-search.js --geo "chennai"

# Run standalone session verification test
node tests/test-session.js
```

## Configuration

### Command line options

`scraper.js` accepts the following arguments and flags:

- `keywords` is the positional string argument for company search terms.
- `-l, --location <city|country>` filters companies by geographic region.
- `--cap <number>` limits the total number of companies to save.
- `--all` fetches all visible search results up to 100 pages.
- `-o, --output <path>` sets a custom file path for the output JSON.
- `--delay <seconds>` sets the sleep interval between page requests. Default is 5 seconds.
- `--max-retries <count>` sets the number of attempts per page on failure. Default is 3 retries.
- `--refresh-session` forces Playwright to acquire fresh cookies before searching.
- `--headless` runs the Playwright browser without a visible window during authentication.
- `--test-session` tests current credentials against the API and exits.
- `--list-geos` prints built-in city names and geo URN identifiers and exits.
- `--full` saves complete raw API responses instead of minimal company records.
- `-h, --help` displays the command help menu.

### Environment variables

- `LINKEDIN_EMAIL` is the LinkedIn account login email.
- `LINKEDIN_PASSWORD` is the LinkedIn account login password.
- `LI_COOKIE` is the active session cookie string.
- `LI_CSRF_TOKEN` is the CSRF token matching the session cookie.
- `LINKEDIN_SCRAPER_DISABLE_SLEEP` disables request delays during testing when set to `1`.
- `LINKEDIN_SCRAPER_NONINTERACTIVE` bypasses interactive prompts when set to `1`.
- `LINKEDIN_SCRAPER_MOCK_SEARCH_RESPONSE_FILE` specifies a JSON fixture path for mocking company search.
- `LINKEDIN_SCRAPER_MOCK_GEO_RESPONSE_FILE` specifies a JSON fixture path for mocking geo typeahead.

### Output format

Results save by default in `output/results/` as timestamped JSON files:

```json
[
  {
    "company_name": "Example Corp",
    "industry_location": "Information Technology, Bengaluru",
    "followers": "12,400 followers",
    "description": "Software development company.",
    "logo_url": "https://media.licdn.com/dms/image/...",
    "company_page_url": "https://www.linkedin.com/company/example-corp",
    "company_urn": "urn:li:company:123456"
  }
]
```

When run with `--full`, the JSON file records query metadata, total company count, page count, and raw GraphQL payloads.

## Testing

Run the automated test suite:

```bash
npm test
```

Run documentation smoke tests:

```bash
npm run test:docs
```

The test suite runs against deterministic JSON fixtures without calling live LinkedIn endpoints.

## Documentation

Extended guides live in `docs/`:

- `docs/architecture.md` documents component breakdown and runtime data flow.
- `docs/cli.md` documents CLI command reference and example queries.
- `docs/configuration.md` documents environment options, mock setups, and requirements.
- `docs/contributing.md` documents contribution guidelines and development workflow.
- `docs/error-handling.md` documents common error states, rate limits, and troubleshooting.
- `docs/module.md` documents public programmatic API methods.
