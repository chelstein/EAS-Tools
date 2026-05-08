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

            '  <!-- Background — deep water -->',
            '  <rect width="44" height="44" rx="10" fill="#0d1a27"/>',

            '  <!-- Danger border -->',
            '  <rect width="44" height="44" rx="10" fill="none" stroke="#c95d2e" stroke-width="2" opacity="0.28"/>',

            '  <!-- Log body — waterlogged, angled from lower-left to upper-right -->',
            '  <!-- Parallelogram: top edge (6,38)→(40,22), bottom edge (6,44)→(40,28) -->',
            '  <path d="M6,38 L40,22 L40,28 L6,44 Z" fill="#1e0d04"/>',

            '  <!-- Log left end cap -->',
            '  <ellipse cx="6" cy="41" rx="3.5" ry="4.2" fill="#1e0d04" stroke="#2e1508" stroke-width="0.6"/>',

            '  <!-- Log right end cap — cut wood, slightly lighter, shows annual rings -->',
            '  <ellipse cx="40" cy="25" rx="3.5" ry="4.2" fill="#2e1508"/>',
            '  <ellipse cx="40" cy="25" rx="2.4" ry="3" fill="none" stroke="#1e0d04" stroke-width="0.6" opacity="0.7"/>',
            '  <ellipse cx="40" cy="25" rx="1.1" ry="1.5" fill="none" stroke="#1e0d04" stroke-width="0.5" opacity="0.5"/>',

            '  <!-- Wood grain lines along log length -->',
            '  <line x1="10" y1="37" x2="38" y2="23" stroke="#2c1208" stroke-width="0.8" opacity="0.7"/>',
            '  <line x1="10" y1="40.5" x2="38" y2="26.5" stroke="#2c1208" stroke-width="0.8" opacity="0.7"/>',

            '  <!-- Dark water — swallows the log below the wave -->',
            '  <path d="M0,26.5 Q5.5,24.5 11,26.5 Q16.5,28.5 22,26.5 Q27.5,24.5 33,26.5 Q38.5,28.5 44,26.5 L44,44 L0,44 Z"',
            '        fill="#07101a"/>',

            '  <!-- Teal wave surface -->',
            '  <path d="M0,26.5 Q5.5,24.5 11,26.5 Q16.5,28.5 22,26.5 Q27.5,24.5 33,26.5 Q38.5,28.5 44,26.5"',
            '        fill="none" stroke="#1abaaf" stroke-width="2.2" stroke-linecap="round" opacity="0.92"/>',

            '  <!-- Water disturbance where log breaks surface (~x=33) -->',
            '  <ellipse cx="35" cy="27" rx="5" ry="1.4" fill="none" stroke="#1abaaf" stroke-width="0.9" opacity="0.5"/>',

            '  <!-- Ripples below -->',
            '  <ellipse cx="22" cy="30" rx="15" ry="2" fill="none" stroke="#1abaaf" stroke-width="0.8" opacity="0.28"/>',
            '  <ellipse cx="22" cy="32.5" rx="9" ry="1.3" fill="none" stroke="#1abaaf" stroke-width="0.6" opacity="0.15"/>',

            '  <!-- Hazard dot -->',
            '  <circle cx="7" cy="6" r="3" fill="#c95d2e"/>',
            '  <circle cx="7" cy="6" r="1.5" fill="#ff7845" opacity="0.85"/>',

            '</svg>'
        ].join('\n');
    }

    window.deadHeadLogoSVG = deadHeadLogoSVG;
})();
