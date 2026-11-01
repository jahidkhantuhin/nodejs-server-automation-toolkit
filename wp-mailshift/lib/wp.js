"use strict";

const { execFile } = require("node:child_process");

// Skipping plugins/themes keeps WP-CLI fast and stops a broken plugin from
// breaking the command.
const SAFE_FLAGS = ["--skip-plugins", "--skip-themes"];
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Runs WP-CLI inside `cwd` and resolves with trimmed stdout.
 *
 * Uses execFile with an argument array (no shell), so values such as an
 * email address can never be interpreted as shell syntax. The working
 * directory is passed per call rather than via process.chdir(), which is
 * process-wide and unsafe when sites are processed in parallel.
 *
 * Only a non-zero exit code counts as failure; WP-CLI often writes harmless
 * warnings to stderr.
 *
 * @param {string} cwd
 * @param {string[]} args
 * @returns {Promise<string>}
 */
function runWp(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile(
      "wp",
      [...args, ...SAFE_FLAGS],
      { cwd, timeout: DEFAULT_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = (stderr || "").trim() || error.message;
          return reject(new Error(detail));
        }
        resolve(stdout.trim());
      }
    );
  });
}

/**
 * Fails fast with a clear message if WP-CLI is not installed.
 * @returns {Promise<string>} the WP-CLI version string
 */
function assertWpCli() {
  return new Promise((resolve, reject) => {
    execFile("wp", ["--version"], { timeout: 10_000 }, (error, stdout) => {
      if (error) {
        return reject(
          new Error(
            error.code === "ENOENT"
              ? "WP-CLI (`wp`) was not found in PATH. Install it first: https://wp-cli.org"
              : `WP-CLI check failed: ${error.message}`
          )
        );
      }
      resolve(stdout.trim());
    });
  });
}

const getOption = (cwd, name) => runWp(cwd, ["option", "get", name]);
const updateOption = (cwd, name, value) =>
  runWp(cwd, ["option", "update", name, value]);

module.exports = { runWp, assertWpCli, getOption, updateOption };
