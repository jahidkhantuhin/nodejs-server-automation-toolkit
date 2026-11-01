# 📬 wp-mailshift

> Change the admin email on **every WordPress site on your Cloudways server** with one command.

![Node.js](https://img.shields.io/badge/Node.js-18.3%2B-339933?logo=node.js&logoColor=white)
![WP-CLI](https://img.shields.io/badge/requires-WP--CLI-0073aa?logo=wordpress&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![License](https://img.shields.io/badge/license-ISC-blue)

---

## Why

When a developer leaves, an agency changes its shared inbox, or you simply want alerts going somewhere new, the admin email on each WordPress site has to change. Doing that site by site in `wp-admin` does not scale. **wp-mailshift** walks the Cloudways application directory, finds every WordPress install, and updates `admin_email` for all of them, safely and with a clear report at the end.

## Features

- **One command, every site.** Discovers WordPress apps automatically using the Cloudways folder layout.
- **Dry-run mode.** See exactly what would change before touching anything.
- **Idempotent.** Sites that already use the target email are skipped.
- **Fast but gentle.** Sites run in parallel with a configurable limit.
- **Safe by design.** No shell string building, so the email can never be run as a command.
- **Clear results.** Per-site status, a final summary, and a proper exit code for scripts and CI.
- **Zero dependencies.** Only Node.js and WP-CLI.

## Requirements

- Node.js **18.3 or newer**
- [WP-CLI](https://wp-cli.org) available as `wp` in your `PATH` (already present on Cloudways servers)
- Access to the server over SSH as the master user

## Quick start

```bash
git clone https://github.com/<your-username>/wp-mailshift.git
cd wp-mailshift

# 1. Preview the changes
node . devs@example.com --dry-run

# 2. Apply them
node . devs@example.com
```

No `npm install` is needed because the project has no dependencies.

## Usage

```
node . <email> [options]
```

| Option | Default | Description |
|---|---|---|
| `<email>` | required | The new admin email address |
| `--dry-run` | off | Report what would change without changing anything |
| `--root <dir>` | `/home/master/applications` | Applications directory to scan |
| `--concurrency <n>` | `4` | How many sites to process at the same time |
| `-h`, `--help` | | Show help |

Save the output to a file if you want a record:

```bash
node . devs@example.com > mailshift.log
```

### Example output

```
Using WP-CLI 2.10.0
Found 12 WordPress site(s), ignoring 2 non-WordPress app(s)
Setting admin email to devs@example.com

✅ https://client-one.com: old@agency.com → updated
✅ https://client-two.com: old@agency.com → updated
⏭️  https://client-three.com: already set, skipped
❌ client-four: Error: Error establishing a database connection.

Done. updated: 2, would update: 0, unchanged: 1, failed: 1
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Everything succeeded |
| `1` | At least one site failed, or a fatal error occurred |
| `2` | Invalid usage (bad email or option) |

## How it works

1. Checks that WP-CLI is installed.
2. Scans `<root>/<app>/public_html` and treats any folder containing `wp-config.php` as a WordPress site.
3. For each site, reads the current `admin_email` and `siteurl` with `wp option get`.
4. If the email differs, runs [`wp option update admin_email`](https://developer.wordpress.org/cli/commands/option/update/).
5. Prints a result per site and a summary at the end.

Plugins and themes are skipped during each WP-CLI call (`--skip-plugins --skip-themes`), so a broken plugin on one site does not block the update.

## Project structure

```
wp-mailshift/
├── index.js            # CLI entry point and reporting
├── lib/
│   ├── wp.js           # Safe WP-CLI wrapper
│   ├── sites.js        # Cloudways WordPress site discovery
│   └── utils.js        # Email validation and concurrency helper
├── test/
│   └── utils.test.js   # Unit tests (node:test)
├── package.json
└── README.md
```

Run the tests with:

```bash
npm test
```

## Good to know

- This changes the **general settings admin email** (`admin_email`). It does not change user accounts. Unlike changing it in `wp-admin`, WP-CLI applies the change immediately without a confirmation email.
- **Multisite networks** are treated as a single site and only their main `admin_email` is updated.
- Always run with `--dry-run` first on a server you have not used the tool on before.

## Troubleshooting

| Problem | Fix |
|---|---|
| `WP-CLI (wp) was not found in PATH` | Install WP-CLI or run the tool as the Cloudways master user |
| `Found 0 WordPress site(s)` | Check `--root`; the layout must be `<root>/<app>/public_html/wp-config.php` |
| A site shows `❌` | Open that site's folder and run `wp option get siteurl` to see the underlying error |

## What changed in v2

Rewritten from the original `remove_wp_users` script:

- Fixed a race condition caused by calling `process.chdir()` while sites ran in parallel
- Removed shell string building in favor of `execFile`, closing a command injection risk
- Stopped treating every WP-CLI warning on stderr as a failure
- Removed the unneeded `wp-cli` npm dependency and an unused hardcoded email
- Added `--dry-run`, `--root`, `--concurrency`, summaries, exit codes, and tests

## License

ISC, by Jahid Khan Tuhin.
