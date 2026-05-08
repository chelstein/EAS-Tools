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

            '  <!-- Badge background -->',
            '  <rect width="44" height="44" rx="10" fill="#112235"/>',

            '  <!-- Top teal accent -->',
            '  <rect x="4" y="1.5" width="36" height="2" rx="1" fill="#0f7c7b" opacity="0.9"/>',

            '  <!-- SAME waveform scan line -->',
            '  <polyline',
            '    points="2,37 5,34 8,37 11,34 14,37 17,34 20,37 23,34 26,37 29,34 32,37 35,34 38,37 41,34"',
            '    fill="none" stroke="#0f7c7b" stroke-width="1.2"',
            '    stroke-linejoin="round" stroke-linecap="round" opacity="0.22"/>',

            '  <!-- Headphone band -->',
            '  <path d="M10,22 Q22,4 34,22"',
            '        fill="none" stroke="#e6e3d4" stroke-width="3" stroke-linecap="round"/>',

            '  <!-- Left ear cup -->',
            '  <rect x="6" y="18" width="6" height="9" rx="2.5" fill="#e6e3d4"/>',

            '  <!-- Right ear cup -->',
            '  <rect x="32" y="18" width="6" height="9" rx="2.5" fill="#e6e3d4"/>',

            '  <!-- Skull cranium -->',
            '  <ellipse cx="22" cy="17" rx="11" ry="10" fill="#e6e3d4"/>',

            '  <!-- Jaw -->',
            '  <rect x="14" y="24" width="16" height="9" rx="2.5" fill="#e6e3d4"/>',

            '  <!-- Eye sockets -->',
            '  <ellipse cx="17.5" cy="17" rx="3" ry="3.5" fill="#112235"/>',
            '  <ellipse cx="26.5" cy="17" rx="3" ry="3.5" fill="#112235"/>',

            '  <!-- Nasal cavity -->',
            '  <path d="M21,22 L22,24.5 L23,22"',
            '        fill="none" stroke="#112235" stroke-width="2"',
            '        stroke-linejoin="round" stroke-linecap="round"/>',

            '  <!-- Teeth dividers -->',
            '  <line x1="18.5" y1="26" x2="18.5" y2="33" stroke="#112235" stroke-width="1.8" stroke-linecap="round"/>',
            '  <line x1="22"   y1="26" x2="22"   y2="33" stroke="#112235" stroke-width="1.8" stroke-linecap="round"/>',
            '  <line x1="25.5" y1="26" x2="25.5" y2="33" stroke="#112235" stroke-width="1.8" stroke-linecap="round"/>',

            '  <!-- Orange status dot -->',
            '  <circle cx="38.5" cy="38.5" r="2.5" fill="#c95d2e"/>',

            '</svg>'
        ].join('\n');
    }

    window.deadHeadLogoSVG = deadHeadLogoSVG;
})();
