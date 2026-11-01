# wp-breeze-cache-clear

> Clear the **Breeze cache** on every WordPress site on your Cloudways server with one command, and see how much space you got back.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![Platform](https://img.shields.io/badge/platform-Cloudways-1d4ed8)
![License](https://img.shields.io/badge/license-ISC-blue)

---

## Why

[Breeze](https://wordpress.org/plugins/breeze/) is the cache plugin bundled with Cloudways WordPress hosting. Its files live in `wp-content/cache/breeze`, and after a theme change, a migration, or a bad deploy you may need to wipe them on many sites at once. Doing that from each site's dashboard is slow. **wp-breeze-cache-clear** finds every app on the server, removes that folder, and reports what it cleared.

Breeze rebuilds its cache automatically on the next visits, so clearing it is safe.

## Features

- **One command, every site.** Walks the Cloudways application directory for you.
- **Dry-run mode.** Preview exactly what would be deleted and how much space it uses.
- **Space report.** Shows the size cleared per site and in total.
- **Safe deletion.** Never follows symlinks and never deletes outside the applications root.
- **No shell involved.** Deletion uses Node's own file APIs instead of `rm -rf`.
- **Script-friendly.** Clear exit codes and plain-text output.
- **Zero dependencies.** Only Node.js.

## Requirements

- Node.js **18 or newer**
- SSH access to the Cloudways server as the master user (so the app folders are writable)

## Quick start

```bash
git clone https://github.com/<your-username>/wp-breeze-cache-clear.git
cd wp-breeze-cache-clear

# 1. Preview
node . --dry-run

# 2. Clear the caches
node .
```

No `npm install` is needed.

## Usage

```
node . [options]
```

| Option | Default | Description |
|---|---|---|
| `--dry-run` | off | Show what would be deleted without deleting anything |
| `--root <dir>` | `/home/master/applications` | Applications directory to scan |
| `--cache-dir <name>` | `breeze` | Folder inside `wp-content/cache` to clear |
| `--concurrency <n>` | `4` | How many sites to process at the same time |
| `-h`, `--help` | | Show help |

Save the output to a file if you want a record:

```bash
node . > wp-breeze-cache-clear.log
```

### Example output

```
Scanning 14 app(s) in /home/master/applications
Clearing wp-content/cache/breeze

✅ abcdefghij: cleared 182.4 MB
✅ klmnopqrst: cleared 41.7 MB
⚠️  uvwxyzabcd: skipped, is a symlink
❌ efghijklmn: EACCES: permission denied, rmdir '...'

Done. cleared: 2, no cache found: 10, skipped: 1, failed: 1
Space freed: 224.1 MB
```

Apps with no Breeze cache folder (static sites, apps without Breeze, freshly created apps) are counted under "no cache found" rather than listed one by one.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Finished with no failures |
| `1` | At least one site failed, or a fatal error occurred |
| `2` | Invalid usage (bad option or unsafe folder name) |

## How it works

1. Lists the app folders under the applications root.
2. For each app, looks for `public_html/wp-content/cache/breeze`.
3. Checks that the folder is a real folder (not a symlink) and that its parents resolve inside the applications root.
4. Measures its size, then deletes it (unless `--dry-run`).
5. Prints a result per site and a summary.

## Safety

Deleting files in bulk deserves care, so wp-breeze-cache-clear is deliberately strict:

- **Symlinks are skipped**, never followed, so a link can't trick the tool into deleting something elsewhere.
- **Parent folders are checked.** If `cache` points outside the applications root, the site is skipped.
- **`--cache-dir` accepts one plain folder name only.** Values like `../etc` or `a/b` are rejected before anything runs.
- **Only the cache folder is removed.** Other files in `wp-content/cache` are left alone.

Run `--dry-run` first on any server you haven't used the tool on before.

## Project structure

```
wp-breeze-cache-clear/
├── index.js            # CLI entry point and reporting
├── lib/
│   ├── cache.js        # Safe discovery, sizing and deletion
│   └── utils.js        # Concurrency helper and byte formatting
├── test/
│   └── cache.test.js   # Unit tests (node:test)
├── package.json
└── README.md
```

Run the tests with:

```bash
npm test
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `ENOENT` / `Fatal` on start | Check `--root`; the default is the Cloudways path `/home/master/applications` |
| Every app shows "no cache found" | Breeze may not be installed, or its cache folder has another name; try `--cache-dir` |
| `EACCES: permission denied` | Run as the Cloudways master user, not a per-app SFTP user |
| App folders have random names | That's normal on Cloudways; match them to sites in the platform dashboard |

## What changed in v2

Rewritten from the original `remove_cache_file` script:

- Fixed a race condition from calling `process.chdir()` inside async work
- Replaced `rm -rf` through a shell with Node's `fs.rm`, plus symlink and path-escape protection
- Stopped treating any stderr output as a failure
- A site without a cache folder is now a normal outcome instead of a logged error
- Corrected the docs: the old README and `package.json` described listing themes, which the code never did
- Added `--dry-run`, `--root`, `--cache-dir`, `--concurrency`, space reporting, a summary, exit codes, and tests

## License

ISC, by Jahid Khan Tuhin.
