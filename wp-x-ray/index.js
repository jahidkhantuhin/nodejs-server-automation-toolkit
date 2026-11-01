const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')

// SITES_ROOT and WP_BIN can be overridden with environment variables (useful for testing)
const sitesRoot = process.env.SITES_ROOT || `/home/master/applications/`
const wpBin = process.env.WP_BIN || `/usr/local/bin/wp`

const WP_TIMEOUT_MS = 120000
// do not load plugins/themes while querying: faster, and a broken plugin cannot break the report
const SKIP = ['--skip-plugins', '--skip-themes']

/* ------------------------------------------------------------------ */
/* options                                                             */
/* ------------------------------------------------------------------ */

const USAGE = `Usage: node index.js [--theme] [--plugins] [--site=<app-folder>]

  --theme               only collect the active theme
  --plugins             only collect the active plugins
  (no flag)             collect both
  --site=<app-folder>   limit the run to one site`

const args = process.argv.slice(2)
const unknown = args.filter(a => !['--theme', '--plugins'].includes(a) && !a.startsWith('--site='))
if (unknown.length > 0) {
    console.error(`Unknown option: ${unknown.join(' ')}\n\n${USAGE}`)
    process.exit(1)
}

const wantTheme = args.includes('--theme') || !args.includes('--plugins')
const wantPlugins = args.includes('--plugins') || !args.includes('--theme')
const onlySite = (args.find(a => a.startsWith('--site=')) || '').replace('--site=', '')

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
        execFile(wpBin, args, { cwd, timeout: WP_TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) return reject(new Error((stderr || error.message).trim()))
            resolve(stdout)
        })
    })
}

// parses a `--json` list, ignoring any PHP notices printed before the JSON
function parseJsonList(output) {
    const start = output.indexOf('[')
    if (start === -1) throw new Error(`no JSON found in the WP-CLI output`)
    return JSON.parse(output.slice(start)) ?? []
}

// CSV cell: quoted, quotes doubled, and neutralised if a spreadsheet could read it as a formula
function csv(value) {
    let text = String(value ?? '')
    if (/^[=+\-@]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
}

/* ------------------------------------------------------------------ */
/* data collection                                                     */
/* ------------------------------------------------------------------ */

/**
 * Collects the data of one site. Throws if WP-CLI fails.
 * Returns the site info plus a list of warnings (things that look odd but are not errors).
 */
async function collectSite(sitePath) {
    const info = { warnings: [] }

    info.site = (await runWp(['option', 'get', 'blogname', ...SKIP], sitePath)).trim()
    info.url = (await runWp(['option', 'get', 'home', ...SKIP], sitePath)).trim()

    if (wantTheme) {
        const themes = parseJsonList(await runWp(['theme', 'list', '--json', ...SKIP], sitePath))
        const active = themes.find(theme => theme.status === 'active')
        const parent = themes.find(theme => theme.status === 'parent') // set when the active theme is a child theme

        info.theme = active ? active.name : ''
        info.parentTheme = parent ? parent.name : ''
        if (!active) info.warnings.push('no active theme found')
    }

    if (wantPlugins) {
        const plugins = parseJsonList(await runWp(['plugin', 'list', '--json', ...SKIP], sitePath))
        const active = plugins
            .filter(plugin => plugin.name != null && ['active', 'active-network'].includes(plugin.status))
            .map(plugin => plugin.name)

        info.pluginCount = active.length
        info.plugins = active.join('; ')
    }

    return info
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

// report columns: [header, value of a row]
const columns = [
    ['APP', r => r.app],
    ['SITE', r => r.site],
    ['URL', r => r.url],
    ...(wantTheme ? [
        ['ACTIVE_THEME', r => r.theme],
        ['PARENT_THEME', r => r.parentTheme],
    ] : []),
    ...(wantPlugins ? [
        ['PLUGIN_COUNT', r => r.pluginCount],
        ['ACTIVE_PLUGINS', r => r.plugins],
    ] : []),
    ['STATUS', r => r.status],
]

async function runScript() {
    // get a list of all sites
    let sites
    try {
        sites = fs.readdirSync(sitesRoot, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
    } catch (error) {
        throw new Error(`Could not read ${sitesRoot}. Is this running on a Cloudways server? (${error.message})`)
    }

    if (onlySite) {
        if (!sites.includes(onlySite)) throw new Error(`No site folder named "${onlySite}" in ${sitesRoot}`)
        sites = [onlySite]
    }

    const what = [wantTheme && 'active theme', wantPlugins && 'active plugins'].filter(Boolean).join(' + ')
    console.log(`Collecting ${what} for ${sites.length} site(s)\n`)

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '')
    const reportFile = path.join(__dirname, 'output', `wp-x-ray-${stamp}.csv`)
    fs.mkdirSync(path.dirname(reportFile), { recursive: true })

    const report = fs.createWriteStream(reportFile)
    report.write(columns.map(([header]) => csv(header)).join(',') + '\n')

    const stats = { ok: 0, warnings: 0, skipped: 0, failed: 0 }

    for (let index = 0; index < sites.length; index++) {
        const app = sites[index]
        const label = `[${index + 1}/${sites.length}] ${app}`
        const sitePath = path.join(sitesRoot, app, 'public_html')

        // defaults, so every row has every column even when the site fails
        const row = { app, site: 'N/A', url: 'N/A', theme: '', parentTheme: '', pluginCount: '', plugins: '' }

        if (!fs.existsSync(sitePath)) {
            stats.skipped++
            row.status = 'skipped: no public_html folder'
        } else {
            try {
                const info = await collectSite(sitePath)
                Object.assign(row, info)

                if (info.warnings.length > 0) {
                    stats.warnings++
                    row.status = `WARNING: ${info.warnings.join(', ')}`
                } else {
                    stats.ok++
                    row.status = 'OK'
                }
            } catch (error) {
                stats.failed++
                row.status = `ERROR: ${error.message.split('\n')[0]}`
            }
        }

        const details = []
        if (wantTheme && row.theme) details.push(`theme ${row.theme}`)
        if (wantPlugins && row.pluginCount !== '') details.push(`${row.pluginCount} active plugins`)
        console.log(`${label}: ${row.status}${details.length ? ` (${row.site} - ${details.join(', ')})` : ''}`)

        report.write(columns.map(([, value]) => csv(value(row))).join(',') + '\n')
    }

    await new Promise(resolve => report.end(resolve))

    console.log(`\nSummary`)
    console.log(`  OK:        ${stats.ok}`)
    console.log(`  Warnings:  ${stats.warnings}`)
    console.log(`  Skipped:   ${stats.skipped}`)
    console.log(`  Failed:    ${stats.failed}`)
    console.log(`\nReport: ${reportFile}`)

    // non-zero exit code so cron jobs/monitoring can spot problems
    if (stats.failed > 0) process.exitCode = 1
}

runScript().catch((error) => {
    console.error(`[FATAL]`, error.message)
    process.exit(1)
})
