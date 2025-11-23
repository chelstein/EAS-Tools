(async function () {
    let splicerTextEditor = null;

    function initSplicerTextEditor() {
        if (splicerTextEditor || !window.CodeMirror) return splicerTextEditor;

        const splicerTextArea = document.getElementById('ttsText2');
        if (!splicerTextArea) return null;

        const splicerEditor = CodeMirror.fromTextArea(splicerTextArea, {
            lineNumbers: true,
            mode: 'text/xml',
            matchBrackets: true,
            theme: 'dracula',
            lineWrapping: true,
        });

        splicerEditor.setSize('27vw', '15rem');

        const splicerWrapper = splicerEditor.getWrapperElement();
        splicerWrapper.classList.add('ttsText', 'ttsText--editor');

        splicerEditor.on('change', () => {
            splicerEditor.save();
        });

        splicerTextEditor = splicerEditor;
        return splicerEditor;
    }

    window.splicerEditor = initSplicerTextEditor();
    window.splicerEditor.refresh();
})();

(async function () {
    const panel = document.getElementById('splicer-panel');
    const canvas = document.getElementById('spliceWaveform');
    if (!panel || !canvas) return;

    const ctx = canvas.getContext('2d');
    const fileInput = panel.querySelector('[data-splice-file]');
    const ttsInput = panel.querySelector('#ttsText2') || panel.querySelector('.ttsText');
    const ttsButton = panel.querySelector('[data-splice-tts-generate]') || panel.querySelector('#spliceTTSGenerator button');
    const ttsStatus = panel.querySelector('[data-splice-tts-status]') || panel.querySelector('#spliceTTSGenerator [data-splice-tts-status]');
    const voiceSelect = panel.querySelector('#ttsVoice2');
    const overrideTzSelect = panel.querySelector('#useSplicerOverrideTZ');
    const silenceInput = panel.querySelector('[data-splice-silence]');
    const silenceStatus = panel.querySelector('[data-splice-silence-status]');
    const silenceBtn = panel.querySelector('[data-splice-add-silence]');
    const splitSelectionBtn = panel.querySelector('[data-splice-split-selection]');
    const joinAllBtn = panel.querySelector('[data-splice-join-all]');
    const playBtn = panel.querySelector('[data-splice-play]');
    const playAllBtn = panel.querySelector('[data-splice-playAll]');
    const stopBtn = panel.querySelector('[data-splice-stop]');
    const trimBtn = panel.querySelector('[data-splice-trim]');
    const deleteBtn = panel.querySelector('[data-splice-delete]');
    const splitBtn = panel.querySelector('[data-splice-split]');
    const exportBtn = panel.querySelector('[data-splice-export]');
    const clearBtn = panel.querySelector('[data-splice-clear]');
    const persistLabel = panel.querySelector('[data-splice-persist]');
    const segmentsList = panel.querySelector('[data-splice-segments]');
    const selStartLabel = panel.querySelector('[data-selection-start]');
    const selEndLabel = panel.querySelector('[data-selection-end]');
    const selLenLabel = panel.querySelector('[data-selection-length]');
    const loadFileBtn = panel.querySelector('[data-splice-load]');
    const macroSelect = panel.querySelector('[data-splice-macro-select]');
    const previewMacroBtn = panel.querySelector('[data-splice-preview-macro]');
    const exportMacroBtn = panel.querySelector('[data-splice-export-macro]');
    const previewMacroBtnDefaultText = previewMacroBtn && previewMacroBtn.textContent
        ? previewMacroBtn.textContent.trim() || 'Play Macro Preview'
        : 'Play Macro Preview';
    let previewMacroBtnWasDisabled = previewMacroBtn ? previewMacroBtn.disabled : false;
    let previewMacroBtnDisabledByTask = false;

    canvas.style.touchAction = 'none';

    const DB_NAME = 'eas-splicer';
    const STORE = 'projects';
    const CACHE_KEY = 'current';
    const PIPER_BUNDLE_URL = 'assets/piper-tts/piper.tts.bundle.js';
    const PIPER_VOICE = 'en_US-joe-medium';
    const NANO_TTS_LANGUAGE = 'en-US';
    const NANO_TTS_VOLUME = 0.5;
    const NANO_TTS_WORKER_URL = new URL('./text2wav-worker.js', import.meta.url);
    const voiceBackendMap = {};
    const nanoTtsState = {
        worker: null,
        ready: false,
        queue: [],
        currentJob: null,
    };
    let currentSegmentId = null;
    const segmentPlayButtons = new Map();
    let pendingSegmentPlay = null;
    let macroPreviewPlayback = null;
    let macroPreviewMarkerInterval = null;

    const state = {
        sampleRate: 44100,
        segments: [],
        pcm: new Float32Array(0),
        selection: { start: 0, end: 0 },
        viewStart: 0,
        viewEnd: 0,
        minViewSpan: 0.05,
    };

    let audioCtx = null;
    let playingSource = null;
    let playingMode = null;
    let playStartOffset = 0;
    let playSpan = 0;
    let playStartedAt = 0;
    let pausedPlayback = null;
    let dragMode = null;
    let touchSelectionId = null;
    let pinchState = null;
    let touchPan = null;
    let cacheDbPromise = null;
    let ttsLoader = null;
    let voiceListLoaded = false;

    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

    const persistStatus = (msg, ok = true) => {
        if (!persistLabel) return;
        persistLabel.textContent = msg;
        persistLabel.style.color = ok ? '#7ae37a' : '#f48383';
    };

    const syncSegmentPlayButtons = (activeId = null) => {
        currentSegmentId = activeId;
        segmentPlayButtons.forEach((btn, segId) => {
            if (!btn || !btn.isConnected) return;
            btn.textContent = segId === currentSegmentId ? 'Pause Section' : 'Play Section';
        });
    };

    const syncPlayButtons = () => {
        if (playBtn) {
            const playingSelection = playingSource && playingMode === 'selection';
            playBtn.textContent = playingSelection ? 'Pause Selection' : 'Play Selection';
        }
        if (playAllBtn) {
            const playingAll = playingSource && playingMode === 'all';
            playAllBtn.textContent = playingAll ? 'Pause All' : 'Play All';
        }
    };

    const setPreviewMacroButtonState = (label, disabled) => {
        if (!previewMacroBtn) return;
        previewMacroBtn.textContent = label;
        previewMacroBtn.disabled = !!disabled;
        previewMacroBtnDisabledByTask = !!disabled;
    };

    const resetPreviewMacroButton = () => {
        if (!previewMacroBtn) return;
        const shouldDisable = previewMacroBtnDisabledByTask
            ? previewMacroBtnWasDisabled
            : previewMacroBtn.disabled || previewMacroBtnWasDisabled;
        previewMacroBtnDisabledByTask = false;
        previewMacroBtn.textContent = previewMacroBtnDefaultText;
        previewMacroBtn.disabled = shouldDisable;
        previewMacroBtnWasDisabled = previewMacroBtn.disabled;
    };

    const clearMacroPreviewInterval = () => {
        if (macroPreviewMarkerInterval) {
            clearInterval(macroPreviewMarkerInterval);
            macroPreviewMarkerInterval = null;
        }
    };

    const invalidateMacroPreview = () => {
        if (!macroPreviewPlayback) return;
        const audio = macroPreviewPlayback.audio;
        if (audio) {
            try {
                audio.pause();
            } catch (err) {
                reportErrorStatus(`Failed to pause macro preview during reset: ${err}`, err);
            }
            try {
                audio.currentTime = 0;
            } catch (err) {
                reportErrorStatus(`Failed to reset macro preview audio position: ${err}`, err);
            }
        }
        try {
            macroPreviewPlayback.cleanup?.();
        } catch (err) {
            reportErrorStatus(`Failed to cleanup macro preview: ${err}`, err);
        }
        if (playingSource === audio) {
            playingSource = null;
            playingMode = null;
            pausedPlayback = null;
            playSpan = 0;
            playStartOffset = 0;
            syncPlayButtons();
        }
        macroPreviewPlayback = null;
        clearMacroPreviewInterval();
        resetPreviewMacroButton();
    };

    const pauseMacroPreview = () => {
        if (!macroPreviewPlayback?.audio) return false;
        try {
            macroPreviewPlayback.audio.pause();
        } catch (err) {
            reportErrorStatus(`Failed to pause macro preview: ${err}`, err);
        }
        macroPreviewPlayback.paused = true;
        clearMacroPreviewInterval();
        setPreviewMacroButtonState('Resume Macro Preview', false);
        playingSource = null;
        playingMode = null;
        pausedPlayback = null;
        return true;
    };

    const resumeMacroPreview = async () => {
        if (!macroPreviewPlayback?.audio) return false;
        const audio = macroPreviewPlayback.audio;
        if (!audio.paused && !macroPreviewPlayback.paused) return true;
        if (playingSource && playingSource !== audio) {
            stopPlayback({ preserveMacroPreview: true });
        }
        const ctxAudio = audioCtx || getAudioCtx();
        if (ctxAudio && ctxAudio.state === 'suspended' && typeof ctxAudio.resume === 'function') {
            try {
                await ctxAudio.resume();
            } catch (err) {
                reportErrorStatus(`Failed to resume audio context for macro preview: ${err}`);
            }
        }
        playingSource = audio;
        playingMode = 'macro-preview';
        playStartOffset = audio.currentTime || 0;
        playSpan = Math.max(0.001, audio.duration || playSpan || 0.001);
        playStartedAt = ctxAudio ? ctxAudio.currentTime : 0;
        macroPreviewPlayback.paused = false;
        clearMacroPreviewInterval();
        macroPreviewMarkerInterval = setInterval(updatePlaybackMarker, 1);
        setPreviewMacroButtonState('Pause Macro Preview', false);
        try {
            await audio.play();
        } catch (err) {
            reportErrorStatus(`Failed to resume macro preview audio playback: ${err}`, err);
            macroPreviewPlayback.paused = true;
            clearMacroPreviewInterval();
            setPreviewMacroButtonState('Resume Macro Preview', false);
            return false;
        }
        return true;
    };

    const cancelPendingSegmentPlayback = () => {
        if (!pendingSegmentPlay) return;
        pendingSegmentPlay.cancelled = true;
        pendingSegmentPlay = null;
    };

    const getDb = () => {
        if (!window.indexedDB) {
            persistStatus('IndexedDB unavailable; caching disabled.', false);
            return null;
        }
        if (!cacheDbPromise) {
            cacheDbPromise = new Promise((resolve, reject) => {
                const req = indexedDB.open(DB_NAME, 1);
                req.onupgradeneeded = () => req.result.createObjectStore(STORE);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        return cacheDbPromise;
    };

    const saveProject = async () => {
        const dbp = getDb();
        if (!dbp) return;
        try {
            const db = await dbp;
            await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, 'readwrite');
                const payload = {
                    sampleRate: state.sampleRate,
                    savedAt: Date.now(),
                    segments: state.segments.map((s) => ({
                        id: s.id,
                        label: s.label,
                        pcm: s.pcm.buffer.slice(0),
                        sourceText: s.sourceText || '',
                    })),
                    ttsVoiceSelection: voiceSelect ? voiceSelect.value : null,
                    ttsText: ttsInput ? ttsInput.value : null,
                    macroSelection: macroSelect ? macroSelect.value : null,
                };
                tx.objectStore(STORE).put(payload, CACHE_KEY);
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
            persistStatus(`Saved locally @ ${new Date().toLocaleTimeString()}`);
        } catch (err) {
            console.error('Failed to save splicer project', err);
            persistStatus('Local save failed', false);
        }
    };

    const loadProject = async () => {
        const dbp = getDb();
        if (!dbp) return null;
        try {
            const db = await dbp;
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, 'readonly');
                const req = tx.objectStore(STORE).get(CACHE_KEY);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        } catch (err) {
            console.error('Failed to load splicer project', err);
            persistStatus('Local load failed', false);
            return null;
        }
    };

    const clearCache = async () => {
        const dbp = getDb();
        if (!dbp) return;
        try {
            const db = await dbp;
            await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).delete(CACHE_KEY);
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
        } catch (err) {
            persistStatus(`Failed clearing cache: ${err}`, false);
        }
    };

    const getAudioCtx = () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    };

    const duration = () => (state.pcm.length ? state.pcm.length / state.sampleRate : 0);

    const updateSelectionLabels = () => {
        const d = duration();
        const start = clamp(state.selection.start, 0, d);
        const end = clamp(state.selection.end, 0, d);
        selStartLabel.textContent = `${start.toFixed(2)}s`;
        selEndLabel.textContent = `${end.toFixed(2)}s`;
        selLenLabel.textContent = `${Math.floor((end - start) / 60)}m ${((end - start) % 60).toFixed(0)}s, ${Math.round((end - start) * state.sampleRate).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} samples`;
    };

    const setSelection = (start, end) => {
        const d = duration();
        start = clamp(start, 0, d);
        end = clamp(end, 0, d);
        if (end < start) [start, end] = [end, start];
        state.selection = { start, end };
        updateSelectionLabels();
        drawWaveform();
    };

    const syncViewWindow = () => {
        const d = duration();
        if (d <= 0) {
            state.viewStart = 0;
            state.viewEnd = 0;
            return;
        }
        let span = state.viewEnd - state.viewStart;
        if (!Number.isFinite(span) || span <= 0) span = d;
        span = clamp(span, state.minViewSpan, d);
        let start = clamp(state.viewStart, 0, Math.max(0, d - state.minViewSpan));
        let end = start + span;
        if (end > d) {
            end = d;
            start = clamp(end - span, 0, d);
        }
        state.viewStart = start;
        state.viewEnd = end;
    };

    const resetViewWindow = () => {
        state.viewStart = 0;
        state.viewEnd = duration();
        syncViewWindow();
    };

    const panViewTo = (center) => {
        syncViewWindow();
        const span = Math.max(state.viewEnd - state.viewStart, state.minViewSpan);
        const d = duration();
        let start = clamp(center - span / 2, 0, Math.max(0, d - span));
        let end = start + span;
        if (end > d) {
            end = d;
            start = Math.max(0, d - span);
        }
        state.viewStart = start;
        state.viewEnd = end;
        drawWaveform();
    };

    const resamplePcm = (pcm, fromRate, toRate) => {
        if (!pcm) return new Float32Array(0);
        if (fromRate === toRate) return new Float32Array(pcm);
        const ratio = fromRate / toRate;
        const newLen = Math.max(1, Math.round(pcm.length / ratio));
        const out = new Float32Array(newLen);
        for (let i = 0; i < newLen; i++) {
            const pos = i * ratio;
            const idx = Math.floor(pos);
            const frac = pos - idx;
            const a = pcm[idx] ?? 0;
            const b = pcm[idx + 1] ?? a;
            out[i] = a + (b - a) * frac;
        }
        return out;
    };

    const rebuildTimeline = () => {
        const total = state.segments.reduce((sum, seg) => sum + seg.pcm.length, 0);
        state.pcm = new Float32Array(total);
        let offset = 0;
        state.segments.forEach((seg) => {
            state.pcm.set(seg.pcm, offset);
            offset += seg.pcm.length;
        });
        if (duration() > 0) {
            setSelection(0, duration());
        } else {
            setSelection(0, 0);
        }
        syncViewWindow();
        updateSegmentsList();
        drawWaveform();
        saveProject();
    };

    const formatSegmentLabel = (seg, idx) => {
        const durMins = Math.floor(seg.pcm.length / state.sampleRate / 60);
        const durSecs = Math.floor((seg.pcm.length / state.sampleRate) % 60);
        const base = `${idx + 1}. ${seg.label || 'Segment'}`;
        const text = (seg.sourceText || '').trim();
        const textPart = text ? ` — "${text.length > 48 ? `${text.slice(0, 48)}…` : text}"` : '';
        return `${base}${textPart} — ${durMins}m ${durSecs}s (${seg.pcm.length.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} samples)`;
    };

    const moveSegment = (from, to) => {
        if (from === to || from < 0 || to < 0 || from >= state.segments.length || to >= state.segments.length) return;
        const [item] = state.segments.splice(from, 1);
        state.segments.splice(to, 0, item);
        rebuildTimeline();
    };

    const playSegment = async (seg) => {
        if (!seg?.pcm?.length) return false;
        cancelPendingSegmentPlayback();
        if (playingSource) stopPlayback();

        const pendingState = { cancelled: false, segId: seg.id };
        pendingSegmentPlay = pendingState;
        const clearPendingState = () => {
            if (pendingSegmentPlay === pendingState) pendingSegmentPlay = null;
        };

        const ctxAudio = getAudioCtx();
        if (ctxAudio.state === 'suspended') {
            try {
                await ctxAudio.resume();
            } catch (err) {
                persistStatus('Failed to resume audio context', false);
            }
        }

        if (pendingState.cancelled) {
            clearPendingState();
            return false;
        }

        const buffer = ctxAudio.createBuffer(1, seg.pcm.length, state.sampleRate);
        buffer.copyToChannel(seg.pcm, 0);

        const resumeInfo = pausedPlayback && pausedPlayback.mode === 'segment' && pausedPlayback.segId === seg.id ? pausedPlayback : null;
        const sr = Math.max(1, state.sampleRate || 44100);
        const segDuration = seg.pcm.length / sr;
        let samplesBefore = 0;
        for (let i = 0; i < state.segments.length; i++) {
            const current = state.segments[i];
            if (current.id === seg.id) break;
            samplesBefore += current.pcm.length;
        }
        const segmentStartTime = samplesBefore / sr;
        let startOffset = 0;
        let len = Math.max(0.001, segDuration);
        if (resumeInfo) {
            const resumeFromAbs = clamp(resumeInfo.resumeFrom ?? segmentStartTime, segmentStartTime, segmentStartTime + segDuration);
            const resumeEndAbs = clamp(resumeInfo.end ?? (segmentStartTime + segDuration), resumeFromAbs, segmentStartTime + segDuration);
            startOffset = resumeFromAbs - segmentStartTime;
            len = Math.max(0.001, resumeEndAbs - resumeFromAbs);
        }

        if (pendingState.cancelled) {
            clearPendingState();
            return false;
        }

        const source = ctxAudio.createBufferSource();
        source.buffer = buffer;
        source.connect(ctxAudio.destination);

        if (pendingState.cancelled) {
            try { source.disconnect(); } catch (err) { persistStatus(err, false); }
            clearPendingState();
            return false;
        }

        source.start(0, startOffset, len);
        playingSource = source;
        clearPendingState();

        playbackInterval = setInterval(updatePlaybackMarker, 1);

        playingMode = 'segment';
        playStartOffset = segmentStartTime + startOffset;
        playSpan = len;
        playStartedAt = ctxAudio.currentTime;
        pausedPlayback = null;

        source.onended = () => {
            if (playingSource !== source) return;
            playingSource = null;
            playingMode = null;
            pausedPlayback = null;
            playSpan = 0;
            playStartOffset = 0;
            syncSegmentPlayButtons(null);
            clearInterval(playbackInterval);
            drawWaveform();
        };
        return true;
    };

    const pauseSegment = async (seg) => {
        if (!playingSource) {
            if (pendingSegmentPlay && pendingSegmentPlay.segId === seg?.id) {
                cancelPendingSegmentPlayback();
            }
            return;
        }
        const ctxAudio = audioCtx || getAudioCtx();
        if (ctxAudio.state === 'suspended') await ctxAudio.resume();

        const elapsed = Math.max(0, ctxAudio.currentTime - playStartedAt);
        const resumeAbs = Math.min(playStartOffset + elapsed, playStartOffset + playSpan);
        pausedPlayback = {
            mode: 'segment',
            segId: seg?.id ?? null,
            resumeFrom: resumeAbs,
            end: playStartOffset + playSpan,
        };

        try {
            playingSource.onended = null;
            playingSource.stop();
        } catch (err) {
            persistStatus(err, false);
        }

        playingSource = null;
        playingMode = null;
    };

    const updateSegmentsList = () => {
        segmentsList.innerHTML = '';
        segmentPlayButtons.clear();
        if (!state.segments.length) {
            const li = document.createElement('li');
            li.textContent = 'No segments yet. Load audio or generate TTS to start.';
            li.style.opacity = '0.8';
            segmentsList.appendChild(li);
            return;
        }
        state.segments.forEach((seg, idx) => {
            const li = document.createElement('li');
            li.draggable = true;
            li.dataset.index = idx.toString();
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.border = '1px solid #1e1e1e';
            li.style.padding = '8px';
            li.style.borderRadius = '6px';
            li.style.background = '#0c0c0c';

            const label = document.createElement('div');
            label.textContent = formatSegmentLabel(seg, idx);
            label.style.flex = '1';

            const playSectionBtn = document.createElement('button');
            playSectionBtn.type = 'button';
            playSectionBtn.textContent = 'Play Section';
            playSectionBtn.disabled = !seg.pcm.length;
            segmentPlayButtons.set(seg.id, playSectionBtn);
            if (currentSegmentId === seg.id && playingMode === 'segment' && playingSource) {
                playSectionBtn.textContent = 'Pause Section';
            }
            playSectionBtn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                const isActiveSegment = Boolean(playingSource) && playingMode === 'segment' && currentSegmentId === seg.id;
                if (isActiveSegment) {
                    syncSegmentPlayButtons(null);
                    try {
                        await pauseSegment(seg);
                    } catch (err) {
                        persistStatus(`Failed to pause segment: ${err}`, false);
                        syncSegmentPlayButtons(seg.id);
                    }
                    return;
                }
                try {
                    const started = await playSegment(seg);
                    if (started) {
                        syncSegmentPlayButtons(seg.id);
                    }
                } catch (err) {
                    persistStatus(`Failed to play segment: ${err}`, false);
                    syncSegmentPlayButtons(null);
                }
            });

            const renameSectionBtn = document.createElement('button');
            renameSectionBtn.type = 'button';
            renameSectionBtn.textContent = 'Rename Section';
            renameSectionBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const newName = prompt('Enter new name for the segment:', seg.label);
                if (newName) {
                    seg.label = newName;
                    updateSegmentsList();
                }
            });

            const moveUpBtn = document.createElement('button');
            moveUpBtn.type = 'button';
            moveUpBtn.textContent = 'Move Up';
            moveUpBtn.disabled = idx === 0;
            moveUpBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (idx > 0) moveSegment(idx, idx - 1);
            });

            const moveDownBtn = document.createElement('button');
            moveDownBtn.type = 'button';
            moveDownBtn.textContent = 'Move Down';
            moveDownBtn.disabled = idx === state.segments.length - 1;
            moveDownBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (idx < state.segments.length - 1) moveSegment(idx, idx + 1);
            });

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = 'Remove';
            removeBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                state.segments = state.segments.filter((s) => s.id !== seg.id);
                rebuildTimeline();
            });

            const controls = document.createElement('div');
            controls.style.display = 'flex';
            controls.style.gap = '6px';
            controls.appendChild(playSectionBtn);
            controls.appendChild(renameSectionBtn);
            controls.appendChild(moveUpBtn);
            controls.appendChild(moveDownBtn);
            controls.appendChild(removeBtn);

            li.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', idx.toString());
            });

            li.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                li.style.borderColor = '#3aa0ff';
            });

            li.addEventListener('dragleave', () => {
                li.style.borderColor = '#1e1e1e';
            });

            li.addEventListener('drop', (e) => {
                e.preventDefault();
                li.style.borderColor = '#1e1e1e';
                const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
                const to = parseInt(li.dataset.index, 10);
                moveSegment(from, to);
            });

            li.appendChild(label);
            li.appendChild(controls);
            segmentsList.appendChild(li);
        });
    };

    const addSegment = (pcm, sampleRate, label, sourceText = '') => {
        if (!pcm || !pcm.length) return;
        if (!state.sampleRate) state.sampleRate = sampleRate || 44100;
        let finalPcm = pcm;
        if (sampleRate && sampleRate !== state.sampleRate) {
            finalPcm = resamplePcm(pcm, sampleRate, state.sampleRate);
        }
        state.segments.push({
            id: `seg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            label: label || 'Segment',
            pcm: new Float32Array(finalPcm),
            sourceText,
        });
        rebuildTimeline();
    };

    const addSilence = () => {
        const secs = parseFloat(silenceInput?.value || '0');
        if (Number.isNaN(secs) || secs <= 0) {
            if (silenceStatus) silenceStatus.textContent = 'Enter a silence length greater than 0.';
            return;
        }
        const samples = Math.max(1, Math.round(secs * state.sampleRate));
        const pcm = new Float32Array(samples);
        addSegment(pcm, state.sampleRate, 'Silence', `Silence ${secs.toFixed(2)}s`);
        if (silenceStatus) silenceStatus.textContent = `Added ${secs.toFixed(2)}s of silence.`;
        setButtonDisabledState(false);
        resetViewWindow();
        drawWaveform();
    };

    const splitAtSelection = () => {
        if (!state.pcm.length) return;
        const sr = state.sampleRate;
        const startIdx = Math.floor(state.selection.start * sr);
        const endIdx = Math.floor(state.selection.end * sr);

        const clampIdx = (idx) => Math.min(Math.max(idx, 0), state.pcm.length);
        const a = clampIdx(startIdx);
        const b = clampIdx(endIdx);

        if (a === b) {
            persistStatus('Select a region inside the audio to split.', false);
            return;
        }

        const low = Math.min(a, b);
        const high = Math.max(a, b);

        const left = state.pcm.slice(0, low);
        const mid = state.pcm.slice(low, high);
        const right = state.pcm.slice(high);

        const segments = [];
        if (left.length) segments.push({ id: `seg-${Date.now()}-l`, label: 'Part 1', pcm: left, sourceText: '' });
        if (mid.length) segments.push({ id: `seg-${Date.now()}-m`, label: 'Split', pcm: mid, sourceText: 'Split selection' });
        if (right.length) segments.push({ id: `seg-${Date.now()}-r`, label: 'Part 2', pcm: right, sourceText: '' });

        if (!segments.length) {
            persistStatus('Nothing to split.', false);
            return;
        }

        state.segments = segments;
        rebuildTimeline();
        persistStatus('Split created separate segments.');
    };

    const joinAllSegments = () => {
        if (!state.segments.length) return;
        const total = state.segments.reduce((sum, seg) => sum + seg.pcm.length, 0);
        const joined = new Float32Array(total);
        let offset = 0;
        const texts = [];
        state.segments.forEach((seg) => {
            joined.set(seg.pcm, offset);
            offset += seg.pcm.length;
            if (seg.sourceText) texts.push(seg.sourceText);
        });
        const textJoined = texts.join(' | ');
        state.segments = [{
            id: `seg-${Date.now()}-joined`,
            label: 'Joined',
            pcm: joined,
            sourceText: textJoined,
        }];
        rebuildTimeline();
        persistStatus('All segments joined into one.');
    };

    const drawWaveform = () => {
        const w = canvas.width;
        const h = canvas.height;
        const userLightMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
        ctx.fillStyle = userLightMode ? '#ffffff' : '#0b0b0b';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#222';
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        if (!state.pcm.length) {
            ctx.fillStyle = '#888';
            ctx.font = '14px monospace';
            ctx.fillText('Upload an existing audio file or generate TTS to begin editing.', 12, h / 2);
            return;
        }

        syncViewWindow();
        const d = duration();
        const viewSpan = Math.max(state.viewEnd - state.viewStart, state.minViewSpan);
        const startSample = Math.floor(state.viewStart * state.sampleRate);
        const visibleSamples = Math.max(1, Math.floor(viewSpan * state.sampleRate));
        const step = Math.max(1, Math.floor(visibleSamples / w));
        ctx.strokeStyle = '#3aa0ff';
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
            const start = startSample + x * step;
            const end = Math.min(state.pcm.length, start + step);
            let min = 1, max = -1;
            for (let i = start; i < end; i++) {
                const v = state.pcm[i];
                if (v < min) min = v;
                if (v > max) max = v;
            }
            const y1 = h / 2 - max * (h / 2);
            const y2 = h / 2 - min * (h / 2);
            ctx.moveTo(x + 0.5, y1);
            ctx.lineTo(x + 0.5, y2);
        }
        ctx.stroke();

        const selStartX = ((state.selection.start - state.viewStart) / viewSpan) * w || 0;
        const selEndX = ((state.selection.end - state.viewStart) / viewSpan) * w || 0;
        const selWidth = Math.max(2, selEndX - selStartX);
        ctx.fillStyle = 'rgba(90, 180, 255, 0.15)';
        ctx.fillRect(selStartX, 0, selWidth, h);
        ctx.strokeStyle = 'rgba(90, 180, 255, 0.7)';
        ctx.strokeRect(selStartX + 0.5, 0.5, selWidth - 1, h - 1);
    };

    const updatePlaybackMarker = () => {
        if (!playingSource || playSpan <= 0) return;

        drawWaveform();

        const ctxAudio = audioCtx || getAudioCtx();
        const elapsed = Math.max(0, ctxAudio.currentTime - playStartedAt);

        const absoluteTime = playStartOffset + elapsed;

        const viewStart = state.viewStart ?? 0;
        const viewEnd = state.viewEnd ?? duration();
        const viewSpan = Math.max(0.001, viewEnd - viewStart);

        const tClamped = Math.min(Math.max(absoluteTime, viewStart), viewEnd);
        const markerX = ((tClamped - viewStart) / viewSpan) * canvas.width;

        ctx.save();
        try {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
            ctx.fillRect(Math.round(markerX), 0, 2, canvas.height);
        } finally {
            ctx.restore();
        }
    };


    const stopPlayback = ({ preserveMacroPreview = false } = {}) => {
        cancelPendingSegmentPlayback();
        const isMacroPreviewActive = playingMode === 'macro-preview';
        const hasPausedMacroPreview = !!macroPreviewPlayback && !isMacroPreviewActive;
        const shouldHandleMacroPreview = isMacroPreviewActive || (hasPausedMacroPreview && !preserveMacroPreview);
        const macroAudio = shouldHandleMacroPreview
            ? (macroPreviewPlayback?.audio || (isMacroPreviewActive ? playingSource : null))
            : null;
        if (playingSource) {
            try {
                playingSource.onended = null;
                playingSource.stop();
            } catch (err) {
                persistStatus(err, false);
            }
        }
        playingSource = null;
        playingMode = null;
        pausedPlayback = null;
        playSpan = 0;
        syncSegmentPlayButtons(null);
        syncPlayButtons();
        rebuildTimeline();
        drawWaveform();
        if (shouldHandleMacroPreview) {
            if (!playingSource && macroAudio) {
                try {
                    if (typeof macroAudio.pause === 'function') macroAudio.pause();
                } catch (err) {
                    reportErrorStatus(`Failed to pause macro preview audio during stop: ${err}`, err);
                }
                try {
                    macroAudio.currentTime = 0;
                } catch (err) {
                    reportErrorStatus(`Failed to reset macro preview audio during stop: ${err}`, err);
                }
                macroPreviewPlayback?.cleanup?.();
            }
            clearMacroPreviewInterval();
            macroPreviewPlayback = null;
            resetPreviewMacroButton();
        }
    };

    const pausePlayback = () => {
        if (!playingSource) return;
        const wasMacroPreview = playingMode === 'macro-preview';
        if (wasMacroPreview && pauseMacroPreview()) {
            return;
        }
        const ctxAudio = audioCtx || getAudioCtx();
        const elapsed = Math.max(0, ctxAudio.currentTime - playStartedAt);
        const endPos = playStartOffset + playSpan;
        const resumeFrom = Math.min(endPos, playStartOffset + elapsed);
        pausedPlayback = playingMode ? { mode: playingMode, resumeFrom, end: endPos } : null;
        try {
            playingSource.onended = null;
            playingSource.stop();
        }

        catch (err) {
            persistStatus(err, false);
        }
        playingSource = null;
        playingMode = null;
        syncPlayButtons();
        if (wasMacroPreview) {
            resetPreviewMacroButton();
        }
    };

    const playSelection = async () => {
        if (!state.pcm.length) return;
        const blob = pcmToWav(state.pcm, state.sampleRate);
        window.blob = blob;
        const selectionStart = state.selection.start;
        const selectionLen = Math.max(0.001, state.selection.end - state.selection.start || duration());
        const selectionEnd = selectionStart + selectionLen;
        const resumeInfo = (pausedPlayback && pausedPlayback.mode === 'selection' && pausedPlayback.resumeFrom >= selectionStart && pausedPlayback.resumeFrom <= selectionEnd)
            ? pausedPlayback
            : null;
        const start = resumeInfo ? resumeInfo.resumeFrom : selectionStart;
        const endPos = resumeInfo ? Math.min(selectionEnd, resumeInfo.end) : selectionEnd;
        const len = Math.max(0.001, endPos - start);
        if (start >= duration() || len <= 0) return;
        if (playingSource) stopPlayback();
        const ctxAudio = getAudioCtx();
        if (ctxAudio.state === 'suspended') await ctxAudio.resume();
        const buffer = ctxAudio.createBuffer(1, state.pcm.length, state.sampleRate);
        buffer.copyToChannel(state.pcm, 0);
        const source = ctxAudio.createBufferSource();
        source.buffer = buffer;
        source.connect(ctxAudio.destination);
        source.start(0, start, len);
        playingSource = source;
        playingMode = 'selection';
        playStartOffset = start;
        playSpan = len;
        playStartedAt = ctxAudio.currentTime;
        const playbackInterval = setInterval(updatePlaybackMarker, 1);
        pausedPlayback = null;
        syncPlayButtons();
        source.onended = () => {
            playingSource = null;
            playingMode = null;
            pausedPlayback = null;
            playSpan = 0;
            playStartOffset = 0;
            clearInterval(playbackInterval);
            drawWaveform();
            syncPlayButtons();
        };
    };

    const playWholeFile = async () => {
        if (!state.pcm.length) return;
        const resumeInfo = pausedPlayback && pausedPlayback.mode === 'all' ? pausedPlayback : null;
        const start = resumeInfo ? resumeInfo.resumeFrom : 0;
        const endPos = duration();
        const len = Math.max(0.001, endPos - start);
        if (start >= endPos || len <= 0) return;
        if (playingSource) stopPlayback();
        const ctxAudio = getAudioCtx();
        if (ctxAudio.state === 'suspended') await ctxAudio.resume();
        const buffer = ctxAudio.createBuffer(1, state.pcm.length, state.sampleRate);
        buffer.copyToChannel(state.pcm, 0);
        const source = ctxAudio.createBufferSource();
        source.buffer = buffer;
        source.connect(ctxAudio.destination);
        source.start(0, start, len);
        playingSource = source;
        playingMode = 'all';
        playStartOffset = start;
        playSpan = len;
        playStartedAt = ctxAudio.currentTime;
        const playbackInterval = setInterval(updatePlaybackMarker, 1);
        pausedPlayback = null;
        syncPlayButtons();
        source.onended = () => {
            playingSource = null;
            playingMode = null;
            pausedPlayback = null;
            playSpan = 0;
            playStartOffset = 0;
            clearInterval(playbackInterval);
            drawWaveform();
            syncPlayButtons();
        };
    };

    const deleteSelection = () => {
        if (!state.pcm.length) return;
        const sr = state.sampleRate;
        const startIdx = Math.floor(state.selection.start * sr);
        const endIdx = Math.floor(state.selection.end * sr);
        if (endIdx <= startIdx) return;
        const left = state.pcm.slice(0, startIdx);
        const right = state.pcm.slice(endIdx);
        state.segments = [];
        if (left.length) state.segments.push({ id: 'seg-left', label: 'Left', pcm: left });
        if (right.length) state.segments.push({ id: 'seg-right', label: 'Right', pcm: right });
        rebuildTimeline();
    };

    const trimToSelection = () => {
        if (!state.pcm.length) return;
        const sr = state.sampleRate;
        const startIdx = Math.floor(state.selection.start * sr);
        const endIdx = Math.floor(state.selection.end * sr);
        if (endIdx <= startIdx) return;
        const chunk = state.pcm.slice(startIdx, endIdx);
        state.segments = [{ id: 'seg-trim', label: 'Trimmed', pcm: chunk }];
        rebuildTimeline();
    };

    const saveSelectionAsSegment = () => {
        if (!state.pcm.length) return;
        const sr = state.sampleRate;
        const startIdx = Math.floor(state.selection.start * sr);
        const endIdx = Math.floor(state.selection.end * sr);
        if (endIdx <= startIdx) return;
        const chunk = state.pcm.slice(startIdx, endIdx);
        addSegment(chunk, sr, 'Selection');
    };

    const pcmToWav = (pcm, sampleRate) => {
        const buffer = new ArrayBuffer(44 + pcm.length * 2);
        const view = new DataView(buffer);
        const writeString = (offset, str) => {
            for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
        };
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + pcm.length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, pcm.length * 2, true);
        let offset = 44;
        for (let i = 0; i < pcm.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, pcm[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        }
        return new Blob([buffer], { type: 'audio/wav' });
    };

    const exportWav = async () => {
        if (!state.pcm.length) return;
        const blob = pcmToWav(state.pcm, state.sampleRate);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'splice.wav';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        const intervalId2 = setInterval(() => persistStatus('WAV exported!', true), 5);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        clearInterval(intervalId2);
    };

    const handleFile = async (file) => {
        if (!file) return;
        const ab = await file.arrayBuffer();
        const ctxAudio = getAudioCtx();
        const decoded = await ctxAudio.decodeAudioData(ab);
        const pcm = new Float32Array(decoded.getChannelData(0));
        addSegment(pcm, decoded.sampleRate, file.name || 'File');
        resetViewWindow();
        drawWaveform();
    };

    const ensureTtsReady = async () => {
        if (window.PiperTTS) return;
        if (!ttsLoader) {
            ttsLoader = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = PIPER_BUNDLE_URL;
                s.async = true;
                s.onload = resolve;
                s.onerror = () => reject(new Error('Failed to load TTS bundle'));
                document.head.appendChild(s);
            });
        }
        await ttsLoader;
        if (window.ort?.env?.wasm) {
            window.ort.env.wasm.wasmPaths = 'assets/piper-tts/onnxruntime-web/';
        }
    };

    const reportNanoTtsStatus = (message) => {
        if (!ttsStatus || !message) return;
        ttsStatus.textContent = message;
    };

    const flushNanoTtsQueue = (error) => {
        while (nanoTtsState.queue.length) {
            const job = nanoTtsState.queue.shift();
            job.reject(error);
        }
    };

    const startNextNanoTtsJob = () => {
        if (!nanoTtsState.worker || !nanoTtsState.ready) return;
        if (nanoTtsState.currentJob || !nanoTtsState.queue.length) return;
        const job = nanoTtsState.queue.shift();
        nanoTtsState.currentJob = job;
        nanoTtsState.worker.postMessage({
            lang: job.lang || NANO_TTS_LANGUAGE,
            volume: `${job.volume ?? NANO_TTS_VOLUME}`,
            text: job.text,
        });
    };

    const processNanoTtsBlob = async (blob) => {
        const job = nanoTtsState.currentJob;
        if (!job) return;
        try {
            const ctxAudio = getAudioCtx();
            const buffer = await blob.arrayBuffer();
            const decoded = await ctxAudio.decodeAudioData(buffer);
            const channel = decoded.getChannelData(0);
            const pcm = new Float32Array(channel.length);
            pcm.set(channel);
            job.resolve({ pcm, sampleRate: decoded.sampleRate });
        } catch (err) {
            job.reject(err);
        } finally {
            nanoTtsState.currentJob = null;
            startNextNanoTtsJob();
        }
    };

    const handleNanoTtsWorkerError = (message, fatal = false) => {
        const error = message instanceof Error ? message : new Error(message || 'NanoTTS error');
        reportNanoTtsStatus(`NanoTTS error: ${error.message}`);
        if (nanoTtsState.currentJob) {
            nanoTtsState.currentJob.reject(error);
            nanoTtsState.currentJob = null;
        }
        if (fatal) {
            if (nanoTtsState.worker) {
                nanoTtsState.worker.terminate();
            }
            nanoTtsState.worker = null;
            nanoTtsState.ready = false;
            flushNanoTtsQueue(error);
        } else {
            startNextNanoTtsJob();
        }
    };

    const handleNanoTtsWorkerMessage = (event) => {
        const data = event?.data || {};
        if (data.type === 'ready') {
            nanoTtsState.ready = true;
            startNextNanoTtsJob();
            return;
        }
        if (data.type === 'progress') {
            if (data.error) {
                handleNanoTtsWorkerError(data.error);
            } else if (data.data) {
                reportNanoTtsStatus(data.data);
            }
            return;
        }
        if (data.error) {
            handleNanoTtsWorkerError(data.error);
            return;
        }
        if (data.blob) {
            processNanoTtsBlob(data.blob);
        }
    };

    const ensureNanoTtsWorker = () => {
        if (!window.Worker) {
            throw new Error('NanoTTS requires Web Worker support in this browser.');
        }
        if (nanoTtsState.worker) return nanoTtsState.worker;
        let worker;
        try {
            worker = new Worker(NANO_TTS_WORKER_URL, { type: 'classic' });
        } catch (err) {
            worker = new Worker(NANO_TTS_WORKER_URL);
        }
        worker.addEventListener('message', handleNanoTtsWorkerMessage);
        worker.addEventListener('error', (event) => handleNanoTtsWorkerError(event?.message || 'NanoTTS worker error', true));
        worker.addEventListener('messageerror', () => handleNanoTtsWorkerError('NanoTTS worker message error', true));
        nanoTtsState.worker = worker;
        nanoTtsState.ready = false;
        return worker;
    };

    const synthNanoTts = (text) => {
        ensureNanoTtsWorker();
        return new Promise((resolve, reject) => {
            nanoTtsState.queue.push({
                text,
                resolve,
                reject,
                lang: NANO_TTS_LANGUAGE,
                volume: NANO_TTS_VOLUME,
            });
            startNextNanoTtsJob();
        });
    };

    const synthTts = async (text, voice) => {
        const mode = (voice || 'wasm').toLowerCase();
        if (mode === 'nanotts') {
            return synthNanoTts(text);
        }
        await ensureTtsReady();
        const target = state.sampleRate || 44100;
        if (window.PiperTTS?.pcmFor) {
            const pcm = await window.PiperTTS.pcmFor(text, PIPER_VOICE, target);
            return { pcm: new Float32Array(pcm), sampleRate: target };
        }
        if (window.PiperTTS?.synthToWavBlob) {
            const wav = await window.PiperTTS.synthToWavBlob(text);
            const ctxAudio = getAudioCtx();
            const decoded = await ctxAudio.decodeAudioData(await wav.arrayBuffer());
            return { pcm: new Float32Array(decoded.getChannelData(0)), sampleRate: decoded.sampleRate };
        }
        throw new Error('TTS service unavailable');
    };

    const getVoiceList = async () => {
        if (!voiceSelect || voiceListLoaded) return;
        const url = "https://wagspuzzle.space/tools/eas-tts/index.php?handler=toolkit&voicelist=true";
        try {
            const response = await fetch(url);
            const data = await response.json();

            for (const [voiceId, voiceName] of Object.entries(data.voices)) {
                if (voiceName.toLowerCase().includes("emnet")) {
                    const option = document.createElement("option");
                    option.value = voiceId;
                    option.textContent = "[EMNet] EMNet (uses generated headers as input)";
                    voiceSelect.appendChild(option);
                } else {
                    const backendMatch = voiceName.match(/\[(.*?)\]/);
                    let backend = backendMatch ? backendMatch[1] : "Unknown";

                    if (voiceName.toLowerCase().includes("bal/spfy")) {
                        backend = "BAL";
                    }

                    if (!voiceBackendMap[backend]) {
                        voiceBackendMap[backend] = [];
                    }

                    voiceBackendMap[backend].push(voiceId);
                    const option = document.createElement("option");
                    option.value = voiceId;
                    option.textContent = voiceName;
                    voiceSelect.appendChild(option);
                }
            }
            voiceListLoaded = true;
        } catch (error) {
            console.error("Error fetching voice list:", error);
            if (ttsStatus) ttsStatus.textContent = "Failed to load external voices; WASM only.";
        }
    };

    const checkZCZCIsValid = (header) => {
        const zczcPattern = /^ZCZC-([A-Z]{3})-([A-Z]{3})-((?:\d{6}(?:-?)){1,31})\+(\d{4})-(\d{7})-([A-Za-z0-9\/ ]{0,8})-?$/;
        return zczcPattern.test(header);
    };

    const validateTtsText = (voiceId, ttsText) => {
        const requiredBackend = Object.keys(voiceBackendMap).find(backend => voiceBackendMap[backend].includes(voiceId));
        const normalizedBackend = requiredBackend ? requiredBackend.toLowerCase() : "";
        const usesBalPhonemes = /<\s*\/?\s*(silence|pron|phoneme)/i.test(ttsText);
        const usesVtmlTags = /<\s*\/?\s*vtml/i.test(ttsText);
        const usesDtPhonemes = /\[:phoneme/i.test(ttsText);

        if (normalizedBackend.includes("bal")) {
            if (usesVtmlTags || usesDtPhonemes) return false;
            if (usesBalPhonemes && !/<(silence|pron|phoneme).*/i.test(ttsText)) return false;
        } else if (normalizedBackend.includes("vt")) {
            if (usesBalPhonemes || usesDtPhonemes) return false;
            if (usesVtmlTags && !/<vtml.*/i.test(ttsText)) return false;
        } else if (normalizedBackend.includes("dt")) {
            if (usesBalPhonemes || usesVtmlTags) return false;
            if (usesDtPhonemes && !/\[phoneme :on].*/i.test(ttsText)) return false;
        } else if (!normalizedBackend.includes("bal") && !normalizedBackend.includes("vt") && !normalizedBackend.includes("dt")) {
            if (usesBalPhonemes || usesVtmlTags || usesDtPhonemes) return false;
        }
        return true;
    };

    const getAudioFromPage = async (response) => {
        const decoder = new TextDecoder("utf-8");
        const responseText = decoder.decode(response);
        const audioMatch = responseText.match(/id="downloadlink"><a href="(.*)" download/i);
        const jsonMatch = responseText.match(/<span id="jsonErrorMsg">(.*)</i);

        if (jsonMatch && jsonMatch[1]) {
            const cleanMatch = jsonMatch[1].replace(/.*Exact error: (.*)/, "$1");
            const errorMsg = cleanMatch !== '' ? cleanMatch : jsonMatch[1];
            throw new Error(errorMsg);
        }

        if (audioMatch && audioMatch[1]) {
            const audioSrc = audioMatch[1];
            const audioResponse = await fetch("https://wagspuzzle.space/tools/eas-tts/" + audioSrc);
            const audioArrayBuffer = await audioResponse.arrayBuffer();
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const buffer = await audioContext.decodeAudioData(audioArrayBuffer);
            return buffer;
        }

        return null;
    };

    const fetchRemoteTtsAudio = ({ text, voiceId, overrideTZ }) => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const url = "https://wagspuzzle.space/tools/eas-tts/index.php?handler=toolkit";

            const params = new URLSearchParams();
            params.append("text", voiceId === "EMNet" ? text : text);
            params.append("voice", voiceId);
            params.append("useOverrideTZ", overrideTZ ?? "UTC");

            xhr.open("POST", url, true);
            xhr.responseType = "arraybuffer";
            xhr.setRequestHeader("Accept", "*/*");
            xhr.setRequestHeader("User-Agent", "EAS-Tools/wagwan-piffting-blud.github.io");
            xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

            const toArrayBuffer = (payload) => {
                if (payload instanceof ArrayBuffer) return Promise.resolve(payload);
                if (payload instanceof Blob) return payload.arrayBuffer();
                if (typeof payload === "string") {
                    const withoutPrefix = payload.replace(/^data:audio\/[\w.+-]+;base64,/, "");
                    const candidate = withoutPrefix.replace(/\s/g, "");
                    return new Promise((resolvePayload, rejectPayload) => {
                        try {
                            const binary = atob(candidate);
                            const buffer = new ArrayBuffer(binary.length);
                            const bytes = new Uint8Array(buffer);
                            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                            resolvePayload(buffer);
                        } catch {
                            try {
                                const buffer = new ArrayBuffer(withoutPrefix.length);
                                const bytes = new Uint8Array(buffer);
                                for (let i = 0; i < withoutPrefix.length; i++) {
                                    bytes[i] = withoutPrefix.charCodeAt(i) & 0xff;
                                }
                                resolvePayload(buffer);
                            } catch (err) {
                                rejectPayload(err);
                            }
                        }
                    });
                }
                return Promise.reject(new TypeError("Unsupported payload type"));
            };

            xhr.onload = function () {
                const contentType = xhr.getResponseHeader("Content-Type") || "";
                const finishWithError = (err) => reject(err || new Error("TTS fetch failed"));

                if (xhr.status >= 200 && xhr.status < 300 && contentType.startsWith("audio/wav")) {
                    const rawPayload = xhr.response ?? xhr.responseText;
                    toArrayBuffer(rawPayload).then((arrayBuffer) => {
                        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                        const decode = audioContext.decodeAudioData.bind(audioContext);
                        const decodePromise = decode.length > 1
                            ? new Promise((resolveDecode, rejectDecode) => decode(arrayBuffer, resolveDecode, rejectDecode))
                            : decode(arrayBuffer);

                        decodePromise.then((buffer) => {
                            if (typeof audioContext.close === "function") {
                                audioContext.close().catch(() => { });
                            }
                            resolve({ pcm: buffer.getChannelData(0), sampleRate: buffer.sampleRate });
                        }).catch((error) => {
                            if (typeof audioContext.close === "function") {
                                audioContext.close().catch(() => { });
                            }
                            finishWithError(error);
                        });
                    }).catch(finishWithError);
                } else if (contentType.startsWith("application/json")) {
                    try {
                        const decoder = new TextDecoder("utf-8");
                        const responseJSON = JSON.parse(decoder.decode(xhr.response));
                        finishWithError(new Error(responseJSON.error || "TTS JSON error"));
                    } catch (error) {
                        finishWithError(error);
                    }
                } else {
                    try {
                        getAudioFromPage(xhr.response).then((buffer) => {
                            if (buffer) {
                                resolve({ pcm: buffer.getChannelData(0), sampleRate: buffer.sampleRate });
                            } else {
                                finishWithError(new Error("No audio found in response"));
                            }
                        }).catch(finishWithError);
                    } catch (error) {
                        finishWithError(error);
                    }
                }
            };

            xhr.onerror = function () {
                reject(new Error(`Network error: ${xhr.status} ${xhr.statusText}`));
            };

            xhr.send(params.toString());
        });
    };

    const bindEvents = () => {
        canvas.addEventListener('mousedown', (event) => {
            if (!state.pcm.length) return;
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            syncViewWindow();
            const viewSpan = state.viewEnd - state.viewStart;
            const t = clamp(state.viewStart + (x / rect.width) * viewSpan, 0, duration());
            const panState = {
                startX: event.clientX,
                viewStart: state.viewStart,
                viewEnd: state.viewEnd,
            };
            if (event.shiftKey) {
                dragMode = 'pan';
            } else {
                const distStart = Math.abs(t - state.selection.start);
                const distEnd = Math.abs(t - state.selection.end);
                dragMode = distStart < distEnd ? 'start' : 'end';
                setSelection(dragMode === 'start' ? t : state.selection.start, dragMode === 'end' ? t : state.selection.end);
            }

            const move = (e) => {
                const nx = e.clientX - rect.left;
                if (dragMode === 'pan') {
                    const deltaPixels = e.clientX - panState.startX;
                    const deltaTime = (deltaPixels / rect.width) * (panState.viewEnd - panState.viewStart);
                    let newStart = panState.viewStart - deltaTime;
                    let newEnd = panState.viewEnd - deltaTime;
                    const d = duration();
                    if (newStart < 0) {
                        newStart = 0;
                        newEnd = newStart + (panState.viewEnd - panState.viewStart);
                    }
                    if (newEnd > d) {
                        newEnd = d;
                        newStart = clamp(newEnd - (panState.viewEnd - panState.viewStart), 0, d);
                    }
                    state.viewStart = newStart;
                    state.viewEnd = newEnd;
                    drawWaveform();
                } else {
                    const nt = clamp(state.viewStart + (nx / rect.width) * viewSpan, 0, duration());
                    if (dragMode === 'start') setSelection(nt, state.selection.end);
                    else setSelection(state.selection.start, nt);
                }
            };
            const up = () => {
                dragMode = null;
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });

        canvas.addEventListener('wheel', (event) => {
            if (!state.pcm.length) return;
            event.preventDefault();
            syncViewWindow();
            const rect = canvas.getBoundingClientRect();
            const xRatio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
            const center = state.viewStart + (state.viewEnd - state.viewStart) * xRatio;
            const factor = event.deltaY < 0 ? 0.8 : 1.25;
            const newSpan = clamp((state.viewEnd - state.viewStart) * factor, state.minViewSpan, duration());
            let newStart = center - newSpan * xRatio;
            let newEnd = newStart + newSpan;
            const d = duration();
            if (newStart < 0) {
                newStart = 0;
                newEnd = newSpan;
            }
            if (newEnd > d) {
                newEnd = d;
                newStart = Math.max(0, d - newSpan);
            }
            state.viewStart = newStart;
            state.viewEnd = newEnd;
            drawWaveform();
        }, { passive: false });

        const getTouchById = (touches, id) => {
            for (let i = 0; i < touches.length; i++) if (touches[i].identifier === id) return touches[i];
            return null;
        };

        const TAP_MAX_MOVE = 8;
        const TAP_MAX_MS = 300;

        canvas.addEventListener('touchstart', (event) => {
            if (event.cancelable) event.preventDefault();
            if (!state.pcm.length) return;
            syncViewWindow();
            const rect = canvas.getBoundingClientRect();

            if (event.touches.length === 1) {
                const t = event.touches[0];
                touchPan = {
                    id: t.identifier,
                    startX: t.clientX,
                    startY: t.clientY,
                    startViewStart: state.viewStart,
                    startViewEnd: state.viewEnd,
                    moved: false,
                    startTime: Date.now(),
                };
                pinchState = null;
                touchSelectionId = null;
                dragMode = null;
            } else if (event.touches.length === 2) {
                const a = event.touches[0];
                const b = event.touches[1];
                const midX = (a.clientX + b.clientX) / 2;
                const midY = (a.clientY + b.clientY) / 2;
                const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
                pinchState = {
                    initialDist: Math.max(1, dist),
                    initialViewStart: state.viewStart,
                    initialViewEnd: state.viewEnd,
                    midX,
                    midY,
                };
                touchPan = null;
                touchSelectionId = null;
                dragMode = null;
            } else {
                pinchState = null;
                touchPan = null;
                touchSelectionId = null;
                dragMode = null;
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (event) => {
            if (event.cancelable) event.preventDefault();
            if (!state.pcm.length) return;
            const rect = canvas.getBoundingClientRect();

            if (event.touches.length === 1 && touchPan && getTouchById(event.touches, touchPan.id)) {
                const t = getTouchById(event.touches, touchPan.id);
                const span = touchPan.startViewEnd - touchPan.startViewStart;
                const deltaPixels = t.clientX - touchPan.startX;
                if (Math.abs(deltaPixels) > TAP_MAX_MOVE) touchPan.moved = true;
                const deltaTime = (deltaPixels / rect.width) * span;
                let newStart = touchPan.startViewStart - deltaTime;
                let newEnd = touchPan.startViewEnd - deltaTime;
                const d = duration();
                if (newStart < 0) {
                    newStart = 0;
                    newEnd = newStart + span;
                }
                if (newEnd > d) {
                    newEnd = d;
                    newStart = Math.max(0, d - span);
                }
                state.viewStart = newStart;
                state.viewEnd = newEnd;
                drawWaveform();
            } else if (event.touches.length === 2) {
                const a = event.touches[0];
                const b = event.touches[1];
                const midX = (a.clientX + b.clientX) / 2;
                const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

                if (!pinchState) {
                    pinchState = {
                        initialDist: Math.max(1, dist),
                        initialViewStart: state.viewStart,
                        initialViewEnd: state.viewEnd,
                        midX,
                        midY: (a.clientY + b.clientY) / 2,
                    };
                }

                const initialDist = pinchState.initialDist;
                const initialViewStart = pinchState.initialViewStart;
                const initialViewEnd = pinchState.initialViewEnd;
                const initialSpan = Math.max(state.minViewSpan, initialViewEnd - initialViewStart);

                const zoomFactor = clamp(initialDist / Math.max(1, dist), 0.2, 5);
                const newSpan = clamp(initialSpan * zoomFactor, state.minViewSpan, duration());

                const centerRatio = clamp((midX - rect.left) / rect.width, 0, 1);
                let newStart = initialViewStart + centerRatio * (initialSpan - newSpan);
                let newEnd = newStart + newSpan;
                const d = duration();
                if (newStart < 0) {
                    newStart = 0;
                    newEnd = newSpan;
                }
                if (newEnd > d) {
                    newEnd = d;
                    newStart = Math.max(0, d - newSpan);
                }
                state.viewStart = newStart;
                state.viewEnd = newEnd;
                drawWaveform();
            }
        }, { passive: false });

        canvas.addEventListener('touchend', (event) => {
            if (touchPan && !touchPan.moved) {
                const elapsed = Date.now() - touchPan.startTime;
                if (elapsed <= TAP_MAX_MS) {
                    const rect = canvas.getBoundingClientRect();
                    const x = touchPan.startX - rect.left;
                    const center = clamp((x / rect.width), 0, 1);
                    const t = clamp(state.viewStart + (state.viewEnd - state.viewStart) * center, 0, duration());
                    const distStart = Math.abs(t - state.selection.start);
                    const distEnd = Math.abs(t - state.selection.end);
                    if (distStart < distEnd) {
                        setSelection(t, state.selection.end);
                    } else {
                        setSelection(state.selection.start, t);
                    }
                }
            }

            if (event.touches.length === 1) {
                const remaining = event.touches[0];
                touchPan = {
                    id: remaining.identifier,
                    startX: remaining.clientX,
                    startY: remaining.clientY,
                    startViewStart: state.viewStart,
                    startViewEnd: state.viewEnd,
                    moved: false,
                    startTime: Date.now(),
                };
                pinchState = null;
            } else {
                touchPan = null;
                pinchState = null;
                touchSelectionId = null;
                dragMode = null;
            }
        }, { passive: false });

        canvas.addEventListener('touchcancel', () => {
            touchPan = null;
            pinchState = null;
            touchSelectionId = null;
            dragMode = null;
        });

        fileInput?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
            setButtonDisabledState(false);
        });

        playBtn?.addEventListener('click', async () => {
            const isSelectionPlaying = playingSource && playingMode === 'selection';
            if (isSelectionPlaying) {
                pausePlayback();
                syncPlayButtons();
                return;
            }
            try {
                await playSelection();
            } catch (err) {
                persistStatus(`Failed to play selection: ${err}`, false);
            } finally {
                syncPlayButtons();
            }
        });

        playAllBtn?.addEventListener('click', async () => {
            const isPlayingAll = playingSource && playingMode === 'all';
            if (isPlayingAll) {
                pausePlayback();
                syncPlayButtons();
                return;
            }
            try {
                await playWholeFile();
            } catch (err) {
                persistStatus(`Failed to play entire file: ${err}`, false);
            } finally {
                syncPlayButtons();
            }
        });

        loadFileBtn?.addEventListener('click', () => { fileInput?.click(); });
        stopBtn?.addEventListener('click', stopPlayback);
        trimBtn?.addEventListener('click', trimToSelection);
        deleteBtn?.addEventListener('click', deleteSelection);
        splitBtn?.addEventListener('click', saveSelectionAsSegment);
        exportBtn?.addEventListener('click', exportWav);
        clearBtn?.addEventListener('click', async () => {
            stopPlayback();
            state.segments = [];
            state.pcm = new Float32Array(0);
            setSelection(0, 0);
            updateSegmentsList();
            drawWaveform();
            clearCache();
            setButtonDisabledState(true);
            const intervalId = setInterval(() => persistStatus('Project cleared.', true), 5);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            clearInterval(intervalId);
        });

        silenceBtn?.addEventListener('click', addSilence);
        splitSelectionBtn?.addEventListener('click', splitAtSelection);
        joinAllBtn?.addEventListener('click', joinAllSegments);

        voiceSelect?.addEventListener('change', () => {
            const selectedVoice = (voiceSelect?.value || 'wasm').trim();
            const overrideTZElements = document.getElementsByClassName('splicerOverrideTZ');
            if (selectedVoice !== 'EMNet') {
                Array.from(overrideTZElements).forEach(el => el.style.display = 'none');
            } else {
                Array.from(overrideTZElements).forEach(el => el.style.display = 'inline-block');
            }
        });

        voiceSelect?.dispatchEvent(new Event('change'));

        ttsButton?.addEventListener('click', async () => {
            const text = (ttsInput?.value || '').trim();
            const selectedVoiceValue = (voiceSelect?.value || 'wasm').trim();
            const normalizedVoice = selectedVoiceValue.toLowerCase();
            const tz = (overrideTzSelect?.value || 'UTC').trim();
            if (!text) {
                if (ttsStatus) ttsStatus.textContent = 'Enter text to synthesize.';
                return;
            }
            if (normalizedVoice === 'emnet' && !checkZCZCIsValid(text)) {
                if (ttsStatus) ttsStatus.textContent = 'EMNet requires a valid SAME header string.';
                return;
            }
            ttsButton.disabled = true;
            if (ttsStatus) ttsStatus.textContent = 'Generating…';
            try {
                if (normalizedVoice === 'wasm' || normalizedVoice === 'nanotts') {
                    const valid = validateTtsText(selectedVoiceValue, text);
                    if (!valid) {
                        if (ttsStatus) ttsStatus.textContent = 'Text contains invalid phonemes for this backend.';
                        return;
                    }
                    const { pcm, sampleRate } = await synthTts(text, normalizedVoice);
                    addSegment(pcm, sampleRate, 'TTS', text);
                    if (ttsStatus) ttsStatus.textContent = `Added ${(pcm.length / (sampleRate || state.sampleRate)).toFixed(2)}s of audio.`;
                    setButtonDisabledState(false);
                    resetViewWindow();
                    drawWaveform();
                } else {
                    const valid = validateTtsText(selectedVoiceValue, text);
                    if (!valid) {
                        if (ttsStatus) ttsStatus.textContent = 'Text contains invalid phonemes for this backend.';
                        return;
                    }
                    const result = await fetchRemoteTtsAudio({ text, voiceId: selectedVoiceValue, overrideTZ: tz });
                    if (result?.pcm?.length) {
                        addSegment(result.pcm, result.sampleRate, 'TTS', text);
                        if (ttsStatus) ttsStatus.textContent = `Added ${(result.pcm.length / (result.sampleRate || state.sampleRate)).toFixed(2)}s of audio.`;
                        setButtonDisabledState(false);
                        resetViewWindow();
                        drawWaveform();
                    } else {
                        if (ttsStatus) ttsStatus.textContent = 'No audio received.';
                    }
                }
            } catch (err) {
                console.error(err);
                if (ttsStatus) ttsStatus.textContent = 'TTS failed. See console for details.';
            } finally {
                ttsButton.disabled = false;
            }
        });
    };

    const setButtonDisabledState = (disabled) => {
        playBtn.disabled = disabled;
        playAllBtn.disabled = disabled;
        stopBtn.disabled = disabled;
        splitBtn.disabled = disabled;
        trimBtn.disabled = disabled;
        deleteBtn.disabled = disabled;
        exportBtn.disabled = disabled;
        splitSelectionBtn.disabled = disabled;
        joinAllBtn.disabled = disabled;
        clearBtn.disabled = disabled;
        if (previewMacroBtn) previewMacroBtn.disabled = disabled;
        if (exportMacroBtn) exportMacroBtn.disabled = disabled;
    };

    const restoreFromCache = async () => {
        const payload = await loadProject();
        if (!payload || !payload.segments?.length) {
            setButtonDisabledState(true);
            persistStatus('No cached project found yet.');
            drawWaveform();
            updateSegmentsList();
            return;
        }
        voiceSelect.value = payload.ttsVoiceSelection || PIPER_VOICE;
        ttsInput.value = payload.ttsText || '';
        macroSelect.value = payload.macroSelection || 'FLAT';
        window.splicerEditor.setValue(payload.ttsText || '');
        state.sampleRate = payload.sampleRate || state.sampleRate;
        state.segments = payload.segments.map((s) => ({
            id: s.id || `seg-${Math.random().toString(16).slice(2)}`,
            label: s.label,
            pcm: new Float32Array(s.pcm),
            sourceText: s.sourceText || '',
        }));
        rebuildTimeline();
        setButtonDisabledState(false);
        const intervalId3 = setInterval(() => persistStatus('Project restored from cache.'), 5);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        clearInterval(intervalId3);
    };

    function getSelectedMacroId() {
        const raw = macroSelect && macroSelect.value ? macroSelect.value : 'FLAT';
        if (raw === 'ENDEC') return 'DIGITAL_ENDEC';
        return raw.toUpperCase();
    }

    function reportErrorStatus(message, err) {
        if (typeof persistStatus === 'function') {
            persistStatus(message, false);
        } else {
            console.error(message, err || '');
        }
    }

    let soxMacroDefs = {};
    let soxMacrosLoaded = false;
    function populateMacroSelect() {
        if (!macroSelect) return;

        const ids = Object.keys(soxMacroDefs);
        if (!ids.length) return;

        const previous = macroSelect.value;

        while (macroSelect.firstChild) {
            macroSelect.removeChild(macroSelect.firstChild);
        }

        const preferred = ['FLAT', 'AM_RADIO', 'DIGITAL_ENDEC'];
        const added = new Set();

        function addOption(id) {
            const def = soxMacroDefs[id] || {};
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent =
                def.label ||
                id.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            macroSelect.appendChild(opt);
            added.add(id);
        }

        preferred.forEach((id) => {
            if (soxMacroDefs[id] && !added.has(id)) {
                addOption(id);
            }
        });

        ids
            .filter((id) => !added.has(id))
            .sort()
            .forEach((id) => addOption(id));

        if (previous && soxMacroDefs[previous]) {
            macroSelect.value = previous;
        } else if (soxMacroDefs.FLAT) {
            macroSelect.value = 'FLAT';
        } else {
            macroSelect.selectedIndex = 0;
        }
    }


    async function loadSoxMacroDefs() {
        try {
            const resp = await fetch('assets/splicer-sox-macros.json', { cache: 'no-store' });
            if (!resp.ok) {
                reportErrorStatus(`SoX macro JSON load failed (status ${resp.status}).`);
                return;
            }
            const json = await resp.json();
            soxMacroDefs = json || {};
            soxMacrosLoaded = true;
            const count = Object.keys(soxMacroDefs).length;
            if (count) {
                persistStatus(`Loaded ${count} SoX macros.`, true);
                populateMacroSelect();
            } else {
                reportErrorStatus('SoX macro JSON is empty.');
            }
        } catch (err) {
            reportErrorStatus(`Failed to load SoX macros JSON: ${err}`, err);
        }
    }


    function float32ToSoxRaw(pcm) {
        const out = new Int16Array(pcm.length);
        for (let i = 0; i < pcm.length; i++) {
            let s = pcm[i];
            s = Math.max(-1, Math.min(1, s));
            out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        return new Uint8Array(out.buffer);
    }

    async function renderMacroWithSox(pcm, sampleRate, macroId) {
        const id = (macroId || 'FLAT').toUpperCase();

        if (!soxMacrosLoaded || !soxMacroDefs[id]) {
            return null;
        }

        if (typeof window.SOXModule !== 'function') {
            reportErrorStatus('SoX engine is not available (SOXModule missing).');
            return null;
        }

        const macro = soxMacroDefs[id];
        if (!Array.isArray(macro.effects) || !macro.effects.length) {
            return null;
        }

        const raw = float32ToSoxRaw(pcm);

        const moduleConfig = {
            arguments: [
                '-r', String(sampleRate),
                '-L', '-e', 'signed-integer', '-b', '16', '-c', '1',
                'in.raw',
                'out.wav',
                ...macro.effects,
            ],
            preRun(mod) {
                (mod || moduleConfig).FS.writeFile('in.raw', raw);
            },
            postRun() {},
        };

        try {
            const maybePromise = window.SOXModule(moduleConfig);
            let modInstance = moduleConfig;

            if (maybePromise && typeof maybePromise.then === 'function') {
                modInstance = await maybePromise;
            } else if (maybePromise && maybePromise.FS) {
                modInstance = maybePromise;
            }

            const fs = modInstance.FS || moduleConfig.FS;
            if (!fs) {
                reportErrorStatus('SoX FS not available after module run.');
                return null;
            }

            const output = fs.readFile('out.wav', { encoding: 'binary' });
            return new Blob([output], { type: 'audio/wav' });
        } catch (err) {
            reportErrorStatus(`SoX render failed for macro \`${id}\`: ${err}`, err);
            return null;
        }
    }

    function encodeWavFromPcm(pcm, sampleRate) {
        const buffer = new ArrayBuffer(44 + pcm.length * 2);
        const view = new DataView(buffer);

        function writeString(offset, str) {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        }

        const length = pcm.length;

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length * 2, true);

        let offset = 44;
        for (let i = 0; i < length; i++, offset += 2) {
            let s = pcm[i];
            s = Math.max(-1, Math.min(1, s));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        }

        return new Blob([buffer], { type: 'audio/wav' });
    }

    async function renderMacroToWavFromPcm(pcm, sampleRate, macroId) {
        if (!pcm || !pcm.length) {
            reportErrorStatus('FX: cannot render macro – empty PCM data.');
            throw new Error('renderMacroToWavFromPcm: empty PCM data');
        }

        const id = macroId || 'FLAT';

        try {
            const soxBlob = await renderMacroWithSox(pcm, sampleRate, id);
            if (soxBlob) {
                return soxBlob;
            }
        } catch (err) {
            // skip
        }

        return encodeWavFromPcm(pcm, sampleRate);
    }

    window.EASSplicerFX = window.EASSplicerFX || {};
    window.EASSplicerFX.renderMacroToWavFromPcm = renderMacroToWavFromPcm;

    async function previewCurrentMacro() {
        if (typeof state === 'undefined' || !state.pcm || !state.pcm.length) {
            reportErrorStatus('No PCM data available to preview.');
            return;
        }

        if (previewMacroBtn) {
            previewMacroBtnWasDisabled = previewMacroBtn.disabled;
            setPreviewMacroButtonState('Rendering macro...', true);
        }

        const macroId = getSelectedMacroId();
        console.log('[Splicer] previewCurrentMacro macroId =', macroId);

        try {
            const blob = await renderMacroToWavFromPcm(
                state.pcm,
                state.sampleRate,
                macroId
            );

            if (playingSource) {
                stopPlayback();
            }

            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            let urlCleaned = false;
            const cleanupUrl = () => {
                if (urlCleaned) return;
                urlCleaned = true;
                URL.revokeObjectURL(url);
            };
            macroPreviewPlayback = { audio, cleanup: cleanupUrl, paused: false, macroId };

            audio.stop = () => {
                try {
                    audio.pause();
                } catch (err) {
                    reportErrorStatus(`Failed to pause macro preview audio: ${err}`);
                }
                try {
                    audio.currentTime = 0;
                } catch (err) {
                    reportErrorStatus(`Failed to reset macro preview audio position: ${err}`);
                }
                cleanupUrl();
            };

            const finalizePlayback = () => {
                cleanupUrl();
                if (macroPreviewPlayback?.audio === audio) {
                    clearMacroPreviewInterval();
                    macroPreviewPlayback = null;
                }
                if (playingSource === audio) {
                    playingSource = null;
                    playingMode = null;
                    pausedPlayback = null;
                    playSpan = 0;
                    playStartOffset = 0;
                    drawWaveform();
                    syncPlayButtons();
                    resetPreviewMacroButton();
                }
            };

            audio.addEventListener('ended', finalizePlayback);
            audio.addEventListener('error', (event) => {
                reportErrorStatus(
                    `Macro preview audio error: ${event?.error || event}`,
                    event?.error || event
                );
                finalizePlayback();
            });

            playingSource = audio;
            playingMode = 'macro-preview';
            pausedPlayback = null;
            setPreviewMacroButtonState('Pause Macro Preview', false);

            const ctxAudio = audioCtx || getAudioCtx();
            if (ctxAudio && ctxAudio.state === 'suspended' && typeof ctxAudio.resume === 'function') {
                try {
                    await ctxAudio.resume();
                } catch (err) {
                    reportErrorStatus(`Failed to resume audio context for macro preview: ${err}`);
                }
            }

            const ensureSpanFromAudio = () => {
                if (Number.isFinite(audio.duration) && audio.duration > 0) {
                    playSpan = Math.max(0.001, audio.duration);
                }
            };
            playSpan = Math.max(0.001, duration());
            ensureSpanFromAudio();
            audio.addEventListener('loadedmetadata', ensureSpanFromAudio, { once: true });

            playStartOffset = 0;
            playStartedAt = ctxAudio ? ctxAudio.currentTime : 0;
            syncPlayButtons();
            clearMacroPreviewInterval();
            macroPreviewMarkerInterval = setInterval(updatePlaybackMarker, 1);

            audio.play().catch((err) => {
                finalizePlayback();
                reportErrorStatus(`previewCurrentMacro playback failed: ${err}`, err);
            });
        } catch (err) {
            clearMacroPreviewInterval();
            macroPreviewPlayback = null;
            resetPreviewMacroButton();
            reportErrorStatus(`previewCurrentMacro failed: ${err}`, err);
        }
    }

    async function exportWavWithCurrentMacro() {
        if (typeof state === 'undefined' || !state.pcm || !state.pcm.length) {
            reportErrorStatus('FX: no PCM data available to export.');
            return;
        }

        const macroId = getSelectedMacroId();
        console.log('[Splicer] exportWavWithCurrentMacro macroId =', macroId);

        try {
            const blob = await renderMacroToWavFromPcm(
                state.pcm,
                state.sampleRate,
                macroId
            );

            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);

            let label = macroId;
            if (macroSelect && macroSelect.selectedIndex >= 0) {
                label = macroSelect.options[macroSelect.selectedIndex].text || macroId;
            }
            const safeLabel = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-');

            a.download = `splice-${safeLabel}.wav`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        } catch (err) {
            reportErrorStatus(
                `FX: exportWavWithCurrentMacro failed for macro '${macroId}'.`,
                err
            );
        }
    }

    if (macroSelect) {
        macroSelect.addEventListener('change', () => {
            invalidateMacroPreview();
        });
    }

    if (previewMacroBtn) {
        previewMacroBtn.addEventListener('click', async () => {
            const currentMacroId = getSelectedMacroId();
            const mismatch = macroPreviewPlayback?.macroId && macroPreviewPlayback.macroId !== currentMacroId;
            if (mismatch) {
                invalidateMacroPreview();
            }
            if (playingSource && playingMode === 'macro-preview') {
                pauseMacroPreview();
                return;
            }
            if (macroPreviewPlayback?.audio && (macroPreviewPlayback.audio.paused || macroPreviewPlayback.paused)) {
                const resumed = await resumeMacroPreview();
                if (resumed) return;
            }
            previewCurrentMacro();
        });
    }

    if (exportMacroBtn) {
        exportMacroBtn.addEventListener('click', () => {
            exportWavWithCurrentMacro();
        });
    }

    await loadSoxMacroDefs();
    bindEvents();
    updateSelectionLabels();
    drawWaveform();
    restoreFromCache();
    await getVoiceList();
})();
