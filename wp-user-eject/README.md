# wp-user-eject

Node.js script that runs **on a Cloudways server** and removes one or more users from **every WordPress site** on it. The content of each deleted user (posts, pages, ...) is reassigned to an administrator of that site, so nothing is lost.

> **Deleting a user cannot be undone.** Take a server backup first, and always start with a dry run.

## Requirements

- A Cloudways server (SSH access as the master user)
- Node.js 14+
- WP-CLI at `/usr/local/bin/wp`

There are no dependencies to install.

## Setup

```bash
cp config.sample.js config.js
```

Edit `config.js` (it is git-ignored):

| Key | Description |
|---|---|
| `ownerEmailDomain` | Only administrators with an email on this domain may take over the deleted users' content. Administrators from other domains (for example a client's own staff) are never used. |
| `fallbackAdminEmail` | Administrator that is created on a site that has no eligible administrator. Must be on `ownerEmailDomain`. |
| `fallbackAdminLogin` | Username for that fallback administrator (default `wpadmin`). |

## Usage

The script does **not** delete anything unless you pass `--apply`.

```bash
node . --users="user@site.com,user2@site.com"                  # dry run
node . --users="user@site.com" --site=<app-folder> --apply     # one site, for real
node . --users="user@site.com,user2@site.com" --apply          # all sites, for real
```

Recommended order: dry run, then `--apply` on one site with `--site=`, check it, then `--apply` on all sites.

| Option | Description |
|---|---|
| `--users=` | Comma separated email addresses (required). Use email addresses, not user IDs. Case does not matter. |
| `--apply` | Really delete. Without it, only read-only commands run. |
| `--site=` | Limit the run to one site (the folder name in `/home/master/applications`). |

## How it works

For every site in `/home/master/applications`:

1. Checks that it is a working WordPress installation; if not, the site is skipped.
2. Looks up which of the given users exist on the site. **If none exist, the site is not touched at all.**
3. Picks the administrator who takes over the content: the lowest-ID administrator with an email on `ownerEmailDomain` who is not one of the users being deleted. The domain must match exactly (`user@notexample.com` does not count for `example.com`).
4. If there is no such administrator, it creates the fallback administrator. If the fallback address already exists on the site but is not an administrator, the site is reported as an error and **nothing is deleted** there.
5. Deletes each user and reassigns their content to the administrator from step 3 or 4.
6. Checks that the user is really gone.

The script refuses to run if one of the users is the fallback administrator.

## Report

Every run writes `output/wp-user-eject-<timestamp>.csv` (dry runs end in `-dry-run`) with one row per site and user:

| Status | Meaning |
|---|---|
| `deleted, content reassigned to ...` | done and verified |
| `would delete, content would go to ...` | dry run |
| `user not found on this site` | nothing to do |
| `skipped: ...` | not a WordPress site |
| `ERROR: ...` | failed; nothing was deleted for that user on that site |

The script exits with a non-zero code if anything failed. The reports contain client site URLs and email addresses; `output/` is git-ignored, do not commit it.

## License

MIT
