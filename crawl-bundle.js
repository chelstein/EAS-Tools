/*
This bundle of JS code is used to generate text crawl animations, similar to those seen in real EAS alerts. It provides functionality to create, customize, and render scrolling text effects on a web page. Users can customize the text content, speed, font size, colors, and other visual aspects of the crawl animation. The generated crawl can be previewed in real-time and exported as a video or GIF for use in various applications. This tool is particularly useful for creating authentic-looking EAS alert simulations for training, testing, or entertainment purposes.
*/

window.EAS2TextModulePromise = window.EAS2TextModulePromise || new Promise((resolve) => {
    window.addEventListener('EAS2TextModuleReady', (event) => resolve(event.detail), { once: true });
});

const clearButton = document.getElementById('clr-crawl');

if (clearButton) {
    clearButton.addEventListener('click', () => resetStatus());
}

function zero_pad_int(num, totalLength) {
    return num.toString().padStart(totalLength, '0');
}

var statuselem = document.getElementById("status-crawl");

function addStatus(stat, type = "LOG") {
    var new_status = document.createElement("div");
    var d = new Date();
    new_status.innerHTML = zero_pad_int(d.getHours().toString() % 12, 2) + ":" + zero_pad_int(d.getMinutes().toString(), 2) + ":" + zero_pad_int(d.getSeconds().toString(), 2) + " [" + type + "]: " + stat;
    statuselem.appendChild(new_status);
    clearButton.style.display = "inline-block";
}

function resetStatus() {
    statuselem.innerHTML = "";
    clearButton.style.display = "none";
}

function exportAsGIF(canvas, filename) {
    if (!window.crawlGenerator) {
        alert('Please start the crawl before exporting.');
        return;
    }

    addStatus('Exporting crawl as GIF... Please wait.');

    const generator = window.crawlGenerator;
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = canvas.width;
    captureCanvas.height = canvas.height;
    const captureCtx = captureCanvas.getContext('2d');

    const text = generator.text || '';
    const fontSize = Number(generator.fontSize) || 24;
    const textColor = generator.textColor || '#FFFFFF';
    const bgColor = generator.bgColor || '#000000';
    const lines = text.split('\n');
    const font = `${fontSize}px Arial`;
    const lineHeight = fontSize + 10;

    captureCtx.font = font;
    captureCtx.textAlign = 'center';
    captureCtx.textBaseline = 'middle';

    const maxLineWidth = lines.reduce((maxWidth, line) => {
        const width = captureCtx.measureText(line).width;
        return width > maxWidth ? width : maxWidth;
    }, 0);

    const halfLineWidth = maxLineWidth / 2;
    const startOffset = canvas.width + halfLineWidth;
    const endOffset = -halfLineWidth;
    const travelDistance = startOffset - endOffset || canvas.width;

    const baseSpeed = Math.max(0.5, Math.abs(Number(generator.speed) || 0));
    const recordedMsPerFrame = Number(generator.msPerFrame);
    const fallbackMsPerFrame = 1000 / 60;
    const targetMsPerFrame = (Number.isFinite(recordedMsPerFrame) && recordedMsPerFrame > 0)
        ? recordedMsPerFrame
        : fallbackMsPerFrame;
    const MIN_GIF_DELAY = 20; // browsers commonly clamp GIF frames below ~20ms
    const frameDelay = Math.max(MIN_GIF_DELAY, Math.round(targetMsPerFrame));
    const pxPerFrame = baseSpeed * (frameDelay / targetMsPerFrame);
    const framesNeeded = Math.max(1, Math.ceil(travelDistance / pxPerFrame));

    const gif = new GIF({
        workers: 2,
        quality: 10
    });

    const drawFrame = (offsetX) => {
        captureCtx.fillStyle = bgColor;
        captureCtx.fillRect(0, 0, captureCanvas.width, captureCanvas.height);
        captureCtx.fillStyle = textColor;
        captureCtx.font = font;

        lines.forEach((line, index) => {
            const verticalOffset = index - (lines.length - 1) / 2;
            const y = captureCanvas.height / 2 + verticalOffset * lineHeight;
            captureCtx.fillText(line, offsetX, y);
        });
    };

    let offsetX = startOffset;
    for (let i = 0; i < framesNeeded; i++) {
        drawFrame(offsetX);
        gif.addFrame(captureCanvas, { delay: frameDelay, copy: true });
        offsetX -= pxPerFrame;
        if (offsetX < endOffset) {
            offsetX = startOffset;
        }
    }

    gif.on('finished', function(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addStatus('Crawl exported successfully!');
    });

    gif.render();
};

