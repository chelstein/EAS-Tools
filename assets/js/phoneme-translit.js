let toARPABET = null;

export function setPhonemize(fn) {
    toARPABET = fn;
}

export const Backend = Object.freeze({
    VTML: "vtml",
    BAL: "bal",
    DT: "dt",
});

export const BAL_SYMBOLS = new Set(["-", "!", "&", ",", ".", "?", "_"]);
export const BAL_STRESS  = new Set(["1", "2"]);
export const BAL_PHONES = new Set([
  "aa","ae","ah","ao","aw","ax","ay",
  "b","ch","d","dh",
  "eh","er","ey",
  "f","g","h",
  "ih","iy",
  "jh","k","l","m","n","ng",
  "ow","oy","p","r","s","sh","t","th",
  "uh","uw","v","w","y","z","zh",
]);

export const BAL_ALIASES = Object.freeze({
  "hh": "h",
  "dx": "d",
  "el": "l",
  "em": "m",
  "en": "n",
  "ix": "ih",
  "axr": "er",
});


const DT_STRESS_PREFIX = new Set(["'", "`", '"']);
const DT_SYNTACTIC = new Set(["-", "*", "#", "(", ")", ",", ".", "?", "!", "+"]);

const DT_ALIASES = Object.freeze({
  "er": "rr",
});

function phoneToken(cmu, stress = null) {
    return { type: "phone", cmu, stress };
}
function symToken(value) {
    return { type: "sym", value };
}

const CMU_VOWELS = new Set([
    "AA", "AE", "AH", "AO", "AW", "AX", "AY",
    "EH", "ER", "EY", "IH", "IY", "OW", "OY",
    "UH", "UW", "IX", "AXR",
]);

const CMU_TO_BAL = {
  AA:"aa", AE:"ae", AH:"ah", AO:"ao", AW:"aw", AX:"ax", AY:"ay",
  EH:"eh", ER:"er", EY:"ey", IH:"ih", IY:"iy", OW:"ow", OY:"oy",
  UH:"uh", UW:"uw",
  B:"b", CH:"ch", D:"d", DH:"dh",
  F:"f", G:"g",
  HH:"h",
  JH:"jh", K:"k", L:"l", M:"m", N:"n", NG:"ng",
  P:"p", R:"r", S:"s", SH:"sh", T:"t", TH:"th",
  V:"v", W:"w", Y:"y", Z:"z", ZH:"zh",
  DX:"d",
  EL:"l", EM:"m", EN:"n",
  IX:"ih",
  AXR:"er",
};

const BAL_TO_CMU = invertMap(CMU_TO_BAL);

const CMU_TO_DT = {
    AA: "aa", AE: "ae", AH: "ah", AO: "ao", AW: "aw", AX: "ax", AY: "ay",
    EH: "eh", ER: "rr", EY: "ey", IH: "ih", IY: "iy", OW: "ow", OY: "oy",
    UH: "uh", UW: "uw", IX: "ix",

    B: "b", CH: "ch", D: "d", DH: "dh", F: "f", G: "g",
    HH: "hx", JH: "jh", K: "k", L: "l", M: "m", N: "n", NG: "nx",
    P: "p", R: "r", S: "s", SH: "sh", T: "t", TH: "th",
    V: "v", W: "w", Y: "yx", Z: "z", ZH: "zh",
};

const DT_TO_CMU = invertMap(CMU_TO_DT);

const CMU_ORTHO_GUESS = Object.freeze({
    AA: "a", AE: "a", AH: "u", AO: "o", AW: "ow", AX: "a", AXR: "er", AY: "i",
    EH: "e", ER: "er", EY: "a", IH: "i", IX: "i", IY: "ee", OW: "o", OY: "oy",
    UH: "u", UW: "oo",

    B: "b", CH: "ch", D: "d", DH: "th", DX: "d", F: "f", G: "g", HH: "h",
    JH: "j", K: "k", L: "l", M: "m", N: "n", NG: "ng", P: "p", R: "r", S: "s",
    SH: "sh", T: "t", TH: "th", V: "v", W: "w", Y: "y", Z: "z", ZH: "zh",
    EL: "l", EM: "m", EN: "n",
});

