export async function saveFile(filename, content, mime, opts = {}) {
    const blob = (content instanceof Blob) ? content : new Blob([content], { type: mime });

    if (window.EASDownloads?.saveBlob) {
        await window.EASDownloads.saveBlob(blob, filename, mime, opts);
        return;
    }

    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } finally {
        URL.revokeObjectURL(url);
    }
}

function freezeBurstList(list) {
    return Object.freeze(list.map((item) => Object.freeze(item)));
}

const ENDEC_MODE_PROFILE_SOURCE = {
    DEFAULT: {
        signature: { tail: "none", lead: "none", burstGapMs: 1000 },
        betweenGapMs: 1000,
        afterGapMs: 1000,
        headerBursts: [{ prefix: "", suffix: "" }, { prefix: "", suffix: "" }, { prefix: "", suffix: "" }],
        eomBursts: [{ prefix: "", suffix: "" }, { prefix: "", suffix: "" }, { prefix: "", suffix: "" }]
    },
    NWS: {
        signature: { tail: "00 00", lead: "none", burstGapMs: 1000 },
        betweenGapMs: 1000,
        afterGapMs: 1000,
        headerBursts: [{ prefix: "", suffix: "\x00\x00" }, { prefix: "", suffix: "\x00\x00" }, { prefix: "", suffix: "\x00\x00" }],
        eomBursts: [{ prefix: "", suffix: "\x00\x00" }, { prefix: "", suffix: "\x00\x00" }, { prefix: "", suffix: "\x00\x00" }]
    },
    SAGE_DIGITAL_3644: {
        signature: { tail: "FF FF FF", lead: "00 on first burst", burstGapMs: 1000 },
        betweenGapMs: 1000,
        afterGapMs: 1000,
        headerBursts: [{ prefix: "\x00", suffix: "\xFF\xFF\xFF" }, { prefix: "\xAB", suffix: "\xFF\xFF\xFF" }, { prefix: "\xAB", suffix: "\xFF\xFF\xFF" }],
        eomBursts: [{ prefix: "\x00", suffix: "\xFF\xFF\xFF" }, { prefix: "", suffix: "\xFF\xFF\xFF" }, { prefix: "", suffix: "\xFF\xFF\xFF" }]
    },
    SAGE_ANALOG_1822: {
        signature: { tail: "FF", lead: "none", burstGapMs: 1000 },
        betweenGapMs: 1000,
        afterGapMs: 1000,
        headerBursts: [{ prefix: "", suffix: "\xFF" }, { prefix: "", suffix: "\xFF" }, { prefix: "", suffix: "\xFF" }],
        eomBursts: [{ prefix: "", suffix: "\xFF" }, { prefix: "", suffix: "\xFF" }, { prefix: "", suffix: "\xFF" }]
    },
    TRILITHIC: {
        signature: { tail: "none", lead: "none", burstGapMs: 868 },
        betweenGapMs: 868,
        afterGapMs: 1118,
        relayPop: {
            enabled: false
        },
        headerBursts: [{ prefix: "", suffix: "" }, { prefix: "", suffix: "" }, { prefix: "", suffix: "" }],
        eomBursts: [{ prefix: "", suffix: "" }, { prefix: "", suffix: "" }, { prefix: "", suffix: "" }]
    },
    TRILITHIC_POP: {
        signature: { tail: "none", lead: "none", burstGapMs: 868 },
        betweenGapMs: 868,
        afterGapMs: 1118,
        relayPop: {
            enabled: true,
            fileStart: "assets/pop_start.wav",
            fileEnd: "assets/pop.wav"
        },
        headerBursts: [{ prefix: "", suffix: "" }, { prefix: "", suffix: "" }, { prefix: "", suffix: "" }],
        eomBursts: [{ prefix: "", suffix: "" }, { prefix: "", suffix: "" }, { prefix: "", suffix: "" }]
    }
};

export const ENDEC_MODE_PROFILES = Object.freeze(
    Object.fromEntries(
        Object.entries(ENDEC_MODE_PROFILE_SOURCE).map(([mode, profile]) => {
            const frozenProfile = Object.freeze({
                signature: Object.freeze(profile.signature),
                betweenGapMs: profile.betweenGapMs,
                afterGapMs: profile.afterGapMs,
                relayPop: profile.relayPop ? Object.freeze({ ...profile.relayPop }) : null,
                headerBursts: freezeBurstList(profile.headerBursts),
                eomBursts: freezeBurstList(profile.eomBursts)
            });
            return [mode, frozenProfile];
        })
    )
);

export const ENDEC_MODES = Object.freeze(Object.keys(ENDEC_MODE_PROFILES));

export const ENDEC_MODE_SIGNATURES = Object.freeze(
    Object.fromEntries(
        ENDEC_MODES.map((mode) => [mode, ENDEC_MODE_PROFILES[mode].signature])
    )
);

export function normalizeEndecMode(mode) {
    const value = (typeof mode === "string") ? mode.trim().toUpperCase() : "DEFAULT";
    return ENDEC_MODE_PROFILES[value] ? value : "DEFAULT";
}

export function getEndecModeProfile(mode) {
    return ENDEC_MODE_PROFILES[normalizeEndecMode(mode)];
}

export function createEndecModeVotes(initialValue = 0) {
    const votes = {};
    for (let i = 0; i < ENDEC_MODES.length; i++) {
        votes[ENDEC_MODES[i]] = initialValue;
    }
    return votes;
}

export function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const CODEMIRROR_LIGHT_THEME_NAME = "elegant";
export const CODEMIRROR_DARK_THEME_NAME = "dracula";

export const USES_DARK_THEME = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? true : false;
