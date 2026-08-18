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

// Playlist State
let activePlaylistType = "bg"; // "bg" or "video"
let videoPlaylist = [];
let bgPlaylist = [];
let currentTrackIndex = 0; // For Video section
let bgTrackIndex = 0;      // For Background Music section
let progressInterval = null;
let playedIndicesHistory = [];
let playedBgHistorySet = new Set();
let playedVideoHistorySet = new Set();

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
    initPetals();
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
    document.getElementById("writingBox").addEventListener("input", function () {
        document.getElementById("charCount").textContent = this.value.length;
    });

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
                if (typeof ytPlayer.playVideo === 'function') {
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
    const isPlaying = isYtReady && ytPlayer && ytPlayerState === YT.PlayerState.PLAYING;

    if (isPlaying) {
        if (playPauseBtn) playPauseBtn.innerHTML = "⏸️ Pause";
        if (bgPlayPauseBtn) bgPlayPauseBtn.innerHTML = "⏸️";
    } else {
        if (playPauseBtn) playPauseBtn.innerHTML = "▶️ Play";
        if (bgPlayPauseBtn) bgPlayPauseBtn.innerHTML = "▶️";
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

    if (event.data === YT.PlayerState.PLAYING) {
        errorRetryCount = 0;
        const promptEl = document.getElementById('autoplayPrompt');
        if (promptEl) promptEl.style.display = 'none';
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
            playNextTrack();
        }
    }
}

