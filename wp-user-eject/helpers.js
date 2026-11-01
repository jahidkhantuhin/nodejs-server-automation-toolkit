const { execFile } = require('child_process')

// WP_BIN can be overridden with an environment variable (useful for testing)
const wpBin = process.env.WP_BIN || `/usr/local/bin/wp`
const WP_TIMEOUT_MS = 120000
// do not load plugins/themes: faster, and a broken plugin cannot break the command
const SKIP = ['--skip-plugins', '--skip-themes']

// the useful line of WP-CLI's stderr: its "Error: ..." line, not the PHP notices printed before it
function errorMessage(stderr, fallback) {
    const lines = String(stderr || '').split('\n').map(line => line.trim()).filter(Boolean)
    return lines.find(line => /^error:/i.test(line)) || lines[lines.length - 1] || fallback
}

/**
 * Runs a WP-CLI command inside a site directory and returns its output.
 * Warnings printed to stderr do not count as a failure, only a non-zero
 * exit code (or a timeout) does.
 *
 * @param {string[]} args  e.g. ['user', 'get', 'a@b.com', '--field=ID']
 * @param {string} cwd     the site's public_html directory
 */
function runWp(args, cwd) {
    return new Promise((resolve, reject) => {
        execFile(
            wpBin,
            [...args, ...SKIP],
            { cwd, timeout: WP_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
            (error, stdout, stderr) => {
                if (error) return reject(new Error(errorMessage(stderr, error.message)))
                resolve(stdout)
            }
        )
    })
}

// true when WP-CLI says the user does not exist (as opposed to a real failure)
const isNotFound = (error) => /invalid user/i.test(error.message)

// parses a `--format=json` list, ignoring any PHP notices printed before the JSON
function parseJsonList(output) {
    const start = output.indexOf('[')
    if (start === -1) throw new Error(`no JSON found in the WP-CLI output`)
    return JSON.parse(output.slice(start)) ?? []
}

// the ID of a user (given as email, login or ID); throws if the user does not exist
async function getUserId(identifier, cwd) {
    const output = await runWp(['user', 'get', identifier, '--field=ID'], cwd)
    const id = parseInt(output.trim().split('\n').pop(), 10)
    if (!Number.isInteger(id)) throw new Error(`unexpected output for user ${identifier}`)
    return id
}

/**
 * Turns "--users=a@x.com, B@y.com" into ['a@x.com', 'b@y.com'] (lower case, de-duplicated).
 * Throws if an address does not look like an email address.
 */
function parseEmails(value = '') {
    const emails = [...new Set(
        value
            .replace(/^["']|["']$/g, '')
            .split(',')
            .map(email => email.trim().toLowerCase())
            .filter(Boolean)
    )]

    const invalid = emails.filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    if (invalid.length > 0) throw new Error(`Not a valid email address: ${invalid.join(', ')}`)

    return emails
}

/**
 * Picks the administrator who takes over the deleted users' content:
 * the lowest-ID administrator with an email on `domain` who is not being deleted.
 * The domain must match exactly (so "user@notexample.com" does not match "example.com").
 */
function pickOwner(admins, { domain, excludeEmails, excludeIds }) {
    return admins
        .filter(admin => String(admin.user_email).toLowerCase().endsWith(`@${domain}`))
        .filter(admin => !excludeEmails.includes(String(admin.user_email).toLowerCase()))
        .filter(admin => !excludeIds.includes(Number(admin.ID)))
        .sort((a, b) => Number(a.ID) - Number(b.ID))[0] || null
}

module.exports = { runWp, isNotFound, parseJsonList, getUserId, parseEmails, pickOwner }
