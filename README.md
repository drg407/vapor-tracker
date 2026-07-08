# Vapor Tracker

A lightweight Safari Web Extension (macOS + iOS) that shows price history on
Steam store pages — the historical low (all-time or past year) and the current
best price across stores, with a "cheaper than Steam" badge when another store
undercuts it. Wishlist rows get a compact price line too.

All data comes from the official [IsThereAnyDeal](https://isthereanydeal.com)
API using your own free API key. No third-party backend, no tracking.

## Features

- **Store pages** (games, DLC, subs, bundles): panel above the purchase box
  with historical low (price, discount, store, date), current best price
  linked to the store, and a full price-history link
- **Wishlist**: per-row price line with the low and current best, batched
  lookups and cached results (plays nice with ITAD rate limits)
- **All-time vs 1-year low** toggle in the toolbar popup
- Matches your Steam storefront country and currency automatically

## Setup

1. Build and run the app once (see below), then enable the extension:
   - **macOS**: Safari → Settings → Extensions → check **Vapor Tracker**,
     and allow it on the Steam sites when prompted
   - **iOS**: Open **Settings → Apps → Safari → Extensions → Vapor Tracker**
     → **Allow Extension**, then allow all three site URLs
     (`store.steampowered.com`, `steamcommunity.com`,
     `api.isthereanydeal.com`)
2. Get a free API key at [isthereanydeal.com/apps/my](https://isthereanydeal.com/apps/my/):
   register an app, then copy the key from the **API Keys** section — *not*
   the OAuth client ID or secret
3. Click the Vapor Tracker toolbar icon, paste the key, **Save & reload page**

Settings are stored per device — configure the key on each device you use.

## Building

The Xcode project is **generated** — don't edit it by hand. The extension
source lives in `Extension/` (plain JS, no build step).

```bash
./scripts/generate-project.sh   # regenerate Xcode wrapper + build (macOS)
```

Requires Xcode. The script runs `xcrun safari-web-extension-converter`,
restores the signing team, and builds the macOS app. For iOS, open
`Vapor Tracker/Vapor Tracker.xcodeproj` and run the "Vapor Tracker (iOS)"
scheme on your device. Regenerate after changing `manifest.json` or
adding/removing files; edits to existing JS/CSS just need a rebuild.

The icon is drawn in code: `swift scripts/makeicon.swift` regenerates the
PNG set in `Extension/img/`.

## How it works

- `content.js` (store pages) and `wishlist.js` find games in the page and ask
  the background script for prices; Steam's CSP blocks direct API calls from
  page context, so all fetching happens in `background.js`
- `background.js` calls ITAD: `lookup/id/shop/61/v1` (Steam IDs → ITAD game
  IDs), `games/overview/v2` (current best + all-time low), and in 1-year mode
  `games/history/v2?since=` (minimum deal event of the past year; note ITAD
  rejects fractional seconds in `since`)
- The wishlist is a virtualized React list with hashed class names, so rows
  are found via their `/app/{id}` title links and re-annotated through a
  debounced MutationObserver as rows mount and unmount

## Credits

Price data by [IsThereAnyDeal](https://isthereanydeal.com). Inspired by
[Augmented Steam](https://github.com/IsThereAnyDeal/AugmentedSteam).
Not affiliated with Valve, Steam, or IsThereAnyDeal.

## License

MIT — see [LICENSE](LICENSE).
