/* ================= GLOBAL VARIABLES ================= */
const SESSION_TIME = 5 * 60;
let remaining = SESSION_TIME;
let timerInterval = null;
let currentMode = "default";
let completed = false;

let recognition = null;
let microphoneRunning = false;
let chantCount = 0;
const MALA_BEADS = 27;

const RING_CIRC = 615.75;

/* ================= YOUTUBE MUSIC & VIDEO PLAYERS ================= */
let ytPlayer = null;
let ytPlayerState = -1; // -1: unstarted, 0: ended, 1: playing, 2: paused, 3: buffering, 5: cued
let isYtReady = false;
let isShuffle = true; // Random mode enabled by default
let isLoop = false;
let currentlyLoadedVideoId = null;

// Playlist State
let activePlaylistType = "bg"; // "bg" or "video"
let videoPlaylist = [];
let bgPlaylist = [];
let currentTrackIndex = 0; // For Video section (randomized on load)
let bgTrackIndex = 0;      // For Background Music section (randomized on load)
let progressInterval = null;
let playedVideoHistorySet = new Set();
let playedBgHistorySet = new Set();

function getActivePlaylist() {
    return activePlaylistType === "video" ? videoPlaylist : bgPlaylist;
}

function getActiveTrackIndex() {
    return activePlaylistType === "video" ? currentTrackIndex : bgTrackIndex;
}

function setActiveTrackIndex(idx) {
    if (activePlaylistType === "video") {
        currentTrackIndex = idx;
    } else {
        bgTrackIndex = idx;
    }
}

/* ================= INITIALIZATION & EVENT BINDINGS ================= */
document.addEventListener('DOMContentLoaded', () => {
    // UI Setup
    buildMala();

    // Mode Buttons
    document.getElementById('listenBtn').addEventListener('click', startListen);
    document.getElementById('writeBtn').addEventListener('click', startWriting);
    document.getElementById('micBtn').addEventListener('click', startMicMode);

    // Player Controls (Video Card)
    document.getElementById('playPauseBtn').addEventListener('click', () => togglePlayPause("video"));
    document.getElementById('prevTrackBtn').addEventListener('click', () => playPrevTrack("video"));
    document.getElementById('nextTrackBtn').addEventListener('click', () => playNextTrack("video"));
    document.getElementById('shuffleBtn').addEventListener('click', toggleShuffle);
    document.getElementById('loopBtn').addEventListener('click', toggleLoop);
    document.getElementById('muteToggleBtn').addEventListener('click', toggleMute);

    // Background Music Bar & Manager Toggle
    document.getElementById('bgPlayPauseBtn').addEventListener('click', () => togglePlayPause("bg"));
    document.getElementById('bgNextBtn').addEventListener('click', () => playNextTrack("bg"));
    document.getElementById('bgManagerToggleBtn').addEventListener('click', toggleBgManager);

    // Sliders
    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => setVolume(e.target.value));
    }
    const trackSeekBar = document.getElementById('trackSeekBar');
    if (trackSeekBar) {
        trackSeekBar.addEventListener('input', (e) => seekTo(e.target.value));
    }

    // Video Playlist Manager Controls
    document.getElementById('addLinkBtn').addEventListener('click', () => {
        const input = document.getElementById('ytLinkInput');
        if (input) {
            addVideoLink(input.value);
            input.value = "";
        }
    });

    const ytLinkInput = document.getElementById('ytLinkInput');
    if (ytLinkInput) {
        ytLinkInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addVideoLink(ytLinkInput.value);
                ytLinkInput.value = "";
            }
        });
    }

    document.getElementById('resetPlaylistBtn').addEventListener('click', resetVideoPlaylistFromFile);
    document.getElementById('exportVideoTxtBtn').addEventListener('click', exportVideoTxtFile);
    document.getElementById('clearPlaylistBtn').addEventListener('click', clearVideoPlaylist);

    // Background Music Playlist Manager Controls
    document.getElementById('addBgLinkBtn').addEventListener('click', () => {
        const input = document.getElementById('bgLinkInput');
        if (input) {
            addBgMusicLink(input.value);
            input.value = "";
        }
    });

    const bgLinkInput = document.getElementById('bgLinkInput');
    if (bgLinkInput) {
        bgLinkInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addBgMusicLink(bgLinkInput.value);
                bgLinkInput.value = "";
            }
        });
    }

    document.getElementById('resetBgPlaylistBtn').addEventListener('click', resetBgPlaylistFromFile);
    document.getElementById('exportBgTxtBtn').addEventListener('click', exportBgTxtFile);
    document.getElementById('clearBgPlaylistBtn').addEventListener('click', clearBgPlaylist);

    // Mic & Writing Controls
    document.getElementById('microphoneButton').addEventListener('click', toggleMicrophone);
    const writingBox = document.getElementById("writingBox");
    if (writingBox) {
        writingBox.addEventListener("input", function () {
            document.getElementById("charCount").textContent = this.value.length;
        });
    }

    // Load local cached playlists instantly and attempt immediate player initialization
    loadVideoPlaylistFromFile();
    loadBgPlaylistFromFile();

    if (window.YT && window.YT.Player) {
        initYouTubePlayer();
    }

    // Auto-start 5-minute session timer
    startTimer();

    // Silent user interaction trigger to start YouTube playback smoothly
    const triggerBgAudio = () => {
        if (isYtReady && ytPlayer) {
            try {
                if (ytPlayerState !== YT.PlayerState.PLAYING && typeof ytPlayer.playVideo === 'function') {
                    ytPlayer.playVideo();
                }
            } catch (e) { }
        }
    };
    ['click', 'keydown', 'pointerdown', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, triggerBgAudio, { passive: true });
    });
});

