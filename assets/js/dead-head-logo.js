// Dead Head badge — inline SVG component.
// Call deadHeadLogoSVG(size) to get a scalable inline SVG string.
// Default size: 44. Legible at 24, 32, and 44px.
(function () {
    function deadHeadLogoSVG(size) {
        size = size || 44;
        return [
            '<svg xmlns="http://www.w3.org/2000/svg"',
            '     viewBox="0 0 44 44"',
            '     width="' + size + '" height="' + size + '"',
            '     role="img" aria-label="Dead Head"',
            '     class="dh-badge">',

            '  <!-- Background -->',
            '  <rect width="44" height="44" rx="10" fill="#0d1a27"/>',

            '  <!-- Danger border -->',
            '  <rect width="44" height="44" rx="10" fill="none" stroke="#c95d2e" stroke-width="2" opacity="0.28"/>',

            '  <!-- Skull — slightly taller than wide -->',
            '  <ellipse cx="22" cy="15" rx="10.5" ry="11.5" fill="#e0dbc8"/>',

            '  <!-- Eye sockets — hollow dark, angled slightly inward for menace -->',
            '  <ellipse cx="17" cy="13" rx="3.5" ry="4" fill="#0d1a27"/>',
            '  <ellipse cx="27" cy="13" rx="3.5" ry="4" fill="#0d1a27"/>',

            '  <!-- Teeth — zigzag row, reads as skull not smiley -->',
            '  <path d="M14.5,21.5 L17,24 L19.5,21.5 L22,24 L24.5,21.5 L27,24 L29.5,21.5"',
            '        fill="none" stroke="#0d1a27" stroke-width="1.9"',
            '        stroke-linejoin="round" stroke-linecap="round"/>',

            '  <!-- Water surface -->',
            '  <path d="M0,27 Q6,24.5 11,27 Q17,29.5 22,27 Q28,24.5 33,27 Q38,29.5 44,27"',
            '        fill="none" stroke="#1abaaf" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>',

            '  <!-- Ripple rings -->',
            '  <ellipse cx="22" cy="28.5" rx="17" ry="2.6" fill="none" stroke="#1abaaf" stroke-width="1" opacity="0.38"/>',
            '  <ellipse cx="22" cy="31" rx="11" ry="1.8" fill="none" stroke="#1abaaf" stroke-width="0.7" opacity="0.2"/>',

            '  <!-- Hazard dot -->',
            '  <circle cx="38.5" cy="5.5" r="3" fill="#c95d2e"/>',
            '  <circle cx="38.5" cy="5.5" r="1.5" fill="#ff7845" opacity="0.85"/>',

            '</svg>'
        ].join('\n');
    }

    window.deadHeadLogoSVG = deadHeadLogoSVG;
})();
