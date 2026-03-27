/* ──────────────────────────────────────────────────────────────
   SubStudio — Main Application Logic
   ────────────────────────────────────────────────────────────── */

// ─── State ──────────────────────────────────────────────────
const state = {
    currentVideo: null,
    cues: [],
    activeCueIndex: -1,
    captionPos: { x: 50, y: 85 }, // percentage
    isDragging: false,
    dragOffset: { x: 0, y: 0 },
    presets: {},
    currentStyle: {
        fontSize: 24,
        fontColor: '#ffffff',
        outlineColor: '#000000',
        showBackground: true
    }
};

// ─── DOM Elements ───────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
    video: $('#video-player'),
    videoSource: $('#video-source'),
    videoContainer: $('#video-container'),
    captionOverlay: $('#caption-overlay'),
    captionText: $('#caption-text'),
    dragHint: $('#drag-hint'),
    emptyState: $('#empty-state'),
    videoInfoBar: $('#video-info-bar'),
    videoName: $('#video-name'),
    videoList: $('#video-list'),
    cueList: $('#cue-list'),
    cueCount: $('#cue-count'),
    posX: $('#pos-x'),
    posY: $('#pos-y'),
    presetSelect: $('#preset-select'),
    fontSizeSlider: $('#font-size-slider'),
    fontSizeValue: $('#font-size-value'),
    fontColor: $('#font-color'),
    fontColorHex: $('#font-color-hex'),
    outlineColor: $('#outline-color'),
    outlineColorHex: $('#outline-color-hex'),
    bgToggle: $('#bg-toggle'),
    uploadModal: $('#upload-modal'),
    dropZone: $('#drop-zone'),
    fileInput: $('#file-input'),
    uploadProgress: $('#upload-progress'),
    progressFill: $('#progress-fill'),
    uploadStatus: $('#upload-status'),
    processingOverlay: $('#processing-overlay'),
    processingTitle: $('#processing-title'),
    processingMessage: $('#processing-message'),
    toastContainer: $('#toast-container'),
};


// ─── Initialize ─────────────────────────────────────────────
async function init() {
    await loadPresets();
    await loadVideos();
    setupEventListeners();
    setupDragSystem();
}


// ─── API Helpers ────────────────────────────────────────────
async function api(url, options = {}) {
    try {
        const res = await fetch(url, options);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    } catch (err) {
        console.error(`API Error: ${url}`, err);
        throw err;
    }
}


// ─── Load Presets ───────────────────────────────────────────
async function loadPresets() {
    try {
        state.presets = await api('/api/presets');
    } catch (e) {
        console.warn('Could not load presets');
    }
}


// ─── Load Videos ────────────────────────────────────────────
async function loadVideos() {
    try {
        const videos = await api('/api/videos');
        renderVideoList(videos);
    } catch (e) {
        els.videoList.innerHTML = '<li class="video-list-empty">Failed to load videos</li>';
    }
}

function renderVideoList(videos) {
    if (videos.length === 0) {
        els.videoList.innerHTML = '<li class="video-list-empty">No videos found</li>';
        return;
    }

    els.videoList.innerHTML = videos.map(v => `
        <li data-filename="${v.filename}" data-name="${v.name}">
            <span class="video-thumb"></span>
            <span class="video-file-name">${v.filename}</span>
            ${v.has_subtitles ? '<span class="video-srt-badge">SRT</span>' : ''}
        </li>
    `).join('');

    // Click handler
    els.videoList.querySelectorAll('li[data-filename]').forEach(li => {
        li.addEventListener('click', () => selectVideo(li.dataset.filename, li.dataset.name));
    });
}


// ─── Select Video ───────────────────────────────────────────
async function selectVideo(filename, name) {
    state.currentVideo = { filename, name };

    // Update UI
    els.emptyState.classList.add('hidden');
    els.videoContainer.classList.remove('hidden');
    els.videoInfoBar.classList.remove('hidden');
    els.dragHint.classList.remove('hidden');
    els.videoName.textContent = filename;

    // Mark active in list
    els.videoList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
    const activeLi = els.videoList.querySelector(`li[data-filename="${filename}"]`);
    if (activeLi) activeLi.classList.add('active');

    // Load video
    els.videoSource.src = `/api/videos/${filename}`;
    els.video.load();

    // Load subtitles
    await loadSubtitles(name);

    // Auto-hide drag hint after 4s
    setTimeout(() => els.dragHint.classList.add('hidden'), 5000);
}