/* ================= YOUTUBE IFRAME API INTEGRATION ================= */
window.onYouTubeIframeAPIReady = function () {
    initYouTubePlayer();
};

function initYouTubePlayer() {
    if (ytPlayer || !document.getElementById('ytIframeContainer')) return;
    if (typeof YT === 'undefined' || !YT.Player) return;

    const activeList = getActivePlaylist();
    if (!activeList || activeList.length === 0) return;

    let idx = getActiveTrackIndex();
    if (idx < 0 || idx >= activeList.length) {
        idx = Math.floor(Math.random() * activeList.length);
        setActiveTrackIndex(idx);
    }

    const initialVideoId = activeList[idx].id;
    currentlyLoadedVideoId = initialVideoId;

    const playerVarsObj = {
        'autoplay': 1,
        'controls': 1,
        'rel': 0,
        'modestbranding': 1,
        'enablejsapi': 1
    };
    if (window.location.protocol.startsWith('http') || window.location.protocol.startsWith('chrome-extension')) {
        playerVarsObj.origin = window.location.origin;
    }

    try {
        ytPlayer = new YT.Player('ytIframeContainer', {
            height: '100%',
            width: '100%',
            host: 'https://www.youtube.com',
            videoId: initialVideoId,
            playerVars: playerVarsObj,
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange,
                'onError': onPlayerError
            }
        });
    } catch (e) {
        console.log("Error initializing YT.Player:", e);
    }
}

function updatePlayPauseIcons() {
    const playPauseBtn = document.getElementById("playPauseBtn");
    const bgPlayPauseBtn = document.getElementById("bgPlayPauseBtn");
    const bgBar = document.getElementById("bgMusicBar");
    const isPlaying = isYtReady && ytPlayer && ytPlayerState === YT.PlayerState.PLAYING;

    if (isPlaying) {
        if (activePlaylistType === "video") {
            if (playPauseBtn) playPauseBtn.innerHTML = "⏸️ Pause Video";
            if (bgPlayPauseBtn) bgPlayPauseBtn.innerHTML = "▶️";
            if (bgBar) bgBar.classList.remove("playing");
        } else {
            if (playPauseBtn) playPauseBtn.innerHTML = "▶️ Play Video";
            if (bgPlayPauseBtn) bgPlayPauseBtn.innerHTML = "⏸️";
            if (bgBar) bgBar.classList.add("playing");
        }
    } else {
        if (playPauseBtn) playPauseBtn.innerHTML = "▶️ Play Video";
        if (bgPlayPauseBtn) bgPlayPauseBtn.innerHTML = "▶️";
        if (bgBar) bgBar.classList.remove("playing");
    }
}

function onPlayerReady(event) {
    isYtReady = true;
    updateTrackDisplay();
    updatePlayPauseIcons();
    const volumeSlider = document.getElementById("volumeSlider");
    if (volumeSlider && ytPlayer && typeof ytPlayer.setVolume === 'function') {
        ytPlayer.setVolume(parseInt(volumeSlider.value));
    }
    // Instant playback start on ready
    try {
        event.target.playVideo();
    } catch (e) { }
}

function onPlayerStateChange(event) {
    ytPlayerState = event.data;
    updatePlayPauseIcons();
    updateTrackDisplay();

    if (event.data === YT.PlayerState.PLAYING) {
        errorRetryCount = 0;
        startProgressTimer();
        const timerEl = document.getElementById("timer");
        if (timerEl) timerEl.style.color = "";
    } else if (event.data === YT.PlayerState.PAUSED) {
        stopProgressTimer();
    } else if (event.data === YT.PlayerState.ENDED) {
        stopProgressTimer();
        if (isLoop) {
            if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
                ytPlayer.playVideo();
            }
        } else {
            playNextTrack(activePlaylistType);
        }
    }
}

let errorRetryCount = 0;
function onPlayerError(event) {
    console.log("YouTube Player Error:", event.data);
    const activeList = getActivePlaylist();
    errorRetryCount++;
    if (errorRetryCount >= (activeList && activeList.length > 0 ? activeList.length : 3)) {
        console.warn("All tracks in playlist returned error.");
        showVideoFeedback("⚠️ Video restricted or unavailable. Please check YouTube URL.", "error");
        errorRetryCount = 0;
        return;
    }
    showVideoFeedback("⚠️ Video unavailable. Auto-skipping to next track...", "error");
    setTimeout(() => {
        playNextTrack(activePlaylistType);
    }, 1200);
}

/* ================= YOUTUBE LINK EXTRACTION & FILE MANAGEMENT ================= */
function extractYouTubeId(urlOrId) {
    if (!urlOrId) return null;
    let str = urlOrId.trim();

    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
        return str;
    }

    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = str.match(regExp);

    if (match && match[2] && match[2].length === 11) {
        return match[2];
    }

    return null;
}