class TextCrawlGenerator {
    constructor(container) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.style.display = 'block';
        this.container.appendChild(this.canvas);
        this.text = "Hello from Wags!";
        this.speed = 2;
        this.fontSize = 24;
        this.textColor = "#FFFFFF";
        this.bgColor = "#000000";
        this.isAnimating = false;
        this.offsetX = this.canvas.width;
        this.offsetY = this.canvas.height;
        this.startFromRightInitialized = false;
        this.msPerFrame = 1000 / 60;
        this.lastTimestamp = null;

        window.addEventListener('resize', () => this.resizeCanvas());
        this.resizeCanvas();
    }

    resizeCanvas() {
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;
        this.offsetX = this.canvas.width / 2;
        this.offsetY = this.canvas.height / 2;
        this.startFromRightInitialized = false;
    }

    setText(text) {
        this.text = text;
        this.startFromRightInitialized = false;
    }

    setSpeed(speed) {
        const parsed = Number(speed);
        if (Number.isFinite(parsed)) {
            this.speed = parsed;
        }
    }

    setFontSize(size) {
        const parsed = Number(size);
        if (Number.isFinite(parsed) && parsed > 0) {
            this.fontSize = parsed;
            this.startFromRightInitialized = false;
        }
    }

    setTextColor(color) {
        this.textColor = color;
    }

    setBgColor(color) {
        this.bgColor = color;
    }

    start() {
        if (!this.isAnimating) {
            this.isAnimating = true;
            this.startFromRightInitialized = false;
            this.lastTimestamp = null;
            requestAnimationFrame((timestamp) => this.animate(timestamp));
        }
    }

    stop() {
        const lines = (this.text || '').split('\n');
        this.isAnimating = false;
        this.lastTimestamp = null;

        this.ctx.font = `${this.fontSize}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const maxLineWidth = lines.reduce((maxWidth, line) => {
            const width = this.ctx.measureText(line).width;
            return width > maxWidth ? width : maxWidth;
        }, 0);

        const startOffset = this.canvas.width + maxLineWidth / 2;
        this.offsetX = Number.isFinite(startOffset) ? startOffset : this.canvas.width / 2;
        this.offsetY = this.canvas.height / 2;
        this.startFromRightInitialized = false;

        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.textColor;

        lines.forEach((line, index) => {
            const verticalOffset = index - (lines.length - 1) / 2;
            const y = this.offsetY + verticalOffset * (this.fontSize + 10);
            this.ctx.fillText(line, this.offsetX, y);
        });
    }

    pause() {
        this.isAnimating = false;
        this.lastTimestamp = null;
    }

    animate(timestamp) {
        if (!this.isAnimating) return;

        if (typeof timestamp === 'number') {
            if (this.lastTimestamp !== null) {
                const delta = timestamp - this.lastTimestamp;
                if (delta > 0) {
                    const smoothing = 0.1;
                    this.msPerFrame = (1 - smoothing) * this.msPerFrame + smoothing * delta;
                }
            }
            this.lastTimestamp = timestamp;
        }

        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.textColor;
        this.ctx.font = `${this.fontSize}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const lines = this.text.split('\n');

        const maxLineWidth = lines.reduce((maxWidth, line) => {
            const width = this.ctx.measureText(line).width;
            return width > maxWidth ? width : maxWidth;
        }, 0);

        const startOffset = this.canvas.width + maxLineWidth / 2;

        if (!this.startFromRightInitialized) {
            this.offsetX = startOffset;
            this.startFromRightInitialized = true;
        } else if (!Number.isFinite(this.offsetX)) {
            this.offsetX = startOffset;
        }

        lines.forEach((line, index) => {
            const verticalOffset = index - (lines.length - 1) / 2;
            const y = this.offsetY + verticalOffset * (this.fontSize + 10);
            this.ctx.fillText(line, this.offsetX, y);
        });

        this.offsetX -= this.speed;
        if (this.offsetX < -maxLineWidth / 2) {
            this.offsetX = startOffset;
        }

        requestAnimationFrame((nextTimestamp) => this.animate(nextTimestamp));
    }
}

