"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { formatBytes, mapWithConcurrency } = require("../lib/utils");
const { assertSafeDirName, clearAppCache, dirSize, listApps } = require("../lib/cache");

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wp-breeze-cache-clear-"));
}

function makeApp(root, app, files = { "a.html": "x".repeat(1000), "sub/b.html": "y".repeat(500) }) {
  const dir = path.join(root, app, "public_html", "wp-content", "cache", "breeze");
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return dir;
}

test("formatBytes", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(5 * 1024 ** 2), "5.0 MB");
});

test("assertSafeDirName accepts plain names and rejects traversal", () => {
  assert.equal(assertSafeDirName("breeze"), "breeze");
  for (const bad of ["", "..", ".", "a/b", "../x", "a b", "x;y"]) {
    assert.throws(() => assertSafeDirName(bad), /Invalid cache folder name/, bad);
  }
});

test("mapWithConcurrency keeps order and respects the limit", async () => {
  let active = 0;
  let peak = 0;
  const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 10));
    active--;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10]);
  assert.ok(peak <= 2);
});

test("dirSize sums nested files", async () => {
  const root = makeRoot();
  const dir = makeApp(root, "app1");
  assert.equal(await dirSize(dir), 1500);
  fs.rmSync(root, { recursive: true, force: true });
});

test("dry run reports size but deletes nothing", async () => {
  const root = makeRoot();
  const dir = makeApp(root, "app1");
  const rootReal = fs.realpathSync(root);

  const res = await clearAppCache({ root, rootReal, app: "app1", dirName: "breeze", dryRun: true });
  assert.equal(res.status, "would-clear");
  assert.equal(res.bytes, 1500);
  assert.ok(fs.existsSync(dir));
  fs.rmSync(root, { recursive: true, force: true });
});

test("real run deletes the cache folder only", async () => {
  const root = makeRoot();
  const dir = makeApp(root, "app1");
  const keep = path.join(path.dirname(dir), "keep.txt");
  fs.writeFileSync(keep, "stay");
  const rootReal = fs.realpathSync(root);

  const res = await clearAppCache({ root, rootReal, app: "app1", dirName: "breeze", dryRun: false });
  assert.equal(res.status, "cleared");
  assert.equal(res.bytes, 1500);
  assert.equal(fs.existsSync(dir), false);
  assert.equal(fs.existsSync(keep), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test("apps without a cache folder are reported as missing", async () => {
  const root = makeRoot();
  fs.mkdirSync(path.join(root, "static", "public_html"), { recursive: true });
  const rootReal = fs.realpathSync(root);

  const res = await clearAppCache({ root, rootReal, app: "static", dirName: "breeze", dryRun: false });
  assert.equal(res.status, "missing");
  fs.rmSync(root, { recursive: true, force: true });
});

test("a symlinked cache folder is skipped and its target survives", async () => {
  const root = makeRoot();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "outside-"));
  fs.writeFileSync(path.join(outside, "precious.txt"), "data");

  const cacheDir = path.join(root, "app1", "public_html", "wp-content", "cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.symlinkSync(outside, path.join(cacheDir, "breeze"));
  const rootReal = fs.realpathSync(root);

  const res = await clearAppCache({ root, rootReal, app: "app1", dirName: "breeze", dryRun: false });
  assert.equal(res.status, "skipped");
  assert.ok(fs.existsSync(path.join(outside, "precious.txt")));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test("a symlinked parent folder pointing outside the root is skipped", async () => {
  const root = makeRoot();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "outside-"));
  fs.mkdirSync(path.join(outside, "breeze"));
  fs.writeFileSync(path.join(outside, "breeze", "precious.txt"), "data");

  const wpContent = path.join(root, "app1", "public_html", "wp-content");
  fs.mkdirSync(wpContent, { recursive: true });
  fs.symlinkSync(outside, path.join(wpContent, "cache"));
  const rootReal = fs.realpathSync(root);

  const res = await clearAppCache({ root, rootReal, app: "app1", dirName: "breeze", dryRun: false });
  assert.equal(res.status, "skipped");
  assert.ok(fs.existsSync(path.join(outside, "breeze", "precious.txt")));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test("listApps returns only folders, sorted", async () => {
  const root = makeRoot();
  fs.mkdirSync(path.join(root, "b"));
  fs.mkdirSync(path.join(root, "a"));
  fs.writeFileSync(path.join(root, "file.txt"), "");
  assert.deepEqual(await listApps(root), ["a", "b"]);
  fs.rmSync(root, { recursive: true, force: true });
});
