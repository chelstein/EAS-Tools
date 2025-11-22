const defaultText = "Hello from NanoTTS! This demo is running entirely in your browser.";

const elements = {
	container: document.getElementById("tts"),
	text: document.getElementById("ttsText"),
	voice: document.getElementById("ttsVoice"),
	status: document.getElementById("status"),
	audio: document.getElementById("audioPlayback"),
	toggle: document.getElementById("toggleTts"),
	action: document.getElementById("speakBtn")
};

if (elements.text) {
	elements.text.value = defaultText;
}

const workerState = {
	instance: null,
	ready: false,
	pendingMessage: null
};

function setStatus(message, isError) {
	if (!elements.status) return;
	elements.status.textContent = message || "";
	elements.status.style.color = isError ? "#8A0808" : "#2c662d";
}

function initWorker() {
	if (workerState.instance) return;
	const workerUrl = window.WebAssembly ? "assets/js/text2wav-worker.js?t=1" : "assets/js/text2wav-worker.js";
	workerState.instance = new Worker(workerUrl);
	setStatus("Loading local voice…");

	workerState.instance.onmessage = function (event) {
		const data = event.data || {};
		if (data.type === "ready") {
			workerState.ready = true;
			setStatus("Voice ready.");
			if (workerState.pendingMessage) {
				workerState.instance.postMessage(workerState.pendingMessage);
				workerState.pendingMessage = null;
			}
			return;
		}
		if (data.type === "progress") {
			setStatus(data.error ? `Error: ${data.error}` : data.data || "Working…", Boolean(data.error));
			return;
		}
		if (data.error) {
			setStatus(`Error: ${data.error}`, true);
			return;
		}
		if (data.blob) {
			const objectUrl = URL.createObjectURL(data.blob);
			elements.audio.src = objectUrl;
			setStatus(`Finished. ${(data.blob.size / 1024).toFixed(1)} KB WAV ready.`);
			elements.audio.play().catch(() => {
				/* playback might be blocked; ignore */
			});
		}
	};

	workerState.instance.onerror = function (error) {
		console.error(error);
		setStatus("Worker error. Reload the page to try again.", true);
		workerState.instance.terminate();
		workerState.instance = null;
		workerState.ready = false;
	};
}

function buildMessage() {
	const text = (elements.text.value || "").trim();
	if (!text) {
		setStatus("Please enter the text to convert.", true);
		return null;
	}
	const lang = "en-US"; // languages can be mapped here if needed
	return {
		lang,
		volume: "0.5",
		text
	};
}

function convertText() {
	const msg = buildMessage();
	if (!msg) return;
	initWorker();
	if (workerState.ready && workerState.instance) {
		setStatus("Starting conversion…");
		workerState.instance.postMessage(msg);
	} else {
		workerState.pendingMessage = msg;
		setStatus("Preparing voice library…");
	}
}

function toggleTtsVisibility() {
	if (!elements.container) return;
	const isHidden = elements.container.style.display === "none";
	elements.container.style.display = isHidden ? "" : "none";
	elements.toggle.textContent = isHidden ? "Hide text controls" : "Show text controls";
}

if (elements.toggle) {
	elements.toggle.addEventListener("click", toggleTtsVisibility);
}
if (elements.action) {
	elements.action.addEventListener("click", convertText);
}
if (elements.voice) {
	elements.voice.addEventListener("change", () => {
		setStatus(`Voice mode: ${elements.voice.value.toUpperCase()} (local)`);
	});
}

// Auto-initialize worker so assets begin loading.
initWorker();
