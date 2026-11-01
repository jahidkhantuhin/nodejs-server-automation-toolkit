const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const got = require('got') // v11 (CommonJS)
const config = require('./config')

const sitesRoot = config.sitesRoot || `/home/master/applications/`
const wpBin = config.wpPath || `/usr/local/bin/wp`
const DRY_RUN = process.argv.includes('--dry-run')
const WP_TIMEOUT_MS = 120000
const WEBHOOK_TIMEOUT_MS = 60000

/**
 * Runs a WP-CLI command inside a site directory and returns its output.
 * Warnings that WP-CLI/PHP print to stderr do not count as a failure,
 * only a non-zero exit code (or a timeout) does.
 *
 * @param {string[]} args  wp arguments, e.g. ['option', 'get', 'home']
 * @param {string} cwd     the site's public_html directory
 * @returns {Promise<string>}
 */
function runWp(args, cwd) {
    return new Promise((resolve, reject) => {
        execFile(
            wpBin,
            args,
            { cwd, timeout: WP_TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 },
            (error, stdout, stderr) => {
                if (error) {
                    const reason = (stderr || error.message).trim()
                    return reject(new Error(`wp ${args.join(' ')} failed: ${reason}`))
                }
                resolve(stdout)
            }
        )
    })
}

// parses a `--json` list, ignoring any PHP notices printed before the JSON
function parseJsonList(output) {
    const start = output.indexOf('[')
    if (start === -1) throw new Error(`no JSON found in the output`)
    return JSON.parse(output.slice(start)) ?? []
}

async function getIP() {
    const { body } = await got(`https://checkip.amazonaws.com/`, { timeout: 10000, retry: 2 })
    return body.trim()
}

/**
 * Sends the data to every configured webhook.
 * Returns true only if all of them accepted it.
 */
async function sendWebhook(data) {
    let ok = true

    for (const webhook of config.webhooks) {
        // log only the host: the full URL may contain a secret token
        const name = new URL(webhook).host

        try {
            await got(webhook, {
                method: `post`,
                json: data,
                timeout: WEBHOOK_TIMEOUT_MS,
            })
        } catch (error) {
            ok = false
            console.error(`  Webhook error: ${name}`)
            console.error(`  ${error.response?.body ?? error.message}`)
        }
    }

    return ok
}

function checkConfig() {
    const hooks = config.webhooks
    if (!Array.isArray(hooks) || hooks.length === 0) {
        throw new Error(`No webhooks configured. Add them to the \`webhooks\` array in config.js.`)
    }
    hooks.forEach((hook) => {
        try { new URL(hook) } catch { throw new Error(`Invalid webhook URL in config.js: ${hook}`) }
    })
}

async function runScript() {
    checkConfig()

    if (DRY_RUN) console.log(`DRY RUN: nothing will be sent to the webhooks`)

    // get IP
    const ip = await getIP()
    console.log(`Server IP:`, ip)

    // get a list of all sites
    let sites
    try {
        sites = fs.readdirSync(sitesRoot, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
    } catch (error) {
        throw new Error(`Could not read ${sitesRoot}. Is this running on a Cloudways server? (${error.message})`)
    }

    console.log(`Found ${sites.length} sites`)

    const stats = { sent: 0, skipped: 0, failed: 0 }

    for (let index = 0; index < sites.length; index++) {
        const site = sites[index]
        const label = `[${index + 1}/${sites.length}] ${site}`
        const sitePath = path.join(sitesRoot, site, 'public_html')

        if (!fs.existsSync(sitePath)) {
            stats.skipped++
            console.log(`${label}: no public_html folder, skipped`)
            continue
        }

        try {
            const siteName = (await runWp(['option', 'get', 'blogname'], sitePath)).trim()
            const siteUrl = (await runWp(['option', 'get', 'home'], sitePath)).trim()
            const wpVersion = (await runWp(['core', 'version'], sitePath)).trim()
            const themes = parseJsonList(await runWp(['theme', 'list', '--json'], sitePath))
            const plugins = parseJsonList(await runWp(['plugin', 'list', '--json'], sitePath))

            const siteInfo = {
                site: siteName,
                url: siteUrl,
                wpVer: wpVersion,
                ip,
                themes: themes.filter(theme => theme.name != null),
                plugins: plugins.filter(plugin => plugin.name != null),
            }

            console.log(`${label}: ${siteInfo.site} - ${siteInfo.url} (WP ${siteInfo.wpVer}, ${siteInfo.themes.length} themes, ${siteInfo.plugins.length} plugins)`)

            if (DRY_RUN) {
                stats.sent++
                continue
            }

            if (await sendWebhook(siteInfo)) {
                stats.sent++
            } else {
                stats.failed++
            }
        } catch (error) {
            stats.failed++
            console.error(`${label}: [ERROR] ${error.message}`)
        }
    }

    console.log(`\nSummary`)
    console.log(`  ${DRY_RUN ? 'Collected' : 'Sent'}:  ${stats.sent}`)
    console.log(`  Skipped:  ${stats.skipped}`)
    console.log(`  Failed:   ${stats.failed}`)
    console.log(`All done!`)

    // non-zero exit code so cron jobs/monitoring can spot problems
    if (stats.failed > 0) process.exitCode = 1
}

// run the script
runScript().catch((error) => {
    console.error(`[FATAL]`, error.message)
    process.exit(1)
})
