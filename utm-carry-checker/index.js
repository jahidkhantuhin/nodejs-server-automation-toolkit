const fs = require('fs');
const path = require('path');
const got = require('got'); // v11 (CommonJS)

const [, , listName = 'ppc5Sites', source = 'sample22', campaign = 'tony'] = process.argv;
const MARKER = 'utms-carry-js';
const CONCURRENCY = 10;
const TIMEOUT_MS = 15000;

let sites;
try {
  sites = [...new Set(require(path.join(__dirname, 'sites', listName)))];
} catch (err) {
  console.error(`Could not load sites/${listName}.js - ${err.message}`);
  process.exit(1);
}

const csv = (v) => `"${String(v).replace(/"/g, '""')}"`;

async function check(site) {
  let url;
  try {
    url = new URL(site.trim());
  } catch {
    return { site, url: '', status: 'ERROR: invalid URL' };
  }
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_campaign', campaign);

  try {
    const res = await got(url.href, { timeout: TIMEOUT_MS, retry: 1 });
    const status = res.body.includes(MARKER) ? 'UTM is working' : 'UTM not working';
    return { site, url: url.href, status };
  } catch (err) {
    const reason = err.response?.statusCode || err.code || err.message;
    return { site, url: url.href, status: `ERROR: ${reason}` };
  }
}

async function run() {
  fs.mkdirSync(path.join(__dirname, 'output'), { recursive: true });
  const outFile = path.join(__dirname, 'output', `${listName}.csv`);
  const out = fs.createWriteStream(outFile);
  out.write('URL,UTM_URL,STATUS\n');

  const counts = {};
  let next = 0;
  let done = 0;

  const worker = async () => {
    while (next < sites.length) {
      const r = await check(sites[next++]);
      const key = r.status.startsWith('ERROR') ? 'ERROR' : r.status;
      counts[key] = (counts[key] || 0) + 1;
      out.write([r.site, r.url, r.status].map(csv).join(',') + '\n');
      console.log(`[${++done}/${sites.length}] ${r.status} - ${r.site}`);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await new Promise((resolve) => out.end(resolve));

  console.log('\nSummary');
  Object.entries(counts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log(`\nAll done! Results saved to ${outFile}`);
}

run();
