(() => {
    const panel = document.getElementById('splice-panel');
    const canvas = document.getElementById('spliceWaveform');
    if (!panel || !canvas) return;

    const ctx = canvas.getContext('2d');
    const fileInput = panel.querySelector('[data-splice-file]');
    const ttsInput = panel.querySelector('#ttsText2') || panel.querySelector('.ttsText');
    const ttsButton = panel.querySelector('[data-splice-tts-generate]') || panel.querySelector('#tts button');
    const ttsStatus = panel.querySelector('[data-splice-tts-status]') || panel.querySelector('#tts [data-splice-tts-status]');
    const voiceSelect = panel.querySelector('#ttsVoice2');
    const overrideTzSelect = panel.querySelector('#useOverrideTZ');
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
    canvas.style.touchAction = 'none';

    const DB_NAME = 'eas-splicer';
    const STORE = 'projects';
    const CACHE_KEY = 'current';
    const PIPER_BUNDLE_URL = 'assets/piper-tts/piper.tts.bundle.js';
    const PIPER_VOICE = 'en_US-joe-medium';
    const voiceBackendMap = {};
    let playBtnClicks = 0;
    let playAllBtnClicks = 0;

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
    let cacheDbPromise = null;
    let ttsLoader = null;
    let voiceListLoaded = false;

    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

    const persistStatus = (msg, ok = true) => {
        if (!persistLabel) return;
        persistLabel.textContent = msg;
        persistLabel.style.color = ok ? '#7ae37a' : '#f48383';
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
            console.error('Failed clearing cache', err);
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
        selLenLabel.textContent = `${Math.max(0, end - start).toFixed(2)}s`;
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
        const dur = (seg.pcm.length / state.sampleRate).toFixed(2);
        const base = `${idx + 1}. ${seg.label || 'Segment'}`;
        const text = (seg.sourceText || '').trim();
        const textPart = text ? ` — "${text.length > 48 ? `${text.slice(0, 48)}…` : text}"` : '';
        return `${base}${textPart} — ${dur}s`;
    };

    const moveSegment = (from, to) => {
        if (from === to || from < 0 || to < 0 || from >= state.segments.length || to >= state.segments.length) return;
        const [item] = state.segments.splice(from, 1);
        state.segments.splice(to, 0, item);
        rebuildTimeline();
    };

    const updateSegmentsList = () => {
        segmentsList.innerHTML = '';
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
        ctx.fillStyle = '#0b0b0b';
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

    const stopPlayback = () => {
        if (playingSource) {
            try { playingSource.stop(); } catch (err) { console.warn(err); }
        }
        playingSource = null;
        playingMode = null;
        pausedPlayback = null;
        playSpan = 0;
    };

    const pausePlayback = () => {
        if (!playingSource) return;
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
            console.warn(err);
        }
        playingSource = null;
        playingMode = null;
    };

    const playSelection = async () => {
        if (!state.pcm.length) return;
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
        pausedPlayback = null;
        source.onended = () => {
            playingSource = null;
            playingMode = null;
            pausedPlayback = null;
            playSpan = 0;
            playStartOffset = 0;
            playBtnClicks = 0;
            if (playBtn) playBtn.textContent = 'Play Selection';
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
        pausedPlayback = null;
        source.onended = () => {
            playingSource = null;
            playingMode = null;
            pausedPlayback = null;
            playSpan = 0;
            playStartOffset = 0;
            playAllBtnClicks = 0;
            if (playAllBtn) playAllBtn.textContent = 'Play All';
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

    const exportWav = () => {
        if (!state.pcm.length) return;
        const blob = pcmToWav(state.pcm, state.sampleRate);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'splice.wav';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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

    const synthTts = async (text) => {
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

            xhr.onload = function() {
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
                                audioContext.close().catch(() => {});
                            }
                            resolve({ pcm: buffer.getChannelData(0), sampleRate: buffer.sampleRate });
                        }).catch((error) => {
                            if (typeof audioContext.close === "function") {
                                audioContext.close().catch(() => {});
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

            xhr.onerror = function() {
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
                        newStart = newEnd - (panState.viewEnd - panState.viewStart);
                        newStart = Math.max(0, newStart);
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

        const resetTouchState = () => {
            dragMode = null;
            touchSelectionId = null;
            pinchState = null;
        };

        canvas.addEventListener('touchstart', (event) => {
            if (event.cancelable) event.preventDefault();
            if (!state.pcm.length) return;
            syncViewWindow();
            const rect = canvas.getBoundingClientRect();
            if (event.touches.length === 1) {
                const touch = event.touches[0];
                const xRatio = clamp((touch.clientX - rect.left) / rect.width, 0, 1);
                const viewSpan = state.viewEnd - state.viewStart;
                const t = clamp(state.viewStart + viewSpan * xRatio, 0, duration());
                const distStart = Math.abs(t - state.selection.start);
                const distEnd = Math.abs(t - state.selection.end);
                dragMode = distStart < distEnd ? 'start' : 'end';
                setSelection(dragMode === 'start' ? t : state.selection.start, dragMode === 'end' ? t : state.selection.end);
                touchSelectionId = touch.identifier;
                pinchState = null;
            } else if (event.touches.length === 2) {
                const a = event.touches[0];
                const b = event.touches[1];
                const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
                pinchState = { lastDist: Math.max(1, dist) };
                dragMode = null;
                touchSelectionId = null;
            } else {
                resetTouchState();
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (event) => {
            if (event.cancelable) event.preventDefault();
            if (!state.pcm.length) return;
            const rect = canvas.getBoundingClientRect();
            if (event.touches.length === 1 && touchSelectionId !== null) {
                let touch = null;
                for (let i = 0; i < event.touches.length; i++) {
                    if (event.touches[i].identifier === touchSelectionId) {
                        touch = event.touches[i];
                        break;
                    }
                }
                if (!touch) return;
                const viewSpan = state.viewEnd - state.viewStart;
                const nx = clamp((touch.clientX - rect.left) / rect.width, 0, 1);
                const nt = clamp(state.viewStart + viewSpan * nx, 0, duration());
                if (dragMode === 'start') setSelection(nt, state.selection.end);
                else setSelection(state.selection.start, nt);
            } else if (event.touches.length === 2 && pinchState) {
                const a = event.touches[0];
                const b = event.touches[1];
                const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
                const span = state.viewEnd - state.viewStart;
                const ratio = clamp(pinchState.lastDist / Math.max(1, dist), 0.2, 5);
                const newSpan = clamp(span * ratio, state.minViewSpan, duration());
                const centerRatio = clamp((((a.clientX + b.clientX) / 2) - rect.left) / rect.width, 0, 1);
                const center = state.viewStart + span * centerRatio;
                let newStart = center - newSpan * centerRatio;
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
                pinchState.lastDist = Math.max(1, dist);
                drawWaveform();
            }
        }, { passive: false });

        canvas.addEventListener('touchend', resetTouchState);
        canvas.addEventListener('touchcancel', resetTouchState);

        fileInput?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
        });

        playBtn?.addEventListener('click', () => {
            playBtnClicks++;
            if (playBtnClicks % 2 === 1) {
                playBtn.textContent = 'Pause Selection';
                playSelection();
            } else {
                playBtn.textContent = 'Play Selection';
                pausePlayback();
            }
        });

        playAllBtn?.addEventListener('click', () => {
            playAllBtnClicks++;
            if (playAllBtnClicks % 2 === 1) {
                playAllBtn.textContent = 'Pause All';
                playWholeFile();
            } else {
                playAllBtn.textContent = 'Play All';
                pausePlayback();
            }
        });
        stopBtn?.addEventListener('click', stopPlayback);
        trimBtn?.addEventListener('click', trimToSelection);
        deleteBtn?.addEventListener('click', deleteSelection);
        splitBtn?.addEventListener('click', saveSelectionAsSegment);
        exportBtn?.addEventListener('click', exportWav);
        clearBtn?.addEventListener('click', () => {
            stopPlayback();
            state.segments = [];
            state.pcm = new Float32Array(0);
            setSelection(0, 0);
            updateSegmentsList();
            drawWaveform();
            clearCache();
            persistStatus('Project cleared');
        });

        silenceBtn?.addEventListener('click', addSilence);
        splitSelectionBtn?.addEventListener('click', splitAtSelection);
        joinAllBtn?.addEventListener('click', joinAllSegments);

        ttsButton?.addEventListener('click', async () => {
            const text = (ttsInput?.value || '').trim();
            const selectedVoice = (voiceSelect?.value || 'wasm').trim();
            const tz = (overrideTzSelect?.value || 'UTC').trim();
            if (!text) {
                if (ttsStatus) ttsStatus.textContent = 'Enter text to synthesize.';
                return;
            }
            if (selectedVoice === 'EMNet' && !checkZCZCIsValid(text)) {
                if (ttsStatus) ttsStatus.textContent = 'EMNet requires a valid SAME header string.';
                return;
            }
            ttsButton.disabled = true;
            if (ttsStatus) ttsStatus.textContent = 'Generating…';
            try {
                if (selectedVoice === 'wasm') {
                    const { pcm, sampleRate } = await synthTts(text);
                    addSegment(pcm, sampleRate, 'TTS', text);
                    if (ttsStatus) ttsStatus.textContent = `Added ${(pcm.length / (sampleRate || state.sampleRate)).toFixed(2)}s of audio.`;
                    resetViewWindow();
                    drawWaveform();
                } else {
                    const valid = validateTtsText(selectedVoice, text);
                    if (!valid) {
                        if (ttsStatus) ttsStatus.textContent = 'Text contains invalid phonemes for this backend.';
                        return;
                    }
                    const result = await fetchRemoteTtsAudio({ text, voiceId: selectedVoice, overrideTZ: tz });
                    if (result?.pcm?.length) {
                        addSegment(result.pcm, result.sampleRate, 'TTS', text);
                        if (ttsStatus) ttsStatus.textContent = `Added ${(result.pcm.length / (result.sampleRate || state.sampleRate)).toFixed(2)}s of audio.`;
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

    const restoreFromCache = async () => {
        const payload = await loadProject();
        if (!payload || !payload.segments?.length) {
            persistStatus('No cached project found yet.');
            drawWaveform();
            updateSegmentsList();
            return;
        }
        state.sampleRate = payload.sampleRate || state.sampleRate;
        state.segments = payload.segments.map((s) => ({
            id: s.id || `seg-${Math.random().toString(16).slice(2)}`,
            label: s.label,
            pcm: new Float32Array(s.pcm),
            sourceText: s.sourceText || '',
        }));
        rebuildTimeline();
        persistStatus('Restored cached project.');
    };

    bindEvents();
    updateSelectionLabels();
    drawWaveform();
    restoreFromCache();
    getVoiceList();
})();
