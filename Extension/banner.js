// iOS Safari shows an "Open in the Steam app" Smart App Banner whenever the
// page carries <meta name="apple-itunes-app">. The banner itself is native
// browser chrome, but removing the meta tag before Safari acts on it keeps
// the banner from appearing. Runs at document_start; the observer catches
// the tag as the parser inserts it, then disconnects once the DOM is ready.
(function () {
    "use strict";

    const kill = () => {
        for (const m of document.querySelectorAll('meta[name="apple-itunes-app"]')) {
            m.remove();
        }
    };

    kill();
    const observer = new MutationObserver(kill);
    observer.observe(document.documentElement, {childList: true, subtree: true});
    addEventListener("DOMContentLoaded", () => {
        kill();
        observer.disconnect();
    }, {once: true});
})();
