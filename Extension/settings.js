// Shared settings access for the background page and the popup.
//
// The API key lives in storage.sync, not storage.local. A full
// scripts/generate-project.sh regenerate tears down and rebuilds the wrapper
// app, which Safari reads as an uninstall — it flags the extension removed
// and purges storage.local, taking the key with it. storage.sync is backed by
// iCloud and is meant to outlive that.
//
// Not every Safari version exposes storage.sync, so every read falls back to
// local and every write mirrors to local. Reads never throw: losing settings
// should degrade to "ask for the key again", never break the page.

const SETTINGS_DEFAULTS = {lowMode: "all", itadKey: ""};

const syncArea = (() => {
    try {
        return browser.storage.sync ?? null;
    } catch {
        return null;
    }
})();

async function loadSettings() {
    const local = await browser.storage.local.get(SETTINGS_DEFAULTS);
    if (!syncArea) {
        return local;
    }

    let synced;
    try {
        synced = await syncArea.get(SETTINGS_DEFAULTS);
    } catch (err) {
        console.error("[VaporTracker] storage.sync read failed, using local:", err);
        return local;
    }

    // Migration: keys saved before this change live only in local. Lift the
    // first one we see into sync so the next purge can't take it.
    if (!synced.itadKey && local.itadKey) {
        try {
            await syncArea.set(local);
        } catch (err) {
            console.error("[VaporTracker] storage.sync migration failed:", err);
        }
        return local;
    }

    return synced;
}

async function saveSettings(settings) {
    // Local first: it is the fallback when sync is unavailable, and writing it
    // unconditionally keeps the two areas from disagreeing.
    await browser.storage.local.set(settings);
    if (!syncArea) {
        return;
    }
    try {
        await syncArea.set(settings);
    } catch (err) {
        console.error("[VaporTracker] storage.sync write failed, key saved locally only:", err);
    }
}
