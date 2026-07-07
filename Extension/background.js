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
async function fetchAllPrices(requestBody) {
    const {lowMode, itadKey} = await browser.storage.local.get({lowMode: "all", itadKey: ""});
    if (!itadKey) {
        return {needsKey: true};
    }

    const gameIds = [
        ...requestBody.apps.map((id) => `app/${id}`),
        ...requestBody.subs.map((id) => `sub/${id}`),
        ...requestBody.bundles.map((id) => `bundle/${id}`)
    ];
    if (gameIds.length === 0) {
        return {prices: {}};
    }

    const key = encodeURIComponent(itadKey);

    const lookup = await fetchJson(
        `${ITAD_API}/lookup/id/shop/${ITAD_STEAM_SHOP_ID}/v1?key=${key}`,
        post(gameIds)
    );
    const uuidToGameId = new Map();
    for (const gid of gameIds) {
        if (lookup[gid]) {
            uuidToGameId.set(lookup[gid], gid);
        }
    }
    if (uuidToGameId.size === 0) {
        return {prices: {}};
    }
    const uuids = [...uuidToGameId.keys()];

    const overview = await fetchJson(
        `${ITAD_API}/games/overview/v2?key=${key}&country=${requestBody.country}`,
        post(uuids)
    );
    const prices = {};
    for (const p of overview.prices ?? []) {
        const gid = uuidToGameId.get(p.id);
        if (gid) {
            prices[gid] = p;
        }
    }

    if (lowMode === "y1") {
        const since = encodeURIComponent(new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString());
        await Promise.all(uuids.map(async (uuid) => {
            const gid = uuidToGameId.get(uuid);
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

    return {prices};
}

browser.runtime.onMessage.addListener((message) => {
    if (message?.action !== "fetchPrices") {
        return;
    }
    return fetchAllPrices(message.body);
});