// ─── Load Subtitles ─────────────────────────────────────────
async function loadSubtitles(name) {
    try {
        const data = await api(`/api/subtitles/${name}`);
        state.cues = data.cues || [];
        renderCueList();
        els.cueCount.textContent = state.cues.length;
        showToast(`Loaded ${state.cues.length} subtitle cues`, 'success');
    } catch (e) {
        state.cues = [];
        renderCueList();
        els.cueCount.textContent = '0';
        showToast('No subtitles found — click Transcribe to generate', 'info');
    }
}

function renderCueList() {
    if (state.cues.length === 0) {
        els.cueList.innerHTML = '<li class="cue-list-empty">No subtitles loaded</li>';
        return;
    }

    els.cueList.innerHTML = state.cues.map((cue, i) => `
        <li data-index="${i}">
            <span class="cue-time">${formatTime(cue.start)} → ${formatTime(cue.end)}</span>
            <span class="cue-text">${cue.text}</span>
        </li>
    `).join('');

    // Click to seek
    els.cueList.querySelectorAll('li[data-index]').forEach(li => {
        li.addEventListener('click', () => {
            const idx = parseInt(li.dataset.index);
            if (state.cues[idx]) {
                els.video.currentTime = state.cues[idx].start;
            }
        });
    });
}


// ─── Caption Sync ───────────────────────────────────────────
function syncCaptions() {
    const time = els.video.currentTime;
    let foundCue = null;
    let foundIndex = -1;

    for (let i = 0; i < state.cues.length; i++) {
        if (time >= state.cues[i].start && time <= state.cues[i].end) {
            foundCue = state.cues[i];
            foundIndex = i;
            break;
        }
    }

    if (foundCue) {
        els.captionText.textContent = foundCue.text;
        els.captionOverlay.classList.remove('hidden-caption');

        // Highlight in cue list
        if (foundIndex !== state.activeCueIndex) {
            state.activeCueIndex = foundIndex;
            els.cueList.querySelectorAll('li').forEach(li => li.classList.remove('active-cue'));
            const activeLi = els.cueList.querySelector(`li[data-index="${foundIndex}"]`);
            if (activeLi) {
                activeLi.classList.add('active-cue');
                activeLi.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    } else {
        els.captionOverlay.classList.add('hidden-caption');
        if (state.activeCueIndex !== -1) {
            state.activeCueIndex = -1;
            els.cueList.querySelectorAll('li').forEach(li => li.classList.remove('active-cue'));
        }
    }
}


// ─── Drag System ────────────────────────────────────────────
function setupDragSystem() {
    const overlay = els.captionOverlay;
    const container = els.videoContainer;

    overlay.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        state.isDragging = true;
        overlay.classList.add('dragging');
        overlay.setPointerCapture(e.pointerId);

        const rect = container.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();

        // Calculate offset from pointer to overlay center
        state.dragOffset.x = e.clientX - (overlayRect.left + overlayRect.width / 2);
        state.dragOffset.y = e.clientY - (overlayRect.top + overlayRect.height / 2);
    });

    overlay.addEventListener('pointermove', (e) => {
        if (!state.isDragging) return;
        e.preventDefault();

        const rect = container.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();

        // Calculate new center position relative to container
        let newX = ((e.clientX - state.dragOffset.x - rect.left) / rect.width) * 100;
        let newY = ((e.clientY - state.dragOffset.y - rect.top) / rect.height) * 100;

        // Clamp within bounds
        newX = Math.max(10, Math.min(90, newX));
        newY = Math.max(5, Math.min(95, newY));

        state.captionPos.x = newX;
        state.captionPos.y = newY;

        updateCaptionPosition();
    });

    overlay.addEventListener('pointerup', (e) => {
        state.isDragging = false;
        overlay.classList.remove('dragging');
    });

    overlay.addEventListener('pointercancel', (e) => {
        state.isDragging = false;
        overlay.classList.remove('dragging');
    });

    // Set initial position
    updateCaptionPosition();
}

