# utm-carry-checker

Node.js script that checks whether UTM parameters are carried through on a list of websites. It requests each site with test UTM parameters and looks for the `utms-carry-js` script in the returned HTML.

## How it works

1. Loads a list of site URLs from `sites/<list>.js` (duplicates are removed)
2. Requests each URL with `?utm_source=...&utm_campaign=...`
3. Checks the response body for `utms-carry-js`
4. Writes the results to `output/<list>.csv` and prints a summary

## Requirements

- Node.js 16+
- Yarn or npm

## Installation

```bash
git clone <repo-url>
cd utm-carry-checker
yarn install   # or: npm install
```

## Usage

```bash
node index.js <listName> [utm_source] [utm_campaign]

# examples
node index.js ppc5Sites
node index.js stagingSites mysource mycampaign
```

Available lists: `ppc1Sites`, `ppc2Sites`, `ppc3Sites`, `ppc4Sites`, `ppc5Sites`, `stagingSites`.

Results are saved to `output/<listName>.csv`:

| URL | UTM_URL | STATUS |
|---|---|---|
| https://example.com | https://example.com/?utm_source=... | UTM is working |

Possible statuses: `UTM is working`, `UTM not working`, `ERROR: <reason>` (timeout, DNS failure, HTTP error, invalid URL).

## Site lists

Each list is a JS file in `sites/` exporting an array of URLs:

```js
module.exports = ["https://example.com", "https://example.org"];
```

## Configuration

| Setting | Default | Where |
|---|---|---|
| Concurrent requests | 10 | `CONCURRENCY` in `index.js` |
| Request timeout | 15s | `TIMEOUT_MS` in `index.js` |
| Marker string | `utms-carry-js` | `MARKER` in `index.js` |

## Notes

- Keep this repository **private**: the site lists contain client domains and staging URLs.
- `output/` is git-ignored, so results are never committed.

## License

MIT
