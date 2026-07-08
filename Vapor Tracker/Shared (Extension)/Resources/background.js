const ITAD_API = "https://api.isthereanydeal.com";
const ITAD_STEAM_SHOP_ID = 61;

async function fetchJson(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
        throw new Error(`${url} responded ${res.status}`);
    }
    return res.json();
}

function post(body) {
    return {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body)
    };
}

// All data comes from the official ITAD API using the user's own key:
//   lookup/id/shop/61/v1   steam ids ("app/123") -> ITAD game uuids
//   games/overview/v2      current best + all-time low + game page url
//   games/history/v2       price-change log; 1y low = min event since a year
//                          ago (only when that mode is enabled, one GET/game)
// Returns {prices: {"app/123": entry}} shaped like the content scripts expect,
// or {needsKey: true} when no API key is configured.
// ITAD's ToS asks integrations to cache rather than refetch; prices don't
// move fast, so an hour per game/country/mode is plenty. Lives as long as
// the background page does.
const priceCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchAllPrices(requestBody) {
    const {lowMode: storedMode, itadKey} = await browser.storage.local.get({lowMode: "all", itadKey: ""});
    if (!itadKey) {
        return {needsKey: true};
    }
    // Callers can opt out of the per-game 1y history calls (e.g. bulk DLC
    // rows); the cache key must reflect the mode actually served.
    const lowMode = requestBody.skipY1 ? "all" : storedMode;

    const allGameIds = [
        ...requestBody.apps.map((id) => `app/${id}`),
        ...requestBody.subs.map((id) => `sub/${id}`),
        ...requestBody.bundles.map((id) => `bundle/${id}`)
    ];

    const cacheKey = (gid) => `${requestBody.country}|${lowMode}|${gid}`;
    const prices = {};
    const gameIds = [];
    for (const gid of allGameIds) {
        const hit = priceCache.get(cacheKey(gid));
        if (hit && hit.expires > Date.now()) {
            if (hit.entry) {
                prices[gid] = hit.entry;
            }
        } else {
            gameIds.push(gid);
        }
    }
    if (gameIds.length === 0) {
        return {prices};
    }

    const key = encodeURIComponent(itadKey);

    const lookup = await fetchJson(
        `${ITAD_API}/lookup/id/shop/${ITAD_STEAM_SHOP_ID}/v1?key=${key}`,
        post(gameIds)
    );
    // Several Steam ids can map to the same ITAD game (e.g. an app and its
    // base-game sub) — every requested id must get the entry, so group them.
    const gidsByUuid = new Map();
    for (const gid of gameIds) {
        const uuid = lookup[gid];
        if (!uuid) {
            continue;
        }
        if (!gidsByUuid.has(uuid)) {
            gidsByUuid.set(uuid, []);
        }
        gidsByUuid.get(uuid).push(gid);
    }
    if (gidsByUuid.size === 0) {
        for (const gid of gameIds) {
            priceCache.set(cacheKey(gid), {expires: Date.now() + CACHE_TTL_MS, entry: null});
        }
        return {prices};
    }
    const uuids = [...gidsByUuid.keys()];

    const overview = await fetchJson(
        `${ITAD_API}/games/overview/v2?key=${key}&country=${requestBody.country}`,
        post(uuids)
    );
    for (const p of overview.prices ?? []) {
        for (const gid of gidsByUuid.get(p.id) ?? []) {
            prices[gid] = p;
        }
    }

    if (lowMode === "y1") {
        // ITAD rejects fractional seconds ("Invalid 'since' format"), which
        // toISOString() always emits — strip the milliseconds.
        const since = encodeURIComponent(
            new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z")
        );
        await Promise.all(uuids.map(async (uuid) => {
            // Entries are shared objects across gids of the same uuid, so
            // mutating via the first gid updates every key.
            const gid = gidsByUuid.get(uuid)?.[0];
            if (!gid || !prices[gid]) {
                return;
            }
            try {
                const events = await fetchJson(
                    `${ITAD_API}/games/history/v2?key=${key}&country=${requestBody.country}&id=${uuid}&since=${since}`
                );
                let min = null;
                for (const e of events) {
                    if (e?.deal && (!min || e.deal.price.amount < min.deal.price.amount)) {
                        min = e;
                    }
                }
                // Games with no deal events in the past year keep the
                // all-time low from overview, labeled as such.
                if (min) {
                    prices[gid].lowest = {
                        shop: min.shop,
                        price: min.deal.price,
                        regular: min.deal.regular,
                        cut: min.deal.cut,
                        timestamp: min.timestamp
                    };
                    prices[gid].lowLabel = "1y";
                }
            } catch (err) {
                console.error("[VaporTracker] 1y low fetch failed, showing all-time low:", err);
            }
        }));
    }

    for (const gid of gameIds) {
        priceCache.set(cacheKey(gid), {expires: Date.now() + CACHE_TTL_MS, entry: prices[gid] ?? null});
    }

    return {prices};
}

browser.runtime.onMessage.addListener((message) => {
    if (message?.action !== "fetchPrices") {
        return;
    }
    return fetchAllPrices(message.body);
});
