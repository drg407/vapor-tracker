(async function () {
    "use strict";

    // --- Identify what we're looking at from the URL ---
    const match = location.pathname.match(/^\/(app|sub|bundle)\/(\d+)/);
    if (!match) { return; }
    const [, type, idStr] = match;
    const id = Number(idStr);

    // Steam exposes the storefront country in its own cookie
    const country = document.cookie.match(/steamCountry=([A-Z]{2})/)?.[1] ?? "US";

    const body = {
        country,
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
        console.error("[VaporTracker] price fetch failed:", err);
        return;
    }

    if (data?.needsKey) {
        const setup = document.createElement("div");
        setup.className = "spp_panel";
        setup.innerHTML = `<div class="spp_title">Vapor Tracker <a class="spp_source" href="https://isthereanydeal.com" target="_blank" rel="noopener">via IsThereAnyDeal</a></div>
            <div class="spp_row"><span class="spp_setup">Add your free IsThereAnyDeal API key to see price history —
            click the Vapor Tracker icon in the toolbar to set it up.</span></div>`;
        const anchor = document.querySelector("#game_area_purchase")
            ?? document.querySelector(".page_content_ctn");
        anchor?.parentNode.insertBefore(setup, anchor);
        return;
    }

    const entry = data?.prices?.[`${type}/${id}`];
    if (!entry) {
        console.log("[VaporTracker] no price data for", `${type}/${id}`);
        return;
    }

    const {current, lowest, urls} = entry;

    // --- Steam's own current price, for the "cheaper elsewhere" comparison ---
    // Handles both "1.234,56" and "1,234.56" style locales.
    function parseMoney(text) {
        const m = text.match(/\d[\d.,  ]*/);
        if (!m) { return null; }
        let s = m[0].replace(/[  ]/g, "");
        if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
            s = s.replace(/\./g, "").replace(",", ".");
        } else {
            s = s.replace(/,/g, "");
        }
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : null;
    }

    function steamPrice() {
        const el = document.querySelector(
            "#game_area_purchase .discount_final_price, #game_area_purchase .game_purchase_price"
        );
        return el ? parseMoney(el.textContent) : null;
    }

    const fmt = (p) => {
        try {
            return new Intl.NumberFormat(undefined, {style: "currency", currency: p.currency}).format(p.amount);
        } catch {
            return `${p.amount.toFixed(2)} ${p.currency}`;
        }
    };

    // --- Build the panel ---
    const panel = document.createElement("div");
    panel.className = "spp_panel";

    let html = `<div class="spp_title">Vapor Tracker <a class="spp_source" href="https://isthereanydeal.com" target="_blank" rel="noopener">via IsThereAnyDeal</a></div>`;

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

    const historyUrl = urls?.history ?? (urls?.game ? `${urls.game}history/` : null);
    if (historyUrl) {
        html += `<div class="spp_row"><a class="spp_history" href="${historyUrl}" target="_blank" rel="noopener">Full price history →</a></div>`;
    }

    panel.innerHTML = html;

    const anchor = document.querySelector("#game_area_purchase")
        ?? document.querySelector(".page_content_ctn");
    if (anchor) {
        anchor.parentNode.insertBefore(panel, anchor);
    }
})();
