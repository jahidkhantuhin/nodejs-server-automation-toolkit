# Cloudways Site Tool

A Node.js tool that runs **on a Cloudways server**. It finds ALL the sites (applications) on that server, collects the following data about each WordPress site with WP-CLI, and sends it to the configured webhooks:

1. Site Name
2. Site URL
3. Site's WP Version
4. Site's themes
5. Site's plugins
6. Server's IP

This is a complete list, so it contains all the plugins and themes of every site.

> Looking for the Cloudways API side (servers list and app access state)? See the companion project, `cloudways-server-tool`.

## Requirements

- A Cloudways server (SSH access as the master user)
- Node.js 14+ and Yarn or npm
- WP-CLI at `/usr/local/bin/wp` (the Cloudways default)

## Installation

1. Clone the repository on the server.
2. Run `yarn` or `npm i` to install the dependencies.
3. Create your config:

```bash
cp config.sample.js config.js
```

## Configuration

Edit `config.js` (it is git-ignored, so webhook URLs are never committed):

| Key | Required | Description |
|---|---|---|
| `webhooks` | yes | Array of webhook URLs that receive the data of each site |
| `sitesRoot` | no | Applications folder (default `/home/master/applications/`) |
| `wpPath` | no | Path to WP-CLI (default `/usr/local/bin/wp`) |

## Usage

```bash
node .                 # collect and send the data
node . --dry-run       # collect the data but do NOT send anything
```

Use `--dry-run` first to check the output on a new server. One webhook request is sent per site, and the script prints a summary at the end.

Sites without a `public_html` folder are skipped. A site that fails (for example a broken WordPress install) is logged and the script moves on to the next one.

The script exits with a non-zero code if any site or webhook failed.

### Using with Cron

Provide the exact location of the script, and keep a log:

```
0 3 * * 0 cd /home/master/tools/cloudways-site-tool/ && node . >> run.log 2>&1
```

## License

MIT
