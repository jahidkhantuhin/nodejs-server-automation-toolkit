"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { isValidEmail, mapWithConcurrency } = require("../lib/utils");
const { findWordPressSites } = require("../lib/sites");

test("isValidEmail accepts normal addresses", () => {
  for (const ok of ["a@b.co", "devs+wpadmin@example.com", "first.last@sub.example.org"]) {
    assert.equal(isValidEmail(ok), true, ok);
  }
});

test("isValidEmail rejects bad or risky input", () => {
  for (const bad of ["", "plain", "a@b", "a b@c.com", "-x@c.com", "a;rm@c.com", "a@c.com; ls", undefined]) {
    assert.equal(isValidEmail(bad), false, String(bad));
  }
});

test("mapWithConcurrency keeps order and respects the limit", async () => {
  let active = 0;
  let peak = 0;
  const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 10));
    active--;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12]);
  assert.ok(peak <= 2, `peak was ${peak}`);
});

test("mapWithConcurrency handles an empty list", async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, async (x) => x), []);
});

test("findWordPressSites separates WP apps from the rest", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mailshift-"));
  fs.mkdirSync(path.join(root, "wpapp", "public_html"), { recursive: true });
  fs.writeFileSync(path.join(root, "wpapp", "public_html", "wp-config.php"), "");
  fs.mkdirSync(path.join(root, "staticapp", "public_html"), { recursive: true });
  fs.writeFileSync(path.join(root, "notes.txt"), "");

  const { sites, skipped } = findWordPressSites(root);
  assert.deepEqual(sites.map((s) => s.name), ["wpapp"]);
  assert.deepEqual(skipped, ["staticapp"]);
  fs.rmSync(root, { recursive: true, force: true });
});
