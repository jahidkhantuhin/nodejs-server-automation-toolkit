const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')

// SITES_ROOT and WP_BIN can be overridden with environment variables (useful for testing)
const sitesRoot = process.env.SITES_ROOT || `/home/master/applications/`
const wpBin = process.env.WP_BIN || `/usr/local/bin/wp`

/**
 * IMPORTANT!!!
 * --------------------------------
 * Define the IPs that must be allowed to reach wp-login.php and wp-admin.
 *
 * BASE_IP  - the IP that is already protecting the sites (the rule the script looks for)
 * NEW_IPS  - the new or changed IPs that must be added to every site
 *
 * The script is safe to run more than once: IPs that are already there are not added again.
 */
const BASE_IP = `34.238.213.152`
const NEW_IPS = [`54.179.205.95`]

const APPLY = process.argv.includes('--apply')
const ONLY = (process.argv.find(arg => arg.startsWith('--only=')) || '').replace('--only=', '')
const WP_TIMEOUT_MS = 120000

/* ------------------------------------------------------------------ */
/* .htaccess rules                                                     */
/* ------------------------------------------------------------------ */

// the line that allows one IP, e.g. RewriteCond %{REMOTE_ADDR} !^54\.179\.205\.95$
const ipCondition = (ip) => `RewriteCond %{REMOTE_ADDR} !^${ip.replace(/\./g, '\\.')}$`

// regex that finds the line of an IP (with or without escaped dots, any line ending)
function ipLineRegex(ip) {
    const octets = ip.split('.').join('\\\\?\\.')
    return new RegExp(`^[ \\t]*RewriteCond %\\{REMOTE_ADDR\\} !\\^${octets}\\$[ \\t]*\\r?$`, 'm')
}

// the complete VPN block, added to sites that do not have it yet
function completeBlock(eol) {
    return [
        `# VPN Protection`,
        `<IfModule mod_rewrite.c>`,
        `RewriteEngine on`,
        `RewriteCond %{REQUEST_URI} ^(.*)?wp-login\\.php(.*)$ [OR]`,
        `RewriteCond %{REQUEST_URI} ^(.*)?wp-admin(.*)$`,
        ...[BASE_IP, ...NEW_IPS].map(ipCondition),
        `RewriteRule ^(.*)$ - [R=403,L]`,
        `</IfModule>`,
        `# END VPN Protection`,
    ].join(eol)
}

// the end of a regex match, without a trailing \r
const matchEnd = (match) => match.index + match[0].replace(/\r$/, '').length

/**
 * Decides what has to change in an .htaccess file.
 *
 * @param {string} text  current content of the file
 * @returns {{action: 'ok'|'add_ips'|'add_block'|'review', text?: string, ips?: string[], note?: string}}
 */
function planChange(text) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n'
    const baseMatch = ipLineRegex(BASE_IP).exec(text)

    // the VPN rules exist: only add the IPs that are missing
    if (baseMatch) {
        const missing = NEW_IPS.filter(ip => !ipLineRegex(ip).test(text))
        if (missing.length === 0) return { action: 'ok' }

        const at = matchEnd(baseMatch)
        const added = missing.map(ip => eol + ipCondition(ip)).join('')
        return { action: 'add_ips', ips: missing, text: text.slice(0, at) + added + text.slice(at) }
    }

    // a VPN block exists but not in the expected shape: do not guess
    if (text.includes(`VPN Protection`)) {
        return { action: 'review', note: `has a VPN Protection block without the ${BASE_IP} rule` }
    }

    // no VPN rules: add the complete block after the WordPress rules
    const marker = /^# END WordPress[ \t]*\r?$/m.exec(text)
    if (!marker) return { action: 'review', note: `no "# END WordPress" marker found` }

    const at = matchEnd(marker)
    const rest = text.slice(at)
    return {
        action: 'add_block',
        text: text.slice(0, at) + eol + eol + completeBlock(eol) + (rest === '' ? eol : '') + rest,
    }
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Runs a WP-CLI command inside a site directory and returns its output.
 * Warnings printed to stderr do not count as a failure, only a non-zero
 * exit code (or a timeout) does.
 *
 * @param {string[]} args  e.g. ['option', 'get', 'home']
 * @param {string} cwd     the site's public_html directory
 */
function runWp(args, cwd) {
    return new Promise((resolve, reject) => {
        execFile(wpBin, args, { cwd, timeout: WP_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) return reject(new Error((stderr || error.message).trim()))
            resolve(stdout)
        })
    })
}

