window.EAS2TextModulePromise = window.EAS2TextModulePromise || new Promise((resolve) => {
    window.addEventListener('EAS2TextModuleReady', (event) => resolve(event.detail), { once: true });
});

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
        window.entryPoints = {};
        window.entryNames = {
            "WXR": "National Weather Service",
            "PEP": "Primary Entry Point",
            "EAS": "Emergency Alert System",
            "CIV": "Civil Authority"
        };

        for (const code in sameCodes['SUBDIV']) {
            const name = sameCodes['SUBDIV'][code];
            window.rgn[code] = name;
        }

        for (const code in sameCodes['ORGS']) {
            const name = sameCodes['ORGS'][code];
            window.entryPoints = window.entryPoints || {};
            window.entryPoints[code] = name;
        }

        for (const code in sameCodes['EVENTS']) {
            const name = sameCodes['EVENTS'][code];
            window.events = window.events || {};
            window.events[code] = name.replace(/^(a|an|the) /, '').trim();
            document.getElementById("easyplusEventCode").innerHTML += `<option value="${code}">${window.events[code]}</option>`;
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

        for (const code in window.entryNames) {
            const name = window.entryNames[code];
            document.getElementById("easyplusOriginator").innerHTML += `<option value="${code}">${name}</option>`;
        }
    }

    const response = await fetch('assets/E2T/same-us.json');
    const data = await response.json();
    processSameCodes(data);
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

    function addStatus(stat, color = null) {
        const statuselem = document.getElementById("sync");
        statuselem.innerHTML = "STATUS: " + stat;
        if (color) {
            statuselem.style.color = color;
        }
    }

    window.modalShown = false;

    // BEGIN decode/audio.js
    let sampleRate = 44100;

    const decodeContext = new AudioContext();

    const filter = decodeContext.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1822.9;
    filter.Q.value = 3;

    let micSource = null;
    const meterElement = document.querySelector("[data-level-meter]");
    const meterFill = meterElement ? meterElement.querySelector("[data-level-fill]") : null;
    let levelAnalyser = null;
    let levelBuffer = null;
    let meterAnimation = 0;
    let meterLevel = 0;

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
        if (micSource) {
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
        decodeContext.audioWorklet.addModule("assets/js/processor.js").then(() => {
            const decodeNode = new AudioWorkletNode(decodeContext, "eas-processor");
            decodeNode.port.onmessage = function (event) {
                const channels = event.data;
                if (!channels || !channels[0]) {
                    return;
                }
                runDecoder(channels[0]);
            };
            filter.connect(decodeNode);
        }).catch((error) => {
            console.error("Failed to load EAS processor", error);
        });
    } else {
        console.warn("AudioWorklet is NOT supported in non-secure (HTTP) contexts. Decoder functionality will be limited.");
    }

    const sel = document.querySelector("#device");
    const micContainer = document.querySelector("[data-mic-container]");
    async function startDecoder(id) {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: id
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

    async function getMicrophones() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(e => e.kind == "audioinput");
    }

    async function runDecode(button) {
        const uploadFileButton = document.querySelector('[data-decoder-load]');
        const startStopButton = document.querySelector('[data-decoder-toggle]');
        if (micSource) {
            uploadFileButton.disabled = false;
            await stopDecode();
            button.innerText = "Start Decoder";
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
            button.innerText = "Stop Decoder";
        }
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
        micSource = source;
        micSource.connect(filter);
        if (levelAnalyser) {
            micSource.connect(levelAnalyser);
            startMeter();
        }
        updateSampleRate(decodeContext.sampleRate);
        updateSync(false);
        decodeContext.resume();
    }

    async function stopDecode() {
        resetDecoderState();
        if (!micSource) {
            stopMeter();
            decodeContext.suspend();
            addStatus("WAITING...", "white");
            return;
        }
        micSource.mediaStream.getTracks().forEach(e => e.stop());
        micSource.disconnect(filter);
        if (levelAnalyser) {
            micSource.disconnect(levelAnalyser);
        }
        micSource = null;
        stopMeter();
        decodeContext.suspend();
        addStatus("WAITING...", "white");
    }
    populateMicrophones();

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
                console.log("Error:", e);
            }
        }
        container = null;
        currentMsg = "";
        headerTimes = 0;
    }

    function resetDecoderState() {
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
                        console.log("Starting");
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
                        container.innerText += currentChar;
                        currentMsg += currentChar;
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
        ret.region = rgn[loc[0]];
        const st = loc.slice(1, 3);
        ret.state = state[st];
        ret.county = county[st][loc.slice(3, 6)];
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
        const regex = /^ZCZC-([A-Z]{3})-([A-Z]{3})-((?:\d{6}(?:-?)){1,31})\+(\d{4})-(\d{7})-([A-Za-z0-9\/ ]{0,8})(.*)/m;
        const cleanHeader = header.rawHeader.replace(regex, 'ZCZC-$1-$2-$3+$4-$5-$6-');

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
        infoContainer.appendChild(createInfo(`Time until Expiration: ${isExpired(expirationTime) ? "EXPIRED" : relativeToReadable(subtractRelative(expirationTime, new Date()), false)}`));
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

    function isExpired(expirationTime) {
        return Date.now() > expirationTime.getTime();
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
})();