function updateCaptionPosition() {
    const overlay = els.captionOverlay;

    // Use left/top with transform for precise positioning
    overlay.style.left = `${state.captionPos.x}%`;
    overlay.style.top = `${state.captionPos.y}%`;
    overlay.style.bottom = 'auto';
    overlay.style.transform = 'translate(-50%, -50%)';

    // Update position display
    els.posX.textContent = `${Math.round(state.captionPos.x)}%`;
    els.posY.textContent = `${Math.round(state.captionPos.y)}%`;
}


// ─── Style Controls ─────────────────────────────────────────
function applyStyleToOverlay() {
    const textEl = els.captionText;
    const overlay = els.captionOverlay;

    textEl.style.fontSize = `${state.currentStyle.fontSize}px`;
    textEl.style.color = state.currentStyle.fontColor;
    textEl.style.textShadow = `0 1px 4px ${state.currentStyle.outlineColor}, 
                               1px 1px 0 ${state.currentStyle.outlineColor},
                               -1px -1px 0 ${state.currentStyle.outlineColor},
                               1px -1px 0 ${state.currentStyle.outlineColor},
                               -1px 1px 0 ${state.currentStyle.outlineColor}`;

    if (state.currentStyle.showBackground) {
        overlay.style.background = 'rgba(0, 0, 0, 0.75)';
    } else {
        overlay.style.background = 'transparent';
    }
}

function applyPreset(presetName) {
    const preset = state.presets[presetName];
    if (!preset) return;

    // Convert ASS color (&Hffffff&) to hex
    const fontColor = assColorToHex(preset.font_color);
    const outlineColor = assColorToHex(preset.outline_color);

    state.currentStyle.fontSize = preset.font_size;
    state.currentStyle.fontColor = fontColor;
    state.currentStyle.outlineColor = outlineColor;
    state.currentStyle.showBackground = preset.border_style === 3;

    // Update controls
    els.fontSizeSlider.value = preset.font_size;
    els.fontSizeValue.textContent = preset.font_size;
    els.fontColor.value = fontColor;
    els.fontColorHex.textContent = fontColor;
    els.outlineColor.value = outlineColor;
    els.outlineColorHex.textContent = outlineColor;
    els.bgToggle.checked = preset.border_style === 3;

    applyStyleToOverlay();
}

function assColorToHex(assColor) {
    // Convert &Hffffff& or &H00ffff& to #ffffff or #00ffff
    const match = assColor.match(/&H([0-9a-fA-F]+)&/);
    if (match) {
        let hex = match[1].padStart(6, '0');
        return '#' + hex;
    }
    return '#ffffff';
}

function hexToAssColor(hex) {
    return '&H' + hex.replace('#', '') + '&';
}


// ─── Event Listeners ────────────────────────────────────────
function setupEventListeners() {
    // Video time update → sync captions
    els.video.addEventListener('timeupdate', syncCaptions);

    // Preset select
    els.presetSelect.addEventListener('change', (e) => {
        applyPreset(e.target.value);
    });
    // Apply initial preset
    applyPreset('netflix');

    // Font size
    els.fontSizeSlider.addEventListener('input', (e) => {
        state.currentStyle.fontSize = parseInt(e.target.value);
        els.fontSizeValue.textContent = e.target.value;
        applyStyleToOverlay();
    });

    // Font color
    els.fontColor.addEventListener('input', (e) => {
        state.currentStyle.fontColor = e.target.value;
        els.fontColorHex.textContent = e.target.value;
        applyStyleToOverlay();
    });

    // Outline color
    els.outlineColor.addEventListener('input', (e) => {
        state.currentStyle.outlineColor = e.target.value;
        els.outlineColorHex.textContent = e.target.value;
        applyStyleToOverlay();
    });

    // Background toggle
    els.bgToggle.addEventListener('change', (e) => {
        state.currentStyle.showBackground = e.target.checked;
        applyStyleToOverlay();
    });

    // Reset position
    $('#btn-reset-pos').addEventListener('click', () => {
        state.captionPos = { x: 50, y: 85 };
        updateCaptionPosition();
        showToast('Caption position reset', 'info');
    });

    // Refresh video list
    $('#btn-refresh').addEventListener('click', loadVideos);

    // Upload button
    $('#btn-upload').addEventListener('click', () => {
        els.uploadModal.classList.remove('hidden');
    });

    // Close modal
    $('#btn-close-modal').addEventListener('click', closeUploadModal);
    $('.modal-backdrop').addEventListener('click', closeUploadModal);

    // Drop zone
    els.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        els.dropZone.classList.add('drag-over');
    });
    els.dropZone.addEventListener('dragleave', () => {
        els.dropZone.classList.remove('drag-over');
    });
    els.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        els.dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) uploadFile(file);
    });

    // File input
    els.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) uploadFile(file);
    });

    // Transcribe button
    $('#btn-process').addEventListener('click', transcribeVideo);

    // Burn/Export button
    $('#btn-burn').addEventListener('click', burnVideo);
}


