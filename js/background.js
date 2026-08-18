const KEYWORDS = [
    "porn", "pornography", "xxx", "nsfw", "adult", "nude", "nudity",
    "hentai", "sexual", "sex", "xvideos", "xhamster", "redtube",
    "youporn", "pornhub", "romance", "romantic", "love", "boobs",
    "bhbhi", "sexy", "game", "seduce", "hair", "girl", "leady",
    "sence enjoyment"
];

function containsBlockedKeyword(urlString) {
    if (!urlString) return null;
    try {
        const url = new URL(urlString);

        // Do not block extension's own pages or non-http(s) protocols
        if (!url.protocol.startsWith('http')) return null;

        // Extract search query parameters and path
        const decodedUrl = decodeURIComponent(url.href).toLowerCase();
        const searchPart = (url.search + url.hash).toLowerCase().replace(/\+/g, " ");

        for (const keyword of KEYWORDS) {
            const k = keyword.toLowerCase().trim();
            if (!k) continue;

            // Match if keyword is present in search parameters or search query string
            if (searchPart.includes(k) || decodedUrl.includes("q=" + k) || decodedUrl.includes("query=" + k) || decodedUrl.includes("search_query=" + k)) {
                return k;
            }
        }
    } catch (e) { }
    return null;
}

const FIREBASE_HOSTED_URL = "https://demoproject-8ddb1.web.app";

function checkAndBlockTab(tabId, url) {
    if (!url) return;

    // Do not block if tab is already on live Firebase site or extension page
    if (url.startsWith(FIREBASE_HOSTED_URL) || url.startsWith(chrome.runtime.getURL("index.html"))) {
        return;
    }

    const blockedKeyword = containsBlockedKeyword(url);
    if (!blockedKeyword) return;

    console.log("Blocked keyword detected:", blockedKeyword, "Redirecting tab:", tabId);
    chrome.tabs.update(tabId, {
        url: FIREBASE_HOSTED_URL
    });
}

// 1. Listen to Tab Updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const targetUrl = changeInfo.url || tab.url;
    checkAndBlockTab(tabId, targetUrl);
});

// 2. Listen to Web Navigation events (Instant pre-render & SPA history updates)
if (chrome.webNavigation) {
    chrome.webNavigation.onBeforeNavigate.addListener((details) => {
        if (details.frameId === 0) {
            checkAndBlockTab(details.tabId, details.url);
        }
    });

    chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
        if (details.frameId === 0) {
            checkAndBlockTab(details.tabId, details.url);
        }
    });
}