function populateVideoPlaylistFromIDs(idsArray) {
    if (!Array.isArray(idsArray)) return;
    videoPlaylist = [];
    idsArray.forEach(linkStr => {
        const videoId = extractYouTubeId(linkStr) || linkStr;
        if (videoId) {
            const exists = videoPlaylist.some(item => item.id === videoId);
            if (!exists) {
                videoPlaylist.push({ title: `YouTube Video (${videoId})`, id: videoId });
                fetchYouTubeTitle(videoId, "video");
            }
        }
    });
}

function populateBgPlaylistFromIDs(idsArray) {
    if (!Array.isArray(idsArray)) return;
    bgPlaylist = [];
    idsArray.forEach(linkStr => {
        const videoId = extractYouTubeId(linkStr) || linkStr;
        if (videoId) {
            const exists = bgPlaylist.some(item => item.id === videoId);
            if (!exists) {
                bgPlaylist.push({ title: `Background Kirtan (${videoId})`, id: videoId });
                fetchYouTubeTitle(videoId, "bg");
            }
        }
    });
}

const DEFAULT_VIDEO_LINKS = [
    "https://www.youtube.com/watch?v=84S6cWvV_cI",
    "https://www.youtube.com/watch?v=73T2dYcIuYg",
    "https://www.youtube.com/watch?v=a929vX4kM3M"
];

const DEFAULT_BG_LINKS = [
    "https://www.youtube.com/watch?v=84S6cWvV_cI",
    "https://www.youtube.com/watch?v=73T2dYcIuYg",
    "https://www.youtube.com/watch?v=a929vX4kM3M"
];

async function loadVideoPlaylistFromFile() {
    let localCacheLoaded = false;
    const cachedLinks = localStorage.getItem("video_links_cache");
    const localTimestamp = parseInt(localStorage.getItem("video_links_timestamp") || "0", 10);

    if (cachedLinks) {
        try {
            const parsed = JSON.parse(cachedLinks);
            if (Array.isArray(parsed) && parsed.length > 0) {
                populateVideoPlaylistFromIDs(parsed);
                localCacheLoaded = true;
            }
        } catch (e) { }
    }

    if (!localCacheLoaded || videoPlaylist.length === 0) {
        populateVideoPlaylistFromIDs(DEFAULT_VIDEO_LINKS);
        localStorage.setItem("video_links_cache", JSON.stringify(DEFAULT_VIDEO_LINKS));
    }

    // Always pick a random starting song on page load/refresh
    if (videoPlaylist.length > 0) {
        currentTrackIndex = Math.floor(Math.random() * videoPlaylist.length);
    }

    renderVideoPlaylistUI();

    try {
        if (window.firebaseDb) {
            const doc = await window.firebaseDb.collection('playlists').doc('video_links').get();
            if (doc.exists && doc.data().links && doc.data().links.length > 0) {
                const cloudLinks = doc.data().links;
                const cloudTime = doc.data().updatedAt ? (doc.data().updatedAt.toMillis ? doc.data().updatedAt.toMillis() : new Date(doc.data().updatedAt).getTime()) : Date.now();

                if (cloudTime > localTimestamp || !localCacheLoaded) {
                    localStorage.setItem("video_links_cache", JSON.stringify(cloudLinks));
                    localStorage.setItem("video_links_timestamp", cloudTime.toString());
                    populateVideoPlaylistFromIDs(cloudLinks);
                    if (videoPlaylist.length > 0) {
                        currentTrackIndex = Math.floor(Math.random() * videoPlaylist.length);
                    }
                    renderVideoPlaylistUI();
                }
            }
        }
    } catch (e) { console.log("Firestore background sync video error:", e); }
}

async function loadBgPlaylistFromFile() {
    let localCacheLoaded = false;
    const cachedLinks = localStorage.getItem("bg_links_cache");
    const localTimestamp = parseInt(localStorage.getItem("bg_links_timestamp") || "0", 10);

    if (cachedLinks) {
        try {
            const parsed = JSON.parse(cachedLinks);
            if (Array.isArray(parsed) && parsed.length > 0) {
                populateBgPlaylistFromIDs(parsed);
                localCacheLoaded = true;
            }
        } catch (e) { }
    }

    if (!localCacheLoaded || bgPlaylist.length === 0) {
        populateBgPlaylistFromIDs(DEFAULT_BG_LINKS);
        localStorage.setItem("bg_links_cache", JSON.stringify(DEFAULT_BG_LINKS));
    }

    // Always pick a random starting background song on page load/refresh
    if (bgPlaylist.length > 0) {
        bgTrackIndex = Math.floor(Math.random() * bgPlaylist.length);
    }

    renderBgPlaylistUI();
    updateTrackDisplay();

    try {
        if (window.firebaseDb) {
            const doc = await window.firebaseDb.collection('playlists').doc('background_music_links').get();
            if (doc.exists && doc.data().links && doc.data().links.length > 0) {
                const cloudLinks = doc.data().links;
                const cloudTime = doc.data().updatedAt ? (doc.data().updatedAt.toMillis ? doc.data().updatedAt.toMillis() : new Date(doc.data().updatedAt).getTime()) : Date.now();

                if (cloudTime > localTimestamp || !localCacheLoaded) {
                    localStorage.setItem("bg_links_cache", JSON.stringify(cloudLinks));
                    localStorage.setItem("bg_links_timestamp", cloudTime.toString());
                    populateBgPlaylistFromIDs(cloudLinks);
                    if (bgPlaylist.length > 0) {
                        bgTrackIndex = Math.floor(Math.random() * bgPlaylist.length);
                    }
                    renderBgPlaylistUI();
                    updateTrackDisplay();
                }
            }
        }
    } catch (e) { console.log("Firestore background sync bg error:", e); }
}

