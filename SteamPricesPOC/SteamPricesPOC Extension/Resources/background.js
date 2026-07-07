const API = "https://api.augmentedsteam.com/prices/v2";

browser.runtime.onMessage.addListener((message) => {
    if (message?.action !== "fetchPrices") {
        return;
    }

    return fetch(API, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(message.body)
    }).then((res) => {
        if (!res.ok) {
            throw new Error(`prices/v2 responded ${res.status}`);
        }
        return res.json();
    });
});
