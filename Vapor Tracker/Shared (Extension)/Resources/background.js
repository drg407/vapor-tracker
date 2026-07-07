const PRICES_API = "https://api.augmentedsteam.com/prices/v2";
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

// When "1-year low" mode is on, replace each app's all-time `lowest` with the
// 1y low from the official ITAD API and tag it via `lowLabel`. Apps without
// 1y data (or any ITAD failure) keep the all-time low untagged.
async function applyY1Lows(data, requestBody) {
    const {lowMode, itadKey} = await browser.storage.local.get({lowMode: "all", itadKey: ""});
    if (lowMode !== "y1" || !itadKey || requestBody.apps.length === 0) {
        return;
    }

    const gameIds = requestBody.apps.map((id) => `app/${id}`);
    const lookup = await fetchJson(
        `${ITAD_API}/lookup/id/shop/${ITAD_STEAM_SHOP_ID}/v1?key=${encodeURIComponent(itadKey)}`,
        post(gameIds)
    );

    const uuids = Object.values(lookup).filter(Boolean);
    if (uuids.length === 0) {
        return;
    }

    const lows = await fetchJson(
        `${ITAD_API}/games/historylow/v1?key=${encodeURIComponent(itadKey)}&country=${requestBody.country}`,
        post(uuids)
    );
    const y1ByUuid = new Map(lows.map((e) => [e.id, e.low?.y1 ?? null]));

    for (const appid of requestBody.apps) {
        const entry = data?.prices?.[`app/${appid}`];
        const y1 = y1ByUuid.get(lookup[`app/${appid}`]);
        if (entry && y1) {
            entry.lowest = y1;
            entry.lowLabel = "1y";
        }
    }
}

browser.runtime.onMessage.addListener((message) => {
    if (message?.action !== "fetchPrices") {
        return;
    }

    return (async () => {
        const data = await fetchJson(PRICES_API, post(message.body));
        try {
            await applyY1Lows(data, message.body);
        } catch (err) {
            console.error("[SteamPricesPOC] 1y low fetch failed, showing all-time low:", err);
        }
        return data;
    })();
});
