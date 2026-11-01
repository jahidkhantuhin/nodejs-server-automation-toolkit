# Cloudways Server Tool

A collection of Node.js scripts that work with all the Cloudways (CW) servers behind the email and API key you provide, and forward the results to your webhook endpoints.

[Cloudways API Documentation](https://developers.cloudways.com/docs/)

## Requirements

- Node.js 14.16+ (the project uses ES modules)
- Yarn or npm
- A Cloudways account email and API key

## Setup

```bash
git clone <repo-url>
cd cloudways-server-tool
yarn install   # or: npm install
cp config.sample.js config.js
```

Edit `config.js`. This file is git-ignored, so credentials and webhook URLs are never committed.

| Key | Required | Description |
|---|---|---|
| `email` | yes | Cloudways account email |
| `apiKey` | yes | Cloudways API key |
| `webhooks` | yes | Array of webhook URLs that receive the data |
| `minIntervalSeconds` | no | Minimum seconds between Cloudways API requests (default `10`) |

## Scripts

Running `node index.js` only prints a reminder, so run the specific script you need.

### serverList.js

Generates a list of all servers and their sites, and sends the data to every endpoint in `config.webhooks`.

```bash
node serverList.js     # or: yarn server-list
```

For every server it sends the server details plus:

- `countApps`: number of apps on the server
- `sites`: one entry per app with `label`, `production_url`, `cloudways_url`, `staging` and `isPublic`

Notes:

- `isPublic` is `null` when the access state could not be fetched (the error is logged and counted in the summary).
- `master_user` and `master_password` are removed before sending.
- Cloudways API requests are spaced `minIntervalSeconds` apart (10s by default), so a large account takes a while: roughly one app every 10 seconds.
- The script exits with a non-zero code if it fails or if any webhook endpoint fails, so it is safe to use in cron jobs.

## Project structure

```
helpers/
  index.js       small utilities (sleep)
  cloudways.js   Cloudways API client (auth, token refresh, request spacing)
  webhook.js     sends data to the configured webhook endpoints
serverList.js    server and site list script
```

## Adding a new script

Create a new `.js` file in the project root, reuse the helpers in `helpers/`, and add a short entry under **Scripts** above.

## License

MIT
