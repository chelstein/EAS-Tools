if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.message, event.filename, event.lineno, event.error);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled rejection:', event.reason);
  });
}

(async function () {
    let encoderTextEditor = null;

    function initEncoderTextEditor() {
        if (encoderTextEditor || !window.CodeMirror) return encoderTextEditor;

        const encoderTextArea = document.getElementById('ttsText');
        if (!encoderTextArea) return null;

        const encoderEditor = CodeMirror.fromTextArea(encoderTextArea, {
            lineNumbers: true,
            mode: 'text/xml',
            matchBrackets: true,
            theme: 'abbott',
            lineWrapping: true,
        });

        encoderEditor.setSize('27vw', '15rem');

        const encoderWrapper = encoderEditor.getWrapperElement();
        encoderWrapper.classList.add('ttsText', 'ttsText--editor');

        encoderEditor.on('change', () => {
            encoderEditor.save();
            window.ttsText = encoderEditor.getValue().trim();
        });

        encoderTextEditor = encoderEditor;
        return encoderEditor;
    }

    window.encoderEditor = initEncoderTextEditor();
    window.encoderEditor.refresh();
})();

async function fetchAndStore() {
    function processSameCodes(sameCodes) {
        window.rgn = {};
        window.state = {};
        window.county = {};
        window.abbrvs = {
            "United States": "US",
            "Alabama": "AL",
            "Alaska": "AK",
            "Arizona": "AZ",
            "Arkansas": "AR",
            "California": "CA",
            "Colorado": "CO",
            "Connecticut": "CT",
            "Delaware": "DE",
            "District of Columbia": "DC",
            "Florida": "FL",
            "Georgia": "GA",
            "Hawaii": "HI",
            "Idaho": "ID",
            "Illinois": "IL",
            "Indiana": "IN",
            "Iowa": "IA",
            "Kansas": "KS",
            "Kentucky": "KY",
            "Louisiana": "LA",
            "Maine": "ME",
            "Maryland": "MD",
            "Massachusetts": "MA",
            "Michigan": "MI",
            "Minnesota": "MN",
            "Mississippi": "MS",
            "Missouri": "MO",
            "Montana": "MT",
            "Nebraska": "NE",
            "Nevada": "NV",
            "New Hampshire": "NH",
            "New Jersey": "NJ",
            "New Mexico": "NM",
            "New York": "NY",
            "North Carolina": "NC",
            "North Dakota": "ND",
            "Ohio": "OH",
            "Oklahoma": "OK",
            "Oregon": "OR",
            "Pennsylvania": "PA",
            "Rhode Island": "RI",
            "South Carolina": "SC",
            "South Dakota": "SD",
            "Tennessee": "TN",
            "Texas": "TX",
            "Utah": "UT",
            "Vermont": "VT",
            "Virginia": "VA",
            "Washington": "WA",
            "West Virginia": "WV",
            "Wisconsin": "WI",
            "Wyoming": "WY",
            "American Samoa": "AS",
            "Guam": "GU",
            "Northern Mariana Islands": "MP",
            "Puerto Rico": "PR",
            "U.S. Virgin Islands": "VI",
        };

        for (const code in sameCodes['SUBDIV']) {
            const name = sameCodes['SUBDIV'][code];
            window.rgn[code] = name;
        }

        for (const code in sameCodes['SAME']) {
            let stcode = code.slice(0, 2);
            let countycode = code.slice(2);
            const name = sameCodes['SAME'][code];
            window.county[stcode] = window.county[stcode] || {};
            window.county[stcode][countycode] = name;
            if (countycode === '000') {
                let statename = name.replace(/^State of /, '').trim();
                const abbrv = window.abbrvs[statename] || statename;
                window.state[stcode] = abbrv;
            }
        }
    }

    const response = await fetch('assets/E2T/same-us.json');
    const data = await response.json();
    processSameCodes(data);
}

