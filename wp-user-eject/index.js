/**
 * wp-user-eject
 *
 * Finds all WordPress sites in the Cloudways applications folder and removes the given
 * user(s) from each of them. The content of a deleted user is reassigned to the first
 * eligible administrator of that site (see config.js).
 *
 * Nothing is changed unless --apply is passed.
 *
 * Usage: node . --users="a@site.com,b@site.com" [--apply] [--site=<app-folder>]
 */
const fs = require('fs')
const path = require('path')
const { runWp, isNotFound, parseJsonList, getUserId, parseEmails, pickOwner } = require('./helpers')

// SITES_ROOT can be overridden with an environment variable (useful for testing)
const sitesRoot = process.env.SITES_ROOT || `/home/master/applications/`

const USAGE = `Usage: node . --users="a@site.com,b@site.com" [--apply] [--site=<app-folder>]

  --users=<emails>      comma separated email addresses of the users to remove (required)
  --apply               really delete; without it nothing is changed (dry run)
  --site=<app-folder>   limit the run to one site`

/* ------------------------------------------------------------------ */
/* options and config                                                  */
/* ------------------------------------------------------------------ */

function fail(message) {
    console.error(message)
    process.exit(1)
}

const args = process.argv.slice(2)
const unknown = args.filter(a => !a.startsWith('--users=') && !a.startsWith('--site=') && a !== '--apply')
if (unknown.length > 0) fail(`Unknown option: ${unknown.join(' ')}\n\n${USAGE}`)

const APPLY = args.includes('--apply')
const onlySite = (args.find(a => a.startsWith('--site=')) || '').replace('--site=', '')
const usersArg = args.find(a => a.startsWith('--users='))
if (!usersArg) fail(`User emails must be supplied. Cannot proceed.\n\n${USAGE}`)

let users
try {
    users = parseEmails(usersArg.replace('--users=', ''))
} catch (error) {
    fail(error.message)
}
if (users.length === 0) fail(`User emails must be supplied. Cannot proceed.\n\n${USAGE}`)

let config
try {
    config = require('./config')
} catch {
    fail(`config.js not found. Create it with: cp config.sample.js config.js`)
}

const domain = String(config.ownerEmailDomain || '').toLowerCase()
const fallbackEmail = String(config.fallbackAdminEmail || '').toLowerCase()
const fallbackLogin = config.fallbackAdminLogin || 'wpadmin'

if (!domain || domain.includes('@')) fail(`config.js: ownerEmailDomain must be a domain such as "example.com"`)
if (!fallbackEmail.endsWith(`@${domain}`)) fail(`config.js: fallbackAdminEmail must be an address on ${domain}`)
if (users.includes(fallbackEmail)) fail(`Refusing to delete ${fallbackEmail}: it is the fallback administrator in config.js`)

/* ------------------------------------------------------------------ */
/* one site                                                            */
/* ------------------------------------------------------------------ */

/**
 * Processes one site and returns one result row per requested user.
 * Read-only unless APPLY is set.
 */
