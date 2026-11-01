# youtube-embed-finder

Node.js script that finds every page on a list of websites that embeds or links to YouTube. For each site it reads `/sitemap.xml`, downloads every page, and checks the HTML for YouTube references.

## How it works

1. Loads a list of site URLs from `sites/<list>.js` (duplicates are removed)
2. Fetches `<site>/sitemap.xml` (sitemap indexes are followed automatically)
3. Downloads each page, 10 at a time, and searches the HTML for `youtube.com/`, `youtube-nocookie.com/` or `youtu.be/`
4. Writes matching pages to `output/<list>.csv` and failures to `output/<list>-errors.csv`

## Requirements

- Node.js 16+
- Yarn or npm

## Installation

```bash
git clone <repo-url>
cd youtube-embed-finder
yarn install   # or: npm install
```

## Usage

```bash
node index.js [listName]

# examples
node index.js                    # uses californiaSites
node index.js californiaSites
```

### Output

`output/<listName>.csv` lists every page that contains YouTube:

| SITE | PAGE_URL |
|---|---|
| http://lancaster-ca-dentist.com | https://lancaster-ca-dentist.com/gallery/ |

`output/<listName>-errors.csv` lists sites with missing or empty sitemaps and pages that failed to load (timeout, DNS failure, HTTP error), so nothing is silently skipped.

## Site lists

Each list is a JS file in `sites/` exporting an array of site URLs:

```js
module.exports = ["https://example.com", "https://example.org"];
```

## Configuration

| Setting | Default | Where |
|---|---|---|
| Concurrent page requests | 10 | `CONCURRENCY` in `index.js` |
| Request timeout | 15s | `TIMEOUT_MS` in `index.js` |
| Match pattern | YouTube links and embeds | `PATTERN` in `index.js` |

## Notes

- Keep this repository **private**: the site lists contain client domains.
- `output/` is git-ignored, so results are never committed.
- Sites without a `/sitemap.xml` are reported in the errors file rather than crawled.

## License

MIT
