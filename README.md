# nodejs-server-automation-toolkit

> A collection of small, focused Node.js tools for automating WordPress and Cloudways server work, one task per project.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)
![Projects](https://img.shields.io/badge/projects-7-informational)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

---

## Overview

Managing many WordPress sites across one or more servers means repeating the same chores again and again. This toolkit bundles seven small projects, each built to do exactly one job across every site on a server (or a list of sites), so you can stop doing them by hand.

Each project is self-contained, with its own folder, its own configuration, and its own run command.

## Table of Contents

- [Projects at a Glance](#projects-at-a-glance)
- [Project Details](#project-details)
  - [wp-user-eject](#wp-user-eject)
  - [wp-x-ray](#wp-x-ray)
  - [wp-admin-vpn-allowlist](#wp-admin-vpn-allowlist)
  - [cloudways-server-tool](#cloudways-server-tool)
  - [cloudways-site-tool](#cloudways-site-tool)
  - [utm-carry-checker](#utm-carry-checker)
  - [youtube-embed-finder](#youtube-embed-finder)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Repository Structure](#repository-structure)
- [Safety Notes](#safety-notes)
- [Contributing](#contributing)
- [License](#license)

---

## Projects at a Glance

| Project | What it does |
|---|---|
| [`wp-user-eject`](#wp-user-eject) | Removes users from every site and reassigns their content |
| [`wp-x-ray`](#wp-x-ray) | Lists the active theme and plugins of every site |
| [`wp-admin-vpn-allowlist`](#wp-admin-vpn-allowlist) | Adds the VPN IP rules to each site's `.htaccess` |
| [`cloudways-server-tool`](#cloudways-server-tool) | Lists servers through the Cloudways API |
| [`cloudways-site-tool`](#cloudways-site-tool) | Sends each site's full theme and plugin data to your webhook |
| [`utm-carry-checker`](#utm-carry-checker) | Checks UTM tracking on a list of sites |
| [`youtube-embed-finder`](#youtube-embed-finder) | Finds pages that embed YouTube |

---

## Project Details

### wp-user-eject

Removes a user from every WordPress site on the server and reassigns their posts and other content to another user, so nothing is orphaned.

**Tasks**
- Find the target user on each site
- Reassign their content to a designated user
- Remove the user from the site

```bash
cd wp-user-eject
node index.js
```

---

### wp-x-ray

Gives you a quick inventory of what is running across your sites by listing the active theme and plugins of every site.

**Tasks**
- Discover every site on the server
- Read the active theme and active plugins for each
- Print the results as a readable list

```bash
cd wp-x-ray
node index.js
```

---

### wp-admin-vpn-allowlist

Locks down `wp-admin` access by adding your VPN IP rules to each site's `.htaccess`.

**Tasks**
- Locate each site's `.htaccess`
- Insert the VPN IP allow rules
- Skip sites that already have the rules

```bash
cd wp-admin-vpn-allowlist
node index.js
```

---

### cloudways-server-tool

Lists the servers on your Cloudways account through the Cloudways API.

**Tasks**
- Authenticate with the Cloudways API
- Fetch all servers
- Print the server list

```bash
cd cloudways-server-tool
node index.js
```

---

### cloudways-site-tool

Collects each site's full theme and plugin data and sends it to your webhook, which is handy for dashboards, spreadsheets, or auditing workflows.

**Tasks**
- Gather theme and plugin data for every site
- Post the data to your configured webhook URL

```bash
cd cloudways-site-tool
node index.js
```

---

### utm-carry-checker

Checks whether UTM tracking parameters survive on a list of sites, for example through redirects, so you know campaign attribution is not being lost.

**Tasks**
- Read a list of site URLs
- Request each URL with UTM parameters attached
- Report whether the UTM values carry through

```bash
cd utm-carry-checker
node index.js
```

---

### youtube-embed-finder

Scans sites to find the pages that embed YouTube videos.

**Tasks**
- Crawl or read the pages of each site
- Detect YouTube embeds (iframes and links)
- List the pages where embeds were found

```bash
cd youtube-embed-finder
node index.js
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- npm
- Server access for the projects that work directly on sites (for example SSH access to the Cloudways server)
- A Cloudways API key and email for the `cloudways-*` projects

### Installation

```bash
git clone https://github.com/<your-username>/nodejs-server-automation-toolkit.git
cd nodejs-server-automation-toolkit/<project-name>
npm install
```

Then run the project as shown in its section above.

---

## Configuration

Each project reads its settings from a `.env` file in its own folder. Copy the example file and fill it in:

```bash
cp .env.example .env
```

Typical variables (see each project's `.env.example` for the exact list):

| Variable | Used by | Description |
|---|---|---|
| `CLOUDWAYS_EMAIL` | `cloudways-*` | Your Cloudways account email |
| `CLOUDWAYS_API_KEY` | `cloudways-*` | Your Cloudways API key |
| `WEBHOOK_URL` | `cloudways-site-tool` | Where site theme and plugin data is sent |
| `VPN_IPS` | `wp-admin-vpn-allowlist` | Comma-separated list of VPN IPs to allow |
| `REASSIGN_USER` | `wp-user-eject` | The user that receives reassigned content |

> **Never commit your `.env` files.** They are listed in `.gitignore`.

---

## Repository Structure

```
nodejs-server-automation-toolkit/
├── wp-user-eject/
├── wp-x-ray/
├── wp-admin-vpn-allowlist/
├── cloudways-server-tool/
├── cloudways-site-tool/
├── utm-carry-checker/
├── youtube-embed-finder/
├── .gitignore
├── LICENSE
└── README.md
```

---

## Safety Notes

Some of these tools change live sites:

- `wp-user-eject` deletes users and reassigns content.
- `wp-admin-vpn-allowlist` edits `.htaccess` files, and a wrong IP list can lock you out of `wp-admin`.

Before running them on production:

1. Take a backup of the affected sites.
2. Test on a single staging site first.
3. Double-check your configuration values.

The remaining projects are read-only or reporting tools.

---

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-improvement`
3. Commit your changes: `git commit -m "Add my improvement"`
4. Push the branch: `git push origin feature/my-improvement`
5. Open a pull request

Please keep each project focused on a single task.

---

## License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for details.
