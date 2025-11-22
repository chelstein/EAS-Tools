# Emergency Alert System (EAS)/Specific Area Message Encoding (SAME) Tools

[![EAS Logo](./assets/eas-logo-banner.png)](./assets/eas-logo-banner.png)

Web‑based **EAS / SAME Tools** that run entirely in your browser. Use your microphone to decode Specific Area Message Encoding (SAME) headers from live audio, or upload a file to decode it, and generate valid EAS audio as a downloadable WAV file. Also includes a Text Crawl Generator for creating EAS‑style scrolling text graphics and an audio splicer for combining multiple, unique audio samples into one continuous WAV file.

> ⚠️ **Legal & ethics notice**
> This project is for **lab, testing, hobbyist, and educational use only**. In many jurisdictions (e.g., U.S. FCC 47 CFR §11.45), transmitting or simulating EAS tones outside of authorized tests is prohibited. **Do not broadcast** generated tones or headers over public channels. The author is NOT responsible for ANY misuse of this software toolkit.

---

## Video Demo

<https://github.com/user-attachments/assets/1c94417f-e8cd-4692-87f8-f86cdd671335>

---

## ✨ Features

* **Decoder**
  * Real‑time decoding of EAS/SAME headers from microphone input
  * File upload support for decoding prerecorded EAS audio
  * Visual audio meter for signal strength
  * Parsed header information: alert type, issuer, affected locations, issue/expiration times, sender ID, and human‑readable text
* **Encoder**
  * Form‑based SAME header generation with validation
  * Text‑to‑speech synthesis of alert message (using WebAssembly voices/outside TTS service)
  * Downloadable WAV file of generated EAS audio (SAME tones + message)
* **Text Crawl Generator**
  * Create scrolling text crawl graphics for EAS alerts
  * Customize most aspects of the crawl appearance
  * Downloadable GIF/WEBM of generated text crawl
* **Audio Splicer**
  * Combine multiple custom audio samples into one continuous WAV file
  * Useful for creating custom audio without the use of programs like Audacity
  * Supports inserting silence between samples, trimming audio, splits, and much more

---

## 🚀 Quick start

### Run locally

1. **Clone** the repo:

   ```bash
   git clone https://github.com/wagwan-piffting-blud/EAS-Tools.git
   cd EAS-Tools
   ```
2. **Serve** it from `localhost` (recommended for microphone access):

   ```bash
   # Python 3
   python -m http.server 8080

   # or Node.js (install http-server if needed: `npm install -g http-server`)
   http-server -p 8080

   # then open http://localhost:8080 in your browser
   ```

   > Browsers require a **secure context** for microphone (`getUserMedia`). `https://` or `http://localhost:8080` works; opening `index.html` with a `file://` URL usually won’t.

---

## 🧭 Using the app

### Decoder

1. Go to **Decoder** tab
2. Choose your **microphone** (device selector)
3. Grant permission and select your microphone when prompted
4. Play an EAS/SAME tone; watch the meter & parsed headers
5. (Optional) Upload a prerecorded EAS audio file using the **Upload Audio File** button

What you’ll see:

