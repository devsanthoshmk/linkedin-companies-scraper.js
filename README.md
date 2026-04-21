# LinkedIn Company Search Scraper for JavaScript

JavaScript port of the [LinkedIn company scraper (Python)](https://github.com/devsanthoshmk/linkedin-companies-scraper.py) with the same split as the original project:
- a primary CLI in [`scraper.js`](./scraper.js)
- reusable modules in [`module/`](./module)
- docs in [`docs/`](./docs)
- tests in [`tests/`](./tests)

This port is standalone. It writes its own `.env` and output files inside the `linkedin-scraper-js` folder and does not modify the original Python project.

## Project Structure

```text
linkedin-scraper.js/
├── scraper.js
├── module/
│   ├── index.js
│   ├── linkedin-search.js
│   ├── paths.js
│   └── session-extractor.js
├── tests/
│   ├── docs-smoke.test.js
│   ├── linkedin-search.test.js
│   ├── scraper.test.js
│   ├── session-extractor.test.js
│   └── test-session.js
├── docs/
│   ├── architecture.md
│   ├── cli.md
│   ├── configuration.md
│   ├── contributing.md
│   ├── error-handling.md
│   ├── module.md
│   └── README.md
└── output/
    ├── progress/
    ├── results/
    └── session/
```

## Installation

You can install the dependencies using `npm` or `pnpm`:

```bash
# Using npm
npm install

# Using pnpm
pnpm install
```

Create a `.env` file in the project root:

```env
LINKEDIN_EMAIL=your_email
LINKEDIN_PASSWORD=your_password
```

## Module Usage

You can import and use the scraper's core functionality in your own JavaScript projects.

```javascript
import { searchCompanies, extractSession } from './module/index.js';

/**
 * 1. Extract session
 * Requires LINKEDIN_EMAIL and LINKEDIN_PASSWORD in your .env.
 * This will launch a browser, login, and save the session (LI_COOKIE and LI_CSRF_TOKEN)
 * back to your .env for subsequent requests.
 */
await extractSession({ headless: false });

/**
 * 2. Search for companies
 * Once the session is in .env, you can search programmatically.
 */
const [results, rawJson] = await searchCompanies({
  keywords: 'Real Estate',
  location: 'india', // Can be a city name, country, or numeric Geo ID
  count: 10
});

// View normalized results
results.companies.forEach(company => {
  console.log(`- ${company.name} (${company.location})`);
  console.log(`  URL: ${company.navigationUrl}`);
});
```

## Quick Start (CLI)

```bash
node scraper.js "Real Estate" --cap 20
```

## CLI Entry Points

- `node scraper.js [keywords] [options]`
- `node module/session-extractor.js [--email --password --headless --test]`
- `node module/linkedin-search.js [keywords] [--all --geo ...]`
- `node tests/test-session.js`

## Testing

Run the automated suite:

```bash
npm test
```

The test suite uses local fixtures for deterministic verification of the documented commands. Live LinkedIn integration still requires valid credentials and network access.

## Documentation

See [`docs/`](./docs) for CLI reference, module API usage, architecture, configuration, troubleshooting, and contribution workflow.