async function processSite(app) {
    const sitePath = path.join(sitesRoot, app, 'public_html')
    const result = (user, status, url = 'N/A') => ({ app, url, user, status })

    if (!fs.existsSync(sitePath)) {
        return [result('*', 'skipped: no public_html folder')]
    }

    let url
    try {
        url = (await runWp(['option', 'get', 'siteurl'], sitePath)).trim()
    } catch {
        return [result('*', 'skipped: not a working WordPress installation')]
    }

    const rows = []

    // 1. which of the users exist on this site?
    const found = []
    try {
        for (const email of users) {
            try {
                found.push({ email, id: await getUserId(email, sitePath) })
            } catch (error) {
                if (!isNotFound(error)) throw error
                rows.push(result(email, 'user not found on this site', url))
            }
        }
    } catch (error) {
        return [result('*', `ERROR: ${error.message.split('\n')[0]}`, url)]
    }

    // nothing to do: do not touch this site at all (no admin gets created)
    if (found.length === 0) return rows

    // 2. who takes over the content?
    let owner
    try {
        const admins = parseJsonList(await runWp(
            ['user', 'list', '--role=administrator', '--fields=ID,user_login,user_email', '--format=json'],
            sitePath
        ))

        owner = pickOwner(admins, {
            domain,
            excludeEmails: users,
            excludeIds: found.map(user => user.id),
        })

        if (owner) {
            owner = { id: Number(owner.ID), email: owner.user_email, created: false }
        } else {
            // no eligible administrator: use (or create) the fallback administrator
            let existing = null
            try {
                existing = await getUserId(fallbackEmail, sitePath)
            } catch (error) {
                if (!isNotFound(error)) throw error
            }

            if (existing !== null) {
                // it exists but was not an eligible administrator, so it is not an admin: do not guess
                throw new Error(`${fallbackEmail} exists on this site but is not an administrator`)
            }

            if (APPLY) {
                const created = await runWp(
                    ['user', 'create', fallbackLogin, fallbackEmail, '--role=administrator', '--porcelain'],
                    sitePath
                )
                owner = { id: parseInt(created.trim().split('\n').pop(), 10), email: fallbackEmail, created: true }
                if (!Number.isInteger(owner.id)) throw new Error(`could not read the ID of the new administrator`)
            } else {
                owner = { id: null, email: fallbackEmail, created: true }
            }
        }
    } catch (error) {
        // without an owner nothing may be deleted
        const status = `ERROR: ${error.message.split('\n')[0]}`
        return [...rows, ...found.map(user => result(user.email, status, url))]
    }

    const ownerNote = owner.created ? `${owner.email} (fallback administrator)` : owner.email

    // 3. delete the users, one by one
    for (const user of found) {
        if (!APPLY) {
            rows.push(result(user.email, `would delete, content would go to ${ownerNote}`, url))
            continue
        }

        try {
            await runWp(['user', 'delete', String(user.id), `--reassign=${owner.id}`, '--yes'], sitePath)

            // verify: the user must be gone now
            let stillThere = true
            try {
                await getUserId(String(user.id), sitePath)
            } catch (error) {
                if (!isNotFound(error)) throw error
                stillThere = false
            }
            if (stillThere) throw new Error(`user still exists after the delete command`)

            rows.push(result(user.email, `deleted, content reassigned to ${ownerNote}`, url))
        } catch (error) {
            rows.push(result(user.email, `ERROR: ${error.message.split('\n')[0]}`, url))
        }
    }

    return rows
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

const csv = (value) => `"${String(value).replace(/"/g, '""')}"`
const row = (cells) => cells.map(csv).join(',') + '\n'

async function run() {
    let apps
    try {
        apps = fs.readdirSync(sitesRoot, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
    } catch (error) {
        throw new Error(`Could not read ${sitesRoot}. Is this running on a Cloudways server? (${error.message})`)
    }

    if (onlySite) {
        if (!apps.includes(onlySite)) throw new Error(`No site folder named "${onlySite}" in ${sitesRoot}`)
        apps = [onlySite]
    }

    console.log(APPLY
        ? `APPLY MODE: users WILL be deleted. This cannot be undone.`
        : `DRY RUN: nothing will be changed. Run again with --apply to delete.`)
    console.log(`Users:  ${users.join(', ')}`)
    console.log(`Owner:  administrators @${domain} (fallback: ${fallbackEmail})`)
    console.log(`Apps:   ${apps.length}\n`)

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '')
    const reportFile = path.join(__dirname, 'output', `wp-user-eject-${stamp}${APPLY ? '' : '-dry-run'}.csv`)
    fs.mkdirSync(path.dirname(reportFile), { recursive: true })

    const report = fs.createWriteStream(reportFile)
    report.write(row(['APP', 'SITE_URL', 'USER', 'STATUS']))

    const stats = { deleted: 0, wouldDelete: 0, notFound: 0, skipped: 0, failed: 0 }

    for (let index = 0; index < apps.length; index++) {
        const app = apps[index]
        const rows = await processSite(app)

        for (const r of rows) {
            report.write(row([r.app, r.url, r.user, r.status]))

            if (r.status.startsWith('deleted')) stats.deleted++
            else if (r.status.startsWith('would delete')) stats.wouldDelete++
            else if (r.status.startsWith('user not found')) stats.notFound++
            else if (r.status.startsWith('skipped')) stats.skipped++
            else stats.failed++
        }

        const interesting = rows.filter(r => !r.status.startsWith('user not found'))
        console.log(`[${index + 1}/${apps.length}] ${app}: ${interesting.length ? interesting.map(r => `${r.user} - ${r.status}`).join(' | ') : 'none of the users found'}`)
    }

    await new Promise(resolve => report.end(resolve))

    console.log(`\nSummary`)
    console.log(`  ${APPLY ? 'Deleted' : 'Would delete'}:  ${APPLY ? stats.deleted : stats.wouldDelete}`)
    console.log(`  Not found:     ${stats.notFound}`)
    console.log(`  Skipped:       ${stats.skipped}`)
    console.log(`  Failed:        ${stats.failed}`)
    console.log(`\nReport: ${reportFile}`)
    if (!APPLY && stats.wouldDelete > 0) console.log(`Nothing was changed. Run with --apply to delete.`)

    // non-zero exit code so problems are noticed
    if (stats.failed > 0) process.exitCode = 1
}

run().catch((error) => {
    console.error(`[FATAL]`, error.message)
    process.exit(1)
})
