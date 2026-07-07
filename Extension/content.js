(async function () {
    "use strict";

    // --- Identify what we're looking at from the URL ---
    const match = location.pathname.match(/^\/(app|sub|bundle)\/(\d+)/);
    if (!match) { return; }
    const [, type, idStr] = match;
    const id = Number(idStr);

    const body = {
        country: "US",
        apps: type === "app" ? [id] : [],
        subs: type === "sub" ? [id] : [],
        bundles: type === "bundle" ? [id] : [],
        voucher: true,
        shops: []
    };

    // Steam's CSP connect-src blocks direct calls to the API from the page,
    // so the fetch happens in the background script.
    let data;
    try {
        data = await browser.runtime.sendMessage({action: "fetchPrices", body});
    } catch (err) {
        console.error("[SteamPricesPOC] price fetch failed:", err);
        return;
    }

    const entry = data?.prices?.[`${type}/${id}`];
    if (!entry) {
        console.log("[SteamPricesPOC] no price data for", `${type}/${id}`);
        return;
    }

    const {current, lowest, urls} = entry;

    // --- Steam's own current price, for the "cheaper elsewhere" comparison ---
    function steamPrice() {
        const el = document.querySelector(
            "#game_area_purchase .discount_final_price, #game_area_purchase .game_purchase_price"
        );
        if (!el) { return null; }
        const n = parseFloat(el.textContent.replace(/[^0-9.]/g, ""));
        return Number.isFinite(n) ? n : null;
    }

    const fmt = (p) => `$${p.amount.toFixed(2)}`;

    // --- Build the panel ---
    const panel = document.createElement("div");
    panel.className = "spp_panel";

    let html = `<div class="spp_title">Price check <span class="spp_source">via IsThereAnyDeal</span></div>`;

    if (lowest) {
        const when = new Date(lowest.timestamp).toLocaleDateString(undefined, {year: "numeric", month: "short"});
        html += `<div class="spp_row">
            <span class="spp_label">${entry.lowLabel === "1y" ? "1-year low" : "Historical low"}</span>
            <span class="spp_value">${fmt(lowest.price)}
                <span class="spp_cut">-${lowest.cut}%</span>
                at ${lowest.shop.name} <span class="spp_when">(${when})</span>
            </span>
        </div>`;
    }

    if (current) {
        const steam = steamPrice();
        const cheaper = steam !== null && current.price.amount < steam;
        html += `<div class="spp_row">
            <span class="spp_label">Current best</span>
            <span class="spp_value">
                <a href="${current.url}" target="_blank" rel="noopener">${fmt(current.price)} at ${current.shop.name}</a>
                ${current.cut > 0 ? `<span class="spp_cut">-${current.cut}%</span>` : ""}
                ${cheaper ? `<span class="spp_badge">cheaper than Steam</span>` : ""}
            </span>
        </div>`;
    }

    if (urls?.history) {
        html += `<div class="spp_row"><a class="spp_history" href="${urls.history}" target="_blank" rel="noopener">Full price history →</a></div>`;
    }

    panel.innerHTML = html;

    const anchor = document.querySelector("#game_area_purchase")
        ?? document.querySelector(".page_content_ctn");
    if (anchor) {
        anchor.parentNode.insertBefore(panel, anchor);
    }
})();
