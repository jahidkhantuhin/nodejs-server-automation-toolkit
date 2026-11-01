import got from "got";
import config from "../config.js";

const TIMEOUT_MS = 60000;

/**
 * Sends the data to every endpoint listed in `config.webhooks`.
 * Every endpoint is attempted; if any of them fail, an error is thrown at the end.
 */
export async function sendWebhook(data = null) {
    if(!data) throw new Error("sendWebhook requires the data to be provided.");

    const endpoints = config.webhooks || [];
    if(endpoints.length === 0) {
        throw new Error("No webhook endpoints configured. Add a `webhooks` array to config.js.");
    }

    let failed = 0;

    for (const endpoint of endpoints) {
        // log only the host: the full URL may contain a secret token
        const name = new URL(endpoint).host;

        try {
            await got(endpoint, {
                method: `post`,
                json: data,
                timeout: { request: TIMEOUT_MS }
            });
            console.log(`  sent to ${name}`);
        } catch (error) {
            failed++;
            console.error(`Webhook error: ${name}`);
            console.error(error.response?.body ?? error.message);
        }
    }

    if(failed > 0) {
        throw new Error(`${failed} of ${endpoints.length} webhook endpoint(s) failed`);
    }
}