const _reverseCache = new WeakMap();

function normalizePhSeqFromTokens(tokens, { stripStress = true } = {}) {
    return tokens
        .filter(t => t.type === "phone")
        .map(t => stripStress ? t.cmu : `${t.cmu}${t.stress ?? ""}`)
        .join(" ")
        .trim();
}

function normalizePhSeqString(seq, { stripStress = true } = {}) {
    return seq
        .trim()
        .split(/\s+/)
        .map(tok => stripStress ? tok.replace(/[012]$/, "") : tok)
        .join(" ");
}

function getReverseLexicon(lexiconObj) {
    let cached = _reverseCache.get(lexiconObj);
    if (cached) return cached;

    const exact = new Map();
    const nostress = new Map();

    for (const [word, ph] of Object.entries(lexiconObj)) {
        const w = word.toLowerCase();
        const p = String(ph).trim();
        if (!p) continue;

        exact.set(normalizePhSeqString(p, { stripStress: false }), w);
        nostress.set(normalizePhSeqString(p, { stripStress: true }), w);
    }

    cached = { exact, nostress };
    _reverseCache.set(lexiconObj, cached);
    return cached;
}

const PHONE_CANDIDATES = Object.freeze({
    AA: ["a", "o"], AE: ["a"], AH: ["u", "o", "a"], AO: ["o", "aw"], AW: ["ow", "ou"],
    AX: ["a", "e", "i", "o", "u"], AY: ["i", "y", "igh", "ie"],
    EH: ["e", "ea"], ER: ["er", "ir", "ur"], EY: ["a", "ay", "ai", "ei"],
    IH: ["i", "e", "y"], IX: ["i", "e"], IY: ["ee", "ea", "ie", "y"],
    OW: ["o", "ow", "oa"], OY: ["oy", "oi"], UH: ["u", "oo"], UW: ["oo", "u", "ew"],
    B: ["b"], CH: ["ch", "tch"], D: ["d"], DH: ["th"], DX: ["d"],
    F: ["f", "ph"], G: ["g", "gh"], HH: ["h"], JH: ["j", "g", "dge"],
    K: ["k", "c", "ck", "q"], L: ["l"], M: ["m"], N: ["n"], NG: ["ng", "n"],
    P: ["p"], R: ["r", "wr"], S: ["s", "c"], SH: ["sh", "ti", "ci"],
    T: ["t"], TH: ["th"], V: ["v"], W: ["w"], Y: ["y"],
    Z: ["z", "s"], ZH: ["zh", "s", "g"],
    EL: ["l"], EM: ["m"], EN: ["n"],
});

const MULTI_PHONE_RULES = [
    { seq: ["S", "K", "AX"], outs: ["ska"], bonus: -5.0 },
    { seq: ["M", "AX", "HH"], outs: ["mah"], bonus: -5.0 },
    { seq: ["AW", "ER"], outs: ["ower"], bonus: -3.5 },
    { seq: ["K", "S"], outs: ["x"], bonus: -3.0 },
    { seq: ["K", "W"], outs: ["qu"], bonus: -1.5 },
];


const COMMON_BIGRAMS = new Set([
    "th", "he", "in", "er", "an", "re", "on", "at", "en", "nd", "ti", "es", "or", "te", "of", "ed", "is", "it", "al", "ar", "st", "to", "nt", "ng", "se", "ha", "as", "ou", "io",
    "me", "ex", "xi", "ic", "co",
    "ca", "ce", "ci", "co", "cu", "ra", "ri", "ro", "ru", "la", "li", "lo", "lu",
]);

