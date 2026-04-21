# Error Handling and Troubleshooting

## Session and Auth Errors

Symptoms:
- HTTP `401` or `403`
- missing `LI_COOKIE` or `LI_CSRF_TOKEN`
- session test failure in `node tests/test-session.js`

Current behavior:
- `scraper.js` validates the session before search
- missing or invalid sessions trigger refresh
- HTTP `401/403` during fetch triggers one refresh and retry

## Network Failures

Examples:
- DNS resolution failures
- firewall or proxy restrictions
- LinkedIn anti-bot responses

Checks:
- verify general internet access
- verify credentials
- retry with `--refresh-session`

## Empty Results

Common causes:
- restrictive location filters
- skipped location selection in non-interactive mode
- LinkedIn ranking or visibility limits

## Output Issues

- if no output path is supplied, files are written under `output/results/`
- parent directories are created automatically
- if no companies match, the scraper exits without writing a result file
