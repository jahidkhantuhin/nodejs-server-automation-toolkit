const fs = require('fs');
const path = require('path');
const got = require('got'); // v11 (CommonJS)
const Sitemapper = require('sitemapper');

const [, , listName = 'californiaSites'] = process.argv;
const CONCURRENCY = 10;
const TIMEOUT_MS = 15000;
// matches youtube.com/, youtube-nocookie.com/ and youtu.be/ links and embeds
const PATTERN = /youtube(?:-nocookie)?\.com\/|youtu\.be\//i;

let sites;
try {
  sites = [...new Set(require(path.join(__dirname, 'sites', listName)).map((s) => s.trim()))];
} catch (err) {
  console.error(`Could not load sites/${listName}.js - ${err.message}`);
  process.exit(1);
}

const csv = (v) => `"${String(v).replace(/"/g, '""')}"`;
const row = (cells) => cells.map(csv).join(',') + '\n';
const errReason = (err) => err.response?.statusCode || err.code || err.message;

// run `worker` over `items`, `limit` at a time
async function pool(items, limit, worker) {
  let next = 0;
  const run = async () => {
    while (next < items.length) await worker(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

async function run() {
  fs.mkdirSync(path.join(__dirname, 'output'), { recursive: true });
  const resultsFile = path.join(__dirname, 'output', `${listName}.csv`);
  const errorsFile = path.join(__dirname, 'output', `${listName}-errors.csv`);
  const results = fs.createWriteStream(resultsFile);
  const errors = fs.createWriteStream(errorsFile);
  results.write(row(['SITE', 'PAGE_URL']));
  errors.write(row(['SITE', 'URL', 'ERROR']));

  const stats = { sites: 0, sitemapFailures: 0, pages: 0, withYoutube: 0, pageErrors: 0 };

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    console.log(`\n[${i + 1}/${sites.length}] ${site}`);

    let sitemapUrl;
    try {
      sitemapUrl = new URL('/sitemap.xml', site).href;
    } catch {
      errors.write(row([site, site, 'invalid URL']));
      stats.sitemapFailures++;
      continue;
    }

    let pages = [];
    try {
      const sitemap = new Sitemapper({ timeout: TIMEOUT_MS });
      const result = await sitemap.fetch(sitemapUrl);
      pages = [...new Set(result.sites || [])];
    } catch (err) {
      errors.write(row([site, sitemapUrl, `sitemap: ${errReason(err)}`]));
      stats.sitemapFailures++;
      console.log(`  sitemap error: ${errReason(err)}`);
      continue;
    }

    if (pages.length === 0) {
      errors.write(row([site, sitemapUrl, 'sitemap: no pages found']));
      stats.sitemapFailures++;
      console.log('  no pages found in sitemap');
      continue;
    }

    stats.sites++;
    let found = 0;
    await pool(pages, CONCURRENCY, async (page) => {
      stats.pages++;
      try {
        const res = await got(page, { timeout: TIMEOUT_MS, retry: 1 });
        if (PATTERN.test(res.body)) {
          results.write(row([site, page]));
          stats.withYoutube++;
          found++;
        }
      } catch (err) {
        errors.write(row([site, page, errReason(err)]));
        stats.pageErrors++;
      }
    });
    console.log(`  ${pages.length} pages scanned, ${found} with YouTube`);
  }

  await Promise.all([results, errors].map((s) => new Promise((resolve) => s.end(resolve))));

  console.log('\nSummary');
  console.log(`  Sites scanned:         ${stats.sites}`);
  console.log(`  Sitemap failures:      ${stats.sitemapFailures}`);
  console.log(`  Pages scanned:         ${stats.pages}`);
  console.log(`  Pages with YouTube:    ${stats.withYoutube}`);
  console.log(`  Page errors:           ${stats.pageErrors}`);
  console.log(`\nResults: ${resultsFile}`);
  console.log(`Errors:  ${errorsFile}`);
}

run();
