/*
This bundle of JS code is used to generate text crawl animations, similar to those seen in real EAS alerts. It provides functionality to create, customize, and render scrolling text effects on a web page. Users can customize the text content, speed, font size, colors, and other visual aspects of the crawl animation. The generated crawl can be previewed in real-time and exported as a GIF for use in various applications. This tool is particularly useful for creating authentic-looking EAS alert simulations for training, testing, or entertainment purposes.
*/

const fontLoader = async () => {
    const fontDir = './assets/fonts/';
    const fontsToLoad = [
        { family: 'VCR EAS', file: 'vcreas.ttf' },
        { family: 'Geneva Blue', file: 'GenevaBlueBold.ttf' },
        { family: 'Akzidenz', file: 'Akzidenz.ttf' },
        { family: 'Helvetica Narrow', file: 'helvn.ttf' },
        { family: 'Swiss721', file: 'Swiss721.ttf' },
        { family: 'UPD6465', file: 'UPD6465.ttf' },
        { family: 'VCREAS_4.5', file: 'VCREAS_4.5.ttf' },
        { family: 'PJF CharGen', file: 'pjf-chargen.ttf' },
    ];

    await Promise.all(
        fontsToLoad.map(({ family, file }) => {
            const font = new FontFace(family, `url(${fontDir}${file})`);
            return font.load().then((loaded) => {
                document.fonts.add(loaded);
            });
        })
    );
};

fontLoader();

window.EAS2TextModulePromise = window.EAS2TextModulePromise || new Promise((resolve) => {
    window.addEventListener('EAS2TextModuleReady', (event) => resolve(event.detail), { once: true });
});

const clearButton = document.getElementById('clr-crawl');
const localStorageKey = 'eas-tools-crawl-settings';

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

const DEFAULT_VDS_BASE_DELAY = 10;

function createVdsExportState(ctx, lines) {
    const normalizedLines = Array.isArray(lines) ? lines : [];
    const charMetrics = [];
    const lineWidths = [];

    normalizedLines.forEach((line) => {
        const metrics = [];
        const characters = Array.from(line);
        let cursor = 0;

        characters.forEach((char) => {
            const glyph = char === '' ? ' ' : char;
            const width = ctx.measureText(glyph).width;
            metrics.push({
                char,
                offset: cursor,
                width,
                state: 'pre',
                framesRemaining: 0
            });
            cursor += width;
        });

        charMetrics.push(metrics);
        lineWidths.push(cursor);
    });

    const maxLineWidth = lineWidths.reduce((maxWidth, width) => Math.max(maxWidth, width), 0);

    return {
        lines: normalizedLines.slice(),
        charMetrics,
        lineWidths,
        maxLineWidth
    };
}

function resetVdsExportState(state) {
    if (!state) return;
    state.charMetrics.forEach((metrics) => {
        metrics.forEach((metric) => {
            metric.state = 'pre';
            metric.framesRemaining = 0;
        });
    });
}

function updateVdsExportState(state, offsetX, viewportWidth, frameDelay) {
    if (!state) return;
    const viewportLeft = 0;
    const viewportRight = viewportWidth;

    state.charMetrics.forEach((metrics, lineIdx) => {
        const width = state.lineWidths[lineIdx] || 0;
        const lineLeft = offsetX - width / 2;

        metrics.forEach((metric) => {
            const charLeft = lineLeft + metric.offset;
            const charRight = charLeft + metric.width;

            switch (metric.state) {
                case 'pre':
                    if (charLeft <= viewportRight) {
                        metric.state = 'delayIn';
                        metric.framesRemaining = frameDelay;
                    }
                    break;
                case 'delayIn':
                    if (charRight < viewportLeft) {
                        metric.state = 'done';
                        metric.framesRemaining = 0;
                    } else if (metric.framesRemaining > 0) {
                        metric.framesRemaining--;
                    } else {
                        metric.state = 'visible';
                    }
                    break;
                case 'visible':
                    if (charLeft <= viewportLeft) {
                        metric.state = 'delayOut';
                        metric.framesRemaining = frameDelay;
                    }
                    break;
                case 'delayOut':
                    if (metric.framesRemaining > 0) {
                        metric.framesRemaining--;
                    } else {
                        metric.state = 'done';
                    }
                    break;
                default:
                    break;
            }
        });
    });
}

