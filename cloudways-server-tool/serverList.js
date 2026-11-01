import Cloudways from "./helpers/cloudways.js"
import config from "./config.js"
import { sendWebhook } from "./helpers/webhook.js";

async function buildServer(cw, server, stats) {
    // pull the credentials out so they can never end up in the webhook payload
    const { apps = [], master_user, master_password, ...rest } = server;

    // list of sites with just the bare minimum info + the app access status
    const sites = [];

    for (const app of apps) {
        const site = {
            label: app.label || null,
            production_url: app.cname || null,
            cloudways_url: app.app_fqdn || null,
            staging: !!app.source_server_id,
            isPublic: null,
        };

        try {
            site.isPublic = await cw.getAppAccessState(server.id, app.id, app.sys_user);
        } catch (error) {
            stats.accessErrors++;
            console.error(`[ERROR] ${error.message}`);
        }

        sites.push(site);
    }

    stats.sites += sites.length;

    return { ...rest, countApps: apps.length, sites };
}

async function main() {
    if (!config.email || !config.apiKey) {
        console.error(`Missing email or apiKey. Copy config.sample.js to config.js and fill it in.`);
        process.exit(1);
    }

    // fail early: the run can take a while, so don't find this out at the end
    if (!config.webhooks?.length) {
        console.error(`No webhook endpoints configured. Add a \`webhooks\` array to config.js.`);
        process.exit(1);
    }

    const cw = new Cloudways(config.email, config.apiKey, {
        minIntervalSeconds: config.minIntervalSeconds,
    });
    const stats = { servers: 0, sites: 0, accessErrors: 0 };

    console.log(`Getting CW servers list...`);
    const { servers } = await cw.getServers();

    const list = [];
    for (let i = 0; i < servers.length; i++) {
        const count = servers[i].apps?.length || 0;
        console.log(`[${i + 1}/${servers.length}] ${servers[i].label || servers[i].id} (${count} apps)`);
        list.push(await buildServer(cw, servers[i], stats));
        stats.servers++;
    }

    console.log(`Sending data to the webhook endpoints:`);
    await sendWebhook({ servers: list });

    console.log(`\nSummary`);
    console.log(`  Servers:               ${stats.servers}`);
    console.log(`  Sites:                 ${stats.sites}`);
    console.log(`  Access-state errors:   ${stats.accessErrors}`);
    console.log(`Done`);
}

main().catch((error) => {
    console.error(`[FATAL]`, error.message);
    if (error.cause) console.error(`  caused by:`, error.cause.message);
    process.exit(1);
});
