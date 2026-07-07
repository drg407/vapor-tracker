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
//   games/overview/v2      current best + all-time low + history urls
//   games/historylow/v1    1-year low (only when that mode is enabled)
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
        try {
            const lows = await fetchJson(
                `${ITAD_API}/games/historylow/v1?key=${key}&country=${requestBody.country}`,
                post(uuids)
            );
            for (const e of lows) {
                const gid = uuidToGameId.get(e.id);
                const y1 = e.low?.y1;
                if (gid && prices[gid] && y1) {
                    prices[gid].lowest = y1;
                    prices[gid].lowLabel = "1y";
                }
            }
        } catch (err) {
            console.error("[VaporTracker] 1y low fetch failed, showing all-time low:", err);
        }
    }

    return {prices};
}

browser.runtime.onMessage.addListener((message) => {
    if (message?.action !== "fetchPrices") {
        return;
    }
    return fetchAllPrices(message.body);
});
