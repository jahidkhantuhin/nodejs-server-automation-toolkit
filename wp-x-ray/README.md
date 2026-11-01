# wp-x-ray

Node.js script that runs **on a Cloudways server** and creates a CSV report of every WordPress site on it, with the site's **active theme** and **active plugins**.

It replaces two separate scripts (one listed active plugins, the other the active theme) with a single run.

## Requirements

- A Cloudways server (SSH access as the master user)
- Node.js 14+
- WP-CLI at `/usr/local/bin/wp`

There are no dependencies to install.

## Usage

```bash
node .                        # active theme + active plugins
node . --theme                # active theme only
node . --plugins              # active plugins only
node . --site=<app-folder>    # one site only (the folder name in /home/master/applications)
```

The script prints one line per site and a summary, and saves the report to `output/wp-x-ray-<timestamp>.csv`. Every run creates a new file, so earlier reports are never overwritten.

### Report columns

| Column | Description |
|---|---|
| `APP` | Application folder name on the server |
| `SITE` | Site title |
| `URL` | Site home URL |
| `ACTIVE_THEME` | Slug of the active theme (with `--theme` or by default) |
| `PARENT_THEME` | Parent theme, when the active theme is a child theme |
| `PLUGIN_COUNT` | Number of active plugins (with `--plugins` or by default) |
| `ACTIVE_PLUGINS` | Active plugin slugs, separated by `; ` (network-activated plugins included) |
| `STATUS` | `OK`, `WARNING: ...`, `skipped: ...` or `ERROR: ...` |

Sites that fail are still written to the report with their error, so nothing disappears silently. A site where WP-CLI fails is logged and the script moves on. The script exits with a non-zero code if any site failed.

### Using with Cron

```
0 3 * * 1 cd /home/master/tools/wp-x-ray/ && node . >> run.log 2>&1
```

## Notes

- Plugins and themes are not loaded while collecting the data (`--skip-plugins --skip-themes`), so a broken plugin on one site cannot break the report.
- Text cells that start with `=`, `+`, `-` or `@` get a leading `'` so spreadsheets do not treat them as formulas.
- Reports contain client site names and URLs. `output/` is git-ignored; do not commit it.

## License

MIT