async function saveVideoPlaylist() {
    try {
        const ids = videoPlaylist.map(item => item.id);
        const now = Date.now();
        localStorage.setItem("video_links_cache", JSON.stringify(ids));
        localStorage.setItem("video_links_timestamp", now.toString());
        
        if (window.firebaseDb) {
            await window.firebaseDb.collection('playlists').doc('video_links').set({
                links: ids,
                updatedAt: firebase.firestore.Timestamp.fromMillis(now)
            }, { merge: true });
        }
    } catch (e) { console.log("Firestore save video error:", e); }
}

async function saveBgPlaylist() {
    try {
        const ids = bgPlaylist.map(item => item.id);
        const now = Date.now();
        localStorage.setItem("bg_links_cache", JSON.stringify(ids));
        localStorage.setItem("bg_links_timestamp", now.toString());
        
        if (window.firebaseDb) {
            await window.firebaseDb.collection('playlists').doc('background_music_links').set({
                links: ids,
                updatedAt: firebase.firestore.Timestamp.fromMillis(now)
            }, { merge: true });
        }
    } catch (e) { console.log("Firestore save bg error:", e); }
}

/* ================= VIDEO PLAYLIST MANAGER FUNCTIONS ================= */
function addVideoLink(inputStr) {
    if (!inputStr || !inputStr.trim()) return;

    const tokens = inputStr.split(/[\s,\n]+/);
    let addedCount = 0;

    tokens.forEach(token => {
        const videoId = extractYouTubeId(token);
        if (videoId) {
            const exists = videoPlaylist.some(item => item.id === videoId);
            if (!exists) {
                const title = `YouTube Video (${videoId})`;
                videoPlaylist.push({ title: title, id: videoId });
                addedCount++;
                fetchYouTubeTitle(videoId, "video");
            }
        }
    });

    if (addedCount > 0) {
        saveVideoPlaylist();
        renderVideoPlaylistUI();
        showVideoFeedback(`✅ Added ${addedCount} video(s) to playlist!`, "success");
        loadAndPlayTrack("video", videoPlaylist.length - 1);
    } else {
        showVideoFeedback("❌ Invalid YouTube link or video already in playlist.", "error");
    }
}

function resetVideoPlaylistFromFile() {
    loadVideoPlaylistFromFile().then(() => {
        saveVideoPlaylist();
        renderVideoPlaylistUI();
        if (videoPlaylist.length > 0) loadAndPlayTrack("video", 0);
        showVideoFeedback("🔄 Synced video playlist with Firebase Cloud Database", "success");
    });
}

function clearVideoPlaylist() {
    if (confirm("Clear all videos from your playlist?")) {
        videoPlaylist = [];
        saveVideoPlaylist();
        renderVideoPlaylistUI();
        showVideoFeedback("🗑️ Video playlist cleared.", "error");
    }
}

function exportVideoTxtFile() {
    if (!videoPlaylist || videoPlaylist.length === 0) {
        showVideoFeedback("⚠️ Video playlist is empty.", "error");
        return;
    }
    let content = "# Paste your Video Section YouTube links below (one link per line)\n";
    videoPlaylist.forEach(item => {
        content += `https://www.youtube.com/watch?v=${item.id}\n`;
    });
    downloadFile(content, "video_links.txt", "text/plain");
    showVideoFeedback("📥 Exported video_links.txt successfully!", "success");
}

function renderVideoPlaylistUI() {
    const listEl = document.getElementById("playlistItems");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!videoPlaylist || videoPlaylist.length === 0) {
        listEl.innerHTML = `<li style="padding:14px; text-align:center; color:#888; font-size:14px;">No videos in playlist. Paste a YouTube link above to add!</li>`;
        return;
    }

    videoPlaylist.forEach((item, index) => {
        const li = document.createElement("li");
        const isPlaying = activePlaylistType === "video" && index === currentTrackIndex;
        li.className = `playlist-item ${isPlaying ? "playing" : ""}`;

        li.innerHTML = `
            <div class="item-info">
                <span class="item-title" title="${item.title}">${item.title}</span>
                ${isPlaying ? '<span class="playing-badge">🎬 Playing</span>' : ''}
            </div>
            <div class="item-actions">
                <button class="item-btn play-item-btn" title="Play Video">▶️</button>
                <button class="item-btn delete-item-btn" title="Remove Video">🗑️</button>
            </div>
        `;

        li.querySelector(".play-item-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            loadAndPlayTrack("video", index);
        });

        li.querySelector(".delete-item-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            removeVideoTrack(index);
        });

        listEl.appendChild(li);
    });
}

function removeVideoTrack(index) {
    if (index >= 0 && index < videoPlaylist.length) {
        videoPlaylist.splice(index, 1);
        saveVideoPlaylist();
        if (currentTrackIndex >= videoPlaylist.length) {
            currentTrackIndex = Math.max(0, videoPlaylist.length - 1);
        }
        renderVideoPlaylistUI();
        if (videoPlaylist.length > 0 && activePlaylistType === "video") {
            if (index === currentTrackIndex) {
                loadAndPlayTrack("video", currentTrackIndex);
            }
        }
        showVideoFeedback("🗑️ Removed video track.", "error");
    }
}

