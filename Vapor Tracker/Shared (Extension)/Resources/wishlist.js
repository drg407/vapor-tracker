(function () {
    "use strict";

    // appid -> price entry (or null when the API has no data)
    const cache = new Map();
    const pending = new Set();
    let flushTimer = null;
    let scanTimer = null;

    const fmt = (p) => `$${p.amount.toFixed(2)}`;

    function titleAnchors() {
        return [...document.querySelectorAll("a[href*='/app/']")]
            .filter((a) => a.textContent.trim().length > 1 && a.closest(".Panel"));
    }

    function appidOf(anchor) {
        const m = anchor.href.match(/\/app\/(\d+)/);
        return m ? Number(m[1]) : null;
    }

    function steamPriceIn(row) {
        const m = row.textContent.match(/\$(\d[\d,]*\.?\d*)/);
        return m ? parseFloat(m[1].replace(/,/g, "")) : null;
    }

    function render(anchor, entry) {
        const holder = anchor.parentElement;
        if (!holder || holder.querySelector(".spp_wl")) { return; }

        const line = document.createElement("div");
        line.className = "spp_wl";

        if (!entry?.lowest && !entry?.current) {
            line.classList.add("spp_wl_none");
            line.textContent = "no price data";
            holder.appendChild(line);
            return;
        }

        let html = "";
        if (entry.lowest) {
            const when = new Date(entry.lowest.timestamp)
                .toLocaleDateString(undefined, {year: "numeric", month: "short"});
            html += `<span class="spp_wl_low">${entry.lowLabel === "1y" ? "1y low" : "low"} ${fmt(entry.lowest.price)}</span>
                <span class="spp_wl_dim">at ${entry.lowest.shop.name} (${when})</span>`;
        }
        if (entry.current) {
            const steam = steamPriceIn(anchor.closest(".Panel"));
            const cheaper = steam !== null && entry.current.price.amount < steam;
            html += `<span class="spp_wl_dim"> · </span>
                <a href="${entry.current.url}" target="_blank" rel="noopener" class="spp_wl_now">
                    now ${fmt(entry.current.price)} at ${entry.current.shop.name}</a>`;
            if (cheaper) {
                html += ` <span class="spp_badge">cheaper</span>`;
            }
        }
        line.innerHTML = html;
        holder.appendChild(line);
    }

    function scan() {
        for (const anchor of titleAnchors()) {
            const appid = appidOf(anchor);
            if (!appid) { continue; }

            if (cache.has(appid)) {
                render(anchor, cache.get(appid));
            } else {
                pending.add(appid);
            }
        }

        if (pending.size > 0 && !flushTimer) {
            flushTimer = setTimeout(flush, 300);
        }
    }

    async function flush() {
        flushTimer = null;
        const ids = [...pending].filter((id) => !cache.has(id));
        pending.clear();
        if (ids.length === 0) { return; }

        for (let i = 0; i < ids.length; i += 50) {
            const chunk = ids.slice(i, i + 50);
            try {
                const data = await browser.runtime.sendMessage({
                    action: "fetchPrices",
                    body: {country: "US", apps: chunk, subs: [], bundles: [], voucher: true, shops: []}
                });
                if (data?.needsKey) {
                    showKeyBanner();
                    return;
                }
                for (const id of chunk) {
                    cache.set(id, data?.prices?.[`app/${id}`] ?? null);
                }
            } catch (err) {
                console.error("[VaporTracker] wishlist price fetch failed:", err);
                return;
            }
        }
        scan();
    }

    // Without an API key there's nothing to show; put one banner up top,
    // stop observing, and let the user set up via the toolbar popup.
    function showKeyBanner() {
        observer.disconnect();
        if (document.querySelector(".spp_wl_banner")) { return; }
        const banner = document.createElement("div");
        banner.className = "spp_panel spp_wl_banner";
        banner.innerHTML = `<div class="spp_title">Vapor Tracker <span class="spp_source">via IsThereAnyDeal</span></div>
            <div class="spp_row"><span class="spp_setup">Add your free IsThereAnyDeal API key to see wishlist prices —
            click the Vapor Tracker icon in the toolbar to set it up.</span></div>`;
        document.body.prepend(banner);
    }

    // Wishlist rows are virtualized: they mount/unmount while scrolling,
    // so re-scan (debounced) on any DOM change. scan() is idempotent.
    const observer = new MutationObserver(() => {
        if (scanTimer) { return; }
        scanTimer = setTimeout(() => {
            scanTimer = null;
            scan();
        }, 250);
    });
    observer.observe(document.body, {subtree: true, childList: true});

    scan();
})();