const e2tReady = window.EAS2TextModulePromise;
const resourcePromise = e2tReady.then(({ loadAllResources }) =>
  loadAllResources({ fallbackBase: 'assets/E2T/' })
);

async function header_to_readable(rawHeader, tzLocal, tzName, endecMode) {
    const regex = /^ZCZC-([A-Z]{3})-([A-Z]{3})-((?:\d{6}(?:-?)){1,31})\+(\d{4})-(\d{7})-([A-Za-z0-9\/ ]{0,8})-$/m;

    if (!regex.exec(rawHeader)) return 'Invalid EAS Header Format';

    const [{ EAS2Text }, resources] = await Promise.all([e2tReady, resourcePromise]);

    if (tzLocal && tzName == '') {
        const eas = await EAS2Text.fromUSMessage(rawHeader, { resources, mode: 'NONE', useLocaleTimezone: tzLocal, mode: endecMode });
        return eas.EASText;
    }

    else {
        const eas = await EAS2Text.fromUSMessage(rawHeader, { resources, mode: 'NONE', timeZoneName: tzName, mode: endecMode });
        return eas.EASText;
    }
}

document.getElementById('startCrawl').addEventListener('click', async () => {
    const crawlDisplay = document.getElementById('crawlDisplay');
    const text = document.getElementById('crawlText').value;
    const rawHeader = document.getElementById('crawlRawHeader').value;
    const speed = document.getElementById('crawlSpeed').value;
    const fontSize = document.getElementById('crawlFontSize').value;
    const textColor = document.getElementById('crawlTextColor').value;
    const bgColor = document.getElementById('crawlBgColor').value;
    const crawlMode = document.getElementById('crawlMode').value;
    const useLocalTZ = document.getElementById('crawlUseLocalTZ').checked;
    const useOverrideTZ = document.getElementById('crawlUseOverrideTZ').value;
    const endecMode = document.getElementById('endecMode').value;

    if (rawHeader && crawlMode === 'header') {
        const settings = {
            text,
            speed,
            fontSize,
            textColor,
            bgColor,
            crawlMode,
            rawHeader,
            useLocalTZ,
            useOverrideTZ,
            endecMode
        };

        localStorage.setItem(localStorageKey, JSON.stringify(settings));
    }

    else {
        const settings = {
            text,
            speed,
            fontSize,
            textColor,
            bgColor,
            crawlMode,
            rawHeader: '',
            useLocalTZ,
            useOverrideTZ,
            endecMode
        };

        localStorage.setItem(localStorageKey, JSON.stringify(settings));
    }

    if (window.crawlGenerator) {
        // Reuse existing generator
        if (rawHeader && crawlMode === 'header') {
            let readable = await header_to_readable(rawHeader, useLocalTZ, useOverrideTZ, endecMode);
            if (readable != 'Invalid EAS Header Format') {
                window.crawlGenerator.setText(readable);
            }
            else {
                alert('Invalid EAS Header Format. Please check your input.');
                return;
            }
        }

        else {
            window.crawlGenerator.setText(text);
        }

        window.crawlGenerator.setSpeed(speed);
        window.crawlGenerator.setFontSize(fontSize);
        window.crawlGenerator.setTextColor(textColor);
        window.crawlGenerator.setBgColor(bgColor);
        window.crawlGenerator.start();
    }

    else {
        window.crawlGenerator = new TextCrawlGenerator(crawlDisplay);

        if (rawHeader && crawlMode === 'header') {
            let readable = await header_to_readable(rawHeader, useLocalTZ, useOverrideTZ, endecMode);
            if (readable != 'Invalid EAS Header Format') {
                window.crawlGenerator.setText(readable);
            }
            else {
                alert('Invalid EAS Header Format. Please check your input.');
                return;
            }
        }

        else {
            window.crawlGenerator.setText(text);
        }

        window.crawlGenerator.setSpeed(speed);
        window.crawlGenerator.setFontSize(fontSize);
        window.crawlGenerator.setTextColor(textColor);
        window.crawlGenerator.setBgColor(bgColor);
        window.crawlGenerator.start();
    }
});

