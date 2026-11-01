#!/usr/bin/env node
"use strict";

/**
 * wp-mailshift
 *
 * Finds every WordPress site on a Cloudways server and updates its
 * admin email in one pass.
 *
 * Usage: node . <email> [--dry-run] [--root <dir>] [--concurrency <n>]
 */

const { parseArgs } = require("node:util");
const { isValidEmail, mapWithConcurrency } = require("./lib/utils");
const { findWordPressSites } = require("./lib/sites");
const { assertWpCli, getOption, updateOption } = require("./lib/wp");

const DEFAULT_ROOT = "/home/master/applications";
const DEFAULT_CONCURRENCY = 4;

const HELP = `
wp-mailshift: update the admin email of every WordPress site on this server

Usage:
  node . <email> [options]

Options:
  --dry-run              Show what would change without changing anything
  --root <dir>           Applications root (default: ${DEFAULT_ROOT})
  --concurrency <n>      Sites processed in parallel (default: ${DEFAULT_CONCURRENCY})
  -h, --help             Show this help

Examples:
  node . devs@example.com --dry-run
  node . devs@example.com
`;

function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean", default: false },
      root: { type: "string", default: DEFAULT_ROOT },
      concurrency: { type: "string", default: String(DEFAULT_CONCURRENCY) },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const concurrency = Number.parseInt(values.concurrency, 10);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("--concurrency must be a whole number of 1 or more.");
  }

  return {
    help: values.help,
    dryRun: values["dry-run"],
    root: values.root,
    concurrency,
    email: positionals[0] ? positionals[0].trim() : "",
  };
}

async function processSite(site, email, dryRun) {
  try {
    const [siteUrl, current] = await Promise.all([
      getOption(site.webRoot, "siteurl"),
      getOption(site.webRoot, "admin_email"),
    ]);

    const base = { name: site.name, siteUrl, previous: current };

    if (current.toLowerCase() === email.toLowerCase()) {
      return { ...base, status: "unchanged" };
    }
    if (dryRun) {
      return { ...base, status: "would-update" };
    }

    await updateOption(site.webRoot, "admin_email", email);
    return { ...base, status: "updated" };
  } catch (error) {
    return { name: site.name, status: "failed", error: error.message };
  }
}

function report(result) {
  const label = result.siteUrl || result.name;
  switch (result.status) {
    case "updated":
      console.log(`✅ ${label}: ${result.previous} → updated`);
      break;
    case "would-update":
      console.log(`🔎 ${label}: would change ${result.previous}`);
      break;
    case "unchanged":
      console.log(`⏭️  ${label}: already set, skipped`);
      break;
    default:
      console.log(`❌ ${result.name}: ${result.error}`);
  }
}

async function main() {
  let options;
  try {
    options = parseCli(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${error.message}\n${HELP}`);
    return 2;
  }

  if (options.help) {
    console.log(HELP);
    return 0;
  }

  if (!isValidEmail(options.email)) {
    console.error(`Error: a valid email address is required.\n${HELP}`);
    return 2;
  }

  try {
    console.log(`Using ${await assertWpCli()}`);
    const { sites, skipped } = findWordPressSites(options.root);

    console.log(
      `Found ${sites.length} WordPress site(s)` +
        (skipped.length ? `, ignoring ${skipped.length} non-WordPress app(s)` : "")
    );
    if (!sites.length) return 0;

    console.log(
      options.dryRun
        ? `Dry run: nothing will be changed.\n`
        : `Setting admin email to ${options.email}\n`
    );

    const results = await mapWithConcurrency(
      sites,
      options.concurrency,
      async (site) => {
        const result = await processSite(site, options.email, options.dryRun);
        report(result);
        return result;
      }
    );

    const count = (status) => results.filter((r) => r.status === status).length;
    console.log(
      `\nDone. updated: ${count("updated")}, would update: ${count("would-update")}, ` +
        `unchanged: ${count("unchanged")}, failed: ${count("failed")}`
    );
    return count("failed") ? 1 : 0;
  } catch (error) {
    console.error(`Fatal: ${error.message}`);
    return 1;
  }
}

main().then((code) => process.exit(code));