function drawVdsExportFrame(ctx, state, offsetX, centerY, fontSize, renderText) {
    if (!state) return;
    const lineHeight = fontSize + 10;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const drawChar = (typeof renderText === 'function')
        ? renderText
        : (text, x, y) => ctx.fillText(text, x, y);

    state.charMetrics.forEach((metrics, lineIdx) => {
        const verticalOffset = lineIdx - (state.lines.length - 1) / 2;
        const y = centerY + verticalOffset * lineHeight;
        const width = state.lineWidths[lineIdx] || 0;
        const lineLeft = offsetX - width / 2;

        metrics.forEach((metric) => {
            if (metric.state !== 'visible') return;
            drawChar(metric.char, lineLeft + metric.offset, y);
        });
    });
}

function createTextRenderer(ctx, outlineColor, outlineWidth) {
    const parsedWidth = Number(outlineWidth);
    const hasOutline = Boolean(outlineColor) && Number.isFinite(parsedWidth) && parsedWidth > 0;

    if (!hasOutline) {
        return (text, x, y) => {
            if (text === undefined || text === null) return;
            const stringText = typeof text === 'string' ? text : String(text);
            if (!stringText) return;
            ctx.fillText(stringText, x, y);
        };
    }

    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = parsedWidth;

    return (text, x, y) => {
        if (text === undefined || text === null) return;
        const stringText = typeof text === 'string' ? text : String(text);
        if (!stringText) return;
        ctx.strokeText(stringText, x, y);
        ctx.fillText(stringText, x, y);
    };
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
    const useVdsMode = Boolean(generator.vdsMode);
    const fontStyle = generator.fontStyle || 'normal';
    const fontFamily = generator.fontFamily || 'Arial';
    const font = `${fontStyle} ${fontSize}px ${fontFamily}`;
    const lineHeight = fontSize + 10;

    captureCtx.font = font;
    captureCtx.textAlign = useVdsMode ? 'left' : 'center';
    captureCtx.textBaseline = 'middle';
    captureCtx.lineJoin = generator.outlineJoin || 'round';
    const renderText = createTextRenderer(captureCtx, generator.outlineColor, generator.outlineWidth);
    const vdsState = useVdsMode ? createVdsExportState(captureCtx, lines) : null;

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
    const defaultVdsDelay = (Number.isFinite(generator.vdsBaseDelayFrames) && generator.vdsBaseDelayFrames > 0)
        ? generator.vdsBaseDelayFrames
        : DEFAULT_VDS_BASE_DELAY;
    const vdsDelay = useVdsMode && typeof generator.getEffectiveVdsDelay === 'function'
        ? generator.getEffectiveVdsDelay(pxPerFrame)
        : defaultVdsDelay;
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

        if (useVdsMode) {
            updateVdsExportState(vdsState, offsetX, captureCanvas.width, vdsDelay);
            drawVdsExportFrame(
                captureCtx,
                vdsState,
                offsetX,
                captureCanvas.height / 2,
                fontSize,
                renderText
            );
            return;
        }

        lines.forEach((line, index) => {
            const verticalOffset = index - (lines.length - 1) / 2;
            const y = captureCanvas.height / 2 + verticalOffset * lineHeight;
            renderText(line, offsetX, y);
        });
    };

    resetVdsExportState(vdsState);
    let offsetX = startOffset;
    for (let i = 0; i < framesNeeded; i++) {
        drawFrame(offsetX);
        gif.addFrame(captureCanvas, { delay: frameDelay, copy: true });
        offsetX -= pxPerFrame;
        if (offsetX < endOffset) {
            offsetX = startOffset;
            resetVdsExportState(vdsState);
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
        this.vdsMode = false;
        this.vdsBaseDelayFrames = DEFAULT_VDS_BASE_DELAY;
        this.vdsReferenceSpeed = Math.max(0.01, Math.abs(this.speed) || 2);
        this.vdsState = null;
        this.fontFamily = 'Arial';
        this.fontStyle = 'normal';
        this.outlineColor = null;
        this.outlineWidth = 0;
        this.outlineJoin = 'round';

        window.addEventListener('resize', () => this.resizeCanvas());
        this.resizeCanvas();
    }

    resizeCanvas() {
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;
        this.offsetX = this.canvas.width / 2;
        this.offsetY = this.canvas.height / 2;
        this.startFromRightInitialized = false;
        this._invalidateVdsState();
    }

    setText(text) {
        this.text = text;
        this.startFromRightInitialized = false;
        this._invalidateVdsState();
    }

    setFontFamily(fontFamily) {
        this.fontFamily = fontFamily;
    }

    setFontStyle(fontStyle) {
        this.fontStyle = fontStyle;
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
            this._invalidateVdsState();
        }
    }

    setTextColor(color) {
        this.textColor = color;
    }

    setBgColor(color) {
        this.bgColor = color;
    }

    setOutlineColor(color) {
        this.outlineColor = color;
    }

    setOutlineWidth(width) {
        const parsed = Number(width);
        if (Number.isFinite(parsed) && parsed >= 0) {
            this.outlineWidth = parsed;
        }
    }

    setOutlineJoin(join) {
        this.outlineJoin = join;
    }

    getCrawlText() {
        return this.text;
    }

    setVDSMode(enabled) {
        const next = Boolean(enabled);
        if (this.vdsMode !== next) {
            this.vdsMode = next;
            this.startFromRightInitialized = false;
            this._invalidateVdsState();
        }
    }

    _invalidateVdsState() {
        this.vdsState = null;
    }

    _ensureVdsState(lines) {
        const normalizedLines = Array.isArray(lines) ? lines : [];
        const key = normalizedLines.join('\n');

        if (this.vdsState && this.vdsState.key === key) {
            return this.vdsState;
        }

        const lineWidths = [];
        const charMetrics = normalizedLines.map((line) => {
            const metrics = [];
            const characters = Array.from(line);
            let cursor = 0;

            characters.forEach((char) => {
                const measuredChar = char === '' ? ' ' : char;
                const width = this.ctx.measureText(measuredChar).width;
                metrics.push({
                    char,
                    offset: cursor,
                    width,
                    state: 'pre',
                    framesRemaining: 0
                });
                cursor += width;
            });

            lineWidths.push(cursor);
            return metrics;
        });

        const maxLineWidth = lineWidths.reduce((maxWidth, width) => Math.max(maxWidth, width), 0);

        this.vdsState = {
            key,
            lines: normalizedLines.slice(),
            charMetrics,
            lineWidths,
            maxLineWidth
        };

        return this.vdsState;
    }

    _resetVdsCharacters(state) {
        state.charMetrics.forEach((metrics) => {
            metrics.forEach((metric) => {
                metric.state = 'pre';
                metric.framesRemaining = 0;
            });
        });
    }

    getEffectiveVdsDelay(speedOverride) {
        const referenceSpeed = Math.max(0.01, this.vdsReferenceSpeed);
        const currentSpeed = Math.max(
            0.01,
            Number.isFinite(speedOverride) ? Math.abs(speedOverride) : Math.abs(this.speed) || referenceSpeed
        );
        const scaled = (this.vdsBaseDelayFrames * referenceSpeed) / currentSpeed;
        return Math.max(1, Math.round(scaled));
    }

    _updateVdsCharacters(state, frameDelay) {
        const viewportLeft = 0;
        const viewportRight = this.canvas.width;

        state.charMetrics.forEach((metrics, lineIdx) => {
            const width = state.lineWidths[lineIdx] || 0;
            const lineLeft = this.offsetX - width / 2;

            metrics.forEach((metric) => {
                const charLeft = lineLeft + metric.offset;
                const charRight = charLeft + metric.width;

                switch (metric.state) {
                    case 'pre':
                        if (charLeft <= viewportRight) {
                            metric.state = 'delayIn';
                            metric.framesRemaining = frameDelay;
                        }
                        break;
                    case 'delayIn':
                        if (charRight < viewportLeft) {
                            metric.state = 'done';
                            metric.framesRemaining = 0;
                        } else if (metric.framesRemaining > 0) {
                            metric.framesRemaining--;
                        } else {
                            metric.state = 'visible';
                        }
                        break;
                    case 'visible':
                        if (charLeft <= viewportLeft) {
                            metric.state = 'delayOut';
                            metric.framesRemaining = frameDelay;
                        }
                        break;
                    case 'delayOut':
                        if (metric.framesRemaining > 0) {
                            metric.framesRemaining--;
                        } else {
                            metric.state = 'done';
                        }
                        break;
                    default:
                        break;
                }
            });
        });
    }

    _drawVdsLines(state, renderText) {
        const lineHeight = this.fontSize + 10;
        const totalLines = state.lines.length;
        const drawChar = (typeof renderText === 'function')
            ? renderText
            : (text, x, y) => this.ctx.fillText(text, x, y);

        for (let lineIdx = 0; lineIdx < totalLines; lineIdx++) {
            const verticalOffset = lineIdx - (totalLines - 1) / 2;
            const y = this.offsetY + verticalOffset * lineHeight;
            const metrics = state.charMetrics[lineIdx];
            const width = state.lineWidths[lineIdx] || 0;
            const lineLeft = this.offsetX - width / 2;

            for (let charIdx = 0; charIdx < metrics.length; charIdx++) {
                const metric = metrics[charIdx];
                if (metric.state !== 'visible') continue;
                drawChar(metric.char, lineLeft + metric.offset, y);
            }
        }
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

        this.ctx.font = `${this.fontStyle || 'normal'} ${this.fontSize}px "${this.fontFamily || 'Arial'}"`;
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
        this.ctx.lineJoin = this.outlineJoin;
        const renderText = createTextRenderer(this.ctx, this.outlineColor, this.outlineWidth);

        lines.forEach((line, index) => {
            const verticalOffset = index - (lines.length - 1) / 2;
            const y = this.offsetY + verticalOffset * (this.fontSize + 10);
            renderText(line, this.offsetX, y);
        });
    }

    pause() {
        this.isAnimating = false;
        this.lastTimestamp = null;
    }

    animate(timestamp) {
        if(this.vdsMode) {
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
            this.ctx.font = `${this.fontStyle || 'normal'} ${this.fontSize}px "${this.fontFamily || 'Arial'}"`;
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'middle';
            this.ctx.lineJoin = this.outlineJoin;
            const renderText = createTextRenderer(this.ctx, this.outlineColor, this.outlineWidth);

            const lines = (this.text || '').split('\n');
            const state = this._ensureVdsState(lines);
            const maxLineWidth = state.maxLineWidth || 0;
            const startOffset = this.canvas.width + maxLineWidth / 2;

            if (!this.startFromRightInitialized || !Number.isFinite(this.offsetX)) {
                this.offsetX = startOffset;
                this.startFromRightInitialized = true;
                this._resetVdsCharacters(state);
            }

            const effectiveDelay = this.getEffectiveVdsDelay();
            this._updateVdsCharacters(state, effectiveDelay);
            this._drawVdsLines(state, renderText);

            if (Number.isFinite(this.speed)) {
                this.offsetX -= this.speed;
            }

            if (this.offsetX < -maxLineWidth / 2) {
                this.offsetX = startOffset;
                this._resetVdsCharacters(state);
            }

            requestAnimationFrame((nextTimestamp) => this.animate(nextTimestamp));
            return;
        }

        else {
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
            this.ctx.font = `${this.fontStyle || 'normal'} ${this.fontSize}px "${this.fontFamily || 'Arial'}"`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.lineJoin = this.outlineJoin;
            const renderText = createTextRenderer(this.ctx, this.outlineColor, this.outlineWidth);

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
                renderText(line, this.offsetX, y);
            });

            this.offsetX -= this.speed;
            if (this.offsetX < -maxLineWidth / 2) {
                this.offsetX = startOffset;
            }

            requestAnimationFrame((nextTimestamp) => this.animate(nextTimestamp));
        }
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
    const useVDSMode = document.getElementById('crawlUseVDSMode').checked;
    const vdsFrameDelay = document.getElementById('vdsFrameDelay').value;
    const parsedVdsDelay = Number(vdsFrameDelay);
    const normalizedVdsDelay = Number.isFinite(parsedVdsDelay) && parsedVdsDelay > 0 ? parsedVdsDelay : DEFAULT_VDS_BASE_DELAY;
    const fontFamily = document.getElementById('crawlFontFamily') ? document.getElementById('crawlFontFamily').value : 'Arial';
    const fontStyle = document.getElementById('crawlFontStyle') ? document.getElementById('crawlFontStyle').value : 'normal';
    const outlineColor = document.getElementById('crawlOutlineColor').value;
    const outlineWidth = document.getElementById('crawlOutlineWidth').value;
    const outlineJoin = document.getElementById('crawlOutlineJoin').value;

    await document.fonts.load(`${fontStyle} ${fontSize}px "${fontFamily}"`);

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
            endecMode,
            useVDSMode,
            vdsFrameDelay,
            fontFamily,
            fontStyle,
            outlineColor,
            outlineWidth,
            outlineJoin
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
            endecMode,
            useVDSMode,
            vdsFrameDelay,
            fontFamily,
            fontStyle,
            outlineColor,
            outlineWidth,
            outlineJoin
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
        window.crawlGenerator.setFontFamily(fontFamily);
        window.crawlGenerator.setFontStyle(fontStyle);
        window.crawlGenerator.setOutlineColor(outlineColor);
        window.crawlGenerator.setOutlineWidth(outlineWidth);
        window.crawlGenerator.setOutlineJoin(outlineJoin);
        window.crawlGenerator.vdsBaseDelayFrames = normalizedVdsDelay;
        window.crawlGenerator.setVDSMode(useVDSMode);
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
        window.crawlGenerator.setFontFamily(fontFamily);
        window.crawlGenerator.setFontStyle(fontStyle);
        window.crawlGenerator.setOutlineColor(outlineColor);
        window.crawlGenerator.setOutlineWidth(outlineWidth);
        window.crawlGenerator.setOutlineJoin(outlineJoin);
        window.crawlGenerator.vdsBaseDelayFrames = normalizedVdsDelay;
        window.crawlGenerator.setVDSMode(useVDSMode);

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

document.getElementById('copyCrawlText').addEventListener('click', async () => {
    const crawlText = window.crawlGenerator.getCrawlText();
    try {
        await navigator.clipboard.writeText(crawlText);
        addStatus('Crawl text copied to clipboard!');
    } catch (err) {
        alert('Failed to copy text: ' + err);
    }
});

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
    document.getElementById('endecMode').value = settings.endecMode;
    document.getElementById('crawlUseVDSMode').checked = settings.useVDSMode;
    document.getElementById('vdsFrameDelay').value = settings.vdsFrameDelay || DEFAULT_VDS_BASE_DELAY;
    document.getElementById('crawlFontFamily').value = settings.fontFamily || 'Arial';
    document.getElementById('crawlFontStyle').value = settings.fontStyle || 'normal';
    document.getElementById('crawlOutlineColor').value = settings.outlineColor || '#000000';
    document.getElementById('crawlOutlineWidth').value = settings.outlineWidth || 0;
    document.getElementById('crawlOutlineJoin').value = settings.outlineJoin || 'round';

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