// the site name and URL are only used in the report, so a failure here must not block the update
async function getSiteInfo(sitePath) {
    try {
        const name = (await runWp(['option', 'get', 'blogname'], sitePath)).trim()
        const url = (await runWp(['option', 'get', 'home'], sitePath)).trim()
        return { name, url }
    } catch {
        return { name: 'N/A', url: 'N/A' }
    }
}

const csv = (value) => `"${String(value).replace(/"/g, '""')}"`
const row = (cells) => cells.map(csv).join(',') + '\n'

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

async function runScript() {
    const ipFormat = /^\d{1,3}(\.\d{1,3}){3}$/
    for (const ip of [BASE_IP, ...NEW_IPS]) {
        if (!ipFormat.test(ip)) throw new Error(`"${ip}" is not a valid IPv4 address`)
    }

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '')
    const backupDir = path.join(__dirname, 'backups', stamp)
    const reportFile = path.join(__dirname, 'output', `vpn-rules-${stamp}${APPLY ? '' : '-dry-run'}.csv`)

    console.log(APPLY
        ? `APPLY MODE: .htaccess files will be changed (backups: ${backupDir})`
        : `DRY RUN: no file will be changed. Run again with --apply to make the changes.`)
    console.log(`IPs: ${[BASE_IP, ...NEW_IPS].join(', ')}\n`)

    // get a list of all sites
    let sites
    try {
        sites = fs.readdirSync(sitesRoot, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
    } catch (error) {
        throw new Error(`Could not read ${sitesRoot}. Is this running on a Cloudways server? (${error.message})`)
    }

    if (ONLY) {
        if (!sites.includes(ONLY)) throw new Error(`No site folder named "${ONLY}" in ${sitesRoot}`)
        sites = [ONLY]
    }

    console.log(`Found ${sites.length} site(s)`)

    fs.mkdirSync(path.dirname(reportFile), { recursive: true })
    const report = fs.createWriteStream(reportFile)
    report.write(row(['APP', 'SITE', 'URL', 'STATUS']))

    const stats = { changed: 0, upToDate: 0, skipped: 0, failed: 0 }
    const would = APPLY ? '' : 'would be '

    for (let index = 0; index < sites.length; index++) {
        const site = sites[index]
        const label = `[${index + 1}/${sites.length}] ${site}`
        const sitePath = path.join(sitesRoot, site, 'public_html')
        const htaccess = path.join(sitePath, '.htaccess')

        let status
        let info = { name: 'N/A', url: 'N/A' }

        try {
            if (!fs.existsSync(sitePath)) {
                stats.skipped++
                status = `skipped: no public_html folder`
            } else if (!fs.existsSync(htaccess)) {
                stats.skipped++
                status = `skipped: no .htaccess file`
            } else {
                info = await getSiteInfo(sitePath)

                const original = fs.readFileSync(htaccess, 'utf8')
                const plan = planChange(original)

                if (plan.action === 'ok') {
                    stats.upToDate++
                    status = `already up to date`
                } else if (plan.action === 'review') {
                    stats.skipped++
                    status = `skipped: needs manual review (${plan.note})`
                } else {
                    if (APPLY) {
                        // back up the original first, then write, then verify
                        fs.mkdirSync(backupDir, { recursive: true })
                        const backup = path.join(backupDir, `${site}.htaccess`)
                        fs.copyFileSync(htaccess, backup)

                        fs.writeFileSync(htaccess, plan.text)

                        if (planChange(fs.readFileSync(htaccess, 'utf8')).action !== 'ok') {
                            fs.copyFileSync(backup, htaccess)
                            throw new Error(`verification failed, the original file was restored`)
                        }
                    }

                    stats.changed++
                    status = plan.action === 'add_block'
                        ? `complete VPN block ${would}added`
                        : `IP ${plan.ips.join(', ')} ${would}added`
                }
            }
        } catch (error) {
            stats.failed++
            status = `ERROR: ${error.message}`
        }

        console.log(`${label}: ${status}`)
        report.write(row([site, info.name, info.url, status]))
    }

    await new Promise(resolve => report.end(resolve))

    console.log(`\nSummary`)
    console.log(`  ${APPLY ? 'Changed' : 'Would change'}:  ${stats.changed}`)
    console.log(`  Up to date:   ${stats.upToDate}`)
    console.log(`  Skipped:      ${stats.skipped}`)
    console.log(`  Failed:       ${stats.failed}`)
    console.log(`\nReport: ${reportFile}`)
    if (!APPLY && stats.changed > 0) console.log(`Nothing was changed. Run with --apply to make the changes.`)

    // non-zero exit code so problems are noticed
    if (stats.failed > 0) process.exitCode = 1
}

runScript().catch((error) => {
    console.error(`[FATAL]`, error.message)
    process.exit(1)
})
