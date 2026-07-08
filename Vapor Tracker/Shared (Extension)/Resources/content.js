(async function () {
    "use strict";

    // --- Identify what we're looking at from the URL ---
    const match = location.pathname.match(/^\/(app|sub|bundle)\/(\d+)/);
    if (!match) { return; }
    const [, type, idStr] = match;
    const id = Number(idStr);

    // Steam exposes the storefront country in its own cookie
    const country = document.cookie.match(/steamCountry=([A-Z]{2})/)?.[1] ?? "US";

    // --- Purchase options: each box is a sub (edition) or bundle with its
    // own price, identified by a hidden input in its add-to-cart form ---
    const boxes = [];
    if (type === "app") {
        for (const box of document.querySelectorAll("#game_area_purchase .game_area_purchase_game")) {
            const bundle = box.querySelector("input[name='bundleid']")?.value;
            const sub = box.querySelector("input[name='subid']")?.value;
            const gid = bundle ? `bundle/${bundle}` : (sub ? `sub/${sub}` : null);
            if (gid) {
                boxes.push({box, gid});
            }
        }
    }

    // --- DLC list ("Content For This Game"): rows are anchors with
    // id="dlc_row_{appid}" ---
    const dlcRows = type === "app"
        ? [...document.querySelectorAll("a.game_area_dlc_row[id^='dlc_row_']")]
            .map((row) => ({row, appid: Number(row.id.slice(8))}))
            .filter((d) => Number.isFinite(d.appid))
        : [];

    const body = {
        country,
        apps: type === "app" ? [id, ...dlcRows.map((d) => d.appid)] : [],
        subs: [...new Set(boxes.filter((b) => b.gid.startsWith("sub/")).map((b) => Number(b.gid.slice(4))))],
        bundles: [...new Set(boxes.filter((b) => b.gid.startsWith("bundle/")).map((b) => Number(b.gid.slice(7))))],
        voucher: true,
        shops: []
    };
    if (type === "sub") { body.subs.push(id); }
    if (type === "bundle") { body.bundles.push(id); }

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

    const prices = data?.prices ?? {};
    const mainEntry = prices[`${type}/${id}`];

    // --- Helpers ---
    // Handles both "1.234,56" and "1,234.56" style locales.
    function parseMoney(text) {
        const m = text.match(/\d[\d.,  ]*/);
        if (!m) { return null; }
        let s = m[0].replace(/[  ]/g, "");
        if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
            s = s.replace(/\./g, "").replace(",", ".");
        } else {
            s = s.replace(/,/g, "");
        }
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : null;
    }

    const fmt = (p) => {
        try {
            return new Intl.NumberFormat(undefined, {style: "currency", currency: p.currency}).format(p.amount);
        } catch {
            return `${p.amount.toFixed(2)} ${p.currency}`;
        }
    };

    const lowWhen = (lowest) => new Date(lowest.timestamp)
        .toLocaleDateString(undefined, {year: "numeric", month: "short"});

    // --- Main panel above the purchase area ---
    if (mainEntry) {
        const {current, lowest, urls} = mainEntry;

        const steamEl = document.querySelector(
            "#game_area_purchase .discount_final_price, #game_area_purchase .game_purchase_price"
        );
        const steam = steamEl ? parseMoney(steamEl.textContent) : null;

        const panel = document.createElement("div");
        panel.className = "spp_panel";

        let html = `<div class="spp_title">Vapor Tracker <a class="spp_source" href="https://isthereanydeal.com" target="_blank" rel="noopener">via IsThereAnyDeal</a></div>`;

        if (lowest) {
            html += `<div class="spp_row">
                <span class="spp_label">${mainEntry.lowLabel === "1y" ? "1-year low" : "Historical low"}</span>
                <span class="spp_value">${fmt(lowest.price)}
                    <span class="spp_cut">-${lowest.cut}%</span>
                    at ${lowest.shop.name} <span class="spp_when">(${lowWhen(lowest)})</span>
                </span>
            </div>`;
        }

        if (current) {
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
    }

    // --- Compact strip above each edition/bundle purchase box ---
    for (const {box, gid} of boxes) {
        const entry = prices[gid];
        if (!entry || (!entry.lowest && !entry.current)) { continue; }
        // The base game's own box duplicates the main panel — skip it
        if (mainEntry && entry.urls?.game && entry.urls.game === mainEntry.urls?.game) { continue; }

        let html = "";
        if (entry.lowest) {
            html += `<span class="spp_wl_low">${entry.lowLabel === "1y" ? "1y low" : "low"} ${fmt(entry.lowest.price)}</span>
                <span class="spp_wl_dim">at ${entry.lowest.shop.name} (${lowWhen(entry.lowest)})</span>`;
        }
        if (entry.current) {
            const boxPriceEl = box.querySelector(".discount_final_price, .game_purchase_price");
            const boxPrice = boxPriceEl ? parseMoney(boxPriceEl.textContent) : null;
            const cheaper = boxPrice !== null && entry.current.price.amount < boxPrice;
            html += `${entry.lowest ? `<span class="spp_wl_dim"> · </span>` : ""}
                <a href="${entry.current.url}" target="_blank" rel="noopener" class="spp_wl_now">
                    now ${fmt(entry.current.price)} at ${entry.current.shop.name}</a>`;
            if (cheaper) {
                html += ` <span class="spp_badge">cheaper than Steam</span>`;
            }
        }
        if (!html) { continue; }

        const line = document.createElement("div");
        line.className = "spp_wl spp_boxline";
        line.innerHTML = html;

        const wrapper = box.closest(".game_area_purchase_game_wrapper") ?? box;
        wrapper.parentNode.insertBefore(line, wrapper);
    }

    // --- Inline note per DLC row (plain text: the row is itself a link) ---
    for (const {row, appid} of dlcRows) {
        const entry = prices[`app/${appid}`];
        if (!entry?.lowest && !entry?.current) { continue; }

        const parts = [];
        if (entry.lowest) {
            parts.push(`${entry.lowLabel === "1y" ? "1y low" : "low"} <b>${fmt(entry.lowest.price)}</b>`);
        }
        if (entry.current) {
            const rowPriceEl = row.querySelector(".discount_final_price, .game_area_dlc_price");
            const rowPrice = rowPriceEl ? parseMoney(rowPriceEl.textContent) : null;
            const cheaper = rowPrice !== null && entry.current.price.amount < rowPrice;
            parts.push(`now <b>${fmt(entry.current.price)}</b> at ${entry.current.shop.name}${cheaper ? ` <span class="spp_badge">cheaper</span>` : ""}`);
        }

        const note = document.createElement("span");
        note.className = "spp_dlc";
        note.innerHTML = parts.join(" · ");
        (row.querySelector(".game_area_dlc_name") ?? row).appendChild(note);
    }
})();
