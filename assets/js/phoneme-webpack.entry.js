import {
    Backend,
    setPhonemize,
    wordToBackend,
    convertPhonemes,
} from "./phoneme-translit.js";

import { toARPABET } from "phonemize";
setPhonemize(toARPABET);

export { Backend, wordToBackend, convertPhonemes };

if (typeof window !== "undefined") {
    window.PhonemeTools = { Backend, wordToBackend, convertPhonemes };
}
