import {
    ENDEC_MODES,
    ENDEC_MODE_SIGNATURES,
    createEndecModeVotes,
    getEndecModeProfile,
    normalizeEndecMode,
    saveFile,
    isObject,
    USES_DARK_THEME
} from './common-functions.js';

window.EAS2TextModulePromise = window.EAS2TextModulePromise || new Promise((resolve) => {
    window.addEventListener('EAS2TextModuleReady', (event) => resolve(event.detail), { once: true });
});

async function fetchAndStore() {
    function processSameCodes(usCodes, caCodes) {
        window.rgn = {};
        window.state = {};
        window.county = {};
        window.canadaCounty = {};
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
        window.entryPoints = {};
        window.entryNames = {
            "WXR": "National Weather Service",
            "PEP": "Primary Entry Point",
            "EAS": "Emergency Alert System",
            "CIV": "Civil Authority"
        };
        window.events = {};

        const eventSelect = document.getElementById("easyplusEventCode");

        function appendEventOption(code, label) {
            if (!eventSelect) {
                return;
            }
            const option = document.createElement("option");
            option.value = code;
            option.textContent = label;
            eventSelect.appendChild(option);
        }

        const datasets = [
            { data: usCodes, isCanada: false },
            { data: caCodes, isCanada: true }
        ];

        for (const { data, isCanada } of datasets) {
            if (!data) {
                continue;
            }

            if (data['SUBDIV']) {
                for (const code in data['SUBDIV']) {
                    window.rgn[code] = data['SUBDIV'][code];
                }
            }

            if (data['ORGS']) {
                for (const code in data['ORGS']) {
                    if (!window.entryPoints[code]) {
                        window.entryPoints[code] = data['ORGS'][code];
                    }
                }
            }

            if (data['EVENTS']) {
                for (const code in data['EVENTS']) {
                    if (!window.events[code]) {
                        const label = data['EVENTS'][code].replace(/^(a|an|the) /, '').trim();
                        window.events[code] = label;
                        appendEventOption(code, label);
                    }
                }
            }

            if (data['SAME']) {
                if (isCanada) {
                    for (const code in data['SAME']) {
                        window.canadaCounty[code.padStart(5, "0")] = data['SAME'][code];
                    }
                } else {
                    for (const code in data['SAME']) {
                        const stcode = code.slice(0, 2);
                        const countycode = code.slice(2);
                        const name = data['SAME'][code];
                        window.county[stcode] = window.county[stcode] || {};
                        if (!window.county[stcode][countycode]) {
                            window.county[stcode][countycode] = name;
                        }
                        if (countycode === '000' && !window.state[stcode]) {
                            let statename = name.replace(/^State of /, '').trim();
                            const abbrv = window.abbrvs[statename] || statename;
                            window.state[stcode] = abbrv;
                        }
                    }
                }
            }
        }

        const originatorSelect = document.getElementById("easyplusOriginator");
        if (originatorSelect) {
            for (const code in window.entryNames) {
                const name = window.entryNames[code];
                const option = document.createElement("option");
                option.value = code;
                option.textContent = name;
                originatorSelect.appendChild(option);
            }
        }
    }

    const response = await fetch('assets/E2T/same-us.json');
    const response2 = await fetch('assets/E2T/same-ca.json');
    const dataUS = await response.json();
    const dataCA = await response2.json();
    processSameCodes(dataUS, dataCA);
}