// ─── Upload ─────────────────────────────────────────────────
async function uploadFile(file) {
    const formData = new FormData();
    formData.append('video', file);

    els.uploadProgress.classList.remove('hidden');
    els.progressFill.style.width = '0%';
    els.uploadStatus.textContent = 'Uploading...';

    try {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                els.progressFill.style.width = pct + '%';
                els.uploadStatus.textContent = `Uploading... ${pct}%`;
            }
        });

        await new Promise((resolve, reject) => {
            xhr.onload = () => {
                if (xhr.status === 200) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error('Upload failed'));
                }
            };
            xhr.onerror = () => reject(new Error('Upload failed'));
            xhr.open('POST', '/api/upload');
            xhr.send(formData);
        });

        showToast(`Uploaded ${file.name}`, 'success');
        closeUploadModal();
        await loadVideos();
    } catch (e) {
        showToast('Upload failed: ' + e.message, 'error');
        els.uploadStatus.textContent = 'Upload failed';
    }
}

function closeUploadModal() {
    els.uploadModal.classList.add('hidden');
    els.uploadProgress.classList.add('hidden');
    els.fileInput.value = '';
}


// ─── Transcribe ─────────────────────────────────────────────
async function transcribeVideo() {
    if (!state.currentVideo) return;

    showProcessing('Transcribing...', 'Whisper AI is processing audio. This may take a minute.');

    try {
        const data = await api('/api/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: state.currentVideo.filename })
        });

        state.cues = data.cues || [];
        renderCueList();
        els.cueCount.textContent = state.cues.length;
        showToast(`Transcription complete — ${state.cues.length} cues`, 'success');
        await loadVideos(); // refresh SRT badges
    } catch (e) {
        showToast('Transcription failed: ' + e.message, 'error');
    } finally {
        hideProcessing();
    }
}


// ─── Burn/Export ────────────────────────────────────────────
async function burnVideo() {
    if (!state.currentVideo) return;
    if (state.cues.length === 0) {
        showToast('No subtitles to burn. Transcribe first.', 'error');
        return;
    }

    showProcessing('Exporting...', 'FFmpeg is burning subtitles into the video.');

    try {
        const stylePayload = {
            font_size: state.currentStyle.fontSize,
            font_color: hexToAssColor(state.currentStyle.fontColor),
            outline_color: hexToAssColor(state.currentStyle.outlineColor),
            alignment: 2,
            margin_v: 30,
            outline: 2,
            shadow: 0,
            border_style: state.currentStyle.showBackground ? 3 : 1
        };

        const data = await api('/api/burn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: state.currentVideo.filename,
                style: stylePayload,
                position_y: state.captionPos.y
            })
        });

        showToast('Export complete! Video saved to output_videos/', 'success');

        // Offer download
        const link = document.createElement('a');
        link.href = `/api/output/${data.output}`;
        link.download = data.output;
        link.click();
    } catch (e) {
        showToast('Export failed: ' + e.message, 'error');
    } finally {
        hideProcessing();
    }
}


// ─── Processing Overlay ────────────────────────────────────
function showProcessing(title, message) {
    els.processingTitle.textContent = title;
    els.processingMessage.textContent = message;
    els.processingOverlay.classList.remove('hidden');
}

function hideProcessing() {
    els.processingOverlay.classList.add('hidden');
}


// ─── Toast Notifications ────────────────────────────────────
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    els.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}


// ─── Utilities ──────────────────────────────────────────────
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}


// ─── Start ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