document.getElementById('stopCrawl').addEventListener('click', () => {
    window.crawlGenerator.stop();
});

document.getElementById('pauseCrawl').addEventListener('click', () => {
    window.crawlGenerator.pause();
});

document.getElementById('exportCrawlGIF').addEventListener('click', () => {
    if (window.crawlGenerator) {
        exportAsGIF(window.crawlGenerator.canvas, 'text_crawl.gif');
    }
    else {
        alert('Please start the crawl before exporting.');
    }
});

document.getElementById('crawlMode').addEventListener('change', (event) => {
    const mode = event.target.value;
    const rawHeaderClassItems = document.getElementsByClassName('crawl-raw-header');
    const crawlTextClassItems = document.getElementsByClassName('crawl-text');

    if (mode === 'header') {
        Array.from(rawHeaderClassItems).forEach((el) => {
            el.style.display = '';
        });
        Array.from(crawlTextClassItems).forEach((el) => {
            el.style.display = 'none';
        });
        document.getElementById('E2TOptions').style.display = 'block';
    }

    else {
        Array.from(rawHeaderClassItems).forEach((el) => {
            el.style.display = 'none';
        });
        Array.from(crawlTextClassItems).forEach((el) => {
            el.style.display = '';
        });
        document.getElementById('E2TOptions').style.display = 'none';
    }
});

document.getElementById('crawlUseLocalTZ').addEventListener('change', (event) => {
    const useLocalTZ = event.target.checked;
    const crawlUseOverrideTZElements = document.getElementsByClassName('overrideTZ');

    if (useLocalTZ) {
        Array.from(crawlUseOverrideTZElements).forEach((el) => {
            el.style.display = 'none';
        });
    }

    else {
        Array.from(crawlUseOverrideTZElements).forEach((el) => {
            el.style.display = 'inline-block';
        });
    }
});

document.getElementById('crawlUseOverrideTZ').addEventListener('change', (event) => {
    const overrideTZ = event.target.value;

    if (overrideTZ != '') {
        document.getElementById('crawlUseLocalTZ').checked = false;
        document.getElementById('crawlUseLocalTZ').disabled = true;

        const crawlUseLocalTZElements = document.getElementsByClassName('localTZ');
        Array.from(crawlUseLocalTZElements).forEach((el) => {
            el.style.display = 'none';
        });

        const crawlUseOverrideTZElements = document.getElementsByClassName('overrideTZ');
        Array.from(crawlUseOverrideTZElements).forEach((el) => {
            el.style.display = 'inline-block';
        });
    }

    else {
        document.getElementById('crawlUseLocalTZ').disabled = false;

        const crawlUseLocalTZElements = document.getElementsByClassName('localTZ');
        Array.from(crawlUseLocalTZElements).forEach((el) => {
            el.style.display = 'inline-block';
        });
    }
});

const localStorageKey = 'eas-tools-crawl-settings';
const savedSettings = localStorage.getItem(localStorageKey);

if (savedSettings) {
    const settings = JSON.parse(savedSettings);

    document.getElementById('crawlText').value = settings.text;
    document.getElementById('crawlSpeed').value = settings.speed;
    document.getElementById('crawlFontSize').value = settings.fontSize;
    document.getElementById('crawlTextColor').value = settings.textColor;
    document.getElementById('crawlBgColor').value = settings.bgColor;
    document.getElementById('crawlMode').value = settings.crawlMode;
    document.getElementById('crawlRawHeader').value = settings.rawHeader;
    document.getElementById('crawlUseLocalTZ').checked = settings.useLocalTZ;
    document.getElementById('crawlUseOverrideTZ').value = settings.useOverrideTZ;

    addStatus('Loaded saved crawl settings!');

    document.addEventListener('DOMContentLoaded', () => {
        const crawlModeSelect = document.getElementById('crawlMode');
        const crawlUseLocalTZ = document.getElementById('crawlUseLocalTZ');
        const crawlUseOverrideTZ = document.getElementById('crawlUseOverrideTZ');

        const event = new Event('change');
        crawlModeSelect.dispatchEvent(event);
        crawlUseLocalTZ.dispatchEvent(event);
        crawlUseOverrideTZ.dispatchEvent(event);
    });
}