(async function () {
    'use strict';
    // Encoder bundle

    await fetchAndStore().catch((error) => {
        console.error('Error fetching and storing data:', error);
    });

    const rgn = window.rgn || {};
    const state = window.state || {};
    const county = window.county || {};

    // BEGIN encode/audio.js
    var context = new AudioContext();
    var gain = context.createGain();
    gain.gain.value = 0.25;
    gain.connect(context.destination);
    var AFSK_TIME = 0.00192;
    var SPACE_FREQ = 1562.5;
    var MARK_FREQ = 2083.3;
    var SAMPLE_RATE = 44100;
    var NRW_WAT_FREQ = 1050;
    var WAT_FREQ_1 = 853;
    var WAT_FREQ_2 = 960;
    var EOM = "NNNN";
    var HEADER = "ZCZC";
    var PREAMBLE = 0xD5; //0xab read from lsb to msb
    var samples = [];
    var afsklen = SAMPLE_RATE * 0.00192;

    let markArray = []; //these have the samples for each afsk freq
    let spaceArray = [];

    function calcAFSKArray() {
        for (let i = 0; i < afsklen; i++) {
            let m = Math.sin((i / SAMPLE_RATE) * 2 * Math.PI * MARK_FREQ);
            let s = Math.sin((i / SAMPLE_RATE) * 2 * Math.PI * SPACE_FREQ);
            if (cl) {
                if (s > 0.79) {
                    s = 0.79;
                } else if (s < -0.79) {
                    s = -0.79;
                }
                if (m > 0.79) {
                    m = 0.79;
                } else if (m < -0.79) {
                    m = -0.79;
                }
            }
            markArray[i] = m;
            spaceArray[i] = s;
        }
    }

    function generate_afsk(message) {
        for (let i = 0; i < message.length; i++) {
            generate_afsk_tone(message[i]);
        }
    }

    //cache the two frequencies
    function generate_tone(freq, length) {
        for (let i = 0; i < length; i++) {
            let s = Math.sin((i / SAMPLE_RATE) * 2 * Math.PI * freq);
            if (cl) {
                if (s > 0.79) {
                    s = 0.79;
                } else if (s < -0.79) {
                    s = -0.79;
                }
            }
            samples.push(s);
        }
    }

    function generate_afsk_tone(bit) {
        const sl = samples.length;
        const copyArray = bit ? markArray : spaceArray;
        for (let i = 0; i < afsklen; i++) {
            samples[sl + i] = copyArray[i];
        }
    }

    function generate_dual_tone(freq1, freq2, length) {
        for (let i = 0; i < length; i++) {
            let s = 0.5 * (Math.sin((i * 2 * Math.PI * freq1) / SAMPLE_RATE) + Math.sin((i * 2 * Math.PI * freq2) / SAMPLE_RATE));
            if (cl) {
                if (s > 0.79) {
                    s = 0.79;
                } else if (s < -0.79) {
                    s = -0.79;
                }
            }
            samples.push(s);
        }
    }

    function generate_silence(length) {
        for (let i = 0; i < length; i++) {
            samples.push(0);
        }
    }

    const PIPER_BUNDLE_URL = 'assets/piper-tts/piper.tts.bundle.js';
    const ORT_WASM_BASE = 'assets/piper-tts/onnxruntime-web/';

    const PIPER_VOICE_ID = 'en_US-joe-medium';

    const PIPER_VOICE = {
        modelUrl: 'assets/piper-tts/voices/en_US-joe-medium.onnx',
        configUrl: 'assets/piper-tts/voices/en_US-joe-medium.onnx.json',
    };

    let __piperLoading = null;

    async function ensurePiperLoaded() {
        if (window.PiperTTS?.pcmFor || window.PiperTTS?.predict) return;

        if (!__piperLoading) {
            __piperLoading = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = PIPER_BUNDLE_URL;
                s.async = true;
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }
        await __piperLoading;

        if (window.ort?.env?.wasm) {
            window.ort.env.wasm.wasmPaths = ORT_WASM_BASE;
        }

        const HF_URL_HINT = '/rhasspy/piper-voices/resolve';
        const origFetch = window.fetch.bind(window);

        window.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : (input?.url || '');
            if (url.includes(HF_URL_HINT) || /voices(\.json)?$/.test(url)) {
                const manifest = {};
                manifest[PIPER_VOICE_ID] = { model: PIPER_VOICE.modelUrl, config: PIPER_VOICE.configUrl };
                return new Response(new Blob([JSON.stringify(manifest)], { type: 'application/json' }), { status: 200 });
            }
            return origFetch(input, init);
        };

        if (window.PiperTTS?.init) {
            try {
                await window.PiperTTS.init({ voiceId: PIPER_VOICE_ID, warmup: false });
            } catch {
                addStatus('PiperTTS: init failed.', "ERROR");
            }
        }
    }

    const NANO_TTS_LANGUAGE = 'en-US';
    const NANO_TTS_VOLUME = 0.5;
    const NANO_TTS_WORKER_URL = new URL('./text2wav-worker.js', import.meta.url);
    const nanoTtsState = {
        worker: null,
        ready: false,
        queue: [],
        currentJob: null,
    };

    const reportNanoTtsStatus = (message, level = "LOG") => {
        if (!message) return;
        addStatus(`NanoTTS: ${message}`, level);
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
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        try {
            const buffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
            const pcm = buffer.getChannelData(0);
            const copy = new Float32Array(pcm.length);
            copy.set(pcm);
            job.resolve({ pcm: copy, sampleRate: buffer.sampleRate });
        } catch (error) {
            job.reject(error);
        } finally {
            if (typeof audioContext.close === "function") {
                audioContext.close().catch(() => {});
            }
            nanoTtsState.currentJob = null;
            startNextNanoTtsJob();
        }
    };

    const handleNanoTtsWorkerError = (message, fatal = false) => {
        const error = message instanceof Error ? message : new Error(message || 'NanoTTS error');
        reportNanoTtsStatus(error.message, "ERROR");
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
        if (data.type === "ready") {
            nanoTtsState.ready = true;
            reportNanoTtsStatus("Local voice ready.");
            startNextNanoTtsJob();
            return;
        }
        if (data.type === "progress") {
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

    function synthNanoTts(text) {
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
    }

    function dbToLin(db) { return Math.pow(10, db / 20); }

    function normalizeTtsPcm(pcm, { targetDb = -3, maxGainDb = 24, softClip = true, softClipK = 1.5 } = {}) {
        if (!pcm || !pcm.length) return pcm;

        let peak = 0;

        for (let i = 0; i < pcm.length; i++) {
            const a = Math.abs(pcm[i]);
            if (a > peak) peak = a;
        }

        if (peak <= 1e-8) return pcm;

        const target = dbToLin(targetDb);
        let gain = target / peak;
        const maxGain = dbToLin(maxGainDb);

        if (gain > maxGain) gain = maxGain;

        const out = new Float32Array(pcm.length);

        if (softClip) {
            const k = softClipK;
            const denom = Math.tanh(k);
            for (let i = 0; i < pcm.length; i++) {
                const x = pcm[i] * gain;
                out[i] = Math.tanh(k * x) / denom;
            }
        }

        else {
            for (let i = 0; i < pcm.length; i++) {
                let x = pcm[i] * gain;
                if (x > 0.999) x = 0.999; else if (x < -0.999) x = -0.999;
                out[i] = x;
            }
        }

        return out;
    }


    async function getPiperPcm(text, targetRate) {
        if (!text || !text.trim()) return null;

        await ensurePiperLoaded();

        addStatus("Generating local TTS audio... this may take a while, especially if your text is longer than a few sentences.");

        if (window.PiperTTS?.pcmFor) {
            return await window.PiperTTS.pcmFor(text, PIPER_VOICE_ID, targetRate);
        }

        let wavBlob = null;

        if (window.PiperTTS?.synthToWavBlob) {
            wavBlob = await window.PiperTTS.synthToWavBlob(text);
        }

        else {
            addStatus('PiperTTS: no synthToWavBlob/pcmFor found.', "WARN");
            return null;
        }

        if (window.wavefile?.WaveFile) {
            const WaveFile = window.wavefile.WaveFile;
            const ab = await wavBlob.arrayBuffer();
            let w = new WaveFile(new Uint8Array(ab));

            if (w.fmt.sampleRate !== targetRate) {
                w.toSampleRate(targetRate, { algorithm: 'sinc' });
            }

            w.toBitDepth('32f');
            const f64 = w.getSamples();
            return new Float32Array(f64);
        }

        if (window.PiperTTS?.wavBlobToPcm) {
            const { pcm, sampleRate } = await window.PiperTTS.wavBlobToPcm(wavBlob);

            if (sampleRate === targetRate) return pcm;

            const ratio = sampleRate / targetRate, out = new Float32Array(Math.round(pcm.length / ratio));

            for (let i = 0; i < out.length; i++) {
                const x = i * ratio, xi = Math.floor(x), xf = x - xi;
                const a = pcm[xi] ?? 0, b = pcm[xi + 1] ?? a;
                out[i] = a + (b - a) * xf;
            }

            return out;
        }

        addStatus('No decoder for WAV to PCM.', "WARN");
        return null;
    }

    function appendPcmToSamples(pcm) {
        if (!pcm) return;
        for (let i = 0; i < pcm.length; i++) {
            let s = pcm[i];
            if (s > 0.99) s = 0.99;
            else if (s < -0.99) s = -0.99;
            samples.push(s);
        }
    }

    // END encode/audio.js
    // BEGIN encode/utils.js
    var wav = new wavefile.WaveFile();

    function zero_pad_int(num, totalLength) {
        return num.toString().padStart(totalLength, '0');
    }

    function getDay(date) { return zero_pad_int(Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24), 3); }

    function getHour(date) { return zero_pad_int(date.getUTCHours(), 2); }

    function getMinute(date) { return zero_pad_int(date.getUTCMinutes(), 2); }

    function bytetobits(byteArray) {
        const bitsArray = [];
        for (let i = 0; i < byteArray.length; i++) {
            let byte = byteArray[i];
            for (let j = 7; j >= 0; j--) {
                bitsArray.push((byte & (1 << j)) >> j);
            }
        }
        return bitsArray;
    }

    function genPreamble() {
        const byteArray = new Uint8Array(16);
        byteArray.fill(PREAMBLE);
        return byteArray;
    }

    function extraspace() { generate_afsk(Array(15).fill(0, 0, 15)); }

    function preamble() {
        return bytetobits(genPreamble());
    }

    function extramarks() { generate_afsk([1, 1, 1, 1, 1, 1]); }

    function getLocalDT(currentLocalDateTime) {
        const year = currentLocalDateTime.getFullYear();
        const month = ('0' + (currentLocalDateTime.getMonth() + 1)).slice(-2);
        const day = ('0' + currentLocalDateTime.getDate()).slice(-2);
        const hours = ('0' + currentLocalDateTime.getHours()).slice(-2);
        const minutes = ('0' + currentLocalDateTime.getMinutes()).slice(-2);
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    function genArray(str) {
        let pre = preamble();
        let byteData = [];
        for (let j = 0; j < str.length; j++) {
            for (let i = 0; i < 8; i++) {
                if ((str.charCodeAt(j) >> i) & 1) {
                    byteData.push(1);
                } else {
                    byteData.push(0);
                }
            }
        }
        let b = pre.concat(byteData);
        return b;
    }

    function getMinNodes() {
        var m = [0, 15, 30, 45]; if (hr > 0) {
            var m = [0, 30];
        } if (hr > 5) { var m = [0]; }
        var nodes = [];
        m.forEach(e => { var o = document.createElement("option"); o.innerHTML = e.toString().padStart(2, "0"); o.value = e; nodes.push(o); }); return nodes;
    }

    function saveToWav() {
        addStatus("Generating wav file...");
        wav.fromScratch(1, SAMPLE_RATE, '32', samples.map(e => {
            return e * (2147483647 / 2);
        }));
        const wavBuffer = wav.toBuffer().buffer;
        const wavBlob = new Blob([new DataView(wavBuffer)], { type: 'audio/wav' });
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(wavBlob);
        downloadLink.download = 'eas.wav';
        downloadLink.click();
        addStatus("Download started...");
    }

    // END encode/utils.js
    // BEGIN encode/alert.js
    function create_eom_tones() {
        var eom = genArray(EOM);
        generate_silence(SAMPLE_RATE);
        for (var i = 0; i < 3; i++) {
            generate_afsk(eom);
            generate_silence(SAMPLE_RATE);
        }
    }

    function create_header_tones(header) {
        var he = genArray(header);
        //generate_silence(SAMPLE_RATE);
        for (var i = 0; i < 3; i++) {
            if (em) { extramarks(); }
            generate_afsk(he);
            if (em) { extramarks(); }
            if (es) { extraspace(); }
            generate_silence(SAMPLE_RATE);
        }
    }

    function create_header_string(origin, event, locations, length, date, par) {
        var h = "";
        h += HEADER;
        h += "-";
        h += origin;
        h += "-";
        h += event;
        for (var i = 0; i < locations.length; i++) {
            h += "-";
            h += zero_pad_int(locations[i], 6);
        }
        h += "+";
        h += length;
        h += "-";
        h += getDay(date);
        h += getHour(date);
        h += getMinute(date);
        h += "-";
        h += par;
        h += "-";
        return h;
    }

    function create_wat() {
        generate_dual_tone(WAT_FREQ_1, WAT_FREQ_2, SAMPLE_RATE * tlen);
    }

    function create_nwr_tone() {
        generate_tone(1050, SAMPLE_RATE * tlen);
    }

    const voiceBackendMap = {};

    async function getVoiceList() {
        const url = "https://wagspuzzle.space/tools/eas-tts/index.php?handler=toolkit&voicelist=true";
        const voiceListElement = document.getElementById("ttsVoice");

        try {
            const response = await fetch(url);
            const data = await response.json();

            for (const [voiceId, voiceName] of Object.entries(data.voices)) {
                if (voiceName.toLowerCase().includes("emnet")) {
                    const option = document.createElement("option");
                    option.value = voiceId;
                    option.textContent = "[EMNet] EMNet (uses generated headers as input)";
                    voiceListElement.appendChild(option);
                }

                else {
                    const backendMatch = voiceName.match(/\[(.*?)\]/);
                    let backend = backendMatch ? backendMatch[1] : "Unknown";

                    if(voiceName.toLowerCase().includes("bal/spfy")) {
                        backend = "BAL";
                    }

                    if (!voiceBackendMap[backend]) {
                        voiceBackendMap[backend] = [];
                    }

                    voiceBackendMap[backend].push(voiceId);
                    const option = document.createElement("option");
                    option.value = voiceId;
                    option.textContent = voiceName;
                    voiceListElement.appendChild(option);
                }
            }
        }

        catch (error) {
            console.error("Error fetching voice list:", error);
            addStatus("Error fetching voice list: " + error.message + ". There will not be any voices available from the TTS service, only the in-browser WebAssembly voice.", "ERROR");
        }

        voiceListElement.dispatchEvent(new Event('change'));
    }

    async function getAudioFromPage(response) {
        const decoder = new TextDecoder("utf-8");
        const responseText = decoder.decode(response);
        const audioMatch = responseText.match(/id="downloadlink"><a href="(.*)" download/i);
        const jsonMatch = responseText.match(/<span id="jsonErrorMsg">(.*)</i);

        if (jsonMatch && jsonMatch[1]) {
            var cleanMatch = jsonMatch[1].replace(/.*Exact error: (.*)/, "$1");
            if (cleanMatch != '') {
                addStatus("TTS Generation Error: " + cleanMatch, "ERROR");
            }
            else {
                addStatus("TTS Generation Error: " + jsonMatch[1], "ERROR");
            }
            return null;
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
    }

    function checkZCZCIsValid(header) {
        const zczcPattern = /^ZCZC-([A-Z]{3})-([A-Z]{3})-((?:\d{6}(?:-?)){1,31})\+(\d{4})-(\d{7})-([A-Za-z0-9\/ ]{0,8})-?$/;
        return zczcPattern.test(header);
    }

    async function validateTtsText() {
        const requiredBackend = Object.keys(voiceBackendMap).find(backend => voiceBackendMap[backend].includes(window.ttsVoice));
        const normalizedBackend = requiredBackend ? requiredBackend.toLowerCase() : "";
        let ttsText = window.ttsText || "";
        const usesBalPhonemes = /<\s*\/?\s*(silence|pron|phoneme)/i.test(ttsText);
        const usesVtmlTags = /<\s*\/?\s*vtml/i.test(ttsText);
        const usesDtPhonemes = /\[:phoneme/i.test(ttsText);

        if (normalizedBackend.includes("bal")) {
            if (usesVtmlTags || usesDtPhonemes) {
                alert("BAL backend cannot include VT or DT phoneme markup.");
                return false;
            }

            if (usesBalPhonemes && !/<(silence|pron|phoneme).*/i.test(ttsText)) {
                alert("TTS Text contains invalid BAL phonemes or formatting.");
                return false;
            }

            if (ttsText.match(/“|”/)) {
                // We can try and fix the smart quotes
                ttsText = ttsText.replace(/“|”/g, '"');
                window.ttsText = ttsText;
                return true;
            }
        }
        else if (normalizedBackend.includes("vt")) {
            if (usesBalPhonemes || usesDtPhonemes) {
                alert("VT backend cannot include BAL or DT phoneme markup.");
                return false;
            }

            if (usesVtmlTags && !/<vtml.*/i.test(ttsText)) {
                alert("TTS Text contains invalid VT phonemes or formatting.");
                return false;
            }

            if (ttsText.match(/“|”/)) {
                // We can try and fix the smart quotes
                ttsText = ttsText.replace(/“|”/g, '"');
                window.ttsText = ttsText;
                return true;
            }
        }
        else if (normalizedBackend.includes("dt")) {
            if (usesBalPhonemes || usesVtmlTags) {
                alert("DT backend cannot include BAL or VT phoneme markup.");
                return false;
            }

            if (usesDtPhonemes && !/\[phoneme :on].*/i.test(ttsText)) {
                alert("TTS Text contains invalid DT phonemes or formatting.");
                return false;
            }
        }
        return true;
    }

    const resamplePcm = (pcm, sourceRate, targetRate) => {
        if (sourceRate === targetRate) {
            return pcm;
        }

        const ratio = sourceRate / targetRate;
        const newLength = Math.max(1, Math.round(pcm.length / ratio));
        const resampled = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) {
            const position = i * ratio;
            const index = Math.floor(position);
            const nextIndex = Math.min(index + 1, pcm.length - 1);
            const frac = position - index;
            resampled[i] = pcm[index] + (pcm[nextIndex] - pcm[index]) * frac;
        }

        return resampled;
    };

    async function webTTSGenerate(useOverrideTZ, header) {
        addStatus("Generating TTS audio using web request, this may take a while...");

        return new Promise((resolve) => {
            let settled = false;

            const safeResolve = () => {
                if (!settled) {
                    settled = true;
                    resolve();
                }
            };

            const finishWithSilence = () => {
                generate_silence(SAMPLE_RATE);
                safeResolve();
            };

            const handleDecodeError = (error) => {
                console.error("Error decoding TTS audio:", error);
                addStatus("Error decoding TTS audio. There will instead be silence.", "ERROR");
                finishWithSilence();
            };

            const xhr = new XMLHttpRequest();
            const url = "https://wagspuzzle.space/tools/eas-tts/index.php?handler=toolkit";

            const params = new URLSearchParams();
            params.append("text", window.ttsVoice === "EMNet" ? header : window.ttsText);
            params.append("voice", window.ttsVoice);
            params.append("useOverrideTZ", useOverrideTZ ?? "UTC");

            xhr.open("POST", url, true);
            xhr.responseType = "arraybuffer";
            xhr.setRequestHeader("Accept", "*/*");
            xhr.setRequestHeader("User-Agent", "EAS-Tools/wagwan-piffting-blud.github.io");
            xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300 && xhr.getResponseHeader("Content-Type") === "audio/wav") {
                    const rawPayload = xhr.response ?? xhr.responseText;

                    const toArrayBuffer = (payload) => {
                        if (payload instanceof ArrayBuffer) {
                            return Promise.resolve(payload);
                        }

                        if (payload instanceof Blob) {
                            return payload.arrayBuffer();
                        }

                        if (typeof payload === "string") {
                            const withoutPrefix = payload.replace(/^data:audio\/[\w.+-]+;base64,/, "");
                            const candidate = withoutPrefix.replace(/\s/g, "");

                            return new Promise((resolvePayload, rejectPayload) => {
                                try {
                                    const binary = atob(candidate);
                                    const buffer = new ArrayBuffer(binary.length);
                                    const bytes = new Uint8Array(buffer);

                                    for (let i = 0; i < binary.length; i++) {
                                        bytes[i] = binary.charCodeAt(i);
                                    }

                                    resolvePayload(buffer);
                                    return;
                                } catch (error) {
                                    try {
                                        const buffer = new ArrayBuffer(withoutPrefix.length);
                                        const bytes = new Uint8Array(buffer);

                                        for (let i = 0; i < withoutPrefix.length; i++) {
                                            bytes[i] = withoutPrefix.charCodeAt(i) & 0xff;
                                        }

                                        resolvePayload(buffer);
                                        return;
                                    }

                                    catch (fallbackError) {
                                        rejectPayload(error);
                                    }
                                }
                            });
                        }
                        return Promise.reject(new TypeError("Unsupported payload type"));
                    };

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

                            const pcm = resamplePcm(buffer.getChannelData(0), buffer.sampleRate, SAMPLE_RATE);

                            const normalizedPcm = normalizeTtsPcm(pcm, { targetDb: 3, maxGainDb: 24, softClip: cl, softClipK: 1.6 });

                            generate_silence(Math.floor(SAMPLE_RATE * 0.25));
                            appendPcmToSamples(normalizedPcm);
                            generate_silence(Math.floor(SAMPLE_RATE * 0.25));

                            safeResolve();
                        }).catch((error) => {
                            if (typeof audioContext.close === "function") {
                                audioContext.close().catch(() => {});
                            }
                            handleDecodeError(error);
                        });
                    }).catch(handleDecodeError);
                }

                else if (xhr.getResponseHeader("Content-Type") === "application/json") {
                    let responseJSON = {};

                    try {
                        const decoder = new TextDecoder("utf-8");
                        responseJSON = JSON.parse(decoder.decode(xhr.response));
                    }

                    catch (error) {
                        console.error("Failed to parse JSON response:", error);
                    }

                    console.error("Request failed with status:", xhr.status, xhr.response);
                    addStatus("Error fetching TTS audio. The server said: '" + responseJSON.error + "'. There will instead be silence.", "ERROR");

                    finishWithSilence();
                }

                else {
                    console.error("Unexpected response type:", xhr.getResponseHeader("Content-Type"), xhr.response);

                    addStatus("Unexpected response type while fetching TTS audio. Trying to fall back to getting audio or JSON error from page...", "WARN");

                    try {
                        getAudioFromPage(xhr.response).then((pcmRaw) => {
                            if (pcmRaw !== null) {
                                const normalizedPcm = normalizeTtsPcm(pcmRaw, { targetDb: 3, maxGainDb: 24, softClip: cl, softClipK: 1.6 });
                                generate_silence(Math.floor(SAMPLE_RATE * 0.25));
                                appendPcmToSamples(normalizedPcm);
                                generate_silence(Math.floor(SAMPLE_RATE * 0.25));
                                safeResolve();
                            }

                            else {
                                addStatus("Failed to find audio in TTS HTML response. There will instead be silence.", "ERROR");
                                finishWithSilence();
                            }
                        }).catch((error) => {
                            console.error("Failed to get audio from page:", error);
                            addStatus("Failed to get audio from page. There will instead be silence.", "ERROR");
                            finishWithSilence();
                        });
                    }

                    catch (error) {
                        console.error("Failed to decode response:", error);
                        addStatus("Failed to decode TTS HTML response. There will instead be silence.", "ERROR");
                        finishWithSilence();
                    }

                }
            };

            xhr.onerror = function() {
                console.error("Unhandled network error occurred.", xhr.status, xhr.statusText);
                addStatus("Unhandled network error occurred while fetching TTS audio. There will instead be silence.", "ERROR");
                finishWithSilence();
            };

            xhr.send(params.toString());
        });
    }

    async function create_alert_async(header, useOverrideTZ, { allowCustomAudio = false } = {}) {
        document.getElementById("generate").disabled = true;
        document.getElementById("save").disabled = true;
        addStatus("Generating EAS...");

        create_header_tones(header);
        if (tone) { create_nwr_tone(); } else { create_wat(); }
        const appendAnnouncement = (pcmRaw) => {
            const pcm = normalizeTtsPcm(pcmRaw, { targetDb: 3, maxGainDb: 24, softClip: cl, softClipK: 1.6 });
            generate_silence(Math.floor(SAMPLE_RATE * 0.25));
            appendPcmToSamples(pcm);
            generate_silence(Math.floor(SAMPLE_RATE * 0.25));
        };

        const selectedVoiceRaw = (window.ttsVoice || '').trim();
        const normalizedVoice = selectedVoiceRaw.toLowerCase();

        if (window.announcementType === "tts") {
            if (normalizedVoice === "wasm") {
                const pcmRaw = await getPiperPcm(window.ttsText, SAMPLE_RATE);
                if (pcmRaw) {
                    appendAnnouncement(pcmRaw);
                } else {
                    generate_silence(SAMPLE_RATE);
                }
            }

            else if (normalizedVoice === "nanotts") {
                const announcementText = (window.ttsText || '').trim();
                if (!announcementText) {
                    addStatus("NanoTTS requires announcement text. There will instead be silence.", "ERROR");
                    generate_silence(SAMPLE_RATE);
                } else {
                    try {
                        const result = await synthNanoTts(announcementText);
                        if (result?.pcm?.length) {
                            const resampled = resamplePcm(result.pcm, result.sampleRate, SAMPLE_RATE);
                            appendAnnouncement(resampled);
                        } else {
                            addStatus("NanoTTS did not return audio. There will instead be silence.", "ERROR");
                            generate_silence(SAMPLE_RATE);
                        }
                    } catch (error) {
                        console.error(error);
                        addStatus("NanoTTS generation failed. There will instead be silence.", "ERROR");
                        generate_silence(SAMPLE_RATE);
                    }
                }
            }

            else if (selectedVoiceRaw) {
                if (!await validateTtsText()) {
                    addStatus("Your text contains invalid phoneme codes for the selected backend. This will not be processed by the server correctly. There will instead be silence.", "ERROR");
                    document.getElementById("generate").disabled = false;
                    document.getElementById("save").disabled = false;
                    generate_silence(SAMPLE_RATE);
                    return;
                }

                await webTTSGenerate(useOverrideTZ, header);
            }

            else {
                generate_silence(SAMPLE_RATE);
            }
        }

        else if (allowCustomAudio && window.announcementType === "custom") {
            let customAudioFile = document.getElementById("customAudioFile").files[0];
            if (customAudioFile) {
                const arrayBuffer = await customAudioFile.arrayBuffer();
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const buffer = await audioContext.decodeAudioData(arrayBuffer);
                const pcmRaw = buffer.getChannelData(0);
                const pcm = resamplePcm(pcmRaw, buffer.sampleRate, SAMPLE_RATE);
                generate_silence(Math.floor(SAMPLE_RATE * 0.25));
                appendPcmToSamples(pcm);
                generate_silence(Math.floor(SAMPLE_RATE * 0.25));
            }
            else {
                addStatus("You must select a custom audio file when using Custom Audio! There will instead be silence.", "ERROR");
                generate_silence(SAMPLE_RATE);
            }
        }

        else {
            generate_silence(SAMPLE_RATE);
        }

        create_eom_tones();

        document.getElementById("generate").disabled = false;
        document.getElementById("save").disabled = false;
    }

    // END encode/alert.js
    // BEGIN encode/main.js
    var events = document.getElementById("events");
    var originators = document.getElementById("originators");
    var hrselect = document.getElementById("hr");
    var minselect = document.getElementById("min");
    var timeselect = document.getElementById("time");
    var parinput = document.getElementById("par");
    var statuselem = document.getElementById("status");
    var saveb = document.getElementById("save");
    var clr = document.getElementById("clr");
    var tl = document.getElementById("tlen");
    var att = document.getElementById("att");
    var extram = document.getElementById("em");
    var clip = document.getElementById("clip");
    var stateselect = document.getElementById("stateselect");
    var countyselect = document.getElementById("countyselect");
    var spaces = document.getElementById("spaces");
    var regionselect = document.getElementById("rgselect");
    var rawinput = document.getElementById("cheader");
    saveb.addEventListener("click", saveToWav);
    var NWR = 1;
    var hr = 0;
    var locations = ["036071"];
    var es = false;
    var em = false;
    var cl = false;
    var tone = NWR;
    var tlen = 10;
    let startTime = null;
    let showTime = localStorage["showTime"];
    let lastValidTimeselectValue = "";
    const TIMSELECT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

    function isTimeselectValueValid(value) {
        if (!value) { return false; }
        const match = TIMSELECT_PATTERN.exec(value.trim());
        if (!match) { return false; }
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const day = parseInt(match[3], 10);
        const hour = parseInt(match[4], 10);
        const minute = parseInt(match[5], 10);
        if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) { return false; }
        const candidate = new Date(year, month - 1, day, hour, minute, 0, 0);
        return candidate.getFullYear() === year &&
            candidate.getMonth() === month - 1 &&
            candidate.getDate() === day &&
            candidate.getHours() === hour &&
            candidate.getMinutes() === minute;
    }

    function guardTimeselectValue(showAlert = true) {
        const value = timeselect.value;
        if (isTimeselectValueValid(value)) {
            lastValidTimeselectValue = value.trim();
            return true;
        }
        if (showAlert) {
            alert("Invalid date/time. Please enter a valid calendar date.");
        }
        if (lastValidTimeselectValue) {
            timeselect.value = lastValidTimeselectValue;
        } else {
            stime();
        }
        return false;
    }

    function stime() {
        const currentValue = getLocalDT(new Date());
        timeselect.value = currentValue;
        lastValidTimeselectValue = currentValue;
    }

    stime();

    function updateVoiceOptions(t) {
        const selectedVoice = t.value;
        window.ttsVoice = (selectedVoice || '').trim();
        const overrideTZElements = document.getElementsByClassName('overrideTZ');
        const ttsTextElements = document.getElementsByClassName('ttsText');

        if (selectedVoice === 'EMNet') {
            for (let i = 0; i < overrideTZElements.length; i++) {
                overrideTZElements[i].style.display = 'inline-block';
            }
        }

        else {
            for (let i = 0; i < overrideTZElements.length; i++) {
                overrideTZElements[i].style.display = 'none';
            }
        }
    }

    hrselect.addEventListener("change", function () {
        hr = parseInt(hrselect.value);
        minselect.innerHTML = "";
        var nodes = getMinNodes();
        nodes.forEach(e => { minselect.appendChild(e); });
    });

    window.ttsText = (document.getElementById('ttsText')?.value || '').trim();
    window.ttsVoice = (document.getElementById('ttsVoice')?.value || '').trim();

    const audioPlayback = document.getElementById("audioPlayback");

    let encoderMode = document.getElementById("encoderMode").value;
    let event = document.getElementById("events").value;
    let originator = document.getElementById("originators").value;
    let hour = document.getElementById("hr").value
    let minute = document.getElementById("min").value;
    let senderid = document.getElementById("par").value;
    let locationsList = locations.slice();
    let attentionTone = document.getElementById("att").value;
    let extraMarks = document.getElementById("em").checked;
    let useSpaces = document.getElementById("spaces").checked;
    let attentionToneDuration = document.getElementById("tlen").value;
    let announcementType = document.getElementById("announcementType").value;
    let overrideTZ = document.getElementById("useOverrideTZ")?.value || '';
    let ttsText = (document.getElementById('ttsText')?.value || '').trim();
    let ttsVoice = (document.getElementById('ttsVoice')?.value || '').trim();
    let rawInput = (document.getElementById("cheader")?.value || '').trim();
    let clipSignal = document.getElementById("clip").checked;

    async function generateEas() {
        encoderMode = document.getElementById("encoderMode").value;
        let eventCode = document.getElementById("events").value;
        let originatorCode = document.getElementById("originators").value;
        hour = document.getElementById("hr").value;
        minute = document.getElementById("min").value.padEnd(2, "0");
        senderid = document.getElementById("par").value;
        locationsList = locations.slice();
        attentionTone = document.getElementById("att").value;
        extraMarks = document.getElementById("em").checked;
        useSpaces = document.getElementById("spaces").checked;
        attentionToneDuration = document.getElementById("tlen").value;
        announcementType = document.getElementById("announcementType").value;
        overrideTZ = document.getElementById("useOverrideTZ")?.value || '';
        ttsText = (document.getElementById('ttsText')?.value || '').trim();
        ttsVoice = (document.getElementById('ttsVoice')?.value || '').trim();
        rawInput = (document.getElementById("cheader")?.value || '').trim();
        clipSignal = document.getElementById("clip").checked;

        localStorage.setItem("eas-tools-encoder-settings", JSON.stringify({
            'encoderMode': encoderMode,
            'events': eventCode,
            'originators': originatorCode,
            'hr': hour,
            'min': minute,
            'par': senderid,
            'locs': locationsList,
            'att': attentionTone,
            'em': extraMarks,
            'spaces': useSpaces,
            'tlen': attentionToneDuration,
            'announcementType': announcementType,
            'useOverrideTZ': overrideTZ,
            'ttsText': ttsText,
            'ttsVoice': ttsVoice,
            'cheader': rawInput,
            'clip': clipSignal
        }));

        samples.length = 0;
        startTime = performance.now();
        cl = clipSignal;
        calcAFSKArray();

        var par = parinput.value;
        if (par.length < 8) {
            var neededPadding = 8 - par.length;
            par += " ".repeat(neededPadding);
        }
        if (locations.length < 1) { addStatus("There must be at least one location!", "ERROR"); return; }

        if (!guardTimeselectValue()) { return; }

        var time = new Date(timeselect.value);
        var originator = originators.value;
        var event = events.value;
        var min = parseInt(minselect.value);
        tlen = parseInt(tl.value);
        var l = hr.toString().padStart(2, "0") + min.toString().padStart(2, "0");
        tone = parseInt(att.value);
        em = extram.checked;
        es = spaces.checked;
        var usesCustomHeader = (window.useCustom && window.mode === "header");

        if(!rawinput.value && usesCustomHeader) {
            alert("ZCZC header cannot be empty!");
            return;
        }

        else if (!checkZCZCIsValid(rawinput.value) && usesCustomHeader) {
            alert("Invalid ZCZC header format!");
            return;
        }

        const useOverrideTZ = (document.getElementById('useOverrideTZ')?.value || '').trim();
        const header = create_header_string(originator, event, locations, l, time, par);

        if (!window.ttsText && window.ttsVoice !== "EMNet" && window.announcementType === "tts") {
            alert("TTS text is required.");
            return;
        }

        const allowCustomAudio = window.announcementType === "custom";
        await create_alert_async(usesCustomHeader ? rawinput.value : header, useOverrideTZ, { allowCustomAudio }).catch((error) => {
            console.error("Error generating alert:", error);
            addStatus("Error generating alert: " + error.message, "ERROR");
            throw error;
        });

        var elapsedMs = performance.now() - startTime;
        var minutes = Math.floor(elapsedMs / 60000);
        var seconds = Math.floor((elapsedMs % 60000) / 1000);
        var hundredths = Math.floor((elapsedMs % 1000) / 10);
        var timeTaken = ", Time taken to generate: " + (minutes.toString().padStart(2, "0") === "00" ? "" : minutes.toString().padStart(2, "0") + ":") + seconds.toString().padStart(2, "0") + "." + hundredths.toString().padStart(2, "0") + (minutes.toString().padStart(2, "0") !== "00" ? "m" : "s");

        saveb.style.display = "inline-block";
        addStatus("EAS Generated! Samples: " + samples.length.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (showTime ? timeTaken : ""));
        addStatus("Generated header: <br class=\"mobileBreak\"><pre id=\"generatedHeader\">" + ((window.useCustom && window.mode === "header") ? rawinput.value : header) + "</pre>");

        const playbackElement = audioPlayback ?? (() => {
            const el = document.createElement("audio");
            el.id = "audioPlayback";
            document.querySelector(".control-panel")?.appendChild(el);
            return el;
        })();

        if (playbackElement.dataset.objectUrl) {
            URL.revokeObjectURL(playbackElement.dataset.objectUrl);
        }

        wav.fromScratch(1, SAMPLE_RATE, '32', samples.map(e => {
            return e * (2147483647 / 2);
        }));
        const wavBuffer = wav.toBuffer().buffer;
        const wavBlob = new Blob([new DataView(wavBuffer)], { type: 'audio/wav' });
        const wavUrl = URL.createObjectURL(wavBlob);
        playbackElement.dataset.objectUrl = wavUrl;
        playbackElement.setAttribute("src", wavUrl);
        playbackElement.src = wavUrl;
        playbackElement.style.display = "block";
        playbackElement.style.visibility = "visible";
        playbackElement.controls = true;
        playbackElement.autoplay = false;
        playbackElement.load();
    }

    function addStatus(stat, type = "LOG") {
        var new_status = document.createElement("div");
        var d = new Date();
        new_status.innerHTML = zero_pad_int(d.getHours().toString() % 12, 2) + ":" + zero_pad_int(d.getMinutes().toString(), 2) + ":" + zero_pad_int(d.getSeconds().toString(), 2) + " " + (d.getHours() >= 12 ? "PM" : "AM") + " [" + type + "]: " + stat;
        statuselem.appendChild(new_status);
        clr.style.display = "inline-block";
    }

    function resetStatus() {
        statuselem.innerHTML = "";
        clr.disabled = true;
    }

    function addLoc() {
        var t = regionselect.value.toString() + stateselect.value.toString() + countyselect.value.toString(); if (locations.indexOf(t) < 0) {
            locations.push(t); updateTable();
        } else { addStatus("You can't add the same location code twice!"); }
    }

    function updateTable() {
        var fcont = document.getElementById("container");
        var fipstable = document.getElementById("fips");
        fcont.innerHTML = "";
        for (var i = 0; i < locations.length; i++) {
            var tr = document.createElement("tr");
            var c = document.createElement("td");
            var s = document.createElement("td");
            var l = document.createElement("td");
            var r = document.createElement("td");
            var st = locations[i].slice(1, 3);
            var co = locations[i].slice(3, 6);
            var re = locations[i].charAt(0);
            c.innerText = locations[i]; l.innerText = county[st][co];
            if (co == "000" && st !== "00") { l.innerText = "Entire State"; }
            r.innerText = rgn[re]; s.innerText = state[st]; tr.appendChild(l); tr.appendChild(s); tr.appendChild(r); tr.appendChild(c);
            tr.setAttribute("class", "entry");
            tr.setAttribute("data-val", i.toString());
            tr.addEventListener("click", function (e) { locations.splice(parseInt(e.srcElement.parentElement.getAttribute("data-val")), 1); updateTable(); });
            fcont.appendChild(tr);
        }
    }
    updateTable();

    stateselect.innerHTML = "";

    stateselect.addEventListener("change", function() {
        updateCounties(stateselect.value);
    });

    Object.keys(state).sort().forEach(e => {
        var option = document.createElement("option");
        option.innerHTML = state[e];
        option.setAttribute("value", e);
        stateselect.appendChild(option);
    });

    function updateCounties(state) {
        countyselect.innerHTML = "";
        if (state !== "00") {
            let entState = document.createElement("option");
            entState.value = "000";
            entState.innerText = "Entire State";
            countyselect.appendChild(entState);
        }
        Object.keys(county[state]).sort().forEach(e => {
            var option = document.createElement("option");
            option.innerHTML = county[state][e];
            option.setAttribute("value", e);
            countyselect.appendChild(option);
        });
    }

    updateCounties("00");

    regionselect.innerHTML = "";

    Object.keys(rgn).sort().forEach(e => {
        var option = document.createElement("option");
        option.innerHTML = rgn[e];
        option.setAttribute("value", e);
        regionselect.appendChild(option);
    });

    function parseSameHeaderParam(rawHeader) {
        if (!rawHeader) {
            return null;
        }

        const sanitized = rawHeader.replace(/[ -]/g, '').toUpperCase();

        const match = sanitized.match(/ZCZC-[^\s]*/);

        if (!match) {
            return null;
        }

        const line = match[0];
        const segments = line.split('-').filter(Boolean);

        if (segments.length < 5) {
            return null;
        }

        const origin = segments[1];
        const eventCode = segments[2];
        const locationsList = [];
        let durationText = null;
        let index = 3;

        for (; index < segments.length; index++) {
            const segment = segments[index];
            if (!segment) {
                continue;
            }

            if (segment.startsWith('+')) {
                durationText = segment.slice(1);
                break;
            }

            if (segment.includes('+')) {
                const parts = segment.split('+');
                if (parts[0]) {
                    locationsList.push(parts[0]);
                }
                durationText = parts[1] || '';
                break;
            }

            locationsList.push(segment);
        }

        if (durationText == null) {
            return null;
        }

        const issue = segments[index + 1] || '';
        const station = segments[index + 2] || '';

        return {
            origin,
            event: eventCode,
            locations: locationsList,
            duration: durationText,
            issue,
            station
        };
    }

    function applyHeaderDetails(parsed) {
        if (!parsed) {
            return;
        }

        const { origin, event: eventCode, locations: locationList, duration, issue, station } = parsed;

        if (originators && origin) {
            const originOption = Array.from(originators.options || []).find(opt => opt.value === origin);
            if (originOption) {
                originators.value = origin;
            }
        }

        if (events && eventCode) {
            const eventOption = Array.from(events.options || []).find(opt => opt.value === eventCode);
            if (eventOption) {
                events.value = eventCode;
            }
        }

        if (Array.isArray(locationList) && locationList.length) {
            const validLocations = locationList.filter(code => /^\d{6}$/.test(code));
            if (validLocations.length) {
                locations.length = 0;
                validLocations.forEach(code => locations.push(code));
                updateTable();
            }
        }

        if (typeof duration === 'string' && /^\d{4}$/.test(duration) && hrselect && minselect) {
            const minutes = parseInt(duration, 10);
            if (!Number.isNaN(minutes)) {
                const hrValues = Array.from(hrselect.options || []).map(opt => parseInt(opt.value, 10)).filter(num => !Number.isNaN(num));
                if (hrValues.length) {
                    const maxHr = Math.max.apply(null, hrValues);
                    let hours = Math.min(Math.floor(minutes / 60), maxHr);
                    if (!Number.isFinite(hours) || hours < 0) {
                        hours = 0;
                    }
                    hr = hours;
                    hrselect.value = hours.toString().padStart(2, '0');
                    hrselect.dispatchEvent(new Event('change'));
                    const remainder = minutes % 60;
                    const minOption = Array.from(minselect.options || []).find(opt => parseInt(opt.value, 10) === remainder);
                    if (minOption) {
                        minselect.value = remainder;
                    }
                }
            }
        }

        if (issue && /^\d{7}$/.test(issue) && timeselect) {
            const dayOfYear = parseInt(issue.slice(0, 3), 10);
            const hour = parseInt(issue.slice(3, 5), 10);
            const minute = parseInt(issue.slice(5, 7), 10);
            if (dayOfYear >= 1 && dayOfYear <= 366 && hour < 24 && minute < 60) {
                const currentUTCYear = new Date().getUTCFullYear();
                const base = new Date(Date.UTC(currentUTCYear, 0, 1, 0, 0, 0));
                base.setUTCDate(dayOfYear);
                base.setUTCHours(hour, minute, 0, 0);
                timeselect.value = getLocalDT(base);
                lastValidTimeselectValue = timeselect.value;
            }
        }

        if (station && parinput) {
            const cleanedStation = station.toUpperCase();
            if (cleanedStation.length === 8) {
                parinput.value = cleanedStation;
            }
            else {
                parinput.value = cleanedStation.padEnd(8, " ");
            }
        }
    }

    const params = new URLSearchParams(window.location.search);
    const headerParam = params.get("header");
    if (headerParam) {
        const trimmedHeader = headerParam.trim();
        const encoderModeSelect = document.getElementById("encoderMode");

        if (encoderModeSelect) {
            encoderModeSelect.value = "header";
        }

        window.useCustom = true;
        const headerField = document.querySelector("#cheader");

        if (headerField) {
            headerField.value = trimmedHeader;
        }

        const parsedHeader = parseSameHeaderParam(trimmedHeader);
        if (parsedHeader) {
            applyHeaderDetails(parsedHeader);
        }

        else {
            addStatus("Unable to parse SAME header from query string.", "WARN");
        }
    }

    // END encode/main.js

    const nowButton = document.querySelector('[data-encoder-now]');
    if (nowButton) {
        nowButton.addEventListener('click', () => stime());
    }

    const addLocButton = document.querySelector('[data-encoder-add-loc]');
    if (addLocButton) {
        addLocButton.addEventListener('click', () => addLoc());
    }

    const generateButton = document.querySelector('[data-encoder-generate]');
    if (generateButton) {
        generateButton.addEventListener('click', () => generateEas());
    }

    const clearButton = document.querySelector('[data-encoder-clear]');
    if (clearButton) {
        clearButton.addEventListener('click', () => resetStatus());
    }

    const voiceSelect = document.getElementById('ttsVoice');
    if (voiceSelect) {
        voiceSelect.addEventListener('change', (event) => updateVoiceOptions(event.target));
    }

    const ttsTextInput = document.getElementById('ttsText');
    if (ttsTextInput) {
        ttsTextInput.addEventListener('change', (event) => window.ttsText = event.target.value.trim());
    }

    const encoderModeSelect = document.getElementById("encoderMode");
    const announcementTypeSelect = document.getElementById("announcementType");
    const customHeader = document.getElementById("customEncoder");
    const stringEncoder = document.getElementById("stringEncoder");
    const ttsOuterDiv = document.getElementById("tts");
    const customAnnouncementDiv = document.getElementById("customAudioDiv");
    const transferButton = document.querySelector('[data-encoder-transfer]');

    if (transferButton) {
        transferButton.addEventListener('click', () => {
            const cheader = document.getElementById("cheader").value;
            const parsedHeader = parseSameHeaderParam(cheader);
            if (parsedHeader) {
                applyHeaderDetails(parsedHeader);
            }
            encoderModeSelect.value = "builder";
            encoderModeSelect.dispatchEvent(new Event('change'));
        });
    }

    await getVoiceList();

    if(!headerParam) {
        localStorage.getItem("eas-tools-encoder-settings") && (() => {
            try {
                const savedSettings = JSON.parse(localStorage.getItem("eas-tools-encoder-settings"));
                for (const [key, value] of Object.entries(savedSettings)) {
                    if (key === 'locs' && Array.isArray(value)) {
                        locations.length = 0;
                        value.forEach(loc => locations.push(loc));
                        updateTable();
                        continue;
                    }
                    else {
                        const element = document.getElementById(key);
                        if (element) {
                            if (element.tagName === "SELECT" || element.tagName === "INPUT") {
                                if (element.type === "checkbox") {
                                    element.checked = value;
                                } else {
                                    element.value = value;
                                }
                            } else if (element.tagName === "TEXTAREA") {
                                element.value = value;
                            }
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to load encoder settings:", error);
            }
        })();

        addStatus("Loaded saved encoder settings!");
    }

    encoderModeSelect.addEventListener("change", function () {
        window.mode = encoderModeSelect.value;

        if (window.mode === "builder") {
            customHeader.style.display = "block";
            stringEncoder.style.display = "none";
            window.useCustom = false;
        }

        else {
            customHeader.style.display = "none";
            stringEncoder.style.display = "block";
            window.useCustom = true;
        }
    });

    announcementTypeSelect.addEventListener("change", function () {
        window.announcementType = announcementTypeSelect.value;

        if (window.announcementType === "tts") {
            ttsOuterDiv.style.display = "block";
            customAnnouncementDiv.style.display = "none";
        }

        else if (window.announcementType === "custom") {
            ttsOuterDiv.style.display = "none";
            customAnnouncementDiv.style.display = "block";
        }

        else {
            ttsOuterDiv.style.display = "none";
            customAnnouncementDiv.style.display = "none";
        }
    });

    encoderModeSelect.dispatchEvent(new Event('change'));
    announcementTypeSelect.dispatchEvent(new Event('change'));
    ttsTextInput.dispatchEvent(new Event('change'));
    voiceSelect.dispatchEvent(new Event('change'));
})();
