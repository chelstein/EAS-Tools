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
            '  <rect width="44" height="44" rx="10" fill="none" stroke="#c95d2e" stroke-width="2" opacity="0.25"/>',

            '  <!-- Skull head — filled circle, stick-figure bold -->',
            '  <circle cx="22" cy="15" r="11" fill="#e0dbc8"/>',

            '  <!-- Left X eye -->',
            '  <line x1="14.5" y1="10.5" x2="19.5" y2="15.5" stroke="#0d1a27" stroke-width="2.2" stroke-linecap="round"/>',
            '  <line x1="19.5" y1="10.5" x2="14.5" y2="15.5" stroke="#0d1a27" stroke-width="2.2" stroke-linecap="round"/>',

            '  <!-- Right X eye -->',
            '  <line x1="24.5" y1="10.5" x2="29.5" y2="15.5" stroke="#0d1a27" stroke-width="2.2" stroke-linecap="round"/>',
            '  <line x1="29.5" y1="10.5" x2="24.5" y2="15.5" stroke="#0d1a27" stroke-width="2.2" stroke-linecap="round"/>',

            '  <!-- Grin -->',
            '  <path d="M15,19.5 Q22,25.5 29,19.5"',
            '        fill="none" stroke="#0d1a27" stroke-width="2" stroke-linecap="round"/>',

            '  <!-- Water surface — emerging hazard -->',
            '  <path d="M0,27 Q6,24.5 11,27 Q17,29.5 22,27 Q28,24.5 33,27 Q38,29.5 44,27"',
            '        fill="none" stroke="#1abaaf" stroke-width="2" stroke-linecap="round" opacity="0.9"/>',

            '  <!-- Water ripple rings -->',
            '  <ellipse cx="22" cy="28" rx="17" ry="2.8" fill="none" stroke="#1abaaf" stroke-width="1.1" opacity="0.4"/>',
            '  <ellipse cx="22" cy="30" rx="12" ry="2" fill="none" stroke="#1abaaf" stroke-width="0.8" opacity="0.22"/>',

            '  <!-- Hazard dot top-right -->',
            '  <circle cx="38.5" cy="5.5" r="3" fill="#c95d2e"/>',
            '  <circle cx="38.5" cy="5.5" r="1.5" fill="#ff7845" opacity="0.85"/>',

            '</svg>'
        ].join('\n');
    }

    window.deadHeadLogoSVG = deadHeadLogoSVG;
})();
