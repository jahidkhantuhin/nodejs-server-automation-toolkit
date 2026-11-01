"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const DIR_NAME_RE = /^[A-Za-z0-9._-]+$/;

/**
 * The cache folder name becomes part of a path that gets deleted, so only
 * a single plain path segment is accepted (no slashes, no "..").
 *
 * @param {string} name
 * @returns {string} the same name, if safe
 */
function assertSafeDirName(name) {
  if (!DIR_NAME_RE.test(name) || name === "." || name === "..") {
    throw new Error(
      `Invalid cache folder name "${name}". Use a single folder name such as "breeze".`
    );
  }
  return name;
}

/**
 * Cloudways layout: <root>/<app>/public_html/wp-content/cache/<dirName>
 */
function cachePathFor(root, app, dirName) {
  return path.join(root, app, "public_html", "wp-content", "cache", dirName);
}

/**
 * Total size in bytes of a folder. Symlinks are not followed, and files that
 * vanish mid-scan (a live cache changes constantly) are ignored.
 *
 * @param {string} dir
 * @returns {Promise<number>}
 */
async function dirSize(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }

  let total = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(full);
    } else if (entry.isFile()) {
      try {
        total += (await fs.lstat(full)).size;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
  return total;
}

/**
 * Decides whether a target is safe to delete.
 *
 * @param {string} rootReal real path of the applications root
 * @param {string} target
 * @returns {Promise<{state: "missing"} | {state: "unsafe", reason: string} | {state: "ok"}>}
 */
async function inspectTarget(rootReal, target) {
  let stat;
  try {
    stat = await fs.lstat(target);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return { state: "missing" };
    throw error;
  }

  if (stat.isSymbolicLink()) return { state: "unsafe", reason: "is a symlink" };
  if (!stat.isDirectory()) return { state: "unsafe", reason: "is not a folder" };

  // Make sure no parent folder (e.g. "cache") is a symlink pointing elsewhere.
  const realParent = await fs.realpath(path.dirname(target));
  const rel = path.relative(rootReal, realParent);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { state: "unsafe", reason: "resolves outside the applications root" };
  }
  return { state: "ok" };
}

/**
 * Clears one app's cache folder.
 *
 * @param {object} p
 * @param {string} p.root       applications root
 * @param {string} p.rootReal   realpath of root
 * @param {string} p.app        app folder name
 * @param {string} p.dirName    cache folder name (already validated)
 * @param {boolean} p.dryRun
 * @returns {Promise<{app: string, status: "cleared"|"would-clear"|"missing"|"skipped"|"failed", bytes?: number, reason?: string}>}
 */
async function clearAppCache({ root, rootReal, app, dirName, dryRun }) {
  const target = cachePathFor(root, app, dirName);

  try {
    const check = await inspectTarget(rootReal, target);
    if (check.state === "missing") return { app, status: "missing" };
    if (check.state === "unsafe") return { app, status: "skipped", reason: check.reason };

    const bytes = await dirSize(target);
    if (dryRun) return { app, status: "would-clear", bytes };

    await fs.rm(target, { recursive: true, force: true, maxRetries: 2 });
    return { app, status: "cleared", bytes };
  } catch (error) {
    return { app, status: "failed", reason: error.message };
  }
}

/**
 * Lists app folders directly under the applications root.
 * @param {string} root
 * @returns {Promise<string[]>}
 */
async function listApps(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

module.exports = {
  assertSafeDirName,
  cachePathFor,
  dirSize,
  inspectTarget,
  clearAppCache,
  listApps,
};
