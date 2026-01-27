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

    const MOBILE_MIC_GAIN = 30;
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
        resetDecoderState();
        resetStreamRecovery();
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
        addStatus("WAITING...", "white");
        setStreamToggleState(false);
    }

    const RECORD_LABEL_START = "Start Recording (alerts toggle this automatically)";
    const RECORD_LABEL_STOP = "Stop Recording (alerts toggle this automatically)";

    async function startRecording() {
        if (window.isRecording) {
            return true;
        }
        const activeSource = inputTapNode;
        if (!activeSource) {
            addStatus("NO AUDIO SOURCE TO RECORD!", "red");
            return false;
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

    function stopRecording() {
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

    function triggerRecordingDownload(buffer) {
        const blob = new Blob([buffer], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `eas-recording-${new Date().toISOString().replace(/[:.]/g, "-")}.wav`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);
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

    async function stopDecode() {
        resetDecoderState();
        if (window.isRecording) {
            stopRecording();
        }
        if (!micSource) {
            detachInputTap();
            stopMeter();
            decodeContext.suspend();
            addStatus("WAITING...", "white");
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
        addStatus("WAITING...", "white");
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
        const loopbackSource = inputTapNode;
        if (!loopbackSource) {
            return;
        }
        loopbackDest = decodeContext.createMediaStreamDestination();
        loopbackSourceNode = loopbackSource;
        loopbackSourceNode.connect(loopbackDest);
        const loopbackStream = loopbackDest.stream;
        const audio = document.createElement("audio");
        audio.srcObject = loopbackStream;
        audio.autoplay = true;
        audio.controls = false;
        audio.style.display = "none";
        audio.setAttribute("aria-hidden", "true");
        audio.setAttribute("aria-loopback", "true");
        document.body.appendChild(audio);
        const playPromise = audio.play && audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => { });
        }
    }

    async function stopLoopback() {
        if (loopbackSourceNode && loopbackDest) {
            try {
                loopbackSourceNode.disconnect(loopbackDest);
            } catch (error) {
                console.warn("Error disconnecting loopback source", error);
            }
        }
        loopbackSourceNode = null;
        loopbackDest = null;
        const audioElements = document.querySelectorAll("audio[aria-loopback='true']");
        audioElements.forEach(audio => {
            audio.srcObject = null;
            audio.remove();
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

    let currentMsg = "";
    let container = null;

    function finalizeAlert() {
        decoding = false;
        updateSync(false);
        if (container) {
            container.innerText += " ";
            try {
                processHeader(currentMsg, container);
            } catch (e) {
                console.error("Error finalizing alert:", e);
            }
        }
        container = null;
        currentMsg = "";
        headerTimes = 0;
    }

    function resetDecoderState() {
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

    function clockdemod(sample) {
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
                if (currentByte == 0xAB) {
                    headerTimes++;
                    if (headerTimes > 4) {
                        decoding = true;
                        updateSync(true);
                    }
                } else {
                    headerTimes = 0;
                }
                if (decoding) {
                    if (!micSource && currentByte == 0xAB && headerTimes > 4 && currentMsg.length && container) {
                        finalizeAlert();
                        headerTimes = 1;
                    } else if (currentByte == 0 || currentByte == 0xFF) {
                        finalizeAlert();
                    } else if (currentByte !== 0xAB) {
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
                        }
                        handleAutoRecordingTriggers();
                    }
                }
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
    function parseHeader(input) {
        if (input.startsWith("NNNN")) {
            return {
                eom: true
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

    function processHeader(header, container) {
        const view = document.createElement("button");
        const parsedHeader = parseHeader(header);
        if (!parsedHeader) {
            return;
        } else if (parsedHeader.eom) {
            const eomIndicator = document.createElement("div");
            eomIndicator.style.color = "gray";
            eomIndicator.style.display = "inline";
            eomIndicator.innerText = "[EOM]";
            container.appendChild(eomIndicator);
            eomCount++;
            if (eomCount == 3) {
                const eomSeparator = document.createElement("hr");
                eomSeparator.classList = "eom-hr";
                container.appendChild(eomSeparator);
                eomCount = 0;
            }
            return;
        }
        view.addEventListener("click", () => {
            showModal(parsedHeader);
            window.modalShown = true;
        });
        view.innerText = "View Alert";
        container.appendChild(view);
        const decoderClear = document.querySelector('[data-decoder-clear]');
        if (decoderClear) {
            decoderClear.disabled = false;
        }
    }
    // END decode/header.js
    // BEGIN decode/alertinfo.js
    const modalClose = document.querySelector("#close");
    const modalContainer = document.querySelector(".modalContainer");
    const infoContainer = document.querySelector(".modalInfo");
    const modalBox = document.querySelector(".modalBox");
    modalClose.addEventListener("click", () => {
        if (window.modalShown) {
            modalContainer.style.display = "none";
        }
    });

    modalContainer.addEventListener("click", (e) => {
        if (e.target === modalContainer && window.modalShown) {
            modalContainer.style.display = "none";
        }
    });

    async function showAlertInfo(header) {
        const e2tReady = window.EAS2TextModulePromise;
        const resourcePromise = e2tReady.then(({ loadAllResources }) =>
            loadAllResources({ fallbackBase: 'assets/E2T/' })
        );
        const [{ EAS2Text }, resources] = await Promise.all([e2tReady, resourcePromise]);
        let alertType = "Information";

        infoContainer.innerHTML = "";

        const alertName = events[header.event];
        const issueTime = header.issueTime;
        const expirationTime = getExpirationTime(issueTime, header.alertTime);
        const regex = window.EASREGEX;
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
        infoContainer.appendChild(document.createElement("br"));
        infoContainer.appendChild(createInfo(`Human-Readable Alert Text: "${easText}"`));
        infoContainer.appendChild(document.createElement("br"));
        infoContainer.appendChild(createInfo(`<a href="index.html?header=${encodedHeader}&tool=encoder">Open in SAME Encoder</a>`));
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
                audiofileInput.click();
            }
        });
    }

    const audiofileInput = document.getElementById('audiofile');
    if (audiofileInput) {
        audiofileInput.addEventListener('change', async function () {
            const file = this.files[0];
            if (file) {
                addStatus("PROCESSING...", "yellow");
                audiofileInput.disabled = true;
                decoderToggle.disabled = true;
                decoderLoad.disabled = true;
                resetDecoderState();
                const arrayBuffer = await file.arrayBuffer();
                const audioBuffer = await decodeContext.decodeAudioData(arrayBuffer);
                updateSampleRate(audioBuffer.sampleRate);
                const channelData = audioBuffer.getChannelData(0);
                const chunkSize = 128;
                for (let i = 0; i < channelData.length; i += chunkSize) {
                    const chunk = channelData.slice(i, i + chunkSize);
                    runDecoder(chunk);
                }
                stopDecode();
                audiofileInput.disabled = false;
                decoderToggle.disabled = false;
                decoderLoad.disabled = false;
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
})();