function scoreWord(w) {
    let s = 0;

    for (let i = 0; i < w.length; i++) {
        if (w[i] === "q" && w[i + 1] !== "u") s += 6;
    }

    if (/(.)\1\1/.test(w)) s += 4;
    if (/jj|vv|ww/.test(w)) s += 3;

    for (let i = 0; i < w.length - 1; i++) {
        const bi = w.slice(i, i + 2);
        if (!COMMON_BIGRAMS.has(bi)) s += 0.35;
    }

    if (!/[aeiouy]/.test(w)) s += 10;

    return s;
}

function beamSpell(phones, beamWidth = 48) {
    let beams = [{ w: "", score: 0 }];

    for (let i = 0; i < phones.length;) {
        const nextBeams = [];

        let usedMulti = false;
        let matched = [];
        let maxLen = 0;

        for (const rule of MULTI_PHONE_RULES) {
            const { seq } = rule;
            if (i + seq.length <= phones.length && seq.every((p, k) => phones[i + k] === p)) {
                matched.push(rule);
                if (seq.length > maxLen) maxLen = seq.length;
            }
        }

        if (maxLen > 0) {
            matched = matched.filter(r => r.seq.length === maxLen);

            const nextBeams = [];
            for (const r of matched) {
                for (const b of beams) {
                    for (const out of r.outs) {
                        const w2 = b.w + out;
                        nextBeams.push({ w: w2, score: scoreWord(w2) + r.bonus });
                    }
                }
            }

            beams = nextBeams.sort((a, b) => a.score - b.score).slice(0, beamWidth);
            i += maxLen;
            continue;
        }


        if (usedMulti) {
            i += MULTI_PHONE_RULES.find(r => r.seq.every((p, k) => phones[i + k] === p))?.seq.length ?? 1;
            beams = nextBeams.sort((a, b) => a.score - b.score).slice(0, beamWidth);
            continue;
        }

        const ph = phones[i];
        const cands =
            PHONE_CANDIDATES[ph] ??
            [CMU_ORTHO_GUESS[ph] ?? ph.toLowerCase()];

        for (const b of beams) {
            for (const out of cands) {
                let o = out;
                if (ph === "K") {
                    const next = phones[i + 1];
                    if (next === "OW" || next === "AO" || next === "AA" || next === "UH" || next === "UW") {
                        if (out === "c") o = "c";
                    }
                }

                const w2 = b.w + o;
                let sc = scoreWord(w2);

                if (ph === "AX") {
                    const prev = phones[i - 1];
                    const next = phones[i + 1];

                    if (i === 1 && prev === "N") {
                        if (o === "e") sc -= 1.8;
                        if (o === "a") sc += 1.0;
                    }

                    if (next === "HH") {
                        if (o === "a") sc -= 1.6;
                        if (o === "e") sc += 1.0;
                        if (o === "i") sc += 1.0;
                    }
                }

                if (ph === "K" && o === "k") {
                    const next = phones[i + 1];
                    if (next === "OW" || next === "AO" || next === "AA" || next === "UH" || next === "UW") sc += 0.8;
                }

                nextBeams.push({ w: w2, score: sc });
            }
        }

        beams = nextBeams.sort((a, b) => a.score - b.score).slice(0, beamWidth);
        i += 1;
    }

    return beams[0]?.w ?? "";
}

function invertMap(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        out[v] = k;
    }
    return out;
}

function splitCmuToken(tok) {
    const m = tok.match(/^([A-Z]+)([012])?$/);
    if (!m) return null;
    const base = m[1];
    const stress = m[2] != null ? Number(m[2]) : null;
    return { base, stress };
}

export function parseVTML(input) {
    let ph = input;
    const m = input.match(/ph\s*=\s*"([^"]+)"/i);
    if (m) ph = m[1];

    const tokens = ph.trim().split(/\s+/).filter(Boolean);
    const out = [];
    for (const t of tokens) {
        if (BAL_SYMBOLS.has(t)) {
            out.push(symToken(t));
            continue;
        }
        const parsed = splitCmuToken(t);
        if (!parsed) continue;
        const { base, stress } = parsed;
        out.push(phoneToken(base, CMU_VOWELS.has(base) ? (stress ?? 0) : null));
    }
    return out;
}

