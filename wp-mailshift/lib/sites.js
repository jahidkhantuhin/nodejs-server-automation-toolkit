"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Scans a Cloudways applications root and splits its folders into
 * WordPress sites (have wp-config.php in public_html) and everything else.
 *
 * Layout: <root>/<app>/public_html/wp-config.php
 *
 * @param {string} root
 * @returns {{ sites: {name: string, webRoot: string}[], skipped: string[] }}
 */
function findWordPressSites(root) {
  const sites = [];
  const skipped = [];

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const webRoot = path.join(root, entry.name, "public_html");
    if (fs.existsSync(path.join(webRoot, "wp-config.php"))) {
      sites.push({ name: entry.name, webRoot });
    } else {
      skipped.push(entry.name);
    }
  }

  sites.sort((a, b) => a.name.localeCompare(b.name));
  return { sites, skipped };
}

module.exports = { findWordPressSites };