* **Raw header** (e.g., `ZCZC-...-...-...`)
* Parsed data about the alert (click "View Alert" to see full details):
  * **Severity**: "Warning", "Watch", "Advisory", "Test", etc.
  * **Type**: "Tornado Warning", "Required Weekly Test", etc.
  * **Issuer**: "National Weather Service", "Civil Authorities", etc.
  * **Affected Locations**: County names ("Los Angeles County", "Orange County", etc.)
  * **Issue Date**: Date & time of issuance
  * **Expires On**: Date & time of expiration
  * **Time until expiration**: "EXPIRED" if expired, or relative time of expiration
  * **Sender ID**: 8 character sender identifier (e.g., "KOAX/NWS")
  * **Human-Readable Alert Text**: The message associated with the alert, parsed using a JS port of [EAS2Text](https://github.com/Newton-Communications/E2T/)
  * **Color-coding** of the alert severity for quick visual identification

### Encoder

1. Go to **Encoder** tab
2. Fill out the form fields (or paste an existing header in the **Use custom SAME Header** box)
3. (Optional) Enter a message for TTS voice synthesis
4. Click **Generate**
5. (Optional) Click play on the audio control to listen in‑browser
6. (Optional) Click **Save as wav file** to save the generated EAS audio file

### Text Crawl Generator

1. Go to **Text Crawl Generator** tab and choose a **Select Crawl Text Source** mode. Keep **Custom Text** to type a message directly or pick **Generate from EAS Header using EAS2Text** to auto-build the crawl from a raw SAME header
2. Provide the content for the mode you picked:
   * **Custom Text**: Enter any crawl copy in the multiline box
   * **EAS2Text**: Paste the raw header, then decide whether to use the local timezone, override it manually, and optionally emulate a specific ENDEC profile for text phrasing
3. Dial in **Crawl Settings** to match the target look:
   * Speed, VDS mode, and frame delay control motion cadence
   * Font family/style/size, canvas width & height, inset, restart delay, and the background/text/outline colors let you mimic different station styles
4. Use the control buttons to run or export the crawl:
   * **Start/Pause/Stop** handle playback; output appears live in the preview bar and is summarized in the status line
   * **Export as GIF** or **Export as video (.webm)** capture the crawl, while **Copy Crawl Text** copies the resolved crawl text for reuse

### Audio Splicer

1. Go to **Audio Splicer** tab
2. Upload multiple audio samples or synthesize new TTS samples using the TTS section inside the Splicer
3. Modify the order of the samples as needed, and optionally insert silence between samples, as well as add splits for easier navigation
4. Click **Export WAV** to create a single continuous WAV file for download

### Navigation

Use the tabs at the top of the page to switch between **Decoder**, **Encoder**, and **Text Crawl Generator** tools. You can also link to a specific tab using URL parameters:
* `?tool=decoder` – Opens the **Decoder** tab
* `?tool=encoder` – Opens the **Encoder** tab
* `?tool=crawl` – Opens the **Text Crawl Generator** tab
* `?tool=splicer` – Opens the **Audio Splicer** tab

### Documentation

For more detailed documentation on the TTS feature, see the [docs page](https://wagwan-piffting-blud.github.io/EAS-Tools/docs.html).

If you need help coming up with phonemes/pronunciations for the TTS voice of your choosing, check out the [TTS Phoneme Helper GPT](https://chatgpt.com/g/g-6919e0f83e4c8191b57400362668981c-tts-phoneme-helper) **(NOTE: Requires a free ChatGPT account)**.

For a demonstration of each individual TTS voice, see the [voice demo page](https://wagwan-piffting-blud.github.io/EAS-Tools/demos.html).

---

## 📜 Credits & third‑party

* UI fonts: **Hack** (via `assets/css/hack.css`)
* WAV writer: **wavefile.js** (bundled in `assets/js/wavefile.js`)
* Resampling: **wave‑resampler.js** (bundled in `assets/js/wave‑resampler.js`)
* gif.js: **gif.js** (bundled in `assets/js/gif.js`)
* WebAssembly TTS voice: **piper.tts.js** (bundled in `assets/piper-tts/piper-tts-bundle.js` and `assets/piper-tts/`) and **nanotts.js** (bundled in `assets/js/nanotts.js`)
* SAME decoding/encoding logic: Original code by CryptoDude3 (removed GitHub Pages site), maintained and expanded by wagwan-piffting-blud
* Inspiration / references:
  * [nicksmadscience SAME Encoder, Python](https://github.com/nicksmadscience/eas-same-encoder)
  * [Mab879 C++ SAME Encoder](https://github.com/Mab879/eas_encoder)
  * [Anon64 EAS Header Generator](https://anon64.bitkit.us/eas-gen/)
  * [wavefile.js](https://rochars.github.io/wavefile/)
  * [wave‑resampler.js](https://github.com/rochars/wave-resampler)
  * [piper.tts.js](https://github.com/Mintplex-Labs/piper-tts-web)
  * [gif.js](https://github.com/jnordberg/gif.js)
  * [EAS2Text](https://github.com/Newton-Communications/E2T/)
  * CryptoDude3 GitHub Pages site (removed) for most of the original code (encoder/decoder logic) and some of the page looks.

> See each upstream project for their respective licenses.

---

## 🛡️ License

This project is licensed under **GPL‑3.0** (see [`LICENSE`](./LICENSE)).

---

## 📍 Disclaimers

This tool decodes and synthesizes EAS/SAME signals for **lab, testing, hobbyist, and educational** purposes only. You are responsible for complying with all laws, regulations, and organizational policies applicable to your use. The author is NOT responsible for ANY misuse of this software toolkit.

## GenAI Disclosure Notice: Portions of this repository have been generated using Generative AI tools (ChatGPT, ChatGPT Codex, GitHub Copilot).
