#!/usr/bin/env node
"use strict";

/**
 * wp-breeze-cache-clear
 *
 * Clears the Breeze cache folder (wp-content/cache/breeze) of every
 * WordPress site on a Cloudways server.
 *
 * Usage: node . [--dry-run] [--root <dir>] [--concurrency <n>] [--cache-dir <name>]
 */

const fs = require("node:fs/promises");
const { parseArgs } = require("node:util");
const { mapWithConcurrency, formatBytes } = require("./lib/utils");
const { assertSafeDirName, clearAppCache, listApps } = require("./lib/cache");

const DEFAULT_ROOT = "/home/master/applications";
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_CACHE_DIR = "breeze";

const HELP = `
wp-breeze-cache-clear: clear the Breeze cache on every WordPress site on this server

Usage:
  node . [options]

Options:
  --dry-run              Show what would be deleted without deleting anything
  --root <dir>           Applications root (default: ${DEFAULT_ROOT})
  --cache-dir <name>     Folder inside wp-content/cache to clear (default: ${DEFAULT_CACHE_DIR})
  --concurrency <n>      Sites processed in parallel (default: ${DEFAULT_CONCURRENCY})
  -h, --help             Show this help

Examples:
  node . --dry-run
  node .
`;

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      "dry-run": { type: "boolean", default: false },
      root: { type: "string", default: DEFAULT_ROOT },
      "cache-dir": { type: "string", default: DEFAULT_CACHE_DIR },
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
    dirName: assertSafeDirName(values["cache-dir"]),
    concurrency,
  };
}

function report(result) {
  switch (result.status) {
    case "cleared":
      console.log(`✅ ${result.app}: cleared ${formatBytes(result.bytes)}`);
      break;
    case "would-clear":
      console.log(`🔎 ${result.app}: would clear ${formatBytes(result.bytes)}`);
      break;
    case "skipped":
      console.log(`⚠️  ${result.app}: skipped, ${result.reason}`);
      break;
    case "failed":
      console.log(`❌ ${result.app}: ${result.reason}`);
      break;
    default:
      break; // "missing" is summarised, not printed per app
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

  try {
    const rootReal = await fs.realpath(options.root);
    const apps = await listApps(options.root);

    console.log(`Scanning ${apps.length} app(s) in ${options.root}`);
    console.log(
      options.dryRun
        ? `Dry run: nothing will be deleted.\n`
        : `Clearing wp-content/cache/${options.dirName}\n`
    );

    const results = await mapWithConcurrency(apps, options.concurrency, async (app) => {
      const result = await clearAppCache({
        root: options.root,
        rootReal,
        app,
        dirName: options.dirName,
        dryRun: options.dryRun,
      });
      report(result);
      return result;
    });

    const count = (status) => results.filter((r) => r.status === status).length;
    const bytes = results.reduce((sum, r) => sum + (r.bytes || 0), 0);
    const verb = options.dryRun ? "would free" : "freed";

    console.log(
      `\nDone. ${options.dryRun ? "would clear" : "cleared"}: ` +
        `${count(options.dryRun ? "would-clear" : "cleared")}, ` +
        `no cache found: ${count("missing")}, skipped: ${count("skipped")}, ` +
        `failed: ${count("failed")}`
    );
    console.log(`Space ${verb}: ${formatBytes(bytes)}`);
    return count("failed") ? 1 : 0;
  } catch (error) {
    console.error(`Fatal: ${error.message}`);
    return 1;
  }
}

main().then((code) => process.exit(code));
