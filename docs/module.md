# Module Reference

Code is organized under `module/`:
- `module.linkedin-search.js`
- `module.session-extractor.js`
- `module.paths.js`

`module/index.js` re-exports the public module API.

## `module/paths.js`

Exports:
- `PROJECT_ROOT`
- `OUTPUT_DIR`
- `RESULTS_DIR`
- `PROGRESS_DIR`
- `SESSION_DIR`

## `module/session-extractor.js`

Key functions:
- `loadCredentials()`
- `extractSession({ email, password, headless, outputDir })`
- `testSessionWithApi({ cookie, csrf })`
- `updateEnvFile(cookieString, csrfToken)`
- `formatCookieString(cookies)`

## `module/linkedin-search.js`

Primary API:
- `searchCompanies({ keywords, location, start, count, cookie, csrfToken })`
- `searchGeoLocations({ keywords, cookie, csrfToken })`
- `matchesGeoFilter(company, geoFilterWords)`
- `writeCompanies(companies, { outputPath, fmt, minimal })`
- `fetchAllCompanies({ keywords, location, cookie, csrfToken, delay, maxRetries })`
- `printResults(results)`
- `printCompanies(companies, start)`
- `printGeoResults(results)`
- `GEO_URN_MAP`

## `EntityResultViewModel`

Convenience accessors:
- `name`
- `location`
- `followers`
- `description`
- `logoUrl`
- `companyId`

Serialization helpers:
- `toDict()`
- `toMinimalDict()`

## Integration Example

```js
import { searchCompanies } from "./module/linkedin-search.js";

const [result] = await searchCompanies({
  keywords: "Real Estate",
  location: "Mumbai",
  start: 0,
  count: 10
});

console.log(result.metadata.totalResultCount);
for (const company of result.companies.slice(0, 3)) {
  console.log(company.name, company.location, company.navigationUrl);
}
```