/* ================= BACKGROUND MUSIC PLAYLIST MANAGER FUNCTIONS ================= */
function toggleBgManager() {
    const card = document.getElementById("bgMusicManagerCard");
    if (card) {
        if (card.style.display === "none" || !card.style.display) {
            card.style.display = "block";
            renderBgPlaylistUI();
        } else {
            card.style.display = "none";
        }
    }
}

function addBgMusicLink(inputStr) {
    if (!inputStr || !inputStr.trim()) return;

    const tokens = inputStr.split(/[\s,\n]+/);
    let addedCount = 0;

    tokens.forEach(token => {
        const videoId = extractYouTubeId(token);
        if (videoId) {
            const exists = bgPlaylist.some(item => item.id === videoId);
            if (!exists) {
                const title = `Background Kirtan (${videoId})`;
                bgPlaylist.push({ title: title, id: videoId });
                addedCount++;
                fetchYouTubeTitle(videoId, "bg");
            }
        }
    });

    if (addedCount > 0) {
        saveBgPlaylist();
        renderBgPlaylistUI();
        showBgFeedback(`✅ Added ${addedCount} background music track(s)!`, "success");
        loadAndPlayTrack("bg", bgPlaylist.length - 1);
    } else {
        showBgFeedback("❌ Invalid YouTube link or track already in list.", "error");
    }
}

function resetBgPlaylistFromFile() {
    loadBgPlaylistFromFile().then(() => {
        saveBgPlaylist();
        renderBgPlaylistUI();
        showBgFeedback("🔄 Synced background music with Firebase Cloud Database", "success");
    });
}

function clearBgPlaylist() {
    if (confirm("Clear all background music links?")) {
        bgPlaylist = [];
        saveBgPlaylist();
        renderBgPlaylistUI();
        showBgFeedback("🗑️ Background music playlist cleared.", "error");
    }
}

function exportBgTxtFile() {
    if (!bgPlaylist || bgPlaylist.length === 0) {
        showBgFeedback("⚠️ Background music playlist is empty.", "error");
        return;
    }
    let content = "# Paste your Background Music YouTube links below (one link per line)\n";
    bgPlaylist.forEach(item => {
        content += `https://www.youtube.com/watch?v=${item.id}\n`;
    });
    downloadFile(content, "background_music_links.txt", "text/plain");
    showBgFeedback("📥 Exported background_music_links.txt successfully!", "success");
}

function renderBgPlaylistUI() {
    const listEl = document.getElementById("bgPlaylistItems");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!bgPlaylist || bgPlaylist.length === 0) {
        listEl.innerHTML = `<li style="padding:14px; text-align:center; color:#888; font-size:14px;">No background tracks. Paste a YouTube link above to add!</li>`;
        return;
    }

    bgPlaylist.forEach((item, index) => {
        const li = document.createElement("li");
        const isPlaying = activePlaylistType === "bg" && index === bgTrackIndex;
        li.className = `playlist-item ${isPlaying ? "playing" : ""}`;

        li.innerHTML = `
            <div class="item-info">
                <span class="item-title" title="${item.title}">${item.title}</span>
                ${isPlaying ? '<span class="playing-badge">🎵 Playing</span>' : ''}
            </div>
            <div class="item-actions">
                <button class="item-btn play-item-btn" title="Play Track">▶️</button>
                <button class="item-btn delete-item-btn" title="Remove Track">🗑️</button>
            </div>
        `;

        li.querySelector(".play-item-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            loadAndPlayTrack("bg", index);
        });

        li.querySelector(".delete-item-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            removeBgTrack(index);
        });

        listEl.appendChild(li);
    });
}

function removeBgTrack(index) {
    if (index >= 0 && index < bgPlaylist.length) {
        bgPlaylist.splice(index, 1);
        saveBgPlaylist();
        if (bgTrackIndex >= bgPlaylist.length) {
            bgTrackIndex = Math.max(0, bgPlaylist.length - 1);
        }
        renderBgPlaylistUI();
        if (bgPlaylist.length > 0 && activePlaylistType === "bg") {
            if (index === bgTrackIndex) {
                loadAndPlayTrack("bg", bgTrackIndex);
            }
        }
        showBgFeedback("🗑️ Removed background track.", "error");
    }
}