let errorRetryCount = 0;
function onPlayerError(event) {
    console.log("YouTube Player Error:", event.data);
    const activeList = getActivePlaylist();
    errorRetryCount++;
    if (errorRetryCount >= (activeList && activeList.length > 0 ? activeList.length : 3)) {
        console.warn("All tracks in playlist returned error (e.g. Error 153 on file:// origin).");
        showVideoFeedback("⚠️ YouTube restricts playback on file:// origin. Please load in chrome://extensions or Live Server.", "error");
        errorRetryCount = 0;
        return;
    }
    showVideoFeedback("⚠️ Video unplayable or restricted. Auto-skipping to next track...", "error");
    setTimeout(() => {
        playNextTrack();
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

async function loadVideoPlaylistFromFile() {
    let localCacheLoaded = false;
    const cachedLinks = localStorage.getItem("video_links_cache");
    const localTimestamp = parseInt(localStorage.getItem("video_links_timestamp") || "0", 10);

    // Instant local playback from cache
    if (cachedLinks) {
        try {
            const parsed = JSON.parse(cachedLinks);
            if (Array.isArray(parsed) && parsed.length > 0) {
                populateVideoPlaylistFromIDs(parsed);
                if (videoPlaylist.length > 0) {
                    currentTrackIndex = Math.floor(Math.random() * videoPlaylist.length);
                    if (activePlaylistType === "video") playTrack(currentTrackIndex, "video");
                }
                renderVideoPlaylistUI();
                localCacheLoaded = true;
            }
        } catch (e) { }
    }

    // Background Cloud Sync - Check if Firestore timestamp is newer
    try {
        if (window.firebaseDb) {
            const doc = await window.firebaseDb.collection('playlists').doc('video_links').get();
            if (doc.exists && doc.data().links) {
                const cloudLinks = doc.data().links;
                const cloudTime = doc.data().updatedAt ? (doc.data().updatedAt.toMillis ? doc.data().updatedAt.toMillis() : new Date(doc.data().updatedAt).getTime()) : Date.now();

                if (cloudTime > localTimestamp || !localCacheLoaded) {
                    localStorage.setItem("video_links_cache", JSON.stringify(cloudLinks));
                    localStorage.setItem("video_links_timestamp", cloudTime.toString());
                    populateVideoPlaylistFromIDs(cloudLinks);

                    if (!localCacheLoaded && videoPlaylist.length > 0) {
                        currentTrackIndex = Math.floor(Math.random() * videoPlaylist.length);
                        if (activePlaylistType === "video") playTrack(currentTrackIndex, "video");
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

    // Instant local playback from cache
    if (cachedLinks) {
        try {
            const parsed = JSON.parse(cachedLinks);
            if (Array.isArray(parsed) && parsed.length > 0) {
                populateBgPlaylistFromIDs(parsed);
                if (bgPlaylist.length > 0) {
                    bgTrackIndex = Math.floor(Math.random() * bgPlaylist.length);
                    if (activePlaylistType === "bg") playTrack(bgTrackIndex, "bg");
                }
                renderBgPlaylistUI();
                updateTrackDisplay();
                localCacheLoaded = true;
            }
        } catch (e) { }
    }

    // Background Cloud Sync - Check if Firestore timestamp is newer
    try {
        if (window.firebaseDb) {
            const doc = await window.firebaseDb.collection('playlists').doc('background_music_links').get();
            if (doc.exists && doc.data().links) {
                const cloudLinks = doc.data().links;
                const cloudTime = doc.data().updatedAt ? (doc.data().updatedAt.toMillis ? doc.data().updatedAt.toMillis() : new Date(doc.data().updatedAt).getTime()) : Date.now();

                if (cloudTime > localTimestamp || !localCacheLoaded) {
                    localStorage.setItem("bg_links_cache", JSON.stringify(cloudLinks));
                    localStorage.setItem("bg_links_timestamp", cloudTime.toString());
                    populateBgPlaylistFromIDs(cloudLinks);

                    if (!localCacheLoaded && bgPlaylist.length > 0) {
                        bgTrackIndex = Math.floor(Math.random() * bgPlaylist.length);
                        if (activePlaylistType === "bg") playTrack(bgTrackIndex, "bg");
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
        playTrack(videoPlaylist.length - 1, "video");
    } else {
        showVideoFeedback("❌ Invalid YouTube link or video already in playlist.", "error");
    }
}

function resetVideoPlaylistFromFile() {
    loadVideoPlaylistFromFile().then(() => {
        saveVideoPlaylist();
        renderVideoPlaylistUI();
        if (videoPlaylist.length > 0) playTrack(0, "video");
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
            playTrack(index, "video");
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
                playTrack(currentTrackIndex, "video");
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
        playTrack(bgPlaylist.length - 1, "bg");
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
            playBgTrack(index);
        });

        li.querySelector(".delete-item-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            removeBgTrack(index);
        });

        listEl.appendChild(li);
    });
}

function playBgTrack(index) {
    playTrack(index, "bg");
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
                playTrack(bgTrackIndex, "bg");
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
                const activeList = getActivePlaylist();
                const currentIndex = getActiveTrackIndex();
                if (activeList[currentIndex] && activeList[currentIndex].id === videoId) {
                    updateTrackDisplay();
                }
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
function playNextTrack(type = null) {
    if (type) activePlaylistType = type;
    const activeList = getActivePlaylist();
    if (!activeList || activeList.length === 0) return;

    const currentIndex = getActiveTrackIndex();
    let nextIndex;

    if (isShuffle) {
        if (activeList.length === 1) {
            nextIndex = 0;
        } else {
            const historySet = activePlaylistType === "video" ? playedVideoHistorySet : playedBgHistorySet;
            historySet.add(currentIndex);

            let available = activeList
                .map((_, idx) => idx)
                .filter(idx => !historySet.has(idx));

            if (available.length === 0) {
                // All songs in playlist have been played! Reset deck & exclude current song
                historySet.clear();
                historySet.add(currentIndex);
                available = activeList
                    .map((_, idx) => idx)
                    .filter(idx => idx !== currentIndex);
            }

            nextIndex = available[Math.floor(Math.random() * available.length)];
        }
    } else {
        nextIndex = (currentIndex + 1) % activeList.length;
    }

    playTrack(nextIndex);
}

function playPrevTrack(type = null) {
    if (type) activePlaylistType = type;
    const activeList = getActivePlaylist();
    if (!activeList || activeList.length === 0) return;

    const currentIndex = getActiveTrackIndex();
    let prevIndex;
    if (playedIndicesHistory.length > 1) {
        playedIndicesHistory.pop(); // Remove current track
        prevIndex = playedIndicesHistory.pop();
    } else {
        prevIndex = (currentIndex - 1 + activeList.length) % activeList.length;
    }

    playTrack(prevIndex);
}

function playTrack(index, type = null) {
    if (type) activePlaylistType = type;
    const activeList = getActivePlaylist();
    if (!activeList || index < 0 || index >= activeList.length) return;

    setActiveTrackIndex(index);
    playedIndicesHistory.push(index);
    if (playedIndicesHistory.length > 50) playedIndicesHistory.shift();

    const track = activeList[index];
    updateTrackDisplay();
    renderVideoPlaylistUI();
    renderBgPlaylistUI();

    if (isYtReady && ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
        ytPlayer.loadVideoById(track.id);
    } else {
        initYouTubePlayer();
    }
}

function togglePlayPause(type = null) {
    if (type) activePlaylistType = type;
    if (!isYtReady || !ytPlayer) {
        initYouTubePlayer();
        return;
    }

    if (ytPlayerState === YT.PlayerState.PLAYING) {
        if (typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo();
    } else {
        if (typeof ytPlayer.playVideo === 'function') ytPlayer.playVideo();
    }
    setTimeout(updatePlayPauseIcons, 100);
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
    const activeList = getActivePlaylist();
    const currentIndex = getActiveTrackIndex();
    const currentTrack = activeList[currentIndex];
    if (!currentTrack) return;

    const nameEl = document.getElementById("kirtanName");
    const bgNameEl = document.getElementById("bgMusicTitle");

    if (nameEl) nameEl.textContent = currentTrack.title;
    if (bgNameEl) bgNameEl.textContent = currentTrack.title;
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
function initPetals() {
    const layer = document.getElementById('petals');
    if (!layer) return;
    const glyphs = ['🪷', '🌸', '🕉️'];
    const count = 14;
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'petal';
        p.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
        p.style.left = Math.random() * 100 + 'vw';
        p.style.fontSize = (14 + Math.random() * 16) + 'px';
        p.style.setProperty('--drift', (Math.random() * 120 - 60) + 'px');
        p.style.animationDuration = (10 + Math.random() * 14) + 's';
        p.style.animationDelay = (-Math.random() * 20) + 's';
        layer.appendChild(p);
    }
}

function buildMala() {
    const mala = document.getElementById('mala');
    if (!mala) return;
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
        const activeList = getActivePlaylist();
        const currentIndex = getActiveTrackIndex();
        const bgNameEl = document.getElementById("bgMusicTitle");

        if (ytPlayerState !== YT.PlayerState.PLAYING) {
            document.getElementById("timer").style.color = "#e2711d";
            if (bgNameEl && activeList[currentIndex]) {
                bgNameEl.textContent = activeList[currentIndex].title + " (Click ▶️ to play)";
            }
        } else {
            document.getElementById("timer").style.color = "";
            if (bgNameEl && activeList[currentIndex]) {
                bgNameEl.textContent = activeList[currentIndex].title;
            }
        }

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
    document.getElementById("timer").textContent =
        String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
    saveTimerState();
}

function updateProgress() {
    const fraction = (SESSION_TIME - remaining) / SESSION_TIME;
    const offset = RING_CIRC * (1 - fraction);
    document.getElementById("ringFg").style.strokeDashoffset = offset;
}

function showSection(id) {
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
}

function setActiveButton(id) {
    document.querySelectorAll(".mode-buttons button").forEach(b => b.classList.remove("active"));
    document.getElementById(id).classList.add("active");
}

/* ================= MODES ================= */
function startListen() {
    startSession("listen");
    showSection("listenSection");
    setActiveButton("listenBtn");
    updateIframeHost("listen");

    if (isYtReady && ytPlayer) {
        if (ytPlayerState !== YT.PlayerState.PLAYING) {
            playTrack(currentTrackIndex, "video");
        }
    } else {
        activePlaylistType = "video";
        initYouTubePlayer();
    }
}

function startWriting() {
    startSession("write");
    showSection("writeSection");
    setActiveButton("writeBtn");
    updateIframeHost("write");
    document.getElementById("writingBox").focus();
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
        document.getElementById("microphoneButton").classList.add("listening");
        document.getElementById("microphoneButton").textContent = "🔴 Listening...";
    };

    recognition.onresult = function (event) {
        let text = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            text += event.results[i][0].transcript + " ";
        }
        document.getElementById("heardText").textContent = "Heard: " + text.trim();
        const normalized = text.toLowerCase().replace(/[^\w\s]/g, "");
        if (normalized.includes("hare krishna") || normalized.includes("harekrishna") || normalized.includes("hare krsna")) {
            chantCount++;
            document.getElementById("chantCount").textContent = chantCount % MALA_BEADS === 0 ? MALA_BEADS : chantCount % MALA_BEADS;
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
    document.getElementById("microphoneButton").classList.remove("listening");
    document.getElementById("microphoneButton").textContent = "🎙️ Start Chanting";
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

    document.getElementById("success").style.display = "block";
    localStorage.removeItem("krishnaSessionRemaining");

    try { localStorage.setItem("krishnaSessionCompleted", Date.now()); } catch (e) { }

    if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.log(err));
    }
}