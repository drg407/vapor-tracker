const status = document.getElementById("status");
const keyInput = document.getElementById("itadKey");
const radios = [...document.querySelectorAll("input[name='lowMode']")];

function flash(msg) {
    status.textContent = msg;
    setTimeout(() => { status.textContent = ""; }, 1500);
}

async function save() {
    const lowMode = radios.find((r) => r.checked)?.value ?? "all";
    const itadKey = keyInput.value.trim();
    await browser.storage.local.set({lowMode, itadKey});
    if (lowMode === "y1" && !itadKey) {
        status.textContent = "1-year low needs an API key";
        return;
    }
    flash("Saved");
}

browser.storage.local.get({lowMode: "all", itadKey: ""}).then(({lowMode, itadKey}) => {
    radios.forEach((r) => { r.checked = r.value === lowMode; });
    keyInput.value = itadKey;
});

radios.forEach((r) => r.addEventListener("change", save));
keyInput.addEventListener("change", save);