(async function () {
    'use strict';
    // Decoder bundle
    await fetchAndStore().catch((error) => {
        console.error('Error fetching and storing data:', error);
    });

    const rgn = window.rgn || {};
    const state = window.state || {};
    const county = window.county || {};
    const entryPoints = window.entryPoints || {};
    const entryNames = window.entryNames || {};
    const events = window.events || {};
    const canadaCounty = window.canadaCounty || {};

    function addStatus(stat, color = null) {
        const statuselem = document.getElementById("sync");
        statuselem.innerHTML = "STATUS: " + stat;
        if (color) {
            statuselem.style.color = color;
        }
    }

    window.modalShown = false;
    window.isRecording = false;

    // BEGIN decode/audio.js
    let sampleRate = 44100;

    const decodeContext = new AudioContext();

    const filter = decodeContext.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1822.9;
    filter.Q.value = 3;

    let micSource = null;
    let streamElement = null;
    let streamSource = null;
    let streamToggleActive = false;
    let nativeRecActive = false;
    let nativeRecChunks = [];
    let nativeRecSampleRate = 0;
    let nativeRecChannels = 1;

    function nativeRecStart(sr, ch) {
      nativeRecActive = true;
      nativeRecChunks = [];
      nativeRecSampleRate = sr || 25000;
      nativeRecChannels = ch || 1;
    }

    function nativeRecPush(pcmI16, sr, ch) {
      if (!nativeRecActive) return;
      if (sr) nativeRecSampleRate = sr;
      if (ch) nativeRecChannels = ch;
      nativeRecChunks.push(new Int16Array(pcmI16));
    }

    function nativeRecStopToWavBlob() {
      nativeRecActive = false;

      let totalSamples = 0;
      for (const c of nativeRecChunks) totalSamples += c.length;

      const wavBytes = 44 + totalSamples * 2;
      const buf = new ArrayBuffer(wavBytes);
      const view = new DataView(buf);

      function writeStr(off, s) {
        for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
      }

      const sr = nativeRecSampleRate || 25000;
      const ch = nativeRecChannels || 1;
      const byteRate = sr * ch * 2;
      const blockAlign = ch * 2;
      const dataSize = totalSamples * 2;

      writeStr(0, "RIFF");
      view.setUint32(4, 36 + dataSize, true);
      writeStr(8, "WAVE");

      writeStr(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, ch, true);
      view.setUint32(24, sr, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, 16, true);

      writeStr(36, "data");
      view.setUint32(40, dataSize, true);

      let off = 44;
      for (const chunk of nativeRecChunks) {
        for (let i = 0; i < chunk.length; i++, off += 2) {
          view.setInt16(off, chunk[i], true);
        }
      }

      nativeRecChunks = [];
      return new Blob([buf], { type: "audio/wav" });
    }

    let nativeStreamActive = false;
    let nativeStreamUrl = null;
    let nativePCMListener = null;

    let nativeMeterActive = false;
    let nativeMeterTarget = 0;

    let nativeRemainder = new Float32Array(0);
    let nativeLastSR = 0;

    function getOggPlugin() {
      return window.Capacitor?.Plugins?.OggStream || null;
    }

    function isCapacitorIOS() {
      try { return window.Capacitor?.getPlatform?.() === "ios"; }
      catch { return false; }
    }

    function canWebViewPlayOgg() {
      try {
        const a = document.createElement("audio");
        return (a.canPlayType("audio/ogg") || a.canPlayType('audio/ogg; codecs="opus"')) !== "";
      } catch {
        return false;
      }
    }

    function shouldUseNativeOgg(url) {
      if (!isCapacitorIOS()) return false;
      if (!getOggPlugin()) return false;
      if (window.forceNativeOgg === true) return true;

      const u = String(url || "").toLowerCase();
      const looksOgg = u.includes(".ogg") || u.includes(".oga") || u.includes(".opus");

      return looksOgg || !canWebViewPlayOgg();
    }

    function b64ToInt16ArrayLE(b64) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return new Int16Array(buf);
    }

    function updateNativeMeterFromInt16(pcmI16, channels) {
      channels = channels || 1;
      const frames = Math.floor(pcmI16.length / channels);
      if (frames <= 0) return;

      let sum = 0;
      if (channels === 1) {
        for (let i = 0; i < frames; i++) {
          const s = pcmI16[i] / 32768;
          sum += s * s;
        }
      } else {
        for (let i = 0; i < frames; i++) {
          let acc = 0;
          const base = i * channels;
          for (let ch = 0; ch < channels; ch++) acc += pcmI16[base + ch];
          const s = (acc / channels) / 32768;
          sum += s * s;
        }
      }

      const rms = Math.sqrt(sum / frames);
      nativeMeterTarget = Math.min(1, rms * 3);
      nativeMeterActive = true;
      startMeter();
    }

    function feedNativePCM_Int16(pcmI16, sampleRate, channels) {
      if (!pcmI16 || !pcmI16.length) return;

      if (sampleRate && sampleRate !== nativeLastSR) {
        updateSampleRate(sampleRate);
        nativeLastSR = sampleRate;
      }

      channels = channels || 1;
      const frames = Math.floor(pcmI16.length / channels);

      const mono = new Float32Array(frames);
      if (channels === 1) {
        for (let i = 0; i < frames; i++) mono[i] = pcmI16[i] / 32768;
      } else {
        for (let i = 0; i < frames; i++) {
          let acc = 0;
          const base = i * channels;
          for (let ch = 0; ch < channels; ch++) acc += pcmI16[base + ch];
          mono[i] = (acc / channels) / 32768;
        }
      }

      const combined = new Float32Array(nativeRemainder.length + mono.length);
      combined.set(nativeRemainder, 0);
      combined.set(mono, nativeRemainder.length);

      const CHUNK = 128;
      let off = 0;
      while (off + CHUNK <= combined.length) {
        runDecoder(combined.subarray(off, off + CHUNK));
        off += CHUNK;
      }
      nativeRemainder = combined.slice(off);
    }

    async function setNativeLoopbackEnabled(enabled) {
      const plugin = getOggPlugin();
      if (!plugin) return;
      try {
        await plugin.setVolume({ volume: enabled ? 1.0 : 0.0 });
      } catch (e) {
        console.warn("Native setVolume failed:", e);
      }
    }

    async function stopNativeOggStream() {
      const plugin = getOggPlugin();
      if (!plugin) return;

      try { await plugin.stop(); } catch {}

      if (nativePCMListener && typeof nativePCMListener.remove === "function") {
        try { await nativePCMListener.remove(); } catch {}
      }

      nativePCMListener = null;
      nativeStreamActive = false;
      nativeStreamUrl = null;
      nativeRemainder = new Float32Array(0);
      nativeLastSR = 0;

      nativeMeterActive = false;
      nativeMeterTarget = 0;
    }

    async function startNativeOggStream(url) {
      const plugin = getOggPlugin();
      if (!plugin) throw new Error("OggStream plugin not available");

      if (streamElement) await stopStreamDecode(streamElement.src);
      if (nativeStreamActive) await stopNativeOggStream();

      const clearStreamURLButton = document.querySelector('[data-decoder-clear-stream-url]');
      if (clearStreamURLButton) clearStreamURLButton.style.display = "inline-block";

      resetStreamRecovery();

      nativePCMListener = await plugin.addListener("pcm", (ev) => {
        try {
          const pcmI16 = b64ToInt16ArrayLE(ev.pcmBase64);
          updateNativeMeterFromInt16(pcmI16, ev.channels);
          feedNativePCM_Int16(pcmI16, ev.sampleRate, ev.channels);
          nativeRecPush(pcmI16, ev.sampleRate, ev.channels);
        } catch (e) {
          console.warn("PCM handler error:", e);
        }
      });

      nativeStreamActive = true;
      nativeStreamUrl = url;

      await plugin.play({ url, tapPcm: true, tapSampleRate: 25000 });

      document.querySelector('[data-decoder-record-toggle]').disabled = false;
      addStatus("STREAMING...", "green");
      setStreamToggleState(true);

      await setNativeLoopbackEnabled(isLoopbackEnabled());

      return { native: true, url };
    }

    let inputTapNode = null;
    let inputTapSource = null;
    let meterInputSource = null;
    const meterElement = document.querySelector("[data-level-meter]");
    const meterFill = meterElement ? meterElement.querySelector("[data-level-fill]") : null;
    let levelAnalyser = null;
    let levelBuffer = null;
    let meterAnimation = 0;
    let meterLevel = 0;
    let loopbackDest = null;
    let loopbackSourceNode = null;
    const STREAM_RECOVERY_DELAY = 2000;
    const STREAM_RECOVERY_MAX_ATTEMPTS = 5;
    let streamRecoveryTimer = null;
    let streamRecoveryAttempts = 0;
    let recordingNode = null;
    let recordingSinkGain = null;
    let recordingSourceNode = null;
    let recordingChunks = [];
    let recordingSampleRate = 0;
    let recordingLength = 0;
    let workletModulePromise = null;
    const AUTO_RECORD_MAX_DURATION = 5 * 60 * 1000;
    let autoRecordingTimer = null;
    let autoRecordingEngaged = false;
    let autoRecordingTriggered = false;

    if (meterFill) {
        levelAnalyser = decodeContext.createAnalyser();
        levelAnalyser.fftSize = 256;
        levelAnalyser.smoothingTimeConstant = 0.25;
        levelBuffer = new Uint8Array(levelAnalyser.fftSize);
    }

    function renderMeter() {
        if (!meterAnimation || !meterFill || !levelAnalyser || !levelBuffer) {
            meterAnimation = 0;
            return;
        }
        let target = 0;
        if (meterInputSource) {
          levelAnalyser.getByteTimeDomainData(levelBuffer);
          let sum = 0;
          for (let i = 0; i < levelBuffer.length; i++) {
            const sample = (levelBuffer[i] - 128) / 128;
            sum += sample * sample;
          }
          const rms = Math.sqrt(sum / levelBuffer.length);
          target = Math.min(1, rms * 3);
        } else if (nativeMeterActive) {
          target = nativeMeterTarget;
        }
        const smoothing = target > meterLevel ? 0.35 : 0.18;
        meterLevel += (target - meterLevel) * smoothing;
        if (meterLevel < 0.001) {
            meterLevel = 0;
        }
        meterFill.style.width = (meterLevel * 100).toFixed(1) + "%";
        if (meterElement) {
            meterElement.setAttribute("aria-valuenow", meterLevel.toFixed(3));
        }
        meterAnimation = requestAnimationFrame(renderMeter);
    }

    function startMeter() {
        if (!meterFill || !levelAnalyser || meterAnimation) {
            return;
        }
        meterAnimation = requestAnimationFrame(renderMeter);
    }

    function stopMeter() {
        if (meterAnimation) {
            cancelAnimationFrame(meterAnimation);
            meterAnimation = 0;
        }
        meterLevel = 0;
        if (meterFill) {
            meterFill.style.width = "0%";
        }
        if (meterElement) {
            meterElement.setAttribute("aria-valuenow", "0");
        }
    }

    if (decodeContext.audioWorklet && typeof decodeContext.audioWorklet.addModule === "function") {
        workletModulePromise = decodeContext.audioWorklet.addModule("assets/js/processor.js").then(() => {
            const decodeNode = new AudioWorkletNode(decodeContext, "eas-processor");
            decodeNode.port.onmessage = function (event) {
                const channels = event.data;
                if (!channels || !channels[0]) {
                    return;
                }
                runDecoder(channels[0]);
            };
            filter.connect(decodeNode);
            return true;
        });
        workletModulePromise.catch((error) => {
            console.error("Failed to load EAS processor", error);
        });
    } else {
        const error = new Error("AudioWorklet is NOT supported in this context.");
        console.warn(error.message, "Decoder functionality will be limited.");
        workletModulePromise = Promise.reject(error);
        workletModulePromise.catch(() => { });
    }

    const MOBILE_MIC_GAIN = 7; // works well on native webview on android, unsure about iOS
    const shouldApplyMobileInputGain = typeof navigator !== "undefined" && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent || "");

    function createMicInputNode(sourceNode) {
        if (!shouldApplyMobileInputGain) {
            return sourceNode;
        }
        const gainNode = decodeContext.createGain();
        gainNode.gain.value = MOBILE_MIC_GAIN;
        sourceNode.connect(gainNode);
        return gainNode;
    }

    const sel = document.querySelector("#device");
    const micContainer = document.querySelector("[data-mic-container]");
    async function startDecoder(id) {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: id,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        }).catch((error) => {
            console.error("Error accessing microphone:", error);
            return null;
        }).finally(() => { return 1; });
        if (!stream) {
            return null;
        }
        await startDecode(stream);
    }

    function attachInputTap(sourceNode) {
        if (!sourceNode) {
            return;
        }
        detachInputTap();
        const tapNode = decodeContext.createGain();
        tapNode.gain.value = 1;
        try {
            sourceNode.connect(tapNode);
        } catch (error) {
            console.warn("Unable to connect input tap:", error);
            return;
        }
        inputTapSource = sourceNode;
        tapNode.connect(filter);
        if (levelAnalyser) {
            tapNode.connect(levelAnalyser);
            meterInputSource = tapNode;
            startMeter();
        } else {
            meterInputSource = null;
        }
        inputTapNode = tapNode;
    }

    function detachInputTap() {
        if (inputTapSource && inputTapNode) {
            try {
                inputTapSource.disconnect(inputTapNode);
            } catch (error) {
                console.warn("Error disconnecting source from input tap:", error);
            }
        }
        if (inputTapNode) {
            try {
                inputTapNode.disconnect();
            } catch (error) {
                console.warn("Error disconnecting input tap:", error);
            }
        }
        inputTapSource = null;
        inputTapNode = null;
        meterInputSource = null;
    }

    async function startStreamDecoder(url) {
        if (!url) {
            addStatus("INVALID STREAM URL!", "red");
            window.streamUrl = null;
            return null;
        }
        try {
            await decodeContext.resume();
        } catch (error) {
            console.warn("Unable to resume audio context before starting stream:", error);
        }
        if (streamElement) {
            await stopStreamDecode(streamElement.src);
        }

        if (shouldUseNativeOgg(url)) {
          try {
            return await startNativeOggStream(url);
          } catch (e) {
            console.error("Native OGG start failed:", e);
            addStatus("STREAM ACCESS FAILED!", "red");
            window.streamUrl = null;
            setStreamToggleState(false);
            return null;
          }
        }

        try {
            const clearStreamURLButton = document.querySelector('[data-decoder-clear-stream-url]');
            clearStreamURLButton.style.display = "inline-block";
            const audio = document.createElement("audio");
            audio.crossOrigin = "anonymous";
            audio.src = url;
            audio.autoplay = false;
            audio.controls = false;
            audio.preload = "auto";
            audio.style.display = "none";
            audio.setAttribute("aria-hidden", "true");
            document.body.appendChild(audio);
            const source = decodeContext.createMediaElementSource(audio);
            attachInputTap(source);
            resetStreamRecovery();
            audio.addEventListener("playing", () => {
                if (streamElement === audio) {
                    resetStreamRecovery();
                    addStatus("STREAMING...", "green");
                }
            });
            audio.addEventListener("error", (event) => {
                if (streamElement !== audio) {
                    return;
                }
                const mediaError = audio.error;
                if (isRecoverableStreamError(mediaError)) {
                    handleStreamFailure(event, false);
                    scheduleStreamRecovery(audio);
                    return;
                }
                handleStreamFailure(event, true);
                void stopStreamDecode(audio.src);
            });
            streamElement = audio;
            streamSource = source;
            await audio.play();
            document.querySelector('[data-decoder-record-toggle]').disabled = false;
            addStatus("STREAMING...", "green");
            setStreamToggleState(true);
            refreshLoopback();
            return audio;
        } catch (error) {
            console.error("Error starting stream decoder:", error);
            if (streamSource) {
                try {
                    streamSource.disconnect();
                } catch (disconnectError) {
                    console.warn("Error cleaning up failed stream source:", disconnectError);
                }
            }
            if (streamElement) {
                streamElement.pause();
                streamElement.remove();
            }
            streamElement = null;
            streamSource = null;
            detachInputTap();
            stopMeter();
            addStatus("STREAM ACCESS FAILED!", "red");
            window.streamUrl = null;
            setStreamToggleState(false);
            return null;
        }
    }

    async function stopStreamDecode(url) {
        flushPendingDecodeTail();
        finalizeActiveSameProduct();
        resetDecoderState();
        resetStreamRecovery();

        if (nativeStreamActive) {
          await stopNativeOggStream();
        }

        if (window.isRecording) {
            stopRecording();
        }
        if (streamSource) {
            try {
                streamSource.disconnect();
            } catch (error) {
                console.warn("Error disconnecting stream source:", error);
            }
            streamSource = null;
        }
        detachInputTap();
        stopMeter();
        if (loopbackSourceNode) {
            stopLoopback();
        }
        let targetElement = streamElement;
        if (!targetElement && url) {
            const mediaElements = document.getElementsByTagName("audio");
            for (let i = 0; i < mediaElements.length; i++) {
                if (mediaElements[i].src === url) {
                    targetElement = mediaElements[i];
                    break;
                }
            }
        }
        if (targetElement) {
            try {
                targetElement.pause();
            } catch (error) {
                console.warn("Error pausing stream element:", error);
            }
            targetElement.srcObject = null;
            targetElement.remove();
            if (targetElement === streamElement) {
                streamElement = null;
            }
        }
        decodeContext.suspend();
        document.querySelector('[data-decoder-toggle]').disabled = false;
        document.querySelector('[data-decoder-load]').disabled = false;
        document.querySelector('[data-decoder-record-toggle]').disabled = true;
        addStatus("WAITING...", USES_DARK_THEME ? "white" : "black");
        setStreamToggleState(false);
    }

    const RECORD_LABEL_START = "Start Recording (alerts toggle this automatically)";
    const RECORD_LABEL_STOP = "Stop Recording (alerts toggle this automatically)";

    async function startRecording() {
        if (nativeStreamActive) {
            nativeRecStart(nativeLastSR || 25000, 1);
            addStatus("RECORDING...", "green");
            window.isRecording = true;
            updateRecordButtonLabel(true);
            return true;
          }
        if (window.isRecording) {
            return true;
        }
        const activeSource = inputTapNode;
        if (!inputTapNode && !nativeStreamActive) {
          addStatus("NO AUDIO SOURCE TO RECORD!", "red");
          return;
        }
        if (!workletModulePromise) {
            addStatus("RECORDING NOT SUPPORTED IN THIS BROWSER", "red");
            return false;
        }
        try {
            await workletModulePromise;
        } catch (error) {
            console.warn("Recording worklet unavailable:", error);
            addStatus("RECORDING NOT SUPPORTED IN THIS BROWSER", "red");
            return false;
        }
        try {
            decodeContext.resume();
        } catch (error) {
            console.warn("Unable to resume audio context before recording:", error);
        }
        recordingSampleRate = decodeContext.sampleRate || sampleRate;
        recordingChunks = [];
        recordingLength = 0;
        recordingSourceNode = activeSource;
        const tapChannels = inputTapSource ? inputTapSource.channelCount : activeSource.channelCount;
        const sourceChannels = Math.max(1, tapChannels || 1);
        recordingNode = new AudioWorkletNode(decodeContext, "eas-recorder", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            channelCount: sourceChannels,
            channelCountMode: "explicit"
        });
        recordingNode.port.onmessage = function (event) {
            if (!window.isRecording) {
                return;
            }
            const channels = event.data;
            if (!channels || !channels.length || !channels[0] || !channels[0].length) {
                return;
            }
            const frameCount = channels[0].length;
            const channelCount = channels.length;
            const chunk = new Float32Array(frameCount);
            for (let channel = 0; channel < channelCount; channel++) {
                const channelData = channels[channel];
                if (!channelData) {
                    continue;
                }
                for (let i = 0; i < frameCount; i++) {
                    chunk[i] += channelData[i];
                }
            }
            if (channelCount > 1) {
                for (let i = 0; i < frameCount; i++) {
                    chunk[i] /= channelCount;
                }
            }
            recordingChunks.push(chunk);
            recordingLength += chunk.length;
        };
        recordingSinkGain = decodeContext.createGain();
        recordingSinkGain.gain.value = 0;
        recordingNode.connect(recordingSinkGain);
        recordingSinkGain.connect(decodeContext.destination);
        try {
            recordingSourceNode.connect(recordingNode);
        } catch (error) {
            console.warn("Unable to connect recording tap:", error);
            if (recordingNode) {
                recordingNode.disconnect();
                recordingNode = null;
            }
            if (recordingSinkGain) {
                recordingSinkGain.disconnect();
                recordingSinkGain = null;
            }
            recordingSourceNode = null;
            recordingChunks = [];
            recordingLength = 0;
            recordingSampleRate = 0;
            return false;
        }
        window.isRecording = true;
        updateRecordButtonLabel(true);
        return true;
    }

    async function stopRecording() {
        if (nativeStreamActive) {
            const b = nativeRecStopToWavBlob();
            console.warn("isBlob", b instanceof Blob);
            console.warn("type", b.type);
            console.warn("size", b.size);
            await triggerRecordingDownload(b);
            addStatus("RECORDING SAVED!", "green");
            return true;
          }
        if (!window.isRecording) {
            return false;
        }
        window.isRecording = false;
        autoRecordingTriggered = false;
        if (recordingSourceNode && recordingNode) {
            try {
                recordingSourceNode.disconnect(recordingNode);
            } catch (error) {
                console.warn("Error disconnecting recording tap:", error);
            }
        }
        if (recordingNode) {
            recordingNode.port.onmessage = null;
            recordingNode.disconnect();
            recordingNode = null;
        }
        if (recordingSinkGain) {
            recordingSinkGain.disconnect();
            recordingSinkGain = null;
        }
        recordingSourceNode = null;
        updateRecordButtonLabel(false);
        if (!recordingChunks.length || !recordingLength) {
            recordingChunks = [];
            recordingLength = 0;
            return true;
        }
        const pcmData = mergeRecordingChunks(recordingChunks, recordingLength);
        recordingChunks = [];
        recordingLength = 0;
        const wavBuffer = encodeWavBuffer(pcmData, recordingSampleRate || sampleRate);
        recordingSampleRate = 0;
        triggerRecordingDownload(wavBuffer);
        resetAutoRecordingState();
        return true;
    }

    function resetAutoRecordingState() {
        if (autoRecordingTimer) {
            clearTimeout(autoRecordingTimer);
            autoRecordingTimer = null;
        }
        autoRecordingEngaged = false;
    }

    function scheduleAutoRecordingTimeout() {
        if (autoRecordingTimer) {
            clearTimeout(autoRecordingTimer);
        }
        autoRecordingTimer = setTimeout(() => {
            autoRecordingTimer = null;
            stopAutoRecording();
        }, AUTO_RECORD_MAX_DURATION);
    }

    function startAutoRecording() {
        if (autoRecordingEngaged || window.isRecording || !inputTapNode) {
            return;
        }
        autoRecordingEngaged = true;
        startRecording().then((started) => {
            if (!started) {
                resetAutoRecordingState();
                autoRecordingTriggered = false;
                return;
            }
            if (!autoRecordingEngaged) {
                if (window.isRecording) {
                    stopRecording();
                }
                return;
            }
            scheduleAutoRecordingTimeout();
        }).catch((error) => {
            console.error("Auto recording failed to start:", error);
            resetAutoRecordingState();
            autoRecordingTriggered = false;
        });
    }

    function stopAutoRecording() {
        const wasEngaged = autoRecordingEngaged;
        resetAutoRecordingState();
        autoRecordingTriggered = false;
        if (wasEngaged && window.isRecording) {
            stopRecording();
        }
    }

    function mergeRecordingChunks(chunks, totalLength) {
        const merged = new Float32Array(totalLength);
        let offset = 0;
        for (let i = 0; i < chunks.length; i++) {
            merged.set(chunks[i], offset);
            offset += chunks[i].length;
        }
        return merged;
    }

    function encodeWavBuffer(samples, sampleRate) {
        const bytesPerSample = 2;
        const channelCount = 1;
        const dataLength = samples.length * bytesPerSample;
        const buffer = new ArrayBuffer(44 + dataLength);
        const view = new DataView(buffer);

        writeString(view, 0, "RIFF");
        view.setUint32(4, 36 + dataLength, true);
        writeString(view, 8, "WAVE");
        writeString(view, 12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, channelCount, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
        view.setUint16(32, channelCount * bytesPerSample, true);
        view.setUint16(34, bytesPerSample * 8, true);
        writeString(view, 36, "data");
        view.setUint32(40, dataLength, true);

        let offset = 44;
        for (let i = 0; i < samples.length; i++, offset += 2) {
            let s = samples[i];
            s = Math.max(-1, Math.min(1, s));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        return buffer;
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    async function triggerRecordingDownload(buffer) {
        const filename = `eas-recording-${new Date().toISOString().replace(/[:.]/g, "-")}.wav`;
        try {
            await saveFile(filename, buffer, "audio/wav");
          } catch (e) {
            console.error("saveFile failed:", e, e?.message, e?.stack);
            throw e;
          }
    }

    function updateRecordButtonLabel(isRecordingState) {
        const button = document.querySelector('[data-decoder-record-toggle]');
        if (button) {
            button.innerText = isRecordingState ? RECORD_LABEL_STOP : RECORD_LABEL_START;
        }
    }

    async function getMicrophones() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(e => e.kind == "audioinput");
    }

    async function runDecode(button) {
        const uploadFileButton = document.querySelector('[data-decoder-load]');
        const startStopButton = document.querySelector('[data-decoder-toggle]');
        const streamStartStopButton = document.querySelector('[data-decoder-stream-toggle]');
        const recordButton = document.querySelector('[data-decoder-record-toggle]');
        if (micSource) {
            uploadFileButton.disabled = false;
            await stopDecode();
            button.innerText = "Start Microphone Decoder";
        } else {
            uploadFileButton.disabled = true;
            resetDecoderState();
            let retval = await startDecoder(sel.value);
            if (retval === null) {
                uploadFileButton.disabled = false;
                startStopButton.disabled = true;
                addStatus("MICROPHONE ACCESS DENIED!", "red");
                return;
            }
            streamStartStopButton.disabled = true;
            recordButton.disabled = false;
            button.innerText = "Stop Microphone Decoder";
        }
    }

    async function runStreamDecoder(url) {
        const uploadFileButton = document.querySelector('[data-decoder-load]');
        const micStartStopButton = document.querySelector('[data-decoder-toggle]');
        const streamStartStopButton = document.querySelector('[data-decoder-stream-toggle]');

        if (!url) {
            uploadFileButton.disabled = false;
            micStartStopButton.disabled = false;
            setStreamToggleState(false);
            return;
        }
        window.streamUrl = url;

        resetDecoderState();

        let retval = await startStreamDecoder(url);

        if (retval === null) {
            uploadFileButton.disabled = false;
            micStartStopButton.disabled = false;
            addStatus("STREAM ACCESS FAILED!", "red");
            window.streamUrl = null;
            return;
        }

        else {
            uploadFileButton.disabled = true;
            micStartStopButton.disabled = true;
            streamStartStopButton.disabled = false;
        }

        setStreamToggleState(true);
    }

    async function populateMicrophones() {
        const mics = await getMicrophones();
        sel.innerHTML = "";
        mics.forEach(mic => {
            const option = document.createElement("option");
            option.value = mic.deviceId;
            option.innerText = mic.label;
            sel.appendChild(option);
        });
        if (micContainer) {
            micContainer.hidden = mics.length === 0;
        }
        sel.disabled = mics.length === 0;
    }

    async function startDecode(stream) {
        const source = decodeContext.createMediaStreamSource(stream);
        const micInputNode = createMicInputNode(source);
        micSource = source;
        attachInputTap(micInputNode);
        updateSampleRate(decodeContext.sampleRate);
        updateSync(false);
        decodeContext.resume();
        refreshLoopback();
    }

    async function stopDecode(resetEndec = true) {
        flushPendingDecodeTail();
        finalizeActiveSameProduct();
        resetDecoderState(resetEndec);
        if (window.isRecording) {
            stopRecording();
        }
        if (!micSource) {
            detachInputTap();
            stopMeter();
            decodeContext.suspend();
            addStatus("WAITING...", USES_DARK_THEME ? "white" : "black");
            return;
        }
        micSource.mediaStream.getTracks().forEach(e => e.stop());
        try {
            micSource.disconnect();
        } catch (error) {
            console.warn("Error disconnecting microphone source:", error);
        }
        micSource = null;
        detachInputTap();
        stopMeter();
        if (loopbackSourceNode) {
            stopLoopback();
        }
        decodeContext.suspend();
        document.querySelector('[data-decoder-stream-toggle]').disabled = false;
        document.querySelector('[data-decoder-record-toggle]').disabled = true;
        addStatus("WAITING...", USES_DARK_THEME ? "white" : "black");
    }
    populateMicrophones();

    function isLoopbackEnabled() {
        const loopbackToggle = document.getElementById("decoder-loopback");
        return !!(loopbackToggle && loopbackToggle.checked);
    }

    function refreshLoopback() {
        if (!isLoopbackEnabled()) {
            return;
        }
        startLoopback();
    }

    async function startLoopback() {
      stopLoopback();

      if (nativeStreamActive) {
        await setNativeLoopbackEnabled(true);
        return;
      }

      const loopbackSource = inputTapNode;
      if (!loopbackSource) return;

      loopbackDest = decodeContext.createMediaStreamDestination();
      loopbackSourceNode = loopbackSource;
      loopbackSourceNode.connect(loopbackDest);

      const audio = document.createElement("audio");
      audio.srcObject = loopbackDest.stream;
      audio.autoplay = true;
      audio.controls = false;
      audio.style.display = "none";
      audio.setAttribute("aria-hidden", "true");
      audio.setAttribute("aria-loopback", "true");
      document.body.appendChild(audio);

      const playPromise = audio.play && audio.play();
      if (playPromise?.catch) playPromise.catch(() => {});
    }

    async function stopLoopback() {
      if (nativeStreamActive) {
        await setNativeLoopbackEnabled(false);
      }

      if (loopbackSourceNode && loopbackDest) {
        try { loopbackSourceNode.disconnect(loopbackDest); }
        catch (e) { console.warn("Error disconnecting loopback source", e); }
      }
      loopbackSourceNode = null;
      loopbackDest = null;

      document.querySelectorAll("audio[aria-loopback='true']").forEach(a => {
        a.srcObject = null;
        a.remove();
      });
    }

    function setStreamToggleState(active) {
        streamToggleActive = active;
        const streamStartStopButton = document.querySelector('[data-decoder-stream-toggle]');
        if (streamStartStopButton) {
            streamStartStopButton.innerText = active ? "Stop Stream Decoder" : "Start Stream Decoder";
        }
    }

    function resetStreamRecovery() {
        if (streamRecoveryTimer) {
            clearTimeout(streamRecoveryTimer);
            streamRecoveryTimer = null;
        }
        streamRecoveryAttempts = 0;
    }

    function isRecoverableStreamError(mediaError) {
        if (!mediaError) {
            return true;
        }
        const abortedCode = typeof MediaError !== "undefined" && MediaError.MEDIA_ERR_ABORTED ? MediaError.MEDIA_ERR_ABORTED : 1;
        const networkCode = typeof MediaError !== "undefined" && MediaError.MEDIA_ERR_NETWORK ? MediaError.MEDIA_ERR_NETWORK : 2;
        return mediaError.code === abortedCode || mediaError.code === networkCode;
    }

    function scheduleStreamRecovery(audioElement) {
        if (streamRecoveryTimer || !streamToggleActive) {
            return;
        }
        if (streamRecoveryAttempts >= STREAM_RECOVERY_MAX_ATTEMPTS) {
            handleStreamFailure(new Error("Stream recovery failed"), true);
            void stopStreamDecode(audioElement.src);
            return;
        }
        streamRecoveryAttempts++;
        addStatus("RECONNECTING STREAM...", "yellow");
        streamRecoveryTimer = setTimeout(async () => {
            streamRecoveryTimer = null;
            if (streamElement !== audioElement || !streamToggleActive) {
                return;
            }
            try {
                audioElement.load();
                await audioElement.play();
                addStatus("STREAMING...", "green");
                resetStreamRecovery();
            } catch (retryError) {
                scheduleStreamRecovery(audioElement);
            }
        }, STREAM_RECOVERY_DELAY);
    }

    function handleStreamFailure(error, fatal = false) {
        console.warn("Stream playback error", error);
        if (fatal) {
            addStatus("STREAM ERROR!", "red");
            setStreamToggleState(false);
            window.streamUrl = null;
            return;
        }
        addStatus("STREAM INTERRUPTED...", "yellow");
    }

    document.addEventListener("click", () => {
        if (!sel.innerHTML) {
            populateMicrophones();
        }
    });

    // END decode/audio.js
    // BEGIN decode/afsk.js
    const ENDEC_DEBUG_HEAD_BYTES = 96;
    const ENDEC_DEBUG_TAIL_BYTES = 96;

    function createEndecCharacteristicsState() {
        return {
            knownModes: ENDEC_MODE_SIGNATURES,
            votes: createEndecModeVotes(),
            markers: {
                preambleSplit: 0,
                preambleRun16: 0,
                preambleRun17Plus: 0,
                terminatorZero: 0,
                validTerminatorZero: 0,
                terminatorZeroRun2Plus: 0,
                terminatorFF: 0,
                validTerminatorFF: 0,
                terminatorFFRun1: 0,
                terminatorFFRun3Plus: 0,
                digitalLeadZero: 0
            },
            timing: {
                samples: 0,
                averageGapMs: 0,
                lastGapMs: 0,
                trilithicGapHits: 0,
                trilithicAfterGapHits: 0,
                standardGapHits: 0
            }
        };
    }

    let endecCharacteristics = createEndecCharacteristicsState();
    let detectedEndecMode = "DEFAULT";
    let sameProductSequence = 0;
    let activeSameProduct = null;
    const sameProductResults = new Map();
    if (typeof window !== "undefined" && typeof window.endecDebug !== "boolean") {
        window.endecDebug = false; // set to true in the console to enable detailed same product logging, which will also be exported to window.lastEndecDebug and window.endecDebugHistory for further analysis. This is intentionally opt-in due to the potential volume of logs generated.
    }

    function snapshotEndecCounters() {
        return {
            markers: Object.assign({}, endecCharacteristics.markers),
            timing: Object.assign({}, endecCharacteristics.timing)
        };
    }

    function createSameProductState() {
        sameProductSequence++;
        return {
            id: sameProductSequence,
            headerKey: "",
            baseline: snapshotEndecCounters(),
            segments: [],
            alerts: [],
            rawBytes: {
                total: 0,
                head: [],
                tail: []
            },
            mode: "Detecting...",
            ready: false
        };
    }

    function ensureActiveSameProduct() {
        if (!activeSameProduct) {
            activeSameProduct = createSameProductState();
        }
        return activeSameProduct;
    }

    function normalizeSameProductHeaderKey(rawHeader) {
        return (typeof rawHeader === "string") ? rawHeader.trim().toUpperCase() : "";
    }

    function maybeRotateSameProduct(rawHeader) {
        const product = ensureActiveSameProduct();
        const key = normalizeSameProductHeaderKey(rawHeader);
        if (!key || key.startsWith("NNNN")) {
            return product;
        }
        if (!product.headerKey) {
            product.headerKey = key;
            return product;
        }
        if (product.headerKey !== key && product.segments.length > 0) {
            finalizeActiveSameProduct();
            const next = ensureActiveSameProduct();
            next.headerKey = key;
            return next;
        }
        return product;
    }

    function diffCounterObjects(current, baseline) {
        const out = {};
        for (const key in current) {
            const cur = current[key] || 0;
            const base = baseline[key] || 0;
            out[key] = Math.max(0, cur - base);
        }
        return out;
    }

    function formatHexByteList(bytes) {
        if (!Array.isArray(bytes) || bytes.length === 0) {
            return "";
        }
        return bytes.map((byteValue) => (byteValue & 0xFF).toString(16).padStart(2, "0")).join(" ");
    }

    function noteSameProductByte(byteValue) {
        if (!Number.isFinite(byteValue)) {
            return;
        }
        const byte = byteValue & 0xFF;
        const product = ensureActiveSameProduct();
        const raw = product.rawBytes;
        raw.total++;
        if (raw.head.length < ENDEC_DEBUG_HEAD_BYTES) {
            raw.head.push(byte);
            return;
        }
        if (raw.tail.length >= ENDEC_DEBUG_TAIL_BYTES) {
            raw.tail.shift();
        }
        raw.tail.push(byte);
    }

    function buildSameProductAnalysis(mode, rule, metrics) {
        return { mode, rule, metrics };
    }

    function logSameProductAnalysis(product, analysis) {
        if (!(typeof window !== "undefined" && window.endecDebug)) {
            return;
        }
        const headerPreview = (product.headerKey || "").slice(0, 96);
        const rawInfo = {
            total: product.rawBytes?.total || 0,
            headHex: formatHexByteList(product.rawBytes?.head || []),
            tailHex: formatHexByteList(product.rawBytes?.tail || []),
            headCount: product.rawBytes?.head?.length || 0,
            tailCount: product.rawBytes?.tail?.length || 0
        };
        const compactSegments = product.segments.map((segment) => ({
            type: segment.type,
            reason: segment.reason,
            termByte: segment.terminatorByte,
            termRun: segment.terminatorRunLength
        }));
        console.groupCollapsed(`[ENDEC DEBUG] product=${product.id} mode=${analysis.mode} rule=${analysis.rule}`);
        console.log("header", headerPreview);
        console.log("alerts", product.alerts.length, "segments", product.segments.length);
        console.log("metrics", analysis.metrics);
        console.log("segments", compactSegments);
        console.log("rawBytes", rawInfo);
        console.groupEnd();
        const exportRecord = {
            productId: product.id,
            header: headerPreview,
            mode: analysis.mode,
            rule: analysis.rule,
            metrics: analysis.metrics,
            segments: compactSegments,
            rawBytes: rawInfo
        };
        window.lastEndecDebug = exportRecord;
        if (!Array.isArray(window.endecDebugHistory)) {
            window.endecDebugHistory = [];
        }
        window.endecDebugHistory.push(exportRecord);
        if (window.endecDebugHistory.length > 200) {
            window.endecDebugHistory.shift();
        }
        console.log(`[ENDEC DEBUG EXPORT] ${JSON.stringify(exportRecord)}`);
    }

    function analyzeSameProductMode(product) {
        if (!product || !product.segments.length) {
            return buildSameProductAnalysis("DEFAULT", "empty_product", {
                alerts: 0,
                segments: 0
            });
        }
        let termZeroRun2Plus = 0;
        let termFFRun1 = 0;
        let termFFRun3Plus = 0;
        let preambleSplits = 0;
        let maxZeroTermRun = 0;
        let minZeroTermRun = Number.POSITIVE_INFINITY;
        let maxFFTermRun = 0;

        for (let i = 0; i < product.segments.length; i++) {
            const segment = product.segments[i];
            if (segment.reason === "PREAMBLE_SPLIT") {
                preambleSplits++;
            }
            if (segment.reason !== "TERM_BYTE") {
                continue;
            }
            if (segment.terminatorByte === 0x00 && segment.terminatorRunLength >= 2) {
                termZeroRun2Plus++;
                if (segment.terminatorRunLength > maxZeroTermRun) {
                    maxZeroTermRun = segment.terminatorRunLength;
                }
                if (segment.terminatorRunLength < minZeroTermRun) {
                    minZeroTermRun = segment.terminatorRunLength;
                }
            } else if (segment.terminatorByte === 0xFF && segment.terminatorRunLength >= 3) {
                termFFRun3Plus++;
                if (segment.terminatorRunLength > maxFFTermRun) {
                    maxFFTermRun = segment.terminatorRunLength;
                }
            } else if (segment.terminatorByte === 0xFF && segment.terminatorRunLength === 1) {
                termFFRun1++;
            }
        }

        const deltas = snapshotEndecCounters();
        const markers = diffCounterObjects(deltas.markers, product.baseline.markers);
        const timing = diffCounterObjects(deltas.timing, product.baseline.timing);
        const zeroRunSpread = (termZeroRun2Plus > 0 && minZeroTermRun !== Number.POSITIVE_INFINITY)
            ? (maxZeroTermRun - minZeroTermRun)
            : 0;
        const digitalSignalMarkers = (markers.digitalLeadZero >= 1) ? 1 : 0;
        const minNwsRuns = Math.max(4, product.alerts.length + 1);
        const metrics = {
            alerts: product.alerts.length,
            segments: product.segments.length,
            termZeroRun2Plus,
            termFFRun1,
            termFFRun3Plus,
            maxZeroTermRun,
            zeroRunSpread,
            maxFFTermRun,
            preambleSplits,
            minNwsRuns,
            digitalSignalMarkers,
            markers: Object.assign({}, markers),
            timing: Object.assign({}, timing)
        };
        const minSageRuns = Math.max(3, product.alerts.length + 1);
        const exactSage1822ByRun1 = termZeroRun2Plus === 0
            && termFFRun3Plus === 0
            && termFFRun1 >= minSageRuns
            && markers.validTerminatorFF === termFFRun1
            && markers.validTerminatorZero === 0
            && markers.digitalLeadZero === 0
            && timing.trilithicGapHits === 0
            && timing.trilithicAfterGapHits === 0;
        const exactSage1822ByRun3Profile = termZeroRun2Plus === 0
            && termFFRun1 === 0
            && termFFRun3Plus >= minSageRuns
            && markers.validTerminatorFF >= termFFRun3Plus
            && markers.validTerminatorZero === 0
            && markers.digitalLeadZero === 0
            && markers.preambleRun17Plus === 0
            && timing.standardGapHits >= 2
            && timing.trilithicGapHits === 0
            && timing.trilithicAfterGapHits === 0
            && timing.averageGapMs >= 900
            && timing.averageGapMs <= 1055
            && maxFFTermRun <= 160;
        const exactSage1822ByPartialCapture = termZeroRun2Plus === 0
            && termFFRun1 === 0
            && termFFRun3Plus === 2
            && markers.validTerminatorFF >= termFFRun3Plus
            && markers.validTerminatorZero === 0
            && markers.digitalLeadZero === 0
            && markers.preambleRun17Plus === 0
            && preambleSplits >= 1
            && timing.trilithicGapHits === 0
            && timing.trilithicAfterGapHits === 0
            && timing.standardGapHits === 0
            && maxFFTermRun <= 96
            && timing.averageGapMs >= 1040
            && timing.averageGapMs <= 1110;
        const exactSage1822 = exactSage1822ByRun1 || exactSage1822ByRun3Profile || exactSage1822ByPartialCapture;
        metrics.exactSage1822 = exactSage1822;
        metrics.exactSage1822ByRun1 = exactSage1822ByRun1;
        metrics.exactSage1822ByRun3Profile = exactSage1822ByRun3Profile;
        metrics.exactSage1822ByPartialCapture = exactSage1822ByPartialCapture;

        const strongTrilithic = timing.trilithicGapHits >= 2
            && (timing.trilithicAfterGapHits >= 1 || timing.trilithicGapHits > (timing.standardGapHits + 1));
        if (strongTrilithic) {
            return buildSameProductAnalysis("TRILITHIC", "strong_trilithic", metrics);
        }

        const strongDigitalWithLead = markers.digitalLeadZero >= 1
            && (termFFRun3Plus >= 1 || markers.validTerminatorFF >= 2);
        const strongDigitalByFfAndTiming = markers.digitalLeadZero === 0
            && termZeroRun2Plus === 0
            && termFFRun3Plus >= Math.max(3, product.alerts.length + 1)
            && markers.validTerminatorFF >= termFFRun3Plus
            && (timing.trilithicAfterGapHits >= 2 || (maxFFTermRun >= 192 && timing.averageGapMs >= 1065));
        if (strongDigitalWithLead || strongDigitalByFfAndTiming) {
            return buildSameProductAnalysis("SAGE DIGITAL 3644", "strong_digital", metrics);
        }
        const strongDigitalByZeroTiming = markers.digitalLeadZero === 0
            && termFFRun3Plus === 0
            && termFFRun1 === 0
            && termZeroRun2Plus >= minNwsRuns
            && markers.validTerminatorZero >= termZeroRun2Plus
            && timing.standardGapHits >= 3
            && timing.averageGapMs >= 1180
            && maxZeroTermRun <= 192;
        if (strongDigitalByZeroTiming) {
            return buildSameProductAnalysis("SAGE DIGITAL 3644", "digital_zero_timing", metrics);
        }

        const sageLike = (termFFRun1 >= 2 && termFFRun3Plus === 0)
            || (markers.digitalLeadZero === 0 && termFFRun3Plus >= Math.max(3, product.alerts.length + 1))
            || (termFFRun1 >= 3 && termFFRun1 >= (termFFRun3Plus + 2) && digitalSignalMarkers === 0);
        if (sageLike
            && termZeroRun2Plus === 0
            && markers.digitalLeadZero === 0) {
            if (exactSage1822) {
                return buildSameProductAnalysis("SAGE ANALOG 1822", "strong_sage_1822_exact", metrics);
            }
            return buildSameProductAnalysis("SAGE DIGITAL 3644", "sage_like_prefer_digital", metrics);
        }

        const strongNws = termZeroRun2Plus >= minNwsRuns
            && termFFRun3Plus === 0
            && termFFRun1 === 0
            && markers.digitalLeadZero === 0
            && preambleSplits === 0
            && timing.standardGapHits === 0
            && termZeroRun2Plus >= (preambleSplits + 3)
            && timing.trilithicGapHits === 0
            && timing.trilithicAfterGapHits === 0;
        if (strongNws) {
            return buildSameProductAnalysis("NWS", "strong_nws", metrics);
        }

        if (termZeroRun2Plus === 0 && (termFFRun1 > 0 || termFFRun3Plus > 0 || markers.validTerminatorFF > 0)) {
            if (markers.digitalLeadZero === 0) {
                if (exactSage1822) {
                    return buildSameProductAnalysis("SAGE ANALOG 1822", "ff_fallback_exact_1822", metrics);
                }
                return buildSameProductAnalysis("SAGE DIGITAL 3644", "ff_fallback_prefer_digital", metrics);
            }
            const digitalScore =
                (termFFRun3Plus * 1.5) +
                (markers.digitalLeadZero * 2);
            const sageScore =
                (termFFRun1 * 2) +
                (Math.max(0, markers.validTerminatorFF - termFFRun3Plus) * 0.5);
            const fallbackMetrics = Object.assign({}, metrics, { digitalScore, sageScore });
            if (!exactSage1822 && digitalScore === sageScore) {
                return buildSameProductAnalysis("SAGE DIGITAL 3644", "ff_fallback_tie_prefer_digital", fallbackMetrics);
            }
            return buildSameProductAnalysis(digitalScore > sageScore ? "SAGE DIGITAL 3644" : "SAGE ANALOG 1822", "ff_fallback", fallbackMetrics);
        }

        return buildSameProductAnalysis("DEFAULT", "default_fallback", metrics);
    }

    function finalizeActiveSameProduct() {
        if (!activeSameProduct) {
            return;
        }
        const product = activeSameProduct;
        const analysis = analyzeSameProductMode(product);
        const mode = analysis.mode;
        product.mode = mode;
        product.ready = true;
        for (let i = 0; i < product.alerts.length; i++) {
            product.alerts[i].endecMode = mode;
            product.alerts[i].endecModeReady = true;
        }
        sameProductResults.set(product.id, { mode, ready: true, analysis });
        if (sameProductResults.size > 256) {
            const first = sameProductResults.keys().next().value;
            sameProductResults.delete(first);
        }
        logSameProductAnalysis(product, analysis);
        activeSameProduct = null;
    }

    function getEndecCharacteristicsState() {
        if (!endecCharacteristics || typeof endecCharacteristics !== "object") {
            endecCharacteristics = createEndecCharacteristicsState();
        }
        return endecCharacteristics;
    }

    function resetEndecDetection() {
        endecCharacteristics = createEndecCharacteristicsState();
        detectedEndecMode = "DEFAULT";
        activeSameProduct = null;
        sameProductResults.clear();
    }

    function addEndecVote(mode, weight) {
        const characteristics = getEndecCharacteristicsState();
        const normalized = normalizeEndecMode(mode);
        characteristics.votes[normalized] = (characteristics.votes[normalized] || 0) + (weight || 0);
    }

    function isLikelySamePayload(payload) {
        if (typeof payload !== "string") {
            return false;
        }
        const msg = payload.trim().toUpperCase();
        if (!msg) {
            return false;
        }
        if (msg.startsWith("NNNN")) {
            return true;
        }
        if (!msg.startsWith("ZCZC")) {
            return false;
        }
        if (msg.length < 20) {
            return false;
        }
        return msg.includes("+") && msg.includes("-");
    }

    function noteEndecPreambleRun(runLength) {
        if (!Number.isFinite(runLength) || runLength < 15 || runLength > 24) {
            return;
        }
        const characteristics = getEndecCharacteristicsState();
        if (runLength >= 17) {
            characteristics.markers.preambleRun17Plus++;
            addEndecVote("SAGE DIGITAL 3644", 4);
        } else if (runLength >= 15) {
            characteristics.markers.preambleRun16++;
            addEndecVote("DEFAULT", 1.5);
        } else {
            return;
        }
        refreshDetectedEndecMode();
    }

    function detectEndecModeFromCharacteristics() {
        const characteristics = getEndecCharacteristicsState();
        const markers = characteristics.markers;
        const timing = characteristics.timing;
        const votes = characteristics.votes;

        const strongTrilithic = timing.trilithicGapHits >= 2
            && (timing.trilithicGapHits > (timing.standardGapHits + 1) || timing.trilithicAfterGapHits >= 1);
        if (strongTrilithic) {
            return "TRILITHIC";
        }

        const digitalEvidence =
            ((markers.digitalLeadZero >= 1) ? 2 : 0) +
            ((markers.preambleRun17Plus >= 1) ? 1 : 0) +
            ((markers.terminatorFFRun3Plus >= 1) ? 2 : 0);
        const digitalRunTimingSupport = markers.terminatorFFRun3Plus >= 2
            && (timing.trilithicAfterGapHits >= 1 || timing.averageGapMs >= 1065);
        const strongDigital =
            ((markers.digitalLeadZero >= 1) && (markers.preambleRun17Plus >= 1 || markers.terminatorFFRun3Plus >= 1))
            || digitalRunTimingSupport
            || digitalEvidence >= 4;

        const strongSage = markers.terminatorFFRun1 >= 2
            && markers.terminatorFFRun3Plus === 0
            && markers.validTerminatorZero === 0
            && markers.digitalLeadZero === 0
            && markers.preambleRun17Plus === 0;
        const exactSage1822ByRun1 = strongSage
            && markers.validTerminatorFF === markers.terminatorFFRun1;
        const exactSage1822ByRun3Profile = markers.terminatorZeroRun2Plus === 0
            && markers.terminatorFFRun1 === 0
            && markers.terminatorFFRun3Plus >= 3
            && markers.validTerminatorFF >= markers.terminatorFFRun3Plus
            && markers.validTerminatorZero === 0
            && markers.digitalLeadZero === 0
            && markers.preambleRun17Plus === 0
            && timing.standardGapHits >= 2
            && timing.trilithicGapHits === 0
            && timing.trilithicAfterGapHits === 0
            && timing.averageGapMs >= 900
            && timing.averageGapMs <= 1055;
        const exactSage1822ByPartialCapture = markers.terminatorZeroRun2Plus === 0
            && markers.terminatorFFRun1 === 0
            && markers.terminatorFFRun3Plus === 2
            && markers.validTerminatorFF >= markers.terminatorFFRun3Plus
            && markers.validTerminatorZero === 0
            && markers.digitalLeadZero === 0
            && markers.preambleRun17Plus === 0
            && markers.preambleSplit >= 1
            && timing.trilithicGapHits === 0
            && timing.trilithicAfterGapHits === 0
            && timing.standardGapHits === 0
            && timing.averageGapMs >= 1040
            && timing.averageGapMs <= 1110;
        const exactSage1822 = exactSage1822ByRun1 || exactSage1822ByRun3Profile || exactSage1822ByPartialCapture;
        const sageLike = markers.validTerminatorFF >= 2
            && markers.validTerminatorZero === 0
            && markers.digitalLeadZero === 0;

        const strongNws = markers.terminatorZeroRun2Plus >= 2
            && markers.validTerminatorFF === 0
            && markers.digitalLeadZero === 0
            && markers.preambleSplit <= 1
            && timing.trilithicGapHits === 0
            && timing.trilithicAfterGapHits === 0;

        if (strongDigital) {
            return "SAGE DIGITAL 3644";
        }
        if (exactSage1822) {
            return "SAGE ANALOG 1822";
        }
        if (strongSage || sageLike) {
            return "SAGE DIGITAL 3644";
        }
        if (strongNws) {
            return "NWS";
        }

        let bestMode = "DEFAULT";
        let bestScore = votes.DEFAULT;
        for (let i = 1; i < ENDEC_MODES.length; i++) {
            const mode = ENDEC_MODES[i];
            const score = votes[mode];
            if (score > bestScore) {
                bestScore = score;
                bestMode = mode;
            }
        }
        return bestMode;
    }

    function refreshDetectedEndecMode() {
        const mode = detectEndecModeFromCharacteristics();
        detectedEndecMode = mode;
        return mode;
    }

    function getDetectedEndecMode() {
        return normalizeEndecMode(detectedEndecMode);
    }

    function noteEndecSplitReason(reason, byteValue, payload, terminatorRunLength = 1) {
        const characteristics = getEndecCharacteristicsState();
        const validPayload = isLikelySamePayload(payload);
        switch (reason) {
            case "PREAMBLE_SPLIT":
                characteristics.markers.preambleSplit++;
                addEndecVote("DEFAULT", 1.5);
                addEndecVote("TRILITHIC", 2);
                break;
            case "TERM_BYTE":
                if (byteValue === 0x00) {
                    characteristics.markers.terminatorZero++;
                    if (validPayload) {
                        if (terminatorRunLength >= 2) {
                            characteristics.markers.validTerminatorZero++;
                            characteristics.markers.terminatorZeroRun2Plus++;
                            addEndecVote("NWS", 3.5);
                        } else {
                            addEndecVote("NWS", 0.5);
                        }
                    }
                } else if (byteValue === 0xFF) {
                    characteristics.markers.terminatorFF++;
                    if (validPayload) {
                        characteristics.markers.validTerminatorFF++;
                        if (terminatorRunLength >= 3) {
                            characteristics.markers.terminatorFFRun3Plus++;
                            addEndecVote("SAGE DIGITAL 3644", 4);
                            addEndecVote("SAGE ANALOG 1822", 0.5);
                        } else if (terminatorRunLength === 1) {
                            characteristics.markers.terminatorFFRun1++;
                            addEndecVote("SAGE ANALOG 1822", 4);
                            addEndecVote("SAGE DIGITAL 3644", 0.5);
                        } else {
                            addEndecVote("SAGE ANALOG 1822", 1.5);
                            addEndecVote("SAGE DIGITAL 3644", 1.5);
                        }
                    }
                }
                break;
            default:
                break;
        }
        refreshDetectedEndecMode();
    }

    function noteEndecLeadingByteBeforePreamble(byteValue) {
        if (byteValue !== 0x00) {
            return;
        }
        const characteristics = getEndecCharacteristicsState();
        characteristics.markers.digitalLeadZero++;
        addEndecVote("SAGE DIGITAL 3644", 5.5);
        refreshDetectedEndecMode();
    }

    function noteEndecGapMs(gapMs) {
        if (!Number.isFinite(gapMs) || gapMs < 200 || gapMs > 2500) {
            return;
        }
        const characteristics = getEndecCharacteristicsState();
        const timing = characteristics.timing;
        timing.lastGapMs = gapMs;
        timing.samples++;
        timing.averageGapMs += (gapMs - timing.averageGapMs) / timing.samples;

        if (gapMs >= 760 && gapMs <= 930) {
            timing.trilithicGapHits++;
            addEndecVote("TRILITHIC", 5);
        } else if (gapMs >= 1080 && gapMs <= 1160) {
            timing.trilithicAfterGapHits++;
            addEndecVote("TRILITHIC", 3);
        } else if (gapMs >= 930 && gapMs < 1050) {
            timing.standardGapHits++;
            addEndecVote("DEFAULT", 2);
        }
        refreshDetectedEndecMode();
    }

    function getOverallEndecMode() {
        const detected = getDetectedEndecMode();
        if (detected !== "DEFAULT") {
            return detected;
        }
        const el = document.getElementById("overallEndecMode");
        const raw = (el && typeof el.value === "string") ? el.value : detected;
        return normalizeEndecMode(raw);
    }

    function samplesFromMs(ms) {
        return Math.round(sampleRate * (ms / 1000));
    }

    const SAME_PREAMBLE = "\xAB".repeat(16);

    function stripLeadingPreamble16(s) {
        return (typeof s === "string" && s.startsWith(SAME_PREAMBLE)) ? s.slice(16) : s;
    }

    function bitsFromStringLSB(str) {
        const bits = [];
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i) & 0xFF;
            for (let b = 0; b < 8; b++) {
                bits.push((c >> b) & 1);
            }
        }
        return bits;
    }

    function buildTxStringsFromBursts(base, bursts) {
        const txStrings = new Array(bursts.length);
        for (let i = 0; i < bursts.length; i++) {
            const burst = bursts[i];
            txStrings[i] = burst.prefix + base + burst.suffix;
        }
        return txStrings;
    }

    function buildHeaderTxStrings(header, mode) {
        const msg = stripLeadingPreamble16(header);
        const data = SAME_PREAMBLE + msg;
        const profile = getEndecModeProfile(mode);
        return buildTxStringsFromBursts(data, profile.headerBursts);
    }

    function buildEomTxStrings(mode) {
        const core = SAME_PREAMBLE + "NNNN";
        const profile = getEndecModeProfile(mode);
        return buildTxStringsFromBursts(core, profile.eomBursts);
    }

    function emitTxBurstsFromStrings(txStrings, betweenSilenceSamples, finalSilenceSamples) {
        if (typeof generate_afsk !== "function" || typeof generate_silence !== "function") {
            return;
        }
        const cache = new Map();

        for (let i = 0; i < txStrings.length; i++) {
            const s = txStrings[i];
            let bits = cache.get(s);
            if (!bits) {
                bits = bitsFromStringLSB(s);
                cache.set(s, bits);
            }

            generate_afsk(bits);

            const isLast = (i === txStrings.length - 1);
            if (!isLast) {
                generate_silence(betweenSilenceSamples);
            } else if (finalSilenceSamples != null) {
                generate_silence(finalSilenceSamples);
            }
        }
    }

    function create_header_tones(header) {
        const mode = getOverallEndecMode();
        const profile = getEndecModeProfile(mode);
        const txStrings = buildHeaderTxStrings(header, mode);
        const between = samplesFromMs(profile.betweenGapMs);
        const after = samplesFromMs(profile.afterGapMs);
        emitTxBurstsFromStrings(txStrings, between, after);
    }

    function create_eom_tones() {
        const mode = getOverallEndecMode();
        const profile = getEndecModeProfile(mode);
        const oneSecondSamples = samplesFromMs(1000);
        if (typeof generate_silence === "function") {
            generate_silence(oneSecondSamples);
        }
        const txStrings = buildEomTxStrings(mode);
        const between = samplesFromMs(profile.betweenGapMs);
        emitTxBurstsFromStrings(txStrings, between, oneSecondSamples);
    }

    resetEndecDetection();
    let buffer = [];

    function runDecoder(buf) {
        if (!buf || !buf.length) {
            return;
        }
        afskdemod(buf);
    }

    let dcWindow = [];

    let fMark = 0;
    let fSpace = 0;
    let phaseMark = 0;
    let phaseSpace = 0;
    let bitPeriod = 0;

    function updateSampleRate(sr) {
        fMark = 2083.3 / sr;
        fSpace = 1562.5 / sr;
        phaseMark = 2 * Math.PI * fMark;
        phaseSpace = 2 * Math.PI * fSpace;
        bitPeriod = Math.round(sr / 520.8333333333);
        sampleRate = sr;

        for (let i = 0; i < bitPeriod; i++) {
            markIwindow[i] = 0;
            markQwindow[i] = 0;
            spaceIwindow[i] = 0;
            spaceQwindow[i] = 0;
        }
    }

    for (let i = 0; i < 128; i++) {
        dcWindow[i] = 0;
    }

    const TWO_PI = 2 * Math.PI;
    let markIwindow = [];
    let markQwindow = [];
    let spaceIwindow = [];
    let spaceQwindow = [];
    let markIInteg = 0;
    let markQInteg = 0;
    let spaceIInteg = 0;
    let spaceQInteg = 0;

    let prevSample = 0;
    let clock = 0;
    let markIndex = 0;
    let spaceIndex = 0;

    let dcSum = 0;

    function afskdemod(signal) {
        for (var i = 0; i < 128; i++) {
            const sig = signal[i];
            const markI = sig * Math.sin(markIndex);
            const markQ = sig * Math.cos(markIndex);
            const spaceI = sig * Math.sin(spaceIndex);
            const spaceQ = sig * Math.cos(spaceIndex);
            markIndex += phaseMark;
            spaceIndex += phaseSpace;
            if (markIndex > TWO_PI) {
                markIndex -= TWO_PI;
            }
            if (spaceIndex > TWO_PI) {
                spaceIndex -= TWO_PI;
            }
            markIInteg += markI - markIwindow[clock];
            markQInteg += markQ - markQwindow[clock];
            spaceIInteg += spaceI - spaceIwindow[clock];
            spaceQInteg += spaceQ - spaceQwindow[clock];

            markIwindow[clock] = markI;
            markQwindow[clock] = markQ;
            spaceIwindow[clock] = spaceI;
            spaceQwindow[clock] = spaceQ;

            let s1 = markIInteg * markIInteg + markQInteg * markQInteg;
            let s2 = spaceIInteg * spaceIInteg + spaceQInteg * spaceQInteg;
            clockdemod(s1 - s2);
            clock++;
            if (clock >= bitPeriod) {
                clock = 0;
            }
        }
    }

    updateSampleRate(48000);

    // END decode/afsk.js
    // BEGIN decode/clock.js
    let bitclock = 0;
    let prevbit = 0;
    let shift = 0;

    let bits = [];
    let bytes = [];
    let currentByte = 0;
    let bytePos = 0;
    let samples = [];
    let decoding = false;
    let headerTimes = 0;
    let syncReg = 0;
    let tolerance = 0.05;
    let demodSampleCounter = 0;
    let previousCompletedByte = -1;
    let abRunLength = 0;
    let preambleByteRun = 0;
    let terminatorRunByte = -1;
    let terminatorRunCount = 0;
    let lastPayloadByteSample = 0;

    let currentMsg = "";
    let container = null;
    let currentMsgFastPathHandled = false;

    function hasCompleteSameHeaderTail(msg) {
        if (!msg || !msg.startsWith("ZCZC-") || msg[msg.length - 1] !== "-") {
            return false;
        }
        const lastDash = msg.length - 1;
        const senderDash = msg.lastIndexOf("-", lastDash - 1);
        if (senderDash < 0) {
            return false;
        }
        return (lastDash - senderDash - 1) === 8;
    }

    function finalizeAlert(reason = "UNKNOWN", terminatorByte = null, terminatorRunLength = 1) {
        decoding = false;
        abRunLength = 0;
        preambleByteRun = 0;
        terminatorRunByte = -1;
        terminatorRunCount = 0;
        updateSync(false);
        maybeRotateSameProduct(currentMsg);
        noteEndecSplitReason(reason, terminatorByte, currentMsg, terminatorRunLength);
        const segmentMeta = {
            reason,
            terminatorByte,
            terminatorRunLength,
            observedMode: getDetectedEndecMode()
        };
        if (container) {
            container.appendChild(document.createTextNode(" "));
            try {
                if (currentMsgFastPathHandled) {
                    const product = maybeRotateSameProduct(currentMsg);
                    product.segments.push({
                        type: "header",
                        reason: segmentMeta.reason || "UNKNOWN",
                        terminatorByte: segmentMeta.terminatorByte ?? null,
                        terminatorRunLength: segmentMeta.terminatorRunLength ?? 0,
                        observedMode: segmentMeta.observedMode || "DEFAULT"
                    });
                } else {
                    processHeader(currentMsg, container, segmentMeta);
                }
            } catch (e) {
                console.error("Error finalizing alert:", e);
            }
        }
        container = null;
        currentMsg = "";
        currentMsgFastPathHandled = false;
        headerTimes = 0;
    }

    function resetDecoderState(resetEndec = true) {
        stopAutoRecording();
        bitclock = 0;
        prevbit = 0;
        shift = 0;
        bits = [];
        bytes = [];
        samples = [];
        currentByte = 0;
        bytePos = 0;
        decoding = false;
        headerTimes = 0;
        syncReg = 0;
        currentMsg = "";
        container = null;
        currentMsgFastPathHandled = false;
        demodSampleCounter = 0;
        previousCompletedByte = -1;
        abRunLength = 0;
        preambleByteRun = 0;
        terminatorRunByte = -1;
        terminatorRunCount = 0;
        lastPayloadByteSample = 0;
        if (resetEndec) {
            resetEndecDetection();
        }
        clock = 0;
        markIndex = 0;
        spaceIndex = 0;
        markIInteg = 0;
        markQInteg = 0;
        spaceIInteg = 0;
        spaceQInteg = 0;
        for (let i = 0; i < bitPeriod; i++) {
            markIwindow[i] = 0;
            markQwindow[i] = 0;
            spaceIwindow[i] = 0;
            spaceQwindow[i] = 0;
        }
    }

    function flushPendingDecodeTail() {
        if (!decoding || !currentMsg.length) {
            return;
        }
        if (terminatorRunCount > 0 && (terminatorRunByte === 0x00 || terminatorRunByte === 0xFF)) {
            finalizeAlert("TERM_BYTE", terminatorRunByte, terminatorRunCount);
        } else {
            finalizeAlert("PREAMBLE_SPLIT");
        }
    }

    function clockdemod(sample) {
        demodSampleCounter++;
        const bit = discriminator(sample);
        if (bit !== prevbit) {
            bitclock = 0;
        }
        if (bitclock == Math.floor(bitPeriod / 2)) {
            currentByte |= (bit << bytePos);
            syncReg = ((syncReg << 1) | bit) & 0xFF;
            if (syncReg == 0xAB && !decoding) {
                bytePos = 0;
                headerTimes++;
            }
            bytePos++;
            if (bytePos == 8) {
                const byteSample = demodSampleCounter;
                if (!decoding) {
                    if (terminatorRunCount > 0) {
                        terminatorRunByte = -1;
                        terminatorRunCount = 0;
                    }
                    if (currentByte === 0xAB) {
                        if (abRunLength === 0) {
                            noteEndecLeadingByteBeforePreamble(previousCompletedByte);
                            if (lastPayloadByteSample > 0) {
                                const gapMs = ((byteSample - lastPayloadByteSample) * 1000) / sampleRate;
                                noteEndecGapMs(gapMs);
                            }
                        }
                        abRunLength++;
                    } else {
                        abRunLength = 0;
                    }
                }
                if (currentByte === 0xAB && currentMsg.length === 0 && (preambleByteRun > 0 || headerTimes > 0)) {
                    preambleByteRun++;
                } else if (preambleByteRun > 0) {
                    noteEndecPreambleRun(preambleByteRun);
                    preambleByteRun = 0;
                }
                if (currentByte == 0xAB) {
                    headerTimes++;
                    if (headerTimes > 4) {
                        decoding = true;
                        abRunLength = 0;
                        updateSync(true);
                    }
                } else {
                    headerTimes = 0;
                }
                if (decoding) {
                    noteSameProductByte(currentByte);
                    let handledByte = false;
                    const isTerminatorByte = (currentByte == 0 || currentByte == 0xFF);
                    if (isTerminatorByte) {
                        if (terminatorRunCount === 0) {
                            terminatorRunByte = currentByte;
                            terminatorRunCount = 1;
                        } else if (terminatorRunByte === currentByte) {
                            terminatorRunCount++;
                        } else {
                            const termByte = terminatorRunByte;
                            const termCount = terminatorRunCount;
                            finalizeAlert("TERM_BYTE", termByte, termCount);
                        }
                        handledByte = true;
                    } else if (terminatorRunCount > 0) {
                        const termByte = terminatorRunByte;
                        const termCount = terminatorRunCount;
                        finalizeAlert("TERM_BYTE", termByte, termCount);
                        headerTimes = (currentByte == 0xAB) ? 1 : 0;
                        handledByte = true;
                    }

                    if (!handledByte) {
                        if (!micSource && currentByte == 0xAB && headerTimes > 4 && currentMsg.length && container) {
                            if (lastPayloadByteSample > 0) {
                                const splitGapMs = ((byteSample - lastPayloadByteSample) * 1000) / sampleRate;
                                noteEndecGapMs(splitGapMs);
                            }
                            finalizeAlert("PREAMBLE_SPLIT");
                            headerTimes = 1;
                        } else if (currentByte !== 0xAB) {
                            lastPayloadByteSample = byteSample;
                            if (!container) {
                                container = document.createElement("div");
                                container.className = "alert";
                                document.querySelector("#output").appendChild(container);
                            }
                            const currentChar = String.fromCharCode(currentByte);
                            // If the character is not valid, just skip printing it and continue to the next valid character
                            if (currentByte >= 32 && currentByte <= 126 && /^[A-Za-z0-9\-\+\/\(\)\\ ]$/.test(currentChar) === false) {
                                // Skip invalid character
                            }

                            else {
                                container.innerText += currentChar;
                                currentMsg += currentChar;
                                if (currentMsg === "NNNN" && eomCount === 2) {
                                    finalizeAlert("EOM_PAYLOAD");
                                } else if (!currentMsgFastPathHandled && currentChar === "-" && hasCompleteSameHeaderTail(currentMsg)) {
                                    const product = maybeRotateSameProduct(currentMsg);
                                    const parsedHeader = parseHeader(currentMsg, product.id);
                                    if (parsedHeader && !parsedHeader.eom) {
                                        product.alerts.push(parsedHeader);
                                        const view = document.createElement("button");
                                        view.addEventListener("click", () => {
                                            showModal(parsedHeader);
                                            window.modalShown = true;
                                        });
                                        view.innerText = "View Alert";
                                        container.appendChild(document.createElement("span")).innerHTML = "&emsp;&emsp;";
                                        container.appendChild(view);
                                        currentMsgFastPathHandled = true;
                                    }
                                }
                            }
                            handleAutoRecordingTriggers();
                        }
                    }
                }
                previousCompletedByte = currentByte;
                bytePos = 0;
                currentByte = 0;
            }
        }
        if (bitclock >= bitPeriod) {
            bitclock = 0;
        }
        bitclock++;
        prevbit = bit;
    }

    function handleAutoRecordingTriggers() {
        if (!autoRecordingTriggered && currentMsg.length >= 4) {
            const prefix = currentMsg.slice(0, 4).toUpperCase();
            if (prefix === "ZCZC") {
                autoRecordingTriggered = true;
                startAutoRecording();
            }
        }
        if (autoRecordingTriggered && currentMsg.length >= 4) {
            const tailWindow = currentMsg.slice(-8).toUpperCase();
            if (tailWindow.includes("NNNN")) {
                stopAutoRecording();
            }
        }
    }

    let thres = 15;

    let bitState = 0;

    function discriminator(sample) {
        if (sample > thres) {
            bitState = 1;
        } else if (sample < -thres) {
            bitState = 0;
        }
        return bitState;
    }

    function updateSync(sync) {
        addStatus(sync ? "SYNC" : "NO SYNC", sync ? "green" : "red");
    }
    // END decode/clock.js
    // BEGIN decode/header.js
    function parseHeader(input, productId = null) {
        if (input.startsWith("NNNN")) {
            eomCount++;
            const isFinalEomBurst = (eomCount === 3);
            if (isFinalEomBurst) {
                finalizeActiveSameProduct();
                eomCount = 0;
            }
            return {
                eom: true,
                endecMode: "Detecting...",
                endecModeReady: false,
                productId,
                isFinalEomBurst
            };
        }
        let output = {};
        const parts = input.split("+");
        const first = parts[0].split("-");
        const second = parts[1].split("-");
        if (first.length < 3 || second.length !== 4) {
            return;
        }
        first.shift();
        output.originator = first.shift();
        output.event = first.shift();
        output.locationCodes = first.map(e => parseLocation(e));
        output.alertTime = second.shift();
        output.issueTime = parseTime(second.shift());
        output.sender = second.shift();
        output.rawHeader = input;
        output.endecMode = "Detecting...";
        output.endecModeReady = false;
        output.productId = productId;
        return output;
    }

    function parseLocation(loc) {
        let ret = {};
        if (loc.length !== 6) {
            return "UNKNOWN";
        }
        ret.region = rgn[loc[0]] || "None";
        const st = loc.slice(1, 3);
        const countyCode = loc.slice(3, 6);
        const countyMap = county[st];
        if (countyMap && countyMap[countyCode]) {
            ret.state = state[st] || "US";
            ret.county = countyMap[countyCode];
        } else {
            const caName = canadaCounty[loc.slice(1)];
            if (caName) {
                ret.state = "Canada";
                ret.county = caName;
            } else {
                ret.state = state[st] || "Unknown";
                ret.county = `FIPS Code ${loc}`;
            }
        }
        return ret;
    }

    function parseTime(str) {
        if (str.length !== 7) {
            return;
        }
        const date = new Date(new Date().getFullYear(), 0, parseInt(str.slice(0, 3)));
        date.setUTCHours(parseInt(str.slice(3, 5)), parseInt(str.slice(5, 7)));
        return date;
    }

    function locationsToReadable(codes) {
        let output = "";

        for (let i = 0; i < codes.length; i++) {
            if (codes[i].region !== "None") {
                output += codes[i].region + " ";
            }
            output += codes[i].county ? codes[i].county : "Unknown Location";
            output += (i == (codes.length - 1)) ? "." : ", ";
        }
        return output;
    }

    let eomCount = 0;

    function processHeader(header, container, segmentMeta = null) {
        let product = null;
        let parsedHeader = null;

        if (isObject(header)) {
            product = maybeRotateSameProduct(header.rawHeader);
            parsedHeader = parseHeader(header.rawHeader, product.id);
            parsedHeader.endecMode = "NONE (Raw Header)";
            parsedHeader.endecModeReady = true;
            parsedHeader.productId = null;
        } else {
            product = maybeRotateSameProduct(header);
            parsedHeader = parseHeader(header, product.id);
        }

        const view = document.createElement("button");

        product.segments.push({
            type: parsedHeader.eom ? "eom" : "header",
            reason: segmentMeta?.reason || "UNKNOWN",
            terminatorByte: segmentMeta?.terminatorByte ?? null,
            terminatorRunLength: segmentMeta?.terminatorRunLength ?? 0,
            observedMode: segmentMeta?.observedMode || "DEFAULT"
        });

        if (parsedHeader.eom) {
            const eomIndicator = document.createElement("div");
            eomIndicator.style.color = "var(--color-border-light)";
            eomIndicator.style.display = "inline";
            eomIndicator.innerText = "[EOM]";
            container.appendChild(eomIndicator);
            if (parsedHeader.isFinalEomBurst) {
                const eomSeparator = document.createElement("hr");
                eomSeparator.classList = "eom-hr";
                container.appendChild(eomSeparator);
            }
            return;
        }

        product.alerts.push(parsedHeader);

        view.addEventListener("click", () => {
            showModal(parsedHeader);
            window.modalShown = true;
        });

        view.innerText = "View Alert";

        container.appendChild(document.createElement("span")).innerHTML = "&emsp;&emsp;";
        container.appendChild(view);
    }
    // END decode/header.js
    // BEGIN decode/alertinfo.js
    const modalClose = document.querySelector("#close");
    const modalContainer = document.querySelector(".modalContainer");
    const infoContainer = document.querySelector(".modalInfo");
    const modalBox = document.querySelector(".modalBox");
    let modalRequestToken = 0;
    modalClose.addEventListener("click", () => {
        if (window.modalShown) {
            modalRequestToken++;
            modalContainer.style.display = "none";
        }
    });

    modalContainer.addEventListener("click", (e) => {
        if (e.target === modalContainer && window.modalShown) {
            modalRequestToken++;
            modalContainer.style.display = "none";
        }
    });

    async function showAlertInfo(header) {
        const requestToken = ++modalRequestToken;
        const e2tReady = window.EAS2TextModulePromise;
        const resourcePromise = e2tReady.then(({ loadAllResources }) =>
            loadAllResources({ fallbackBase: 'assets/E2T/' })
        );
        const [{ EAS2Text }, resources] = await Promise.all([e2tReady, resourcePromise]);
        if (requestToken !== modalRequestToken) {
            return;
        }
        let alertType = "Information";

        infoContainer.innerHTML = "";

        const alertName = events[header.event];
        const issueTime = header.issueTime;
        const expirationTime = getExpirationTime(issueTime, header.alertTime);
        const regex = window.EASREGEX;
        let endecMode = header.endecMode || "Detecting...";
        if (!header.endecModeReady) {
            const resolved = sameProductResults.get(header.productId);
            if (resolved && resolved.ready) {
                endecMode = resolved.mode;
                header.endecMode = resolved.mode;
                header.endecModeReady = true;
            } else {
                endecMode = "Detecting...";
            }
        }
        const cleanHeader = header.rawHeader.trim().replace(regex, 'ZCZC-$1-$2-$3+$4-$5-$6-');

        let eas = await EAS2Text.fromUSMessage(cleanHeader, { resources, mode: 'NONE', useLocaleTimezone: true }).catch((e) => {
            console.error("Error parsing EAS to text:", e);
            return null;
        });
        if (!eas) {
            eas = { EASText: "Error generating EAS text." };
        }
        const encodedHeader = encodeURIComponent(header.rawHeader);
        const easText = eas.EASText.replace(/\n/g, "<br>");
        const openInEncoderButton = `<button id="openInEncoderButton${requestToken}">Open in SAME Encoder</button>`;

        if (easText.match(/(Warning|Emergency|Immediate)/i) && !easText.match(/(Demo)/i)) {
            modalBox.style.border = "3px solid red";
            modalBox.style.borderRadius = "10px";
            alertType = "Warning";
        }

        else if (easText.match(/(Watch)/i)) {
            modalBox.style.border = "3px solid orange";
            modalBox.style.borderRadius = "10px";
            alertType = "Watch";
        }

        else if (easText.match(/(Advisory)/i)) {
            modalBox.style.border = "3px solid yellow";
            modalBox.style.borderRadius = "10px";
            alertType = "Advisory";
        }

        else if (easText.match(/(Statement)/i)) {
            modalBox.style.border = "3px solid blue";
            modalBox.style.borderRadius = "10px";
            alertType = "Statement";
        }

        else if (easText.match(/(Information|Test|Demo)/i)) {
            modalBox.style.border = "3px solid green";
            modalBox.style.borderRadius = "10px";
            alertType = "Information";
        }

        else {
            modalBox.style.border = "3px solid gray";
            modalBox.style.borderRadius = "10px";
            alertType = "Unknown";
        }

        infoContainer.appendChild(createInfo(`Severity: ${alertType}`));
        infoContainer.appendChild(createInfo(`Type: ${alertName}`));
        infoContainer.appendChild(createInfo(`Issuer: ${entryNames[header.originator]}`));
        infoContainer.appendChild(createInfo(`Affected Locations: ${locationsToReadable(header.locationCodes)}`));
        infoContainer.appendChild(createInfo(`Issue date: ${dateToReadable(issueTime, false)}`));
        infoContainer.appendChild(createInfo(`Expires on: ${dateToReadable(expirationTime, false)}`));
        infoContainer.appendChild(createInfo(`Time until Expiration: ${isExpired(issueTime, expirationTime) ? "EXPIRED" : relativeToReadable(subtractRelative(expirationTime, new Date()), false)}`));
        infoContainer.appendChild(createInfo(`Sender ID: ${header.sender}`));
        infoContainer.appendChild(createInfo(`ENDEC Used (best-guess): ${endecMode}`));
        infoContainer.appendChild(document.createElement("br"));
        infoContainer.appendChild(createInfo(`Human-Readable Alert Text: "${easText}"`));
        infoContainer.appendChild(document.createElement("br"));
        infoContainer.appendChild(createInfo(openInEncoderButton));

        const openInEncoderBtn = document.getElementById(`openInEncoderButton${requestToken}`);
        if (openInEncoderBtn) {
            openInEncoderBtn.addEventListener("click", () => {
                const encoderUrl = `index.html?tool=encoder&header=${encodedHeader}`;
                window.location.href = encoderUrl;
            });
        }
    }

    function timeToReadable(time, use24) {
        if (use24) {
            return time.getHours().toString().padStart(2, "0") + ":" + time.getMinutes().toString().padStart(2, "0");
        } else {
            const hrs = (time.getHours() % 12);
            return (((hrs == 0) ? 12 : hrs).toString().padStart(2, "0") + ":" + time.getMinutes().toString().padStart(2, "0") + " " + ((time.getHours() >= 12) ? "PM" : "AM"));
        }
    }

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    function dateToReadable(time, use24) {
        const readableTime = timeToReadable(time, use24);
        return months[time.getMonth()] + " " + numberPrefix(time.getDate()) + ", " + readableTime;
    }

    const pre = ["th", "st", "nd", "rd"];
    function numberPrefix(num) {
        if (Math.floor(num / 10) == 1) {
            return num + "th";
        }
        const prefix = pre[num % 10];
        return num + (prefix ? prefix : "th")
    }

    function isExpired(issueTime, expirationTime) {
        const now = Date.now();
        if (issueTime.getTime() > now) {
            return true;
        }
        return now > expirationTime.getTime();
    }

    function relativeToReadable(time) {
        let output = "";
        if (time.hrs > 0) {
            output += time.hrs.toString().padStart(2, "0") + " hrs ";
        }
        output += time.mins.toString().padStart(2, "0") + ((time.mins == 1) ? " min" : " mins");
        return output;
    }

    function subtractRelative(date1, date2) {
        const time = Math.floor((date1.getTime() - date2.getTime()) / 1000) / 60;
        return {
            hrs: Math.floor(time / 60),
            mins: Math.floor(time % 60)
        };
    }

    function getExpirationTime(issueTime, inputStr) {
        const hrs = parseInt(inputStr.slice(0, 2));
        const mins = parseInt(inputStr.slice(2));
        const date = new Date(issueTime);
        date.setHours(issueTime.getHours() + hrs, issueTime.getMinutes() + mins);
        return date;
    }

    function createInfo(content) {
        const infoElem = document.createElement("div");
        infoElem.className = "info";
        infoElem.innerHTML = content;
        return infoElem;
    }

    function clearInfo() {
        infoContainer.innerHTML = "";
    }

    function showModal(parsedHeader) {
        modalContainer.style.display = "flex";
        showAlertInfo(parsedHeader);
    }

    // END decode/alertinfo.js
    const decoderToggle = document.querySelector('[data-decoder-toggle]');
    if (decoderToggle) {
        decoderToggle.addEventListener('click', function () {
            runDecode(this);
        });
    }

    const streamToggle = document.querySelector('[data-decoder-stream-toggle]');
    if (streamToggle) {
        streamToggle.addEventListener('click', async function () {
            if (!streamToggleActive) {
                if (!window.streamUrl) {
                    const streamUrl = prompt("Enter the URL of the DIRECT audio stream (YouTube NOT supported!):");
                    if (!streamUrl) {
                        return;
                    }
                    const trimmed = streamUrl.trim();
                    if (!trimmed.match(/^https:\/\/.+/i)) {
                        alert("Invalid URL. Please enter a valid https://... URL.");
                        return;
                    }
                    window.streamUrl = trimmed;
                }
                await runStreamDecoder(window.streamUrl);
            } else {
                await stopStreamDecode(window.streamUrl);
            }
        });
    }

    const decoderClear = document.querySelector('[data-decoder-clear]');
    if (decoderClear) {
        decoderClear.addEventListener('click', function () {
            const output = document.getElementById('output');
            if (output) {
                output.innerHTML = "";
                decoderClear.disabled = true;
            }
        });
    }

    const decoderLoad = document.querySelector('[data-decoder-load]');
    if (decoderLoad) {
        decoderLoad.addEventListener('click', function () {
            const audiofileInput = document.getElementById('audiofile');
            if (audiofileInput) {
                audiofileInput.value = "";
                if (typeof audiofileInput.showPicker === "function") {
                    try {
                        audiofileInput.showPicker();
                    } catch {
                        audiofileInput.click();
                    }
                } else {
                    audiofileInput.click();
                }
            }
        });
    }

    const audiofileInput = document.getElementById('audiofile');
    if (audiofileInput) {
        audiofileInput.addEventListener('change', async function () {
            const file = this.files && this.files[0];
            if (!file) return;
            addStatus("PROCESSING...", "yellow");
            audiofileInput.disabled = true;
            decoderToggle.disabled = true;
            decoderLoad.disabled = true;
            resetDecoderState();
            try {
                const arrayBuffer = await file.arrayBuffer();
                const audioBuffer = await decodeContext.decodeAudioData(arrayBuffer);
                updateSampleRate(audioBuffer.sampleRate);
                const channelData = audioBuffer.getChannelData(0);
                let sumSquares = 0;
                let peak = 0;
                for (let i = 0; i < channelData.length; i++) {
                    const sample = channelData[i];
                    const abs = sample < 0 ? -sample : sample;
                    if (abs > peak) peak = abs;
                    sumSquares += sample * sample;
                }
                if (peak > 0 && channelData.length > 0) {
                    const rms = Math.sqrt(sumSquares / channelData.length);
                    const minRms = 0.08912509381337455; // -21 dBFS
                    if (rms > 0 && rms <= minRms) {
                        const gain = 0.99 / peak;
                        if (gain > 1) {
                            for (let i = 0; i < channelData.length; i++) {
                                channelData[i] *= gain;
                            }
                        }
                    }
                }
                const chunkSize = 128;
                for (let i = 0; i < channelData.length; i += chunkSize) {
                    const chunk = channelData.subarray(i, i + chunkSize);
                    runDecoder(chunk);
                }
                stopDecode(false);
            } catch (e) {
                console.error("Failed to decode uploaded audio file:", e);
                addStatus("FAILED TO READ AUDIO FILE!", "red");
            } finally {
                audiofileInput.disabled = false;
                decoderToggle.disabled = false;
                decoderLoad.disabled = false;
                audiofileInput.value = "";
            }
        });
    }

    const decoderLoopback = document.getElementById('decoder-loopback');
    if (decoderLoopback) {
        decoderLoopback.addEventListener('change', function () {
            if (this.checked) {
                startLoopback();
            } else {
                stopLoopback();
            }
        });
    }

    const recordToggle = document.querySelector('[data-decoder-record-toggle]');
    if (recordToggle) {
        recordToggle.addEventListener('click', function () {
            if (window.isRecording) {
                stopRecording();
            } else {
                startRecording().catch((error) => {
                    console.error("Unable to start recording:", error);
                });
            }
        });
    }

    const clearStreamURLButton = document.querySelector('[data-decoder-clear-stream-url]');
    if (clearStreamURLButton) {
        clearStreamURLButton.addEventListener('click', function () {
            window.streamUrl = null;
            clearStreamURLButton.style.display = "none";
        });
    }

    const rawHeaderButton = document.querySelector('[data-decoder-load-raw]');
    if (rawHeaderButton) {
        rawHeaderButton.addEventListener('click', function () {
            const rawHeader = prompt("Enter the raw SAME header (e.g. \"ZCZC-PEP-NPT-000000+0030-2761820-KETV    -\"): ");
            if (window.EASREGEX.test(rawHeader)) {
                const container = document.createElement("div");
                container.className = "raw-alert";
                container.style.display = "inline-block";
                document.querySelector("#output").appendChild(document.createElement("span")).innerHTML = rawHeader;
                document.querySelector("#output").appendChild(container);
                const rawHeaderObject = {
                    rawHeader: rawHeader
                }
                processHeader(rawHeaderObject, container);
                const eomHr = document.createElement("hr");
                eomHr.classList.add("eom-hr");
                document.querySelector("#output").appendChild(eomHr);
            } else {
                alert("Invalid SAME header format. Please enter a valid header.");
            }
        });
    }

    const dropArea = document.getElementById('decoder-panel');
    if (dropArea) {
        dropArea.addEventListener('dragover', (event) => {
            event.preventDefault();
            dropArea.classList.add('dragover');
        });

        dropArea.addEventListener('dragleave', () => {
            dropArea.classList.remove('dragover');
        });

        dropArea.addEventListener('drop', async (event) => {
            event.preventDefault();
            dropArea.classList.remove('dragover');
            const files = event.dataTransfer.files;
            if (files.length > 0) {
                addStatus("PROCESSING...", "yellow");
                resetDecoderState();
                const file = files[0];
                const arrayBuffer = await file.arrayBuffer();
                const audioBuffer = await decodeContext.decodeAudioData(arrayBuffer);
                updateSampleRate(audioBuffer.sampleRate);
                const channelData = audioBuffer.getChannelData(0);
                const chunkSize = 128;
                for (let i = 0; i < channelData.length; i += chunkSize) {
                    const chunk = channelData.slice(i, i + chunkSize);
                    runDecoder(chunk);
                }
                stopDecode(false);
            }
        });
    }

    const mutationObserver = new MutationObserver(() => {
        const alertElements = document.querySelectorAll('.alert');
        if (alertElements.length > 0) {
            decoderClear.disabled = false;
        } else {
            decoderClear.disabled = true;
        }
    });

    mutationObserver.observe(document.getElementById('output'), { childList: true, subtree: true });
})();