export function parseBalabolka(input) {
    const tokens = input.trim().split(/\s+/).filter(Boolean);
    const out = [];
    let pendingStress = null;

    for (const raw of tokens) {
        if (BAL_SYMBOLS.has(raw)) {
            out.push(symToken(raw));
            continue;
        }

        if (BAL_STRESS.has(raw)) {
            pendingStress = Number(raw);
            continue;
        }

        const m = raw.match(/^([a-z]+)([12])$/);
        let base = raw;
        let stress = null;
        if (m) {
            base = m[1];
            stress = Number(m[2]);
        }

        base = BAL_ALIASES[base] ?? base;

        if (!BAL_PHONES.has(base)) {
            out.push(symToken(raw));
            continue;
        }

        const cmu = BAL_TO_CMU[base] ?? base.toUpperCase();
        const isVowel = CMU_VOWELS.has(cmu);
        const finalStress =
            isVowel ? (stress ?? pendingStress ?? 0) : null;

        out.push(phoneToken(cmu, finalStress));
        pendingStress = null;
    }

    return out;
}

export function parseDectalk(input) {
    let body = input;
    const groups = [...input.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
    if (groups.length) body = groups[groups.length - 1];

    const tokens = body.trim().split(/\s+/).filter(Boolean);
    const out = [];
    let pendingStress = null;

    for (let tok of tokens) {
        if (DT_SYNTACTIC.has(tok)) {
            out.push(symToken(tok));
            continue;
        }

        while (tok.length && DT_STRESS_PREFIX.has(tok[0])) {
            const ch = tok[0];
            if (ch === "'") pendingStress = 1;
            else if (ch === "`") pendingStress = 2;
            tok = tok.slice(1);
        }

        const dt = tok.toLowerCase();
        const dtNorm = DT_ALIASES[dt] ?? dt;
        const cmu = DT_TO_CMU[dtNorm];

        if (!cmu) {
            out.push(symToken(tok));
            pendingStress = null;
            continue;
        }

        const isVowel = CMU_VOWELS.has(cmu);
        out.push(phoneToken(cmu, isVowel ? (pendingStress ?? 0) : null));
        pendingStress = null;
    }

    return out;
}

export function emitVTML(tokens, { wrapTag = false, text = "" } = {}) {
    const ph = tokens
        .filter(t => t.type === "phone")
        .map(t => {
            if (t.type !== "phone") return "";
            if (t.stress == null) return t.cmu;
            return `${t.cmu}${t.stress}`;
        })
        .join(" ");

    if (!wrapTag) return ph;
    return `<vtml_phoneme alphabet="x-cmu" ph="${ph}">${escapeXml(text)}</vtml_phoneme>`;
}

export function emitBalabolka(tokens, { stressStyle = "separate" } = {}) {
    const out = [];
    for (const t of tokens) {
        if (t.type === "sym") {
            out.push(t.value);
            continue;
        }
        const base = CMU_TO_BAL[t.cmu];
        if (!base) continue;

        if (t.stress != null && t.stress !== 0) {
            if (stressStyle === "suffix") out.push(`${base}${t.stress}`);
            else { out.push(base); out.push(String(t.stress)); }
        } else {
            out.push(base);
        }
    }
    const body = out.join(" ").replace(/\s+/g, " ").trim();
    return `<pron sym="${body}" />`;
}

export function emitDectalk(tokens, { wrapBrackets = true } = {}) {
    const out = [];
    for (const t of tokens) {
        if (t.type === "sym") {
            out.push(t.value);
            continue;
        }
        const base = CMU_TO_DT[t.cmu];
        if (!base) continue;

        if (t.stress === 1) out.push(`'${base}`);
        else if (t.stress === 2) out.push("`" + base);
        else out.push(base);
    }

    const body = out.join(" ").replace(/\s+/g, " ").trim();
    return wrapBrackets ? `[:phoneme on] [${body}]` : body;
}

function parseByBackend(input, backend) {
    if (backend === Backend.VTML) return parseVTML(input);
    if (backend === Backend.BAL) return parseBalabolka(input);
    if (backend === Backend.DT) return parseDectalk(input);
    throw new Error(`Unknown source backend: ${backend}`);
}

const PUNC_KEEP = new Set([",", ".", "?", "!", "-", "&", "_"]);

function tokenizeText(input) {
    const s = String(input ?? "");
    const out = [];

    try {
        const re = /(\p{L}+(?:[’']\p{L}+)*)|(\p{N}+)|([^\s])/gu;
        for (const m of s.matchAll(re)) {
            if (m[1]) out.push({ kind: "word", value: m[1] });
            else if (m[2]) out.push({ kind: "word", value: m[2] });
            else if (m[3]) out.push({ kind: "punc", value: m[3] });
        }
        return out;
    } catch {
        const re = /([A-Za-z0-9]+(?:[’'][A-Za-z0-9]+)*)|([^\s])/g;
        for (const m of s.matchAll(re)) {
            if (m[1]) out.push({ kind: "word", value: m[1] });
            else if (m[2]) out.push({ kind: "punc", value: m[2] });
        }
        return out;
    }
}

function phraseToCanonical(rawText, overrides) {
    const toks = tokenizeText(rawText);

    const canonical = [];
    for (const t of toks) {
        if (t.kind === "word") {
            const key = t.value.toLowerCase();
            let arpabet = overrides?.[key];

            if (!arpabet) {
                if (!toARPABET) {
                    throw new Error("phonemize not set. Call setPhonemize(toARPABET) first, or pass an override.");
                }
                arpabet = toARPABET(t.value, { stripStress: false });
            }

            const wordCanon = parseVTML(arpabet);
            canonical.push(...wordCanon);
            continue;
        }

        if (PUNC_KEEP.has(t.value)) {
            canonical.push(symToken(t.value));
        } else if (t.value === ";" || t.value === ":") {
            canonical.push(symToken(","));
        }
    }

    return canonical;
}

export function convertPhonemes(input, {
    lexicon = null,
    beamWidth = 48,
} = {}) {
    const backends = [Backend.VTML, Backend.BAL, Backend.DT];

    for (const backend of backends) {
        try {
            const tokens = parseByBackend(input, backend);

            if (lexicon) {
                const rev = getReverseLexicon(lexicon);
                const withStress = normalizePhSeqFromTokens(tokens, { stripStress: false });
                const noStress = normalizePhSeqFromTokens(tokens, { stripStress: true });

                const hit =
                    rev.exact.get(withStress) ??
                    rev.nostress.get(noStress);

                if (hit) return hit;
            }

            const phones = tokens
                .filter(t => t.type === "phone")
                .map(t => t.cmu);

            if (!phones.length) continue;

            const guess = beamSpell(phones, beamWidth);
            if (guess) return guess;

        } catch {
            // ignore parse errors
        }
    }

    return "";
}

export function wordToBackend(word, backend, {
    overrides = {},
    ...emitOpts
} = {}) {
    const raw = String(word ?? "").trim();
    if (!raw) return "";

    const phraseKey = raw.toLowerCase();
    let canonical;

    if (overrides[phraseKey]) {
        canonical = parseVTML(overrides[phraseKey]);
    } else {
        canonical = phraseToCanonical(raw, overrides);
    }

    if (backend === Backend.VTML) return emitVTML(canonical, { wrapTag: true, text: raw, ...emitOpts });
    if (backend === Backend.BAL) return emitBalabolka(canonical, emitOpts);
    if (backend === Backend.DT) return emitDectalk(canonical, emitOpts);
    throw new Error(`Unknown backend: ${backend}`);
}


function escapeXml(s) {
    return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
}
