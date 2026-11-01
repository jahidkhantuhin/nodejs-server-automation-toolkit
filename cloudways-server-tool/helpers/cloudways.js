import got from "got"
import { sleep } from "./index.js";

const REQUEST_TIMEOUT_MS = 30000;
const TOKEN_SAFETY_MARGIN_MS = 60000;

// build a readable error without leaking request details (credentials etc.)
function apiError(action, error) {
    const detail = error.response?.statusCode ? `HTTP ${error.response.statusCode}` : error.message;
    return new Error(`Cloudways: could not ${action} (${detail})`, { cause: error });
}

/**
 * Class Cloudways
 *
 * This class handles all CW API communication.
 *
 * - Authentication is automatic: the token is fetched on the first request,
 *   refreshed shortly before it expires, and refreshed once more if the API
 *   answers with a 401.
 * - Requests are spaced at least `minIntervalSeconds` apart (default 10s) to
 *   stay clear of the API rate limit.
 */
class Cloudways {
    #token = null;
    #tokenExpiresAt = 0;
    #email;
    #apiKey;
    #minIntervalSeconds;
    #lastRequestAt = 0;
    #queue = Promise.resolve();
    #authInFlight = null;

    apiUrl = "https://api.cloudways.com/api/v1";

    constructor(email = '', apiKey = '', { minIntervalSeconds = 10 } = {}) {
        if(!email || !apiKey) throw new Error("Please provide both the email and the api key for Cloudways authentication");

        this.#email = email;
        this.#apiKey = apiKey;
        this.#minIntervalSeconds = minIntervalSeconds;
    }

    // makes sure requests start at least `minIntervalSeconds` apart, even if called concurrently
    #throttle() {
        const turn = this.#queue.then(async () => {
            const wait = this.#lastRequestAt + this.#minIntervalSeconds * 1000 - Date.now();
            if(wait > 0) await sleep(wait / 1000);
            this.#lastRequestAt = Date.now();
        });
        this.#queue = turn.catch(() => {});
        return turn;
    }

    async #call(url, options = {}) {
        await this.#throttle();
        return got(url, { timeout: { request: REQUEST_TIMEOUT_MS }, ...options }).json();
    }

    async #authenticate(force = false) {
        if(!force && this.#token && Date.now() < this.#tokenExpiresAt) return;

        // concurrent callers share one login request instead of each making their own
        if(!this.#authInFlight) {
            this.#authInFlight = this.#login().finally(() => { this.#authInFlight = null; });
        }
        return this.#authInFlight;
    }

    async #login() {
        const data = await this.#call(`${this.apiUrl}/oauth/access_token`, {
            method: 'post',
            json: {
                email: this.#email,
                api_key: this.#apiKey
            }
        });

        if(!data?.access_token) throw new Error("no access token in the response");

        this.#token = data.access_token;
        this.#tokenExpiresAt = data.expires_in
            ? Date.now() + data.expires_in * 1000 - TOKEN_SAFETY_MARGIN_MS
            : Infinity;
    }

    async #get(path, searchParams) {
        await this.#authenticate();

        const send = () => this.#call(`${this.apiUrl}${path}`, {
            searchParams,
            headers: { Authorization: `Bearer ${this.#token}` }
        });

        try {
            return await send();
        } catch (error) {
            // token rejected (expired or revoked): get a new one and retry once
            if(error.response?.statusCode !== 401) throw error;
            await this.#authenticate(true);
            return send();
        }
    }

    async getServers() {
        try {
            return await this.#get(`/server`);
        } catch (error) {
            throw apiError(`fetch the servers list`, error);
        }
    }

    /**
     * Returns the access state of an app (true/false), or null if the API did not report one.
     * Throws if the request fails.
     */
    async getAppAccessState(serverId = null, appId = null, sys_user = null) {
        if(!serverId || !appId || !sys_user) {
            throw new Error("Must provide serverId, appId and sys_user for getAppAccessState");
        }

        try {
            const data = await this.#get(`/app/getApplicationAccess`, { server_id: serverId, app_id: appId });
            return data?.response?.app_status?.[sys_user] ?? null;
        } catch (error) {
            throw apiError(`fetch the access state of app ${appId} on server ${serverId}`, error);
        }
    }
}

export default Cloudways;
