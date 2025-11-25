(async function () {
    let crawlTextEditor = null;

    function initCrawlTextEditor() {
        if (crawlTextEditor || !window.CodeMirror) return crawlTextEditor;

        const crawlTextArea = document.getElementById('crawlText');
        if (!crawlTextArea) return null;

        const crawlEditor = CodeMirror.fromTextArea(crawlTextArea, {
            lineNumbers: true,
            mode: 'text/xml',
            matchBrackets: true,
            theme: 'dracula',
            lineWrapping: true,
        });

        crawlEditor.setSize('27vw', '15rem');

        const crawlWrapper = crawlEditor.getWrapperElement();
        crawlWrapper.classList.add('ttsText', 'ttsText--editor', 'crawl-text');

        crawlEditor.on('change', () => {
            crawlEditor.save();
        });

        crawlTextEditor = crawlEditor;
        return crawlEditor;
    }

    window.crawlEditor = initCrawlTextEditor();
    window.crawlEditor.refresh();
})();

(function () {
    const TARGET_FRAME_MS = 1000 / 60;
    const TARGET_FRAMES_PER_SECOND = 1000 / TARGET_FRAME_MS;
    const PREMADE_BACKGROUND_LAYOUTS = Object.freeze({
        'assets/screens/xfinity.png': { topLeft: { x: 0, y: 475 } },
        'assets/screens/directv.jpg': { topLeft: { x: 0, y: 1200 } },
        'easyplus': { topLeft: { x: 0, y: 175 } },
        'easyplus_gray': { topLeft: { x: 0, y: 720 } },
        'dasdec': { topLeft: { x: 9999, y: 9999 } }
    });
    const ALLOWED_CRAWL_BACKGROUND_MODES = new Set(['solid', 'transparent', 'image', 'premade']);

    function normalizeCrawlBackgroundMode(value) {
        return ALLOWED_CRAWL_BACKGROUND_MODES.has(value) ? value : 'solid';
    }

    const fontLoader = async () => {
        const fontDir = './assets/fonts/';
        const fontsToLoad = [
            { family: 'VCREAS', file: 'VCREAS.ttf' },
            { family: 'Geneva Blue', file: 'GenevaBlueBold.ttf' },
            { family: 'Akzidenz', file: 'Akzidenz.ttf' },
            { family: 'Helvetica Narrow', file: 'helvn.ttf' },
            { family: 'Swiss721', file: 'Swiss721.ttf' },
            { family: 'UPD6465', file: 'UPD6465.ttf' },
            { family: 'VCREAS_4.5', file: 'VCREAS_4.5.ttf' },
            { family: 'PJF CharGen', file: 'pjf-chargen.ttf' },
            { family: 'Luxi Mono', file: 'luximb.ttf' }
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
        new_status.innerHTML = zero_pad_int(d.getHours().toString() % 12, 2) + ":" + zero_pad_int(d.getMinutes().toString(), 2) + ":" + zero_pad_int(d.getSeconds().toString(), 2) + " " + (d.getHours() >= 12 ? "PM" : "AM") + " [" + type + "]: " + stat;
        statuselem.appendChild(new_status);
        clearButton.style.display = "inline-block";
    }

    function resetStatus() {
        statuselem.innerHTML = "";
        clearButton.disabled = true;
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

    function updateVdsExportState(state, offsetX, viewportWidth, frameDelay, viewportInset = 0) {
        if (!state) return;
        const inset = Number.isFinite(viewportInset) ? viewportInset : 0;
        const safeWidth = Math.max(0, Number(viewportWidth) || 0);
        const viewportLeft = inset;
        const viewportRight = inset + safeWidth;

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

    // Source - https://stackoverflow.com/a/64656254
    // Posted by Fennec, modified by community. See post 'Timeline' for change history
    // Retrieved 2025-11-11, License - CC BY-SA 4.0
    function getSupportedMimeTypes(media, types, codecs) {
        const isSupported = MediaRecorder.isTypeSupported;
        const supported = [];
        types.forEach((type) => {
            const mimeType = `${media}/${type}`;
            codecs.forEach((codec) => [
                `${mimeType};codecs=${codec}`,
                `${mimeType};codecs=${codec.toUpperCase()}`,
            ].forEach(variation => {
                if(isSupported(variation))
                    supported.push(variation);
            }));
            if (isSupported(mimeType))
            supported.push(mimeType);
        });
        return supported;
    };

    function drawGeneratorBackground(ctx, generator, width, height) {
        if (!ctx || !generator) {
            return;
        }
        const safeWidth = Number.isFinite(width) && width > 0 ? width : 0;
        const safeHeight = Number.isFinite(height) && height > 0 ? height : 0;
        if (!safeWidth || !safeHeight) {
            ctx.clearRect(0, 0, safeWidth, safeHeight);
            return;
        }
        const video = generator.bgVideo;
        const image = generator.bgImage;
        if (video) {
            const haveCurrentData = typeof HTMLMediaElement !== 'undefined'
                ? HTMLMediaElement.HAVE_CURRENT_DATA
                : 2;
            if (video.readyState >= haveCurrentData) {
                ctx.drawImage(video, 0, 0, safeWidth, safeHeight);
                return;
            }
        }
        if (image) {
            ctx.drawImage(image, 0, 0, safeWidth, safeHeight);
            return;
        }
        if (generator._transparentBg) {
            ctx.clearRect(0, 0, safeWidth, safeHeight);
            return;
        }
        const fill = generator.bgColor || '#000000';
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, safeWidth, safeHeight);
    }

    function getGeneratorSpeedPerSecond(generator) {
        if (!generator) {
            return 0;
        }
        const cached = generator._speedPerSecond;
        if (Number.isFinite(cached)) {
            return cached;
        }
        const raw = Number(generator.speed);
        return Number.isFinite(raw) ? raw * TARGET_FRAMES_PER_SECOND : 0;
    }

    function getDasdecRotationState() {
        const state = window.__dasdecRotationState;
        return state && typeof state === 'object' ? state : null;
    }

    function stopDasdecRotationState() {
        const state = getDasdecRotationState();
        if (state && typeof state.stop === 'function') {
            state.stop();
        }
        window.__dasdecRotationState = null;
    }

    function pauseDasdecRotationState() {
        const state = getDasdecRotationState();
        if (state && typeof state.pause === 'function') {
            state.pause();
        }
    }

    function resumeDasdecRotationState() {
        const state = getDasdecRotationState();
        if (state && typeof state.resume === 'function') {
            state.resume();
        }
    }

    function stepDasdecRotationState(step) {
        const state = getDasdecRotationState();
        if (state && typeof state.step === 'function') {
            state.step(step);
            return true;
        }
        return false;
    }

    function setProgressBarValue(progressBar, ratio) {
        if (!progressBar) {
            return;
        }
        const normalized = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
        progressBar.value = normalized;
    }

    const PROGRESS_MINIMUM_STEP = 0.0005;
    const PROGRESS_RATIO_EPSILON = 1e-6;

    function resolveProgressStepRatio(increment) {
        const numeric = Number(increment);
        if (!Number.isFinite(numeric) || numeric <= 0) {
            return 0.01;
        }
        const normalized = numeric <= 1 ? numeric : numeric / 100;
        return Math.min(1, Math.max(PROGRESS_MINIMUM_STEP, normalized));
    }

    function resolveProgressFractionDigits(stepRatio) {
        const percentStep = stepRatio * 100;
        if (percentStep >= 1) {
            return 0;
        }
        const digits = Math.ceil(Math.abs(Math.log10(percentStep)));
        return Math.max(1, Math.min(3, digits));
    }

    function formatProgressPercent(ratio, fractionDigits) {
        if (ratio <= 0) {
            return '0%';
        }
        if (ratio >= 1 - PROGRESS_RATIO_EPSILON) {
            return '100%';
        }
        const percent = ratio * 100;
        if (!Number.isFinite(fractionDigits) || fractionDigits <= 0) {
            return `${Math.round(percent)}%`;
        }
        return `${percent.toFixed(fractionDigits)}%`;
    }

    function createExportProgressReporter(label, increment = 0.001) {
        const step = resolveProgressStepRatio(increment);
        const fractionDigits = resolveProgressFractionDigits(step);
        const progressBar = document.getElementById('crawlExportProgress');
        const progressDiv = document.getElementById('crawlExportProgressDiv');
        const progressLabel = document.getElementById('crawlExportProgressLabel');

        if (progressBar && progressDiv && progressLabel) {
            setProgressBarValue(progressBar, 0);
            progressDiv.style.display = 'block';
            progressLabel.textContent = '0%';

            let nextThreshold = step;
            return (value) => {
                const raw = Number(value);
                if (!Number.isFinite(raw)) {
                    return;
                }
                const ratio = raw <= 1 ? raw : raw / 100;
                const clampedRatio = Math.max(0, Math.min(1, ratio));
                setProgressBarValue(progressBar, clampedRatio);
                if (clampedRatio + PROGRESS_RATIO_EPSILON >= nextThreshold || clampedRatio >= 1 - PROGRESS_RATIO_EPSILON) {
                    progressLabel.textContent = formatProgressPercent(clampedRatio, fractionDigits);
                    nextThreshold = Math.min(1, clampedRatio + step);
                }
            };
        }
    }

    const crawlExportController = (() => {
        const progressDiv = document.getElementById('crawlExportProgressDiv');
        const progressBar = document.getElementById('crawlExportProgress');
        const progressLabel = document.getElementById('crawlExportProgressLabel');
        const cancelButton = document.getElementById('cancelCrawlExport');
        let activeToken = null;

        const hideProgress = () => {
            if (progressDiv) {
                progressDiv.style.display = 'none';
            }
            setProgressBarValue(progressBar, 0);
            if (progressLabel) {
                progressLabel.textContent = '0%';
            }
        };

        if (cancelButton) {
            cancelButton.disabled = true;
            cancelButton.addEventListener('click', () => {
                if (activeToken && typeof activeToken.cancel === 'function') {
                    activeToken.cancel();
                }
            });
        }
        hideProgress();

        return {
            createToken(onCancel) {
                const token = {
                    cancelled: false,
                    cancel() {
                        if (this.cancelled) {
                            return;
                        }
                        this.cancelled = true;
                        if (cancelButton && activeToken === token) {
                            cancelButton.disabled = true;
                        }
                        if (typeof onCancel === 'function') {
                            try {
                                onCancel();
                            } catch (error) {
                                console.error('Error cancelling crawl export:', error);
                            }
                        }
                    }
                };
                activeToken = token;
                if (cancelButton) {
                    cancelButton.disabled = typeof onCancel !== 'function';
                }
                return token;
            },
            clear(token) {
                if (token && token !== activeToken) {
                    return;
                }
                activeToken = null;
                if (cancelButton) {
                    cancelButton.disabled = true;
                }
                hideProgress();
            },
            isCancelled(token) {
                return Boolean(token && token.cancelled);
            }
        };
    })();

    function exportAsGIF(canvas, filename) {
        if (!window.crawlGenerator) {
            alert('Please start the crawl before exporting.');
            return;
        }

        addStatus('Exporting crawl as GIF... Please wait.');
        const startTime = performance.now();

        const generator = window.crawlGenerator;
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = canvas.width;
        captureCanvas.height = canvas.height;
        const captureCtx = captureCanvas.getContext('2d');

        const text = generator.text || '';
        const fontSize = Number(generator.fontSize) || 24;
        const textColor = generator.textColor || '#FFFFFF';
        const lines = text.split('\n');
        const useVdsMode = Boolean(generator.vdsMode);
        const fontStyle = generator.fontStyle || 'normal';
        const fontFamily = generator.fontFamily || 'Arial';
        const sanitizedFontFamily = /[^a-zA-Z0-9_-]/.test(fontFamily)
            ? `"${fontFamily.replace(/(["\\])/g, '\\$1')}"`
            : fontFamily;
        const font = `${fontStyle} ${fontSize}px ${sanitizedFontFamily}`;
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
        const translation = (typeof generator._computeTopLeftTranslation === 'function')
            ? generator._computeTopLeftTranslation(maxLineWidth, lines.length)
            : { x: 0, y: 0 };
        const translationX = Number.isFinite(translation.x) ? translation.x : 0;
        const translationY = Number.isFinite(translation.y) ? translation.y : 0;

        const bounds = typeof generator._computeCrawlBounds === 'function'
            ? generator._computeCrawlBounds(maxLineWidth)
            : null;
        const inset = bounds ? bounds.inset : 0;
        const halfLineWidth = maxLineWidth / 2;
        const startOffsetFallback = canvas.width + halfLineWidth;
        const endOffsetFallback = -halfLineWidth;
        const startOffset = bounds && Number.isFinite(bounds.start) ? bounds.start : startOffsetFallback;
        const endOffset = bounds && Number.isFinite(bounds.end) ? bounds.end : endOffsetFallback;
        const adjustedStartOffset = startOffset - translationX;
        const adjustedEndOffset = endOffset - translationX;
        const travelDistance = adjustedStartOffset - adjustedEndOffset || canvas.width;

        const recordedMsPerFrame = Number(generator.msPerFrame);
        const fallbackMsPerFrame = TARGET_FRAME_MS;
        const targetMsPerFrame = (Number.isFinite(recordedMsPerFrame) && recordedMsPerFrame > 0)
            ? recordedMsPerFrame
            : fallbackMsPerFrame;
        const MIN_GIF_DELAY = 20;
        const frameDelay = Math.max(MIN_GIF_DELAY, Math.round(targetMsPerFrame));
        const speedPerSecond = getGeneratorSpeedPerSecond(generator);
        const pxPerSecond = Math.max(0.5, Math.abs(speedPerSecond));
        const pxPerFrameMagnitude = pxPerSecond * (frameDelay / 1000);
        const pxPerFrameSigned = speedPerSecond >= 0 ? pxPerFrameMagnitude : -pxPerFrameMagnitude;
        const defaultVdsDelay = (Number.isFinite(generator.vdsBaseDelayFrames) && generator.vdsBaseDelayFrames > 0)
            ? generator.vdsBaseDelayFrames
            : DEFAULT_VDS_BASE_DELAY;
        const vdsDelay = useVdsMode && typeof generator.getEffectiveVdsDelay === 'function'
            ? generator.getEffectiveVdsDelay(pxPerFrameMagnitude)
            : defaultVdsDelay;
        let framesNeeded = Math.max(1, Math.ceil(travelDistance / Math.max(pxPerFrameMagnitude, 0.01)));
        const rawRepetitionInput = (typeof generator.crawlRepetitions !== 'undefined')
            ? Number(generator.crawlRepetitions)
            : Number(generator.repetitions);
        const repetitions = Math.max(1, Math.min(10, Math.round(rawRepetitionInput || 0)));
        const gifRepeat = repetitions <= 1 ? -1 : repetitions - 1;

        const gif = new GIF({
            workers: 5,
            quality: 4,
            repeat: gifRepeat
        });
        let userCancelledGifExport = false;
        const gifCancelToken = crawlExportController.createToken(() => {
            userCancelledGifExport = true;
            if (gif && typeof gif.abort === 'function') {
                gif.abort();
            } else {
                crawlExportController.clear(gifCancelToken);
                addStatus('GIF export canceled.', 'WARN');
            }
        });

        const clipWidth = captureCanvas.width - inset * 2;
        const shouldClip = inset > 0 && clipWidth > 0;
        const restartDelayMs = Number(generator.crawlRestartDelay);
        const restartDelayFrames = (Number.isFinite(restartDelayMs) && restartDelayMs > 0)
            ? Math.max(1, Math.round(restartDelayMs / frameDelay))
            : 0;
        const framesPerCycle = framesNeeded + restartDelayFrames;
        let totalFrames = framesPerCycle * repetitions;
        const dasdecBackground = window.__dasdecBackground;
        const dasdecPages = dasdecBackground && Array.isArray(dasdecBackground.pages) ? dasdecBackground.pages : null;
        const dasdecRotationDelay = dasdecBackground && Number.isFinite(dasdecBackground.rotationDelayMs)
            ? dasdecBackground.rotationDelayMs
            : null;
        const dasdecRepetitionOverride = dasdecBackground && Number.isFinite(dasdecBackground.repetitions)
            ? Math.max(1, Math.min(10, Math.round(dasdecBackground.repetitions)))
            : repetitions;
        const dasdecTotalDisplays = dasdecPages && dasdecPages.length && dasdecRotationDelay
            ? Math.max(1, Number(dasdecBackground.totalDisplays) || (dasdecRepetitionOverride * dasdecPages.length))
            : 0;
        const dasdecFramesPerPage = dasdecRotationDelay
            ? Math.max(1, Math.round(dasdecRotationDelay / frameDelay))
            : null;
        const getDasdecPageForFrame = dasdecPages && dasdecFramesPerPage
            ? (frameIndex) => {
                const displayIndex = Math.min(
                    dasdecTotalDisplays - 1,
                    Math.floor(frameIndex / dasdecFramesPerPage)
                );
                return dasdecPages[displayIndex % dasdecPages.length];
            }
            : null;
        if (getDasdecPageForFrame) {
            totalFrames = dasdecTotalDisplays * dasdecFramesPerPage;
        }
        let delayFramesRemaining = 0;
        const reportProgress = createExportProgressReporter('GIF export');
        const captureProgressPortion = 0.25;

        let showTime = localStorage["showTime"];

        const clearFrame = (frameIndex = 0) => {
            captureCtx.save();
            captureCtx.setTransform(1, 0, 0, 1, 0, 0);
            captureCtx.globalAlpha = 1;
            captureCtx.globalCompositeOperation = 'copy';
            let drewCustomBackground = false;
            if (getDasdecPageForFrame) {
                const dasdecPage = getDasdecPageForFrame(frameIndex);
                if (dasdecPage) {
                    captureCtx.drawImage(dasdecPage, 0, 0, captureCanvas.width, captureCanvas.height);
                    drewCustomBackground = true;
                }
            }
            if (!drewCustomBackground) {
                drawGeneratorBackground(captureCtx, generator, captureCanvas.width, captureCanvas.height);
            }
            captureCtx.restore();
            captureCtx.globalCompositeOperation = 'source-over';
        };

        const drawFrame = (offsetX, frameIndex) => {
            clearFrame(frameIndex);
            captureCtx.fillStyle = textColor;
            captureCtx.font = font;

            const translatedOffsetX = offsetX + translationX;
            const centerY = captureCanvas.height / 2 + translationY;

            if (shouldClip) {
                captureCtx.save();
                captureCtx.beginPath();
                captureCtx.rect(inset, 0, clipWidth, captureCanvas.height);
                captureCtx.clip();
            }

            if (useVdsMode) {
                updateVdsExportState(
                    vdsState,
                    translatedOffsetX,
                    Math.max(0, captureCanvas.width - inset * 2),
                    vdsDelay,
                    inset
                );
                drawVdsExportFrame(
                    captureCtx,
                    vdsState,
                    translatedOffsetX,
                    centerY,
                    fontSize,
                    renderText
                );
            } else {
                lines.forEach((line, index) => {
                    const verticalOffset = index - (lines.length - 1) / 2;
                    const y = centerY + verticalOffset * lineHeight;
                    renderText(line, translatedOffsetX, y);
                });
            }

            if (shouldClip) {
                captureCtx.restore();
            }
        };

        resetVdsExportState(vdsState);
        let offsetX = adjustedStartOffset;
        for (let i = 0; i < totalFrames; i++) {
            drawFrame(offsetX, i);
            gif.addFrame(captureCanvas, { delay: frameDelay, copy: true });
            reportProgress(((i + 1) / totalFrames) * captureProgressPortion);

            if (delayFramesRemaining > 0) {
                delayFramesRemaining--;
                if (delayFramesRemaining === 0) {
                    offsetX = adjustedStartOffset;
                    resetVdsExportState(vdsState);
                }
                continue;
            }

            offsetX -= pxPerFrameSigned;
            if ((pxPerFrameSigned >= 0 && offsetX < adjustedEndOffset) || (pxPerFrameSigned < 0 && offsetX > adjustedEndOffset)) {
                if (restartDelayFrames > 0) {
                    offsetX = adjustedEndOffset;
                    delayFramesRemaining = restartDelayFrames;
                } else {
                    offsetX = adjustedStartOffset;
                    resetVdsExportState(vdsState);
                }
            }
        }

        gif.on('progress', function(progress) {
            const clampedProgress = Math.max(0, Math.min(0.999, progress));
            const remainingPortion = 1 - captureProgressPortion;
            reportProgress(captureProgressPortion + clampedProgress * remainingPortion);
        });

        gif.on('abort', function() {
            const wasUserCancelled = userCancelledGifExport || crawlExportController.isCancelled(gifCancelToken);
            crawlExportController.clear(gifCancelToken);
            addStatus(
                wasUserCancelled ? 'GIF export canceled.' : 'GIF export aborted unexpectedly.',
                wasUserCancelled ? 'WARN' : 'ERROR'
            );
        });

        gif.on('finished', function(blob) {
            const wasCancelled = crawlExportController.isCancelled(gifCancelToken);
            if (wasCancelled) {
                crawlExportController.clear(gifCancelToken);
                return;
            }
            reportProgress(1);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            crawlExportController.clear(gifCancelToken);
            addStatus('Crawl exported successfully!' + (showTime ? ` (Took: ${((performance.now() - startTime) / 1000).toFixed(2)} seconds)` : ''), 'SUCCESS');
        });

        gif.render();
    };

    async function exportAsWebM(canvas, filename) {
        if (!window.crawlGenerator) {
            alert('Please start the crawl before exporting.');
            return;
        }

        addStatus('Exporting crawl as WebM... Please wait.');
        const startTime = performance.now();

        const generator = window.crawlGenerator;
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = canvas.width;
        captureCanvas.height = canvas.height;
        const captureCtx = captureCanvas.getContext('2d');

        const text = generator.text || '';
        const fontSize = Number(generator.fontSize) || 24;
        const textColor = generator.textColor || '#FFFFFF';
        const lines = text.split('\n');
        const useVdsMode = Boolean(generator.vdsMode);
        const fontStyle = generator.fontStyle || 'normal';
        const fontFamily = generator.fontFamily || 'Arial';
        const sanitizedFontFamily = /[^a-zA-Z0-9_-]/.test(fontFamily)
            ? `"${fontFamily.replace(/(["\\])/g, '\\$1')}"`
            : fontFamily;
        const font = `${fontStyle} ${fontSize}px ${sanitizedFontFamily}`;
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
        const translation = (typeof generator._computeTopLeftTranslation === 'function')
            ? generator._computeTopLeftTranslation(maxLineWidth, lines.length)
            : { x: 0, y: 0 };
        const translationX = Number.isFinite(translation.x) ? translation.x : 0;
        const translationY = Number.isFinite(translation.y) ? translation.y : 0;

        const bounds = typeof generator._computeCrawlBounds === 'function'
            ? generator._computeCrawlBounds(maxLineWidth)
            : null;
        const inset = bounds ? bounds.inset : 0;
        const halfLineWidth = maxLineWidth / 2;
        const startOffsetFallback = canvas.width + halfLineWidth;
        const endOffsetFallback = -halfLineWidth;
        const startOffset = bounds && Number.isFinite(bounds.start) ? bounds.start : startOffsetFallback;
        const endOffset = bounds && Number.isFinite(bounds.end) ? bounds.end : endOffsetFallback;
        const adjustedStartOffset = startOffset - translationX;
        const adjustedEndOffset = endOffset - translationX;
        const travelDistance = adjustedStartOffset - adjustedEndOffset || canvas.width;

        const recordedMsPerFrame = Number(generator.msPerFrame);
        const fallbackMsPerFrame = TARGET_FRAME_MS;
        const targetMsPerFrame = (Number.isFinite(recordedMsPerFrame) && recordedMsPerFrame > 0)
            ? recordedMsPerFrame
            : fallbackMsPerFrame;
        const MIN_CAPTURE_FPS = 60;
        const captureFrameDelay = 1000 / MIN_CAPTURE_FPS;
        const frameDelay = Math.max(1, Math.min(targetMsPerFrame, captureFrameDelay));
        const speedPerSecond = getGeneratorSpeedPerSecond(generator);
        const pxPerSecond = Math.max(0.5, Math.abs(speedPerSecond));
        const pxPerFrameMagnitude = pxPerSecond * (frameDelay / 1000);
        const pxPerFrameSigned = speedPerSecond >= 0 ? pxPerFrameMagnitude : -pxPerFrameMagnitude;
        const defaultVdsDelay = (Number.isFinite(generator.vdsBaseDelayFrames) && generator.vdsBaseDelayFrames > 0)
            ? generator.vdsBaseDelayFrames
            : DEFAULT_VDS_BASE_DELAY;
        const vdsDelay = useVdsMode && typeof generator.getEffectiveVdsDelay === 'function'
            ? generator.getEffectiveVdsDelay(pxPerFrameMagnitude)
            : defaultVdsDelay;
        let framesNeeded = Math.max(1, Math.ceil(travelDistance / Math.max(pxPerFrameMagnitude, 0.01)));
        const restartDelayMs = Number(generator.crawlRestartDelay);
        const restartDelayFrames = (Number.isFinite(restartDelayMs) && restartDelayMs > 0)
            ? Math.max(1, Math.round(restartDelayMs / frameDelay))
            : 0;
        const rawRepetitionInput = (typeof generator.crawlRepetitions !== 'undefined')
            ? Number(generator.crawlRepetitions)
            : Number(generator.repetitions);
        const repetitions = Math.max(1, Math.min(10, Math.round(rawRepetitionInput || 0)));
        const framesPerCycle = framesNeeded + restartDelayFrames;
        let totalFrames = framesPerCycle * repetitions;
        const dasdecBackground = window.__dasdecBackground;
        const dasdecPages = dasdecBackground && Array.isArray(dasdecBackground.pages) ? dasdecBackground.pages : null;
        const dasdecRotationDelay = dasdecBackground && Number.isFinite(dasdecBackground.rotationDelayMs)
            ? dasdecBackground.rotationDelayMs
            : null;
        const dasdecRepetitionOverride = dasdecBackground && Number.isFinite(dasdecBackground.repetitions)
            ? Math.max(1, Math.min(10, Math.round(dasdecBackground.repetitions)))
            : repetitions;
        const dasdecTotalDisplays = dasdecPages && dasdecPages.length && dasdecRotationDelay
            ? Math.max(1, Number(dasdecBackground.totalDisplays) || (dasdecRepetitionOverride * dasdecPages.length))
            : 0;
        const dasdecFramesPerPage = dasdecRotationDelay
            ? Math.max(1, Math.round(dasdecRotationDelay / frameDelay))
            : null;
        const getDasdecPageForFrame = dasdecPages && dasdecFramesPerPage
            ? (frameIndex) => {
                const displayIndex = Math.min(
                    dasdecTotalDisplays - 1,
                    Math.floor(frameIndex / dasdecFramesPerPage)
                );
                return dasdecPages[displayIndex % dasdecPages.length];
            }
            : null;
        if (getDasdecPageForFrame) {
            totalFrames = dasdecTotalDisplays * dasdecFramesPerPage;
        }

        const clipWidth = captureCanvas.width - inset * 2;
        const shouldClip = inset > 0 && clipWidth > 0;
        let delayFramesRemaining = 0;
        const reportProgress = createExportProgressReporter('WebM export');
        const captureProgressPortion = 0.25;

        let showTime = localStorage["showTime"];

        const clearFrame = (frameIndex = 0) => {
            captureCtx.save();
            captureCtx.setTransform(1, 0, 0, 1, 0, 0);
            captureCtx.globalAlpha = 1;
            captureCtx.globalCompositeOperation = 'copy';
            let drewCustomBackground = false;
            if (getDasdecPageForFrame) {
                const dasdecPage = getDasdecPageForFrame(frameIndex);
                if (dasdecPage) {
                    captureCtx.drawImage(dasdecPage, 0, 0, captureCanvas.width, captureCanvas.height);
                    drewCustomBackground = true;
                }
            }
            if (!drewCustomBackground) {
                drawGeneratorBackground(captureCtx, generator, captureCanvas.width, captureCanvas.height);
            }
            captureCtx.restore();
            captureCtx.globalCompositeOperation = 'source-over';
        };

        const drawFrame = (offsetX, frameIndex) => {
            clearFrame(frameIndex);
            captureCtx.fillStyle = textColor;
            captureCtx.font = font;

            const translatedOffsetX = offsetX + translationX;
            const centerY = captureCanvas.height / 2 + translationY;

            if (shouldClip) {
                captureCtx.save();
                captureCtx.beginPath();
                captureCtx.rect(inset, 0, clipWidth, captureCanvas.height);
                captureCtx.clip();
            }

            if (useVdsMode) {
                updateVdsExportState(
                    vdsState,
                    translatedOffsetX,
                    Math.max(0, captureCanvas.width - inset * 2),
                    vdsDelay,
                    inset
                );
                drawVdsExportFrame(
                    captureCtx,
                    vdsState,
                    translatedOffsetX,
                    centerY,
                    fontSize,
                    renderText
                );
            } else {
                lines.forEach((line, index) => {
                    const verticalOffset = index - (lines.length - 1) / 2;
                    const y = centerY + verticalOffset * lineHeight;
                    renderText(line, translatedOffsetX, y);
                });
            }

            if (shouldClip) {
                captureCtx.restore();
            }
        };

        const captureFps = Math.max(1, Math.min(120, Math.round(1000 / frameDelay)));
        const estimatedBitrate = Math.floor(captureCanvas.width * captureCanvas.height * captureFps * 0.3);
        const videoBitsPerSecond = Math.max(2_000_000, Math.min(25_000_000, estimatedBitrate));
        const stream = captureCanvas.captureStream(captureFps);
        const supportedMimeTypes = getSupportedMimeTypes('video', ['webm'], ['vp8', 'vp9', 'opus']);
        const mimeType = supportedMimeTypes[0] || 'video/webm';
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
        const recordedChunks = [];
        let recordingFailed = false;

        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size) {
                recordedChunks.push(event.data);
            }
        };

        let recorderStopResolver;
        const recorderStopped = new Promise((resolve) => {
            recorderStopResolver = resolve;
        });
        const resolveRecorderStopped = () => {
            if (recorderStopResolver) {
                recorderStopResolver();
                recorderStopResolver = null;
            }
        };
        const webmCancelToken = crawlExportController.createToken(() => {
            if (recorder.state !== 'inactive') {
                recorder.stop();
            } else {
                crawlExportController.clear(webmCancelToken);
                addStatus('WebM export canceled.', 'WARN');
                resolveRecorderStopped();
            }
        });

        recorder.onstop = () => {
            const wasCancelled = crawlExportController.isCancelled(webmCancelToken);
            if (recordingFailed) {
                recordedChunks.length = 0;
                crawlExportController.clear(webmCancelToken);
                resolveRecorderStopped();
                return;
            }
            if (wasCancelled) {
                recordedChunks.length = 0;
                crawlExportController.clear(webmCancelToken);
                addStatus('WebM export canceled.', 'WARN');
                resolveRecorderStopped();
                return;
            }
            if (!recordedChunks.length) {
                crawlExportController.clear(webmCancelToken);
                addStatus('No frames recorded for WebM export.', 'WARN');
                resolveRecorderStopped();
                return;
            }
            reportProgress(1);
            const blob = new Blob(recordedChunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            crawlExportController.clear(webmCancelToken);
            addStatus('Crawl exported successfully!' + (showTime ? ` (Took: ${((performance.now() - startTime) / 1000).toFixed(2)} seconds)` : ''), 'SUCCESS');
            resolveRecorderStopped();
        };

        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
        const now = (typeof performance === 'object' && typeof performance.now === 'function')
            ? () => performance.now()
            : () => Date.now();
        const createFrameScheduler = (delay) => {
            let nextTarget = now();
            return async () => {
                nextTarget += delay;
                let remaining = nextTarget - now();
                while (remaining > 1) {
                    await sleep(Math.min(remaining - 1, 16));
                    remaining = nextTarget - now();
                }
            };
        };
        const track = stream.getVideoTracks()[0];
        if (track && 'contentHint' in track) {
            track.contentHint = 'text';
        }
        if (track && typeof track.applyConstraints === 'function') {
            track.applyConstraints({ frameRate: captureFps }).catch(() => {});
        }
        const requestFrame = track && typeof track.requestFrame === 'function'
            ? () => track.requestFrame()
            : () => {};
        const waitForNextFrame = createFrameScheduler(frameDelay);

        const renderCapture = async () => {
            try {
                recorder.start();
                resetVdsExportState(vdsState);
                let offsetX = adjustedStartOffset;
                for (let i = 0; i < totalFrames; i++) {
                    if (crawlExportController.isCancelled(webmCancelToken)) {
                        break;
                    }
                    drawFrame(offsetX, i);
                    requestFrame();
                    reportProgress(((i + 1) / totalFrames) * (captureProgressPortion + 0.75));
                    if (delayFramesRemaining > 0) {
                        delayFramesRemaining--;
                        if (delayFramesRemaining === 0) {
                            offsetX = adjustedStartOffset;
                            resetVdsExportState(vdsState);
                        }
                    } else {
                        offsetX -= pxPerFrameSigned;
                        if ((pxPerFrameSigned >= 0 && offsetX < adjustedEndOffset) || (pxPerFrameSigned < 0 && offsetX > adjustedEndOffset)) {
                            if (restartDelayFrames > 0) {
                                offsetX = adjustedEndOffset;
                                delayFramesRemaining = restartDelayFrames;
                            } else {
                                offsetX = adjustedStartOffset;
                                resetVdsExportState(vdsState);
                            }
                        }
                    }
                    if (crawlExportController.isCancelled(webmCancelToken)) {
                        break;
                    }
                    if (i < totalFrames - 1) {
                        await waitForNextFrame();
                        if (crawlExportController.isCancelled(webmCancelToken)) {
                            break;
                        }
                    }
                }
                if (recorder.state !== 'inactive') {
                    recorder.stop();
                } else {
                    resolveRecorderStopped();
                }
            } catch (error) {
                console.error('WebM export failed:', error);
                recordingFailed = true;
                addStatus('Failed to export crawl as WebM.', 'ERROR');
                if (recorder.state !== 'inactive') {
                    recorder.stop();
                } else {
                    crawlExportController.clear(webmCancelToken);
                    resolveRecorderStopped();
                }
            }
        };

        await Promise.all([renderCapture(), recorderStopped]);
    }

    class TextCrawlGenerator {
        constructor(container) {
            this.container = container;
            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d');
            this.canvas.style.display = 'block';
            this.container.appendChild(this.canvas);
            this.text = "Hello from Wags!";
            this.speed = 2;
            this._speedPerSecond = this._computeSpeedPerSecond(this.speed);
            this.fontSize = 24;
            this.textColor = "#FFFFFF";
            this.bgColor = "#000000";
            this._transparentBg = false;
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
            this.bgImage = null;
            this.bgVideo = null;
            this.explicitWidth = null;
            this.explicitHeight = null;
            this.crawlInset = 0;
            this.crawlRestartDelay = 1000;
            this._restartDelayRemaining = 0;
            this._topLeftOffsetX = 0;
            this._topLeftOffsetY = 0;
            this._topLeftActive = false;
            this.repetitions = 0;
            this.crawlRepetitions = 0;
            this._frameHistory = [];
            this._frameHistoryLimit = 15;

            window.addEventListener('resize', () => this.resizeCanvas());
            this.resizeCanvas();
        }

        getNextFrame() {
            if (!this.ctx || !this.canvas) {
                return null;
            }

            const deltaMs = Number.isFinite(this.msPerFrame) && this.msPerFrame > 0
                ? this.msPerFrame
                : TARGET_FRAME_MS;
            this._renderFrame({ deltaMs, advance: true });
            return this.canvas;
        }

        getPrevFrame() {
            if (!this.ctx || !this.canvas) {
                return null;
            }

            const snapshot = this._frameHistory.pop();
            if (snapshot) {
                this._restoreFrameState(snapshot);
            }
            this._renderFrame({ advance: false });
            return this.canvas;
        }

        resizeCanvas() {
            const width = Number.isFinite(this.explicitWidth) ? this.explicitWidth : this.container.clientWidth;
            const height = Number.isFinite(this.explicitHeight) ? this.explicitHeight : this.container.clientHeight;
            this._applyCanvasSize(width, height);
        }

        adjustSize(width, height) {
            const normalizedWidth = this._normalizeExplicitDimension(width);
            const normalizedHeight = this._normalizeExplicitDimension(height);
            this.explicitWidth = normalizedWidth;
            this.explicitHeight = normalizedHeight;
            const targetWidth = Number.isFinite(normalizedWidth) ? normalizedWidth : this.container.clientWidth;
            const targetHeight = Number.isFinite(normalizedHeight) ? normalizedHeight : this.container.clientHeight;
            this._applyCanvasSize(targetWidth, targetHeight);
        }

        _applyCanvasSize(width, height) {
            const safeWidth = Number.isFinite(width) && width > 0 ? Math.round(width) : 1;
            const safeHeight = Number.isFinite(height) && height > 0 ? Math.round(height) : 1;
            if (this.canvas.width === safeWidth && this.canvas.height === safeHeight) {
                return;
            }
            this.canvas.width = safeWidth;
            this.canvas.height = safeHeight;
            this.offsetX = this.canvas.width / 2;
            this.offsetY = this.canvas.height / 2;
            this.startFromRightInitialized = false;
            this._invalidateVdsState();
            this._resetFrameHistory();
        }

        _normalizeExplicitDimension(value) {
            const parsed = Number(value);
            return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
        }

        _resolveCrawlInset() {
            const inset = Number.isFinite(this.crawlInset) ? this.crawlInset : 0;
            const halfWidth = Number.isFinite(this.canvas.width) ? this.canvas.width / 2 : 0;
            return Math.max(0, Math.min(halfWidth, inset));
        }

        _getEffectiveInset(rawInset) {
            const width = Number.isFinite(this.canvas.width) ? this.canvas.width : 0;
            const baseInset = Number.isFinite(rawInset) ? Math.max(0, rawInset) : this._resolveCrawlInset();
            if (!width || baseInset <= 0) {
                return 0;
            }
            return baseInset * 2 < width ? baseInset : 0;
        }

        _computeCrawlBounds(maxLineWidth) {
            const canvasWidth = Number.isFinite(this.canvas.width) ? this.canvas.width : 0;
            const textWidth = Math.max(0, Number(maxLineWidth) || 0);
            const halfTextWidth = textWidth / 2;
            const inset = this._getEffectiveInset();
            return {
                start: canvasWidth + halfTextWidth,
                end: -halfTextWidth,
                inset,
                textWidth
            };
        }

        _computeTopLeftTranslation(blockWidth, lineCount) {
            if (!this._topLeftActive) {
                return { x: 0, y: 0 };
            }
            const parseValue = (value) => {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? parsed : 0;
            };
            const safeWidth = Math.max(0, Number(blockWidth) || 0);
            const safeLineCount = Math.max(1, Number(lineCount) || 1);
            const lineHeight = this.fontSize + 10;
            const blockHeight = safeLineCount * lineHeight;
            const canvasWidth = Number.isFinite(this.canvas.width) ? this.canvas.width : 0;
            const canvasHeight = Number.isFinite(this.canvas.height) ? this.canvas.height : 0;
            const defaultLeft = canvasWidth / 2 - safeWidth / 2;
            const defaultTop = canvasHeight / 2 - blockHeight / 2;
            const targetX = parseValue(this._topLeftOffsetX);
            const targetY = parseValue(this._topLeftOffsetY);
            const deltaX = Number.isFinite(targetX) ? targetX - defaultLeft : -defaultLeft;
            const deltaY = Number.isFinite(targetY) ? targetY - defaultTop : -defaultTop;
            return {
                x: Number.isFinite(deltaX) ? deltaX : 0,
                y: Number.isFinite(deltaY) ? deltaY : 0
            };
        }

        _runWithTopLeftTranslation(translation, drawFn) {
            if (typeof drawFn !== 'function') {
                return;
            }
            const shiftX = translation && Number.isFinite(translation.x) ? translation.x : 0;
            const shiftY = translation && Number.isFinite(translation.y) ? translation.y : 0;
            if (shiftX === 0 && shiftY === 0) {
                drawFn();
                return;
            }
            const originalX = this.offsetX;
            const originalY = this.offsetY;
            this.offsetX = originalX + shiftX;
            this.offsetY = originalY + shiftY;
            try {
                drawFn();
            } finally {
                this.offsetX = originalX;
                this.offsetY = originalY;
            }
        }

        _applyCrawlClip(ctx, insetOverride) {
            const inset = Number.isFinite(insetOverride) ? insetOverride : this._getEffectiveInset();
            const width = this.canvas.width;
            const height = this.canvas.height;
            if (!ctx || typeof ctx.save !== 'function' || inset <= 0) {
                return () => {};
            }
            const clipWidth = width - inset * 2;
            if (clipWidth <= 0) {
                return () => {};
            }
            ctx.save();
            ctx.beginPath();
            ctx.rect(inset, 0, clipWidth, height);
            ctx.clip();
            return () => ctx.restore();
        }

        _updateFrameTiming(timestamp) {
            let delta = this.msPerFrame;
            if (typeof timestamp === 'number') {
                if (this.lastTimestamp !== null) {
                    const frameDelta = timestamp - this.lastTimestamp;
                    if (frameDelta > 0) {
                        const smoothing = 0.1;
                        this.msPerFrame = (1 - smoothing) * this.msPerFrame + smoothing * frameDelta;
                        delta = frameDelta;
                    }
                }
                this.lastTimestamp = timestamp;
            }
            return delta > 0 ? delta : this.msPerFrame;
        }

        _computeSpeedPerSecond(value) {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed * TARGET_FRAMES_PER_SECOND : 0;
        }

        _getFrameSpeedStep(deltaMs) {
            const perSecond = Number.isFinite(this._speedPerSecond)
                ? this._speedPerSecond
                : this._computeSpeedPerSecond(this.speed);
            if (!perSecond) {
                return 0;
            }
            const safeDelta = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : this.msPerFrame;
            return perSecond * (safeDelta / 1000);
        }

        _handleRestartDelay(deltaMs, endThreshold, startOffset, resetCallback) {
            const resolvedDelay = Number.isFinite(this.crawlRestartDelay) ? this.crawlRestartDelay : 0;
            const safeDelta = Number.isFinite(deltaMs) ? deltaMs : this.msPerFrame;

            if (this.offsetX < endThreshold) {
                if (this._restartDelayRemaining <= 0) {
                    this._restartDelayRemaining = resolvedDelay;
                    this.offsetX = endThreshold;
                    return;
                }

                this.offsetX = endThreshold;
                if (this._restartDelayRemaining > 0 && safeDelta > 0) {
                    this._restartDelayRemaining = Math.max(0, this._restartDelayRemaining - safeDelta);
                }

                if (this._restartDelayRemaining === 0) {
                    this.offsetX = startOffset;
                    if (typeof resetCallback === 'function') {
                        resetCallback();
                    }
                }
                return;
            }

            this._restartDelayRemaining = 0;
        }

        _resetFrameHistory() {
            if (Array.isArray(this._frameHistory)) {
                this._frameHistory.length = 0;
            } else {
                this._frameHistory = [];
            }
        }

        _cloneVdsState(state) {
            if (!state) {
                return null;
            }
            const cloneMetrics = state.charMetrics.map((metrics) => metrics.map((metric) => ({
                char: metric.char,
                offset: metric.offset,
                width: metric.width,
                state: metric.state,
                framesRemaining: metric.framesRemaining
            })));
            return {
                key: state.key,
                lines: state.lines.slice(),
                charMetrics: cloneMetrics,
                lineWidths: state.lineWidths.slice(),
                maxLineWidth: state.maxLineWidth
            };
        }

        _captureFrameState() {
            return {
                offsetX: this.offsetX,
                restartDelayRemaining: this._restartDelayRemaining,
                startFromRightInitialized: this.startFromRightInitialized,
                vdsState: this.vdsMode ? this._cloneVdsState(this.vdsState) : null
            };
        }

        _recordFrameSnapshot() {
            if (!Array.isArray(this._frameHistory)) {
                this._frameHistory = [];
            }
            this._frameHistory.push(this._captureFrameState());
            const limit = Number.isFinite(this._frameHistoryLimit) && this._frameHistoryLimit > 0
                ? Math.floor(this._frameHistoryLimit)
                : 0;
            if (limit > 0 && this._frameHistory.length > limit) {
                this._frameHistory.splice(0, this._frameHistory.length - limit);
            }
        }

        _restoreFrameState(snapshot) {
            if (!snapshot) {
                return;
            }
            if (Number.isFinite(snapshot.offsetX)) {
                this.offsetX = snapshot.offsetX;
            }
            if (Number.isFinite(snapshot.restartDelayRemaining)) {
                this._restartDelayRemaining = snapshot.restartDelayRemaining;
            }
            if (typeof snapshot.startFromRightInitialized === 'boolean') {
                this.startFromRightInitialized = snapshot.startFromRightInitialized;
            }
            if (snapshot.vdsState) {
                this.vdsState = this._cloneVdsState(snapshot.vdsState);
            }
        }

        _renderFrame(options = {}) {
            if (!this.ctx || !this.canvas) {
                return;
            }

            const { advance = true } = options;
            const deltaMs = Number.isFinite(options.deltaMs) && options.deltaMs > 0
                ? options.deltaMs
                : this.msPerFrame;

            this._clearBackground();
            this.ctx.fillStyle = this.textColor;
            this.ctx.font = `${this.fontStyle || 'normal'} ${this.fontSize}px "${this.fontFamily || 'Arial'}"`;
            this.ctx.textBaseline = 'middle';
            this.ctx.lineJoin = this.outlineJoin;

            const lines = (this.text || '').split('\n');

            if (this.vdsMode) {
                this.ctx.textAlign = 'left';
                const renderText = createTextRenderer(this.ctx, this.outlineColor, this.outlineWidth);
                const state = this._ensureVdsState(lines);
                const maxLineWidth = state.maxLineWidth || 0;
                const translation = this._computeTopLeftTranslation(maxLineWidth, lines.length);
                const translationX = Number.isFinite(translation.x) ? translation.x : 0;
                const bounds = this._computeCrawlBounds(maxLineWidth);
                const { start: startOffset, end: endOffset, inset } = bounds;
                const adjustedStartOffset = startOffset - translationX;
                const adjustedEndOffset = endOffset - translationX;
                const releaseClip = this._applyCrawlClip(this.ctx, inset);

                if (!this.startFromRightInitialized || !Number.isFinite(this.offsetX)) {
                    this.offsetX = adjustedStartOffset;
                    this.startFromRightInitialized = true;
                    this._restartDelayRemaining = 0;
                    this._resetVdsCharacters(state);
                    this._resetFrameHistory();
                }

                if (advance) {
                    this._recordFrameSnapshot();
                }

                const effectiveDelay = this.getEffectiveVdsDelay();
                this._runWithTopLeftTranslation(translation, () => {
                    if (advance) {
                        this._updateVdsCharacters(state, effectiveDelay);
                    }
                    this._drawVdsLines(state, renderText);
                });
                releaseClip();

                if (!advance) {
                    return;
                }

                const frameStep = this._getFrameSpeedStep(deltaMs);
                if (frameStep) {
                    this.offsetX -= frameStep;
                }

                this._handleRestartDelay(deltaMs, adjustedEndOffset, adjustedStartOffset, () => {
                    this._resetVdsCharacters(state);
                });

                return;
            }

            this.ctx.textAlign = 'center';
            const renderText = createTextRenderer(this.ctx, this.outlineColor, this.outlineWidth);
            const maxLineWidth = lines.reduce((maxWidth, line) => {
                const width = this.ctx.measureText(line).width;
                return width > maxWidth ? width : maxWidth;
            }, 0);
            const translation = this._computeTopLeftTranslation(maxLineWidth, lines.length);
            const translationX = Number.isFinite(translation.x) ? translation.x : 0;
            const bounds = this._computeCrawlBounds(maxLineWidth);
            const { start: startOffset, end: endOffset, inset } = bounds;
            const adjustedStartOffset = startOffset - translationX;
            const adjustedEndOffset = endOffset - translationX;
            const releaseClip = this._applyCrawlClip(this.ctx, inset);

            if (!this.startFromRightInitialized || !Number.isFinite(this.offsetX)) {
                this.offsetX = adjustedStartOffset;
                this.startFromRightInitialized = true;
                this._restartDelayRemaining = 0;
                this._resetFrameHistory();
            }

            if (advance) {
                this._recordFrameSnapshot();
            }

            this._runWithTopLeftTranslation(translation, () => {
                lines.forEach((line, index) => {
                    const verticalOffset = index - (lines.length - 1) / 2;
                    const y = this.offsetY + verticalOffset * (this.fontSize + 10);
                    renderText(line, this.offsetX, y);
                });
            });
            releaseClip();

            if (!advance) {
                return;
            }

            const frameStep = this._getFrameSpeedStep(deltaMs);
            if (frameStep) {
                this.offsetX -= frameStep;
            }

            this._handleRestartDelay(deltaMs, adjustedEndOffset, adjustedStartOffset);
        }

        setTopLeftOffsetX(offsetX) {
            this._topLeftOffsetX = offsetX;
            this._topLeftActive = true;
            this._resetFrameHistory();
        }

        setTopLeftOffsetY(offsetY) {
            this._topLeftOffsetY = offsetY;
            this._topLeftActive = true;
            this._resetFrameHistory();
        }

        setRepetitions(count) {
            const parsed = Number(count);
            if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 10) {
                this.repetitions = Math.round(parsed);
                this.crawlRepetitions = this.repetitions;
            }
        }

        setCrawlInset(inset) {
            const parsed = Number(inset);
            if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 500) {
                this.crawlInset = parsed;
                this.startFromRightInitialized = false;
                this._restartDelayRemaining = 0;
                this._invalidateVdsState();
                this._resetFrameHistory();
            }
        }

        setCrawlRestartDelay(delay) {
            const parsed = Number(delay);
            if (Number.isFinite(parsed) && parsed >= 500 && parsed <= 60000) {
                this.crawlRestartDelay = parsed;
                this._restartDelayRemaining = 0;
                this._resetFrameHistory();
            }
        }

        setText(text) {
            this.text = text;
            this.startFromRightInitialized = false;
            this._invalidateVdsState();
            this._resetFrameHistory();
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
                this._speedPerSecond = this._computeSpeedPerSecond(parsed);
                this._resetFrameHistory();
            }
        }

        setFontSize(size) {
            const parsed = Number(size);
            if (Number.isFinite(parsed) && parsed > 0) {
                this.fontSize = parsed;
                this.startFromRightInitialized = false;
                this._invalidateVdsState();
                this._resetFrameHistory();
            }
        }

        setTextColor(color) {
            this.textColor = color;
        }

        setBgColor(color) {
            this.bgColor = color;
            this._transparentBg = this._isTransparentColor(color);
        }

        _isTransparentColor(color) {
            if (typeof color !== 'string') {
                return false;
            }
            const normalized = color.trim().toLowerCase();
            if (normalized === 'transparent') {
                return true;
            }
            if (!normalized.startsWith('rgba(')) {
                return false;
            }
            const channels = normalized.slice(5, -1).split(',');
            if (channels.length < 4) {
                return false;
            }
            const alpha = Number(channels[3]);
            return Number.isFinite(alpha) && alpha <= 0;
        }

        _clearBackground() {
            if (!this.ctx) {
                return;
            }

            const width = this.canvas.width;
            const height = this.canvas.height;
            const video = this.bgVideo;

            if (video && Number.isFinite(width) && Number.isFinite(height)) {
                const haveCurrentData = typeof HTMLMediaElement !== 'undefined'
                    ? HTMLMediaElement.HAVE_CURRENT_DATA
                    : 2;
                if (video.readyState >= haveCurrentData) {
                    this.ctx.drawImage(video, 0, 0, width, height);
                    return;
                }
            }

            if (this.bgImage && Number.isFinite(width) && Number.isFinite(height)) {
                this.ctx.drawImage(this.bgImage, 0, 0, width, height);
                return;
            }

            if (this._transparentBg) {
                this.ctx.clearRect(0, 0, width, height);
                return;
            }
            const fill = this.bgColor || '#000000';
            this.ctx.fillStyle = fill;
            this.ctx.fillRect(0, 0, width, height);
        }

        setBgImage(image) {
            this.bgImage = image;
        }

        setBgVideo(video) {
            this.bgVideo = video;
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
                this._resetFrameHistory();
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
            const inset = this._getEffectiveInset();
            const viewportLeft = inset;
            const viewportRight = Math.max(inset, this.canvas.width - inset);

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

        _updateButtons(disabled) {
            const pauseCrawlButton = document.getElementById('pauseCrawl');
            const stopCrawlButton = document.getElementById('stopCrawl');
            const exportAsGIFButton = document.getElementById('exportCrawlGIF');
            const exportAsVideoButton = document.getElementById('exportCrawlVideo');
            const copyCrawlTextButton = document.getElementById('copyCrawlText');
            const destroyInstanceButton = document.getElementById('destroyCrawl');
            const nextFrameButton = document.getElementById('nextFrame');
            const prevFrameButton = document.getElementById('prevFrame');

            pauseCrawlButton.disabled = disabled;
            stopCrawlButton.disabled = disabled;
            exportAsGIFButton.disabled = disabled;
            exportAsVideoButton.disabled = disabled;
            copyCrawlTextButton.disabled = disabled;
            destroyInstanceButton.disabled = disabled;
            nextFrameButton.disabled = disabled;
            prevFrameButton.disabled = disabled;
        }

        start() {
            if (!this.isAnimating) {
                this.isAnimating = true;
                this.startFromRightInitialized = false;
                this.lastTimestamp = null;
                this._restartDelayRemaining = 0;
                this._resetFrameHistory();
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

            const bounds = this._computeCrawlBounds(maxLineWidth);
            this.offsetX = Number.isFinite(bounds.start) ? bounds.start : this.canvas.width / 2;
            this.offsetY = this.canvas.height / 2;
            this.startFromRightInitialized = false;
            this._restartDelayRemaining = 0;
            this._resetFrameHistory();

            this._clearBackground();
            this.ctx.fillStyle = this.textColor;
            this.ctx.lineJoin = this.outlineJoin;
            const renderText = createTextRenderer(this.ctx, this.outlineColor, this.outlineWidth);
            const releaseClip = this._applyCrawlClip(this.ctx, bounds.inset);

            const translation = this._computeTopLeftTranslation(maxLineWidth, lines.length);
            this._runWithTopLeftTranslation(translation, () => {
                lines.forEach((line, index) => {
                    const verticalOffset = index - (lines.length - 1) / 2;
                    const y = this.offsetY + verticalOffset * (this.fontSize + 10);
                    renderText(line, this.offsetX, y);
                });
            });
            releaseClip();
        }

        pause() {
            this.isAnimating = false;
            this.lastTimestamp = null;
            this._restartDelayRemaining = 0;
        }

        unpause() {
            if (!this.isAnimating) {
                this.isAnimating = true;
                this.lastTimestamp = null;
                requestAnimationFrame((timestamp) => this.animate(timestamp));
            }
        }

        destroy() {
            this.isAnimating = false;
            this.lastTimestamp = null;
            this._restartDelayRemaining = 0;
            this.container.removeChild(this.canvas);
            this.canvas = null;
            this.ctx = null;
            this._updateButtons(true);
        }

        animate(timestamp) {
            if (!this.isAnimating) return;

            const deltaMs = this._updateFrameTiming(timestamp);
            this._renderFrame({ deltaMs, advance: true });
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

    function getRequestedCrawlDimensions() {
        const widthInput = document.getElementById('crawlWidth');
        const heightInput = document.getElementById('crawlHeight');
        const width = widthInput ? Math.round(Number(widthInput.value) / 2) * 2 : null;
        const height = heightInput ? Math.round(Number(heightInput.value) / 2) * 2 : null;
        widthInput.value = String(width);
        heightInput.value = String(height);
        return { width, height };
    }

    function applyCrawlSizeToGenerator(generator = window.crawlGenerator) {
        if (!generator) return;
        const { width, height } = getRequestedCrawlDimensions();
        generator.adjustSize(width, height);
    }

    function getFileFromInput(inputId) {
        const input = document.getElementById(inputId);
        if (!input || !input.files || !input.files[0]) {
            return null;
        }
        return input.files[0];
    }

    async function loadImageFromInput(inputId) {
        const file = getFileFromInput(inputId);
        if (!file) return null;
        return new Promise((resolve) => {
            const objectUrl = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(null);
            };
            img.src = objectUrl;
        });
    }

    function parseBackgroundSelectionValue(value) {
        if (typeof value !== 'string') {
            return null;
        }
        const colonIndex = value.indexOf(':');
        if (colonIndex <= 0) {
            return null;
        }
        const type = value.slice(0, colonIndex).trim();
        const source = value.slice(colonIndex + 1).trim();
        if (!source) {
            return null;
        }
        return { type, source };
    }

    function setNumericInputValue(id, value, options = {}) {
        const input = document.getElementById(id);
        if (!input || !Number.isFinite(value)) {
            return false;
        }
        const { allowZero = false } = options;
        const normalized = Math.round(value);
        if (!allowZero && normalized <= 0) {
            return false;
        }
        if (allowZero && normalized < 0) {
            return false;
        }
        const nextValue = String(normalized);
        if (input.value === nextValue) {
            return false;
        }
        input.value = nextValue;
        return true;
    }

    function getPremadeTopLeft(path) {
        const layout = PREMADE_BACKGROUND_LAYOUTS[path];
        const x = layout && layout.topLeft && Number(layout.topLeft.x);
        const y = layout && layout.topLeft && Number(layout.topLeft.y);
        return {
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0
        };
    }

    async function loadImageFromSource(src) {
        if (!src) return null;
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }

    async function loadMediaElementFromSource(type, source) {
        if (type === 'image') {
            return loadImageFromSource(source);
        }
        return null;
    }

    function updateCrawlControlsFromAsset(meta = {}, options = {}) {
        const generator = options.generator || window.crawlGenerator;
        const { width, height, inset, topLeft } = meta;
        let sizeAvailable = false;

        if (Number.isFinite(width) && width > 0) {
            setNumericInputValue('crawlWidth', width, { allowZero: false });
            sizeAvailable = true;
        }

        if (Number.isFinite(height) && height > 0) {
            setNumericInputValue('crawlHeight', height, { allowZero: false });
            sizeAvailable = true;
        }

        if (sizeAvailable) {
            applyCrawlSizeToGenerator(generator);
        }

        if (Number.isFinite(inset)) {
            setNumericInputValue('crawlInset', inset, { allowZero: true });
            if (generator) {
                generator.setCrawlInset(inset);
            }
        }

        if (topLeft && typeof topLeft === 'object') {
            if (Number.isFinite(topLeft.x)) {
                setNumericInputValue('crawlTopLeftPixelX', topLeft.x, { allowZero: true });
                if (generator) {
                    generator.setTopLeftOffsetX(topLeft.x);
                }
            }
            if (Number.isFinite(topLeft.y)) {
                setNumericInputValue('crawlTopLeftPixelY', topLeft.y, { allowZero: true });
                if (generator) {
                    generator.setTopLeftOffsetY(topLeft.y);
                }
            }
        }

        return sizeAvailable;
    }

    let premadeSizingRequestToken = 0;
    async function requestPremadeBackgroundSizing() {
        const premadeSelect = document.getElementById('crawlBackgroundPremadeSelect');
        if (!premadeSelect) return;
        const descriptor = parseBackgroundSelectionValue(premadeSelect.value);
        if (!descriptor) return;
        const requestId = ++premadeSizingRequestToken;
        const initialTopLeft = getPremadeTopLeft(descriptor.source);
        if (descriptor.source === 'dasdec') {
            updateCrawlControlsFromAsset({
                width: 640,
                height: 480,
                topLeft: initialTopLeft
            });
            return;
        }
        updateCrawlControlsFromAsset({ topLeft: initialTopLeft });
        const media = await loadMediaElementFromSource(descriptor.type, descriptor.source);
        if (!media || requestId !== premadeSizingRequestToken) {
            return;
        }
        const modeSelect = document.getElementById('crawlBackgroundMode');
        if (!modeSelect || modeSelect.value !== 'premade') {
            return;
        }
        const width = media.naturalWidth;
        const height = media.naturalHeight;
        const topLeft = getPremadeTopLeft(descriptor.source);
        updateCrawlControlsFromAsset({ width, height, topLeft });
    }

    function mapEasyplusOriginatorToFullName(originator) {
        const originatorMap = window.entryPoints;
        const regex = /^(A|An|The) /gi;
        const regex2 = /rity$/gi;
        return originatorMap[originator].replace(regex, "").replace(regex2, "rities") || originator.replace(regex, "").replace(regex2, "rities");
    }

    function mapEasyplusEventCodeToFullName(eventCode) {
        const eventCodeMap = window.events;
        return eventCodeMap[eventCode] || eventCode;
    }

    async function generateEasyPlusMode1BackgroundImage(originatorInput, eventCodeInput) {
        const originator = mapEasyplusOriginatorToFullName(originatorInput ? originatorInput.trim() : '').replace(/A Primary/gi, 'Primary');
        const eventCode = mapEasyplusEventCodeToFullName(eventCodeInput ? eventCodeInput.trim() : '');

        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ababab';

        const fontSize = 84;
        const fontStyle = 'normal';
        const fontFamily = 'VCREAS_4.5';
        const sanitizedFontFamily = /[^a-zA-Z0-9_-]/.test(fontFamily)
            ? `"${fontFamily.replace(/(["\\])/g, '\\$1')}"`
            : fontFamily;
        const font = `${fontStyle} ${fontSize}px ${sanitizedFontFamily}`;

        await document.fonts.load(font);

        ctx.font = font;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        const aOrAn = /^[AEIOU]/i.test(eventCode) ? ' an ' : ' a ';
        const offsetScale = fontSize / 36;
        const centerY = canvas.height / 2;

        ctx.fillText("EMERGENCY ALERT SYSTEM".trim(), canvas.width / 2, centerY - 173 * offsetScale);
        ctx.fillText(originator.trim(), canvas.width / 2, centerY - 70 * offsetScale);
        ctx.fillText(('Issued' + aOrAn).trim(), canvas.width / 2, centerY - 3 * offsetScale);
        ctx.fillText(eventCode.trim(), canvas.width / 2, centerY + 65 * offsetScale);

        const img = new Image();
        img.src = canvas.toDataURL('image/png');
        return img;
    }

    async function generateEasyPlusMode2BackgroundImage(originatorInput, eventCodeInput) {
        const originator = mapEasyplusOriginatorToFullName(originatorInput ? originatorInput.trim() : '').replace(/A Primary/gi, 'Primary');
        const eventCode = mapEasyplusEventCodeToFullName(eventCodeInput ? eventCodeInput.trim() : '');

        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ababab';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';

        const fontSize = 84;
        const fontStyle = 'normal';
        const fontFamily = 'VCREAS_4.5';
        const sanitizedFontFamily = /[^a-zA-Z0-9_-]/.test(fontFamily)
            ? `"${fontFamily.replace(/(["\\])/g, '\\$1')}"`
            : fontFamily;
        const font = `${fontStyle} ${fontSize}px ${sanitizedFontFamily}`;

        await document.fonts.load(font);

        ctx.font = font;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        const renderText = createTextRenderer(ctx, "#000000", 5);
        const aOrAn = /^[AEIOU]/i.test(eventCode) ? ' an ' : ' a ';
        const offsetScale = fontSize / 36;
        const centerY = canvas.height / 2;

        renderText("EMERGENCY ALERT SYSTEM".trim(), canvas.width / 2, centerY - 173 * offsetScale);
        renderText(originator.trim(), canvas.width / 2, centerY - 100 * offsetScale);
        renderText(('Issued' + aOrAn).trim(), canvas.width / 2, centerY - 30 * offsetScale);
        renderText(eventCode.trim(), canvas.width / 2, centerY + 35 * offsetScale);

        const img = new Image();
        img.src = canvas.toDataURL('image/png');
        return img;
    }

    function formatDasdecPages(rawText) {
        const maxLineLength = 35;
        const maxLinesPerPage = 14;

        const lines = rawText.replace(/; /g, '\n').split('\n');
        const formattedLines = [];

        lines.forEach((line) => {
            const words = line.split(' ');
            let currentLine = '';

            words.forEach((word) => {
                if ((currentLine.length + word.length + 1) <= maxLineLength) {
                    currentLine += (currentLine ? ' ' : '') + word;
                } else {
                    formattedLines.push(currentLine);
                    currentLine = word;
                }
            });

            if (currentLine) {
                formattedLines.push(currentLine);
            }
        });

        const pages = [];
        const totalPages = Math.ceil(formattedLines.length / (maxLinesPerPage - 1));

        for (let i = 0; i < formattedLines.length; i += (maxLinesPerPage - 1)) {
            const pageContent = formattedLines.slice(i, i + (maxLinesPerPage - 1));
            while (pageContent.length < (maxLinesPerPage - 1)) {
                pageContent.push(''); // Fill empty lines if necessary
            }
            pageContent.push(`${pages.length + 1}/${totalPages}`);
            pages.push(pageContent);
        }

        return pages;
    }

    async function formatDasdecEAS2Text(rawHeader) {
        const [{ EAS2Text }, resources] = await Promise.all([e2tReady, resourcePromise]);
        const eas = await EAS2Text.fromUSMessage(rawHeader, { resources, mode: 'NONE', timeZoneName: document.getElementById('crawlUseOverrideTZ').value || 'UTC', tzLocal: document.getElementById('crawlUseLocalTZ').checked });

        const orgText = eas.orgText.replace(/An EAS Participant/gi, 'A broadcast or cable system');
        const msgFrom = eas.callsign ? `.\nMessage from ${eas.callsign}.\n` : '.\n';

        const fipsParts = [...eas.FIPSText];
        let dasdecFips = '';

        for (let i = 0; i < fipsParts.length; i++) {
            const part = fipsParts[i];
            const stateMatch = part.match(/\b([A-Z]{2})$/);
            let countyName = part;
            let stateAbbr = null;

            if (stateMatch) {
                stateAbbr = stateMatch[1];
                countyName = part.slice(0, part.length - 4).trim();
            }

            dasdecFips += countyName;

            const nextPart = fipsParts[i + 1];
            const nextStateMatch = nextPart ? nextPart.match(/\b([A-Z]{2})$/) : null;
            const nextStateAbbr = nextStateMatch ? nextStateMatch[1] : null;

            if (stateAbbr && nextStateAbbr !== stateAbbr) {
                dasdecFips += `, ${stateAbbr};\n`;
            } else if (stateAbbr && !nextStateAbbr) {
                dasdecFips += `, ${stateAbbr};\n`;
            } else {
                dasdecFips += ';\n';
            }
        }

        const fipscodes = dasdecFips.trim();

        const fullText = (
            `${orgText.toUpperCase()}\n` +
            `has issued ${eas.evntText.toUpperCase()}\n` +
            `for the following counties or\nareas:\n` +
            `${fipscodes}\n` +
            `at ${eas.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n` +
            `on ${eas.startTime.toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase()}\n` +
            `Effective until ${eas.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` +
            msgFrom
        );

        const pages = formatDasdecPages(fullText);
        return pages;
    }

    async function generateDasdecScreenImage(headerText) {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#4b4569';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#7a2f4c';
        ctx.lineWidth = 10;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);

        const fontSize = 28;
        const fontStyle = 'normal';
        const fontFamily = 'Luxi Mono';
        const sanitizedFontFamily = /[^a-zA-Z0-9_-]/.test(fontFamily)
            ? `"${fontFamily.replace(/(["\\])/g, '\\$1')}"`
            : fontFamily;
        const font = `${fontStyle} ${fontSize}px ${sanitizedFontFamily}`;

        await document.fonts.load(font);

        ctx.font = font;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        const lines = headerText.flat();
        const lineHeight = fontSize + 4;
        let y = 10;

        const centerX = canvas.width / 2;
        const horizontalScale = 0.75;
        lines.forEach((line) => {
            const textY = y + lineHeight / 2;
            ctx.save();
            ctx.scale(horizontalScale, 1);
            ctx.fillText(line, centerX / horizontalScale, textY);
            ctx.restore();
            y += lineHeight;
        });

        const img = new Image();
        img.src = canvas.toDataURL('image/png');
        return img;
    }

    async function loadCrawlBackgroundAssets(mode) {
        if (mode !== 'premade') {
            stopDasdecRotationState();
            window.__dasdecBackground = null;
        }
        if (mode === 'image') {
            const image = await loadImageFromInput('crawlBackgroundImageFile');
            return {
                image,
                width: image ? image.naturalWidth : null,
                height: image ? image.naturalHeight : null
            };
        }

        if (mode === 'premade') {
            window.__dasdecBackground = null;
            const premadeSelect = document.getElementById('crawlBackgroundPremadeSelect');

            if (premadeSelect) {
                const descriptor = parseBackgroundSelectionValue(premadeSelect.value);
                if (descriptor) {
                    if (descriptor.source !== 'dasdec') {
                        stopDasdecRotationState();
                    }
                    if (descriptor && descriptor.type === 'image') {
                        const media = await loadMediaElementFromSource(descriptor.type, descriptor.source);
                        if (media) {
                            const topLeft = getPremadeTopLeft(descriptor.source);
                            return {
                                image: media,
                                width: media ? media.naturalWidth : null,
                                height: media ? media.naturalHeight : null,
                                topLeft,
                                source: descriptor.source
                            };
                        }
                    }

                    else if (descriptor.source === 'easyplus_gray') {
                        const originator = document.getElementById('easyplusOriginator').value;
                        const eventCode = document.getElementById('easyplusEventCode').value;
                        const media = await generateEasyPlusMode2BackgroundImage(originator, eventCode);
                        if (media) {
                            const topLeft = getPremadeTopLeft(descriptor.source);
                            return {
                                image: media,
                                width: media ? media.naturalWidth : null,
                                height: media ? media.naturalHeight : null,
                                topLeft,
                                source: descriptor.source
                            };
                        }
                    }

                    else if (descriptor.source === 'easyplus') {
                        const easyplusSettings = document.getElementById('easyplusSettings');
                        easyplusSettings.style.display = 'block';
                        const originator = document.getElementById('easyplusOriginator').value;
                        const eventCode = document.getElementById('easyplusEventCode').value;
                        const media = await generateEasyPlusMode1BackgroundImage(originator, eventCode);
                        if (media) {
                            const topLeft = getPremadeTopLeft(descriptor.source);
                            return {
                                image: media,
                                width: media ? media.naturalWidth : null,
                                height: media ? media.naturalHeight : null,
                                topLeft,
                                source: descriptor.source
                            };
                        }
                    }

                    else if (descriptor.source === 'dasdec') {
                        stopDasdecRotationState();
                        window.__dasdecBackground = null;
                        const rawHeader = document.getElementById('crawlRawHeader').value;
                        let pages = await formatDasdecEAS2Text(rawHeader);
                        pages = Array.isArray(pages) ? pages : [];

                        const renderedPages = (await Promise.all(pages.map((page) => generateDasdecScreenImage(page)))).filter(Boolean);

                        if (renderedPages.length) {
                            const rotationDelayMs = 4000;
                            const repetitionsEl = document.getElementById('crawlRepetitions');
                            const rawRepetitionInput = repetitionsEl ? Number(repetitionsEl.value) : 1;
                            const repetitions = Math.max(1, Math.min(10, Math.round(rawRepetitionInput || 1)));
                            const totalDisplays = repetitions * renderedPages.length;
                            const baseMedia = renderedPages[0];
                            const baseWidth = baseMedia ? (baseMedia.naturalWidth || baseMedia.width || 640) : 640;
                            const baseHeight = baseMedia ? (baseMedia.naturalHeight || baseMedia.height || 480) : 480;
                            const rotatingImage = new Image();
                            const waitForImageLoad = (image) => new Promise((resolve) => {
                                if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
                                    resolve();
                                    return;
                                }
                                image.addEventListener('load', resolve, { once: true });
                                image.addEventListener('error', resolve, { once: true });
                            });
                            rotatingImage.src = baseMedia.src;
                            await waitForImageLoad(rotatingImage);

                            const dasdecBackgroundMeta = {
                                pages: renderedPages,
                                rotationDelayMs,
                                repetitions,
                                totalDisplays,
                                width: baseWidth,
                                height: baseHeight
                            };
                            window.__dasdecBackground = dasdecBackgroundMeta;

                            const rotationState = {
                                timer: null,
                                delay: rotationDelayMs,
                                pages: renderedPages,
                                image: rotatingImage,
                                index: 0,
                                paused: false,
                                destroyed: false,
                                stop() {
                                    this.destroyed = true;
                                    this.paused = true;
                                    if (this.timer) {
                                        clearTimeout(this.timer);
                                        this.timer = null;
                                    }
                                },
                                pause() {
                                    if (this.paused) {
                                        return;
                                    }
                                    this.paused = true;
                                    if (this.timer) {
                                        clearTimeout(this.timer);
                                        this.timer = null;
                                    }
                                },
                                resume() {
                                    if (this.destroyed) {
                                        return;
                                    }
                                    const wasPaused = this.paused;
                                    this.paused = false;
                                    if (wasPaused || !this.timer) {
                                        this._scheduleNext();
                                    }
                                },
                                step(stepDelta) {
                                    if (!Array.isArray(this.pages) || !this.pages.length) {
                                        return;
                                    }
                                    const len = this.pages.length;
                                    if (len === 1) {
                                        this.index = 0;
                                        this.image.src = this.pages[0].src;
                                        return;
                                    }
                                    const delta = Number(stepDelta);
                                    if (!Number.isFinite(delta)) {
                                        return;
                                    }
                                    const normalized = ((Math.trunc(delta) % len) + len) % len;
                                    if (normalized === 0) {
                                        this._restartTimer();
                                        return;
                                    }
                                    this.index = (this.index + normalized) % len;
                                    this.image.src = this.pages[this.index].src;
                                    this._restartTimer();
                                },
                                _restartTimer() {
                                    if (this.timer) {
                                        clearTimeout(this.timer);
                                        this.timer = null;
                                    }
                                    this._scheduleNext();
                                },
                                _scheduleNext() {
                                    if (this.destroyed || this.paused || !Array.isArray(this.pages) || this.pages.length <= 1) {
                                        return;
                                    }
                                    this.timer = setTimeout(() => {
                                        if (this.destroyed || this.paused) {
                                            this.timer = null;
                                            return;
                                        }
                                        this.index = (this.index + 1) % this.pages.length;
                                        this.image.src = this.pages[this.index].src;
                                        this._scheduleNext();
                                    }, this.delay);
                                }
                            };

                            window.__dasdecRotationState = rotationState;
                            rotationState.resume();
                            const topLeft = getPremadeTopLeft(descriptor.source);
                            return {
                                image: rotatingImage,
                                width: baseWidth,
                                height: baseHeight,
                                topLeft,
                                source: descriptor.source
                            };
                        }
                        window.__dasdecBackground = null;
                    }
                }
            }
        }

        return { image: null, width: null, height: null };
    }

    function applyBackgroundToGenerator(generator, mode, assets) {
        if (!generator) return;
        const resolvedAssets = assets || {};
        generator.setBgImage(null);
        generator.setBgVideo(null);

        if (resolvedAssets.image && (mode === 'image' || mode === 'premade')) {
            generator.setBgImage(resolvedAssets.image);
        }
    }

    let crawlPaused = false;

    function setPauseButtonState(paused) {
        crawlPaused = Boolean(paused);
        const pauseButton = document.getElementById('pauseCrawl');
        if (pauseButton) {
            pauseButton.innerText = crawlPaused ? 'Unpause Crawl' : 'Pause Crawl';
        }
    }

    function handleFrameStep(step) {
        if (Number(step) >= 0) {
            stepDasdecRotationState(1);
            if (window.crawlGenerator) {
                window.crawlGenerator.getNextFrame();
            }
        } else {
            stepDasdecRotationState(-1);
            if (window.crawlGenerator) {
                window.crawlGenerator.getPrevFrame();
            }
        }
    }

    document.getElementById('startCrawl').addEventListener('click', async () => {
        const crawlDisplay = document.getElementById('crawlDisplay');
        const text = document.getElementById('crawlText').value;
        const rawHeader = document.getElementById('crawlRawHeader').value;
        const speed = document.getElementById('crawlSpeed').value;
        const fontSize = document.getElementById('crawlFontSize').value;
        const textColor = document.getElementById('crawlTextColor').value;
        let bgColor = document.getElementById('crawlBgColor').value;
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
        const crawlWidth = document.getElementById('crawlWidth').value;
        const crawlHeight = document.getElementById('crawlHeight').value;
        const crawlInset = document.getElementById('crawlInset').value;
        const crawlRestartDelay = document.getElementById('crawlRestartDelay').value;
        const crawlBackgroundMode = document.getElementById('crawlBackgroundMode').value;
        const crawlBackgroundPremade = document.getElementById('crawlBackgroundPremadeSelect').value;
        const easyplusOriginator = document.getElementById('easyplusOriginator').value;
        const easyplusEventCode = document.getElementById('easyplusEventCode').value;
        const crawlTopLeftOffsetX = document.getElementById('crawlTopLeftPixelX').value;
        const crawlTopLeftOffsetY = document.getElementById('crawlTopLeftPixelY').value;
        const repetitions = document.getElementById('crawlRepetitions').value;

        if (crawlBackgroundMode === 'transparent') {
            bgColor = 'transparent';
        }

        await document.fonts.load(`${fontStyle} ${fontSize}px "${fontFamily}"`);

        const settings = {
            text,
            speed,
            fontSize,
            textColor,
            bgColor,
            crawlMode,
            rawHeader: rawHeader && crawlMode === 'header' ? rawHeader : '',
            useLocalTZ,
            useOverrideTZ,
            endecMode,
            useVDSMode,
            vdsFrameDelay,
            fontFamily,
            fontStyle,
            outlineColor,
            outlineWidth,
            outlineJoin,
            crawlWidth,
            crawlHeight,
            crawlInset,
            crawlRestartDelay,
            crawlBackgroundMode,
            crawlBackgroundPremade,
            easyplusOriginator,
            easyplusEventCode,
            crawlTopLeftOffsetX,
            crawlTopLeftOffsetY,
            repetitions
        };

        localStorage.setItem(localStorageKey, JSON.stringify(settings));

        const backgroundAssets = await loadCrawlBackgroundAssets(crawlBackgroundMode);
        const isNewGenerator = !window.crawlGenerator;

        if (isNewGenerator) {
            window.crawlGenerator = new TextCrawlGenerator(crawlDisplay);
        }

        const generator = window.crawlGenerator;
        let appliedAutoSizing = false;
        if (crawlBackgroundMode === 'premade') {
            const autoMeta = {
                width: backgroundAssets.width,
                height: backgroundAssets.height,
                topLeft: backgroundAssets.topLeft
            };
            if (Number.isFinite(backgroundAssets.inset)) {
                autoMeta.inset = backgroundAssets.inset;
            }
            appliedAutoSizing = updateCrawlControlsFromAsset(autoMeta, { generator });
        }

        if (!appliedAutoSizing) {
            applyCrawlSizeToGenerator(generator);
        }

        applyBackgroundToGenerator(generator, crawlBackgroundMode, backgroundAssets);

        if (rawHeader && crawlMode === 'header') {
            let readable = await header_to_readable(rawHeader, useLocalTZ, useOverrideTZ, endecMode);
            if (readable != 'Invalid EAS Header Format') {
                if (readable.match(/for All of The United States/gi) && document.getElementById('endecMode').value === "EASY") {
                    readable = readable.replace(/for All of The United States/gi, 'for the United States');
                }
                generator.setText(readable);
            }
            else {
                alert('Invalid EAS Header Format. Please check your input.');
                return;
            }
        }

        else {
            if (isNewGenerator && (!text || text.trim() === '')) {
                alert('Please enter crawl text or a valid EAS header.');
                return;
            }

            generator.setText(text);
        }

        if (backgroundAssets.image) {
            generator.setBgColor('rgba(0,0,0,0)');
            generator.setTopLeftOffsetX(crawlTopLeftOffsetX);
            generator.setTopLeftOffsetY(crawlTopLeftOffsetY);
        }
        generator.setSpeed(speed);
        generator.setFontSize(fontSize);
        generator.setTextColor(textColor);
        generator.setBgColor(bgColor === 'transparent' ? 'rgba(0,0,0,0)' : bgColor);
        generator.setFontFamily(fontFamily);
        generator.setFontStyle(fontStyle);
        generator.setOutlineColor(outlineColor);
        generator.setOutlineWidth(outlineWidth);
        generator.setOutlineJoin(outlineJoin);
        generator.setCrawlInset(crawlInset);
        generator.setCrawlRestartDelay(crawlRestartDelay);
        generator.vdsBaseDelayFrames = normalizedVdsDelay;
        generator.setVDSMode(useVDSMode);
        generator.setRepetitions(repetitions);
        setPauseButtonState(false);
        resumeDasdecRotationState();
        window.crawlGenerator._updateButtons(false);
        generator.start();
    });

    document.getElementById('stopCrawl').addEventListener('click', () => {
        if (!window.crawlGenerator) return;
        stopDasdecRotationState();
        window.crawlGenerator.stop();
        setPauseButtonState(false);
    });

    document.getElementById('pauseCrawl').addEventListener('click', () => {
        if (!window.crawlGenerator) return;
        const shouldPause = !crawlPaused;
        setPauseButtonState(shouldPause);
        if (shouldPause) {
            window.crawlGenerator.pause();
            pauseDasdecRotationState();
        }
        else {
            window.crawlGenerator.unpause();
            resumeDasdecRotationState();
        }
    });

    const nextFrameButton = document.getElementById('nextFrame');
    if (nextFrameButton) {
        nextFrameButton.addEventListener('click', () => handleFrameStep(1));
    }

    const prevFrameButton = document.getElementById('prevFrame');
    if (prevFrameButton) {
        prevFrameButton.addEventListener('click', () => handleFrameStep(-1));
    }

    document.getElementById('exportCrawlGIF').addEventListener('click', () => {
        if (window.crawlGenerator) {
            exportAsGIF(window.crawlGenerator.canvas, 'text_crawl.gif');
        }
        else {
            alert('Please start the crawl before exporting.');
        }
    });

    document.getElementById('exportCrawlVideo').addEventListener('click', () => {
        if (window.crawlGenerator) {
            exportAsWebM(window.crawlGenerator.canvas, 'text_crawl.webm');
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
                el.style.display = 'inline-block';
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
                el.style.display = 'inline-block';
            });
            document.getElementById('E2TOptions').style.display = 'none';
        }
    });

    document.getElementById('crawlUseLocalTZ').addEventListener('change', (event) => {
        const useLocalTZ = event.target.checked;
        const crawlUseOverrideTZElements = document.getElementsByClassName('crawlOverrideTZ');

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

            const crawlUseOverrideTZElements = document.getElementsByClassName('crawlOverrideTZ');
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
        if (!window.crawlGenerator) {
            alert('Please start the crawl before copying text.');
            return;
        }

        const crawlModeSelect = document.getElementById('crawlMode');
        const backgroundModeSelect = document.getElementById('crawlBackgroundMode');
        const premadeSelect = document.getElementById('crawlBackgroundPremadeSelect');
        const usingHeaderMode = crawlModeSelect && crawlModeSelect.value === 'header';
        const usingDasdecBackground = backgroundModeSelect
            && backgroundModeSelect.value === 'premade'
            && premadeSelect
            && premadeSelect.value.includes('dasdec');

        let textToCopy = window.crawlGenerator.getCrawlText() || '';

        if (usingHeaderMode && usingDasdecBackground) {
            const rawHeader = document.getElementById('crawlRawHeader').value;
            if (!rawHeader) {
                alert('Please provide an EAS header before copying DASDEC text.');
                return;
            }
            try {
                const pages = await formatDasdecEAS2Text(rawHeader);
                if (Array.isArray(pages) && pages.length) {
                    const formattedPages = pages.map((page) => {
                        if (Array.isArray(page)) {
                            return page.join('\n').trimEnd();
                        }
                        if (page && typeof page === 'object' && typeof page.flat === 'function') {
                            return page.flat().join('\n').trimEnd();
                        }
                        return String(page || '').trimEnd();
                    });
                    textToCopy = formattedPages.join('\n\n').trim();
                }
            } catch (error) {
                console.error('Failed to format DASDEC text for copying:', error);
                addStatus('Failed to format DASDEC text. Falling back to displayed crawl text.', 'WARN');
            }
        }

        try {
            await navigator.clipboard.writeText(textToCopy);
            addStatus(usingHeaderMode && usingDasdecBackground
                ? 'Formatted DASDEC text copied to clipboard!'
                : 'Crawl text copied to clipboard!');
        } catch (err) {
            alert('Failed to copy text: ' + err);
            addStatus('Failed to copy text: ' + err, 'ERROR');
        }
    });

    document.getElementById('crawlBackgroundMode').addEventListener('change', (event) => {
        const mode = event.target.value;
        const bgColorInput = document.getElementById('crawlBgColor');
        const crawlBackgroundColorDiv = document.getElementById('crawlBackgroundColorDiv');
        const crawlBackgroundImageDiv = document.getElementById('crawlBackgroundImageDiv');
        const crawlBackgroundPremadeDiv = document.getElementById('crawlBackgroundPremadeDiv');
        const crawlGetAndSetDiv = document.getElementById('crawlGetAndSetDiv');
        const showGetSetControls = mode === 'image';

        if (crawlGetAndSetDiv) {
            crawlGetAndSetDiv.style.display = showGetSetControls ? 'block' : 'none';
        }

        crawlBackgroundImageDiv.style.display = 'none';
        crawlBackgroundColorDiv.style.display = 'none';
        if (crawlBackgroundPremadeDiv) {
            crawlBackgroundPremadeDiv.style.display = 'none';
        }

        if (mode === 'image') {
            bgColorInput.disabled = true;
            crawlBackgroundImageDiv.style.display = 'block';
        }

        else if (mode === 'solid') {
            bgColorInput.disabled = false;
            crawlBackgroundColorDiv.style.display = 'block';
        }

        else if (mode === 'premade') {
            bgColorInput.disabled = true;
            if (crawlBackgroundPremadeDiv) {
                crawlBackgroundPremadeDiv.style.display = 'block';
            }
            requestPremadeBackgroundSizing();
        }

        else {
            bgColorInput.disabled = true;
        }
    });

    const destroyInstanceButton = document.getElementById('destroyCrawl');
    if (destroyInstanceButton) {
        destroyInstanceButton.addEventListener('click', () => {
            stopDasdecRotationState();
            if (window.crawlGenerator) {
                window.crawlGenerator.destroy();
                window.crawlGenerator = null;
                setPauseButtonState(false);
                addStatus('Crawl generator instance destroyed.');
                destroyInstanceButton.disabled = true;
            } else {
                addStatus('No crawl generator instance to destroy.', 'WARNING');
            }
        });
    }

    const crawlBackgroundPremadeSelect = document.getElementById('crawlBackgroundPremadeSelect');
    if (crawlBackgroundPremadeSelect) {
        crawlBackgroundPremadeSelect.addEventListener('change', () => {
            const modeSelect = document.getElementById('crawlBackgroundMode');
            if (modeSelect && modeSelect.value === 'premade') {
                requestPremadeBackgroundSizing();
            }
        });
    }

    const crawlGetAndSetButton = document.getElementById('crawlGetAndSetWH');
    if (crawlGetAndSetButton) {
        crawlGetAndSetButton.addEventListener('click', async () => {
            const modeSelect = document.getElementById('crawlBackgroundMode');
            if (!modeSelect) return;
            const mode = modeSelect.value;
            if (mode !== 'image') {
                alert('Select a custom image background before syncing dimensions.');
                return;
            }
            const media = await loadImageFromInput('crawlBackgroundImageFile');
            if (!media) {
                alert('Please choose a background file first.');
                return;
            }
            const width = Math.round(media.naturalWidth / 2) * 2;
            const height = Math.round(media.naturalHeight / 2) * 2;
            if (!width || !height) {
                alert('Unable to determine media dimensions.');
                return;
            }
            updateCrawlControlsFromAsset({ width, height });
        });
    }

    ['crawlWidth', 'crawlHeight'].forEach((id) => {
        const input = document.getElementById(id);
        if (!input) return;
        const handler = () => applyCrawlSizeToGenerator();
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
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
        document.getElementById('crawlRepetitions').value = settings.repetitions || 1;
        document.getElementById('easyplusOriginator').value = settings.easyplusOriginator || '';
        document.getElementById('easyplusEventCode').value = settings.easyplusEventCode || '';

        const premadeSelect = document.getElementById('crawlBackgroundPremadeSelect');
        if (premadeSelect && typeof settings.crawlBackgroundPremade === 'string' && settings.crawlBackgroundPremade) {
            const hasValue = Array.from(premadeSelect.options || []).some((option) => option.value === settings.crawlBackgroundPremade);
            if (hasValue) {
                premadeSelect.value = settings.crawlBackgroundPremade;
            }
        }

        const storedBackgroundMode = normalizeCrawlBackgroundMode(settings.crawlBackgroundMode);
        document.getElementById('crawlBackgroundMode').value = storedBackgroundMode;

        if (settings.crawlWidth !== undefined && settings.crawlWidth !== null) {
            document.getElementById('crawlWidth').value = settings.crawlWidth;
        }

        if (settings.crawlHeight !== undefined && settings.crawlHeight !== null) {
            document.getElementById('crawlHeight').value = settings.crawlHeight;
        }

        if (settings.crawlInset !== undefined && settings.crawlInset !== null) {
            document.getElementById('crawlInset').value = settings.crawlInset;
        }

        if (settings.crawlRestartDelay !== undefined && settings.crawlRestartDelay !== null) {
            document.getElementById('crawlRestartDelay').value = settings.crawlRestartDelay;
        }

        if (settings.crawlBackgroundMode !== undefined && settings.crawlBackgroundMode !== null) {
            document.getElementById('crawlBackgroundMode').value = storedBackgroundMode;
        }

        addStatus('Loaded saved crawl settings!');

        const refreshSavedCrawlControls = () => {
            const crawlUseLocalTZ = document.getElementById('crawlUseLocalTZ');
            const crawlUseOverrideTZ = document.getElementById('crawlUseOverrideTZ');
            const crawlBackgroundMode = document.getElementById('crawlBackgroundMode');
            const crawlTextSource = document.getElementById('crawlMode');
            if (!crawlUseLocalTZ || !crawlUseOverrideTZ || !crawlBackgroundMode || !crawlTextSource) {
                return;
            }

            const dispatchChange = (element) => {
                element.dispatchEvent(new Event('change', { bubbles: true }));
            };

            dispatchChange(crawlUseLocalTZ);
            dispatchChange(crawlUseOverrideTZ);
            dispatchChange(crawlBackgroundMode);
            dispatchChange(crawlTextSource);
        };

        const ensurePremadeSizing = () => {
            const modeSelect = document.getElementById('crawlBackgroundMode');
            if (modeSelect && modeSelect.value === 'premade') {
                requestPremadeBackgroundSizing();
            }
        };

        const runSavedControlRefresh = () => {
            refreshSavedCrawlControls();
            ensurePremadeSizing();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', runSavedControlRefresh, { once: true });
        } else {
            runSavedControlRefresh();
        }
    }

    function parseEASHeaderAndUpdateEasyPlusSettings(rawHeader) {
        const regex = /^ZCZC-([A-Z]{3})-([A-Z]{3})-((?:\d{6}(?:-?)){1,31})\+(\d{4})-(\d{7})-([A-Za-z0-9\/ ]{0,8})-$/m;
        const match = regex.exec(rawHeader);
        if (!match) {
            return;
        }

        const originatorCode = match[1];
        const eventCode = match[2];

        const originatorInput = document.getElementById('easyplusOriginator');
        const eventCodeInput = document.getElementById('easyplusEventCode');

        if (originatorInput) {
            originatorInput.value = originatorCode;
        }

        if (eventCodeInput) {
            eventCodeInput.value = eventCode;
        }
    }

    const initializeRawHeaderInput = () => {
        const headerInput = document.getElementById('crawlRawHeader');
        if (!headerInput) {
            return false;
        }

        const parseHeader = () => {
            parseEASHeaderAndUpdateEasyPlusSettings(headerInput.value);
        };

        headerInput.addEventListener('blur', parseHeader);

        const originatorSelect = document.getElementById('easyplusOriginator');
        const eventSelect = document.getElementById('easyplusEventCode');

        const attemptInitialParse = () => {
            if (!originatorSelect || !eventSelect) {
                return false;
            }
            if (!originatorSelect.options.length || !eventSelect.options.length) {
                return false;
            }
            parseHeader();
            return true;
        };

        if (!attemptInitialParse()) {
            const targets = [originatorSelect, eventSelect].filter(Boolean);
            if (targets.length) {
                const observer = new MutationObserver(() => {
                    if (attemptInitialParse()) {
                        observer.disconnect();
                    }
                });
                targets.forEach((target) => observer.observe(target, { childList: true }));
            }
        }

        return true;
    };

    if (!initializeRawHeaderInput() && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeRawHeaderInput, { once: true });
    }

    if (crawlBackgroundPremadeSelect.value.includes('easyplus')) {
        const easyplusSettings = document.getElementById('easyplusSettings');
        easyplusSettings.style.display = 'block';
    }

})();
