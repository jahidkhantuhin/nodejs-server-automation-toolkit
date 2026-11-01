export default {
    // Cloudways account credentials
    email: '',
    apiKey: '',

    // Webhook endpoints that receive the data. Kept here (config.js is git-ignored)
    // so that endpoint URLs and their tokens are never committed.
    webhooks: [
        // 'https://example.com/api/v1/webhook/...',
    ],

    // Minimum seconds between two Cloudways API requests (optional, default 10)
    minIntervalSeconds: 10
}