/* ================= UTILITY FUNCTIONS ================= */
function fetchYouTubeTitle(videoId, target = "video") {
    fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`)
        .then(res => res.json())
        .then(data => {
            if (data && data.title) {
                if (target === "video" || target === "both") {
                    const item = videoPlaylist.find(p => p.id === videoId);
                    if (item) {
                        item.title = data.title;
                        renderVideoPlaylistUI();
                    }
                }
                if (target === "bg" || target === "both") {
                    const itemBg = bgPlaylist.find(p => p.id === videoId);
                    if (itemBg) {
                        itemBg.title = data.title;
                        renderBgPlaylistUI();
                    }
                }
                updateTrackDisplay();
            }
        })
        .catch(err => console.log("Failed to fetch title for video:", videoId, err));
}

function downloadFile(content, fileName, contentType) {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
}

function showVideoFeedback(msg, type) {
    const fb = document.getElementById("linkFeedback");
    if (fb) {
        fb.textContent = msg;
        fb.className = `link-feedback ${type}`;
        setTimeout(() => {
            if (fb.textContent === msg) fb.textContent = "";
        }, 4000);
    }
}

function showBgFeedback(msg, type) {
    const fb = document.getElementById("bgLinkFeedback");
    if (fb) {
        fb.textContent = msg;
        fb.className = `link-feedback ${type}`;
        setTimeout(() => {
            if (fb.textContent === msg) fb.textContent = "";
        }, 4000);
    }
}

/* ================= PLAYBACK CONTROLS ================= */
function loadAndPlayTrack(type, index) {
    if (type) activePlaylistType = type;
    const list = getActivePlaylist();
    if (!list || list.length === 0) return;

    let validIndex = index;
    if (validIndex < 0 || validIndex >= list.length) {
        validIndex = 0;
    }
    setActiveTrackIndex(validIndex);
    
    const track = list[validIndex];
    if (!track || !track.id) return;

    updateTrackDisplay();
    renderVideoPlaylistUI();
    renderBgPlaylistUI();

    if (isYtReady && ytPlayer) {
        if (currentlyLoadedVideoId !== track.id) {
            currentlyLoadedVideoId = track.id;
            if (typeof ytPlayer.loadVideoById === 'function') {
                ytPlayer.loadVideoById(track.id);
            }
        } else {
            if (typeof ytPlayer.playVideo === 'function') {
                ytPlayer.playVideo();
            }
        }
    } else {
        currentlyLoadedVideoId = track.id;
        initYouTubePlayer();
    }
}

function playTrack(index, type = null) {
    loadAndPlayTrack(type || activePlaylistType, index);
}

function playNextTrack(type = null) {
    const targetType = type || activePlaylistType;
    activePlaylistType = targetType;
    const list = getActivePlaylist();
    if (!list || list.length === 0) return;

    const currentIndex = getActiveTrackIndex();
    let nextIndex;

    if (isShuffle) {
        if (list.length === 1) {
            nextIndex = 0;
        } else {
            const historySet = targetType === "video" ? playedVideoHistorySet : playedBgHistorySet;
            historySet.add(currentIndex);

            let available = list
                .map((_, idx) => idx)
                .filter(idx => !historySet.has(idx));

            if (available.length === 0) {
                historySet.clear();
                historySet.add(currentIndex);
                available = list
                    .map((_, idx) => idx)
                    .filter(idx => idx !== currentIndex);
            }

            nextIndex = available[Math.floor(Math.random() * available.length)];
        }
    } else {
        nextIndex = (currentIndex + 1) % list.length;
    }

    loadAndPlayTrack(targetType, nextIndex);
}

function playPrevTrack(type = null) {
    const targetType = type || activePlaylistType;
    activePlaylistType = targetType;
    const list = getActivePlaylist();
    if (!list || list.length === 0) return;

    const currentIndex = getActiveTrackIndex();
    const prevIndex = (currentIndex - 1 + list.length) % list.length;
    loadAndPlayTrack(targetType, prevIndex);
}

function togglePlayPause(type = null) {
    const targetType = type || activePlaylistType;
    const list = targetType === "video" ? videoPlaylist : bgPlaylist;
    if (!list || list.length === 0) return;

    const targetIndex = targetType === "video" ? currentTrackIndex : bgTrackIndex;
    const track = list[targetIndex] || list[0];
    if (!track) return;

    if (activePlaylistType !== targetType || currentlyLoadedVideoId !== track.id) {
        loadAndPlayTrack(targetType, targetIndex);
        return;
    }

    if (!isYtReady || !ytPlayer) {
        loadAndPlayTrack(targetType, targetIndex);
        return;
    }

    if (ytPlayerState === YT.PlayerState.PLAYING) {
        if (typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo();
    } else {
        if (typeof ytPlayer.playVideo === 'function') ytPlayer.playVideo();
    }
    setTimeout(updatePlayPauseIcons, 150);
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    const btn = document.getElementById("shuffleBtn");
    if (btn) {
        if (isShuffle) {
            btn.classList.add("active");
            btn.innerHTML = "🔀 Shuffle ON";
        } else {
            btn.classList.remove("active");
            btn.innerHTML = "🔀 Shuffle OFF";
        }
    }
}

function toggleLoop() {
    isLoop = !isLoop;
    const btn = document.getElementById("loopBtn");
    if (btn) {
        if (isLoop) {
            btn.classList.add("active");
            btn.innerHTML = "🔁 Loop 1";
        } else {
            btn.classList.remove("active");
            btn.innerHTML = "🔁 Loop All";
        }
    }
}

function setVolume(vol) {
    if (isYtReady && ytPlayer && typeof ytPlayer.setVolume === 'function') {
        ytPlayer.setVolume(parseInt(vol));
        const muteBtn = document.getElementById("muteToggleBtn");
        if (parseInt(vol) === 0) {
            if (typeof ytPlayer.mute === 'function') ytPlayer.mute();
            if (muteBtn) muteBtn.textContent = "🔇";
        } else {
            if (typeof ytPlayer.unMute === 'function') ytPlayer.unMute();
            if (muteBtn) muteBtn.textContent = "🔊";
        }
    }
}

function toggleMute() {
    if (isYtReady && ytPlayer && typeof ytPlayer.isMuted === 'function') {
        const muteBtn = document.getElementById("muteToggleBtn");
        if (ytPlayer.isMuted()) {
            ytPlayer.unMute();
            if (muteBtn) muteBtn.textContent = "🔊";
        } else {
            ytPlayer.mute();
            if (muteBtn) muteBtn.textContent = "🔇";
        }
    }
}

function seekTo(percentage) {
    if (isYtReady && ytPlayer && typeof ytPlayer.getDuration === 'function') {
        const duration = ytPlayer.getDuration();
        if (duration > 0) {
            const targetSeconds = (percentage / 100) * duration;
            ytPlayer.seekTo(targetSeconds, true);
        }
    }
}

function startProgressTimer() {
    stopProgressTimer();
    progressInterval = setInterval(() => {
        if (isYtReady && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
            const currentTime = ytPlayer.getCurrentTime() || 0;
            const duration = ytPlayer.getDuration() || 0;

            const currLbl = document.getElementById("currentTimeLabel");
            const durLbl = document.getElementById("durationLabel");
            const seekBar = document.getElementById("trackSeekBar");

            if (currLbl) currLbl.textContent = formatTime(currentTime);
            if (durLbl) durLbl.textContent = formatTime(duration);
            if (seekBar && duration > 0) {
                seekBar.value = (currentTime / duration) * 100;
            }
        }
    }, 500);
}

function stopProgressTimer() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

function formatTime(seconds) {
    const s = Math.floor(seconds);
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

function updateTrackDisplay() {
    const vTrack = videoPlaylist[currentTrackIndex];
    const bgTrack = bgPlaylist[bgTrackIndex];

    const nameEl = document.getElementById("kirtanName");
    const bgNameEl = document.getElementById("bgMusicTitle");
    const bgBadgeEl = document.getElementById("bgMusicBadge");

    if (nameEl) {
        if (vTrack) {
            nameEl.textContent = vTrack.title;
        } else {
            nameEl.textContent = "No Video Loaded";
        }
    }

    if (bgNameEl) {
        if (bgTrack) {
            const isBgPlaying = activePlaylistType === "bg" && isYtReady && ytPlayer && ytPlayerState === YT.PlayerState.PLAYING;
            bgNameEl.textContent = bgTrack.title + (isBgPlaying ? "" : " (Paused)");
        } else {
            bgNameEl.textContent = "No Background Music Track";
        }
    }

    if (bgBadgeEl) {
        if (activePlaylistType === "bg" && isYtReady && ytPlayer && ytPlayerState === YT.PlayerState.PLAYING) {
            bgBadgeEl.textContent = "🎵 Playing";
            bgBadgeEl.className = "bg-music-badge active";
        } else {
            bgBadgeEl.textContent = "⏸️ Music";
            bgBadgeEl.className = "bg-music-badge";
        }
    }
}

function updateIframeHost(mode) {
    const iframeContainer = document.getElementById("ytIframeContainer");
    const listenWrapper = document.getElementById("listenPlayerWrapper");
    const bgHost = document.getElementById("bgYtPlayerHost");

    if (!iframeContainer) return;

    if (mode === "listen" && listenWrapper) {
        if (iframeContainer.parentElement !== listenWrapper) {
            listenWrapper.appendChild(iframeContainer);
        }
    } else if (bgHost) {
        if (iframeContainer.parentElement !== bgHost) {
            bgHost.appendChild(iframeContainer);
        }
    }
}

/* ================= UI & DECORATIVE EFFECTS ================= */
function buildMala() {
    const mala = document.getElementById('mala');
    if (!mala) return;
    mala.innerHTML = "";
    for (let i = 0; i < MALA_BEADS; i++) {
        const b = document.createElement('div');
        b.className = 'bead';
        b.id = 'bead' + i;
        mala.appendChild(b);
    }
}

/* ================= STRICT MODE ENFORCEMENT ================= */
function enterFullScreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(() => console.log("Fullscreen blocked"));
    } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
    }
}

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && remaining > 0 && !completed && timerInterval) {
        alert("Please return. You must complete your 5 minutes of remembrance.");
        enterFullScreen();
    }
});

function saveTimerState() {
    if (!completed && remaining > 0) {
        localStorage.setItem("krishnaSessionRemaining", remaining);
        localStorage.setItem("krishnaSessionMode", currentMode);
        localStorage.setItem("krishnaSessionSavedTime", Date.now());
    } else {
        localStorage.removeItem("krishnaSessionRemaining");
    }
}

window.addEventListener('load', function () {
    const savedRemaining = localStorage.getItem("krishnaSessionRemaining");
    const savedTime = localStorage.getItem("krishnaSessionSavedTime");
    const savedMode = localStorage.getItem("krishnaSessionMode");

    if (savedRemaining && savedTime && savedMode) {
        const timeAway = Math.floor((Date.now() - parseInt(savedTime)) / 1000);
        let newRemaining = parseInt(savedRemaining) - timeAway;

        if (newRemaining > 0) {
            remaining = newRemaining;
            currentMode = savedMode;

            if (savedMode === "listen") { showSection("listenSection"); setActiveButton("listenBtn"); updateIframeHost("listen"); }
            if (savedMode === "write") { showSection("writeSection"); setActiveButton("writeBtn"); updateIframeHost("write"); }
            if (savedMode === "mic") { showSection("micSection"); setActiveButton("micBtn"); updateIframeHost("mic"); }
        } else {
            localStorage.removeItem("krishnaSessionRemaining");
            remaining = SESSION_TIME;
            currentMode = "default";
        }
    } else {
        remaining = SESSION_TIME;
        currentMode = "default";
    }

    startTimer();
});

window.addEventListener("beforeunload", function (event) {
    if (!completed && remaining > 0) {
        event.preventDefault();
        event.returnValue = "";
    }
});

/* ================= SESSION LOGIC & TIMER ================= */
function startTimer() {
    if (timerInterval || completed) return;

    completed = false;
    document.getElementById("success").style.display = "none";

    updateTimer();
    updateProgress();

    timerInterval = setInterval(function () {
        remaining--;
        updateTimer();
        updateProgress();

        if (remaining <= 0) finishSession();
    }, 1000);
}

function startSession(mode) {
    enterFullScreen();
    currentMode = mode;
    startTimer();
}

function updateTimer() {
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    const timerEl = document.getElementById("timer");
    if (timerEl) {
        timerEl.textContent = String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
    }
    saveTimerState();
}

function updateProgress() {
    const fraction = (SESSION_TIME - remaining) / SESSION_TIME;
    const offset = RING_CIRC * (1 - fraction);
    const ringFg = document.getElementById("ringFg");
    if (ringFg) {
        ringFg.style.strokeDashoffset = offset;
    }
}

function showSection(id) {
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    const sec = document.getElementById(id);
    if (sec) sec.classList.add("active");
}

function setActiveButton(id) {
    document.querySelectorAll(".mode-buttons button").forEach(b => b.classList.remove("active"));
    const btn = document.getElementById(id);
    if (btn) btn.classList.add("active");
}

/* ================= MODES ================= */
function startListen() {
    startSession("listen");
    showSection("listenSection");
    setActiveButton("listenBtn");
    updateIframeHost("listen");

    if (videoPlaylist.length > 0) {
        loadAndPlayTrack("video", currentTrackIndex);
    }
}

function startWriting() {
    startSession("write");
    showSection("writeSection");
    setActiveButton("writeBtn");
    updateIframeHost("write");
    const box = document.getElementById("writingBox");
    if (box) box.focus();
}

function startMicMode() {
    startSession("mic");
    showSection("micSection");
    setActiveButton("micBtn");
    updateIframeHost("mic");
}

function toggleMicrophone() {
    if (microphoneRunning) stopRecognition();
    else startRecognition();
}

function lightBead() {
    const idx = (chantCount - 1) % MALA_BEADS;
    const bead = document.getElementById('bead' + idx);
    if (bead) bead.classList.add('lit');
    if (chantCount % MALA_BEADS === 0) {
        document.querySelectorAll('.bead').forEach(b => {
            setTimeout(() => b.classList.remove('lit'), 500);
        });
    }
}

function startRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Speech recognition is not supported in this browser. Please use Google Chrome.");
        return;
    }
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    recognition.onstart = function () {
        microphoneRunning = true;
        const btn = document.getElementById("microphoneButton");
        if (btn) {
            btn.classList.add("listening");
            btn.textContent = "🔴 Listening...";
        }
    };

    recognition.onresult = function (event) {
        let text = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            text += event.results[i][0].transcript + " ";
        }
        const heardEl = document.getElementById("heardText");
        if (heardEl) heardEl.textContent = "Heard: " + text.trim();

        const normalized = text.toLowerCase().replace(/[^\w\s]/g, "");
        if (normalized.includes("hare krishna") || normalized.includes("harekrishna") || normalized.includes("hare krsna")) {
            chantCount++;
            const chantEl = document.getElementById("chantCount");
            if (chantEl) {
                chantEl.textContent = chantCount % MALA_BEADS === 0 ? MALA_BEADS : chantCount % MALA_BEADS;
            }
            lightBead();
        }
    };

    recognition.onerror = function (event) { console.log("Speech recognition:", event.error); };

    recognition.onend = function () {
        if (microphoneRunning && remaining > 0) {
            try { recognition.start(); } catch (e) { }
        }
    };

    try { recognition.start(); } catch (e) { console.log(e); }
}

function stopRecognition() {
    microphoneRunning = false;
    if (recognition) { try { recognition.stop(); } catch (e) { } }
    const btn = document.getElementById("microphoneButton");
    if (btn) {
        btn.classList.remove("listening");
        btn.textContent = "🎙️ Start Chanting";
    }
}

/* ================= FINISH ================= */
function finishSession() {
    clearInterval(timerInterval);
    timerInterval = null;
    remaining = 0;
    updateTimer();
    updateProgress();
    completed = true;
    stopRecognition();

    if (isYtReady && ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
        ytPlayer.pauseVideo();
    }

    const succ = document.getElementById("success");
    if (succ) succ.style.display = "block";
    localStorage.removeItem("krishnaSessionRemaining");

    try { localStorage.setItem("krishnaSessionCompleted", Date.now()); } catch (e) { }

    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        try {
            document.exitFullscreen().catch(err => console.log("Fullscreen exit:", err));
        } catch (e) { }
    }
}