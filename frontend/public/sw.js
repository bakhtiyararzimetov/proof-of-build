// Minimal service worker: makes the site installable as an app.
// No caching: balances and on-chain state must always be fresh, so every request goes to the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
