# Contributing

## Setup

```bash
npm install
```

For live integration work, create `.env` in this JS project root and generate a session:

```bash
node module/session-extractor.js --test
```

## Validation

Run:

```bash
npm test
node tests/test-session.js
node scraper.js --help
node module/linkedin-search.js --geo "chennai"
```

Notes:
- automated tests use local fixtures
- live LinkedIn verification still requires network access and valid credentials
- docs should be updated when CLI or module behavior changes
