# wp-admin-vpn-allowlist

Node.js script that runs **on a Cloudways server** and adds the VPN IP allowlist to the `.htaccess` of every WordPress site on it. Visitors whose IP is not in the list get a `403` on `wp-login.php` and `wp-admin`.

For each site it:

- adds the complete `# VPN Protection` block (after `# END WordPress`) if the site has no VPN rules yet, or
- adds only the new IPs to the existing rules (blocks written earlier under a different comment title are recognized by their IP rule and keep their original title), and
- writes a CSV report of what happened to every site.

It is safe to run more than once: IPs that are already present are not added again.

## Requirements

- A Cloudways server (SSH access as the master user)
- Node.js 14+
- WP-CLI at `/usr/local/bin/wp` (only used to put the site name and URL in the report)

There are no dependencies to install.

## Configure the IPs

Open `index.js` and edit the two constants at the top:

```js
const BASE_IP = `34.238.213.152`      // the IP that already protects the sites
const NEW_IPS = [`54.179.205.95`]     // the new or changed IPs to add
```

## Usage

The script does **not** change anything unless you pass `--apply`.

```bash
node .                       # dry run: shows what would change on every site
node . --only=<app-folder>   # limit the run to one site (the folder name in /home/master/applications)
node . --apply               # make the changes
```

Recommended order: run a dry run, apply it to one site with `--only`, open that site and check that the front end works and the admin is blocked outside the VPN, then run `--apply` for all sites.

### What `--apply` does for each changed site

1. Copies the current `.htaccess` to `backups/<timestamp>/<app-folder>.htaccess`
2. Writes the updated file
3. Re-reads it to verify the result; if the check fails, the original is restored

### Statuses in the report

| Status | Meaning |
|---|---|
| `complete VPN block added` | the site had no VPN rules; the full block was added |
| `IP x.x.x.x added` | the site had the rules; the new IP(s) were added |
| `already up to date` | nothing to do |
| `skipped: no public_html folder` / `no .htaccess file` | not a standard WordPress app |
| `skipped: needs manual review (...)` | the file is not in the expected shape (for example no `# END WordPress` line); fix it by hand |
| `ERROR: ...` | something failed; the script moves on to the next site |

Reports are written to `output/vpn-rules-<timestamp>.csv` (dry runs end in `-dry-run`). The script exits with a non-zero code if any site failed.

## Rolling back

Every changed file was backed up first. To restore all sites changed in one run:

```bash
cd backups/<timestamp>
for f in *.htaccess; do
  app="${f%.htaccess}"
  cp "$f" "/home/master/applications/$app/public_html/.htaccess"
done
```

## Important notes

- **`admin-ajax.php` is blocked too.** The rules block everything under `wp-admin` for non-VPN visitors, and that includes `wp-admin/admin-ajax.php`, which many themes and plugins use for front-end features (forms, carts, filters, live search). Test the public site after applying.
- **Backups contain client site configuration.** `backups/` and `output/` are git-ignored; do not commit them.

## License

MIT
