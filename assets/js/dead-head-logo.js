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

            '  <!-- Danger border glow -->',
            '  <rect width="44" height="44" rx="10" fill="none" stroke="#c95d2e" stroke-width="2.5" opacity="0.22"/>',

            '  <!-- Broadcast signal arcs -->',
            '  <path d="M4,19 Q22,2 40,19"',
            '        fill="none" stroke="#1abaaf" stroke-width="2" stroke-linecap="round" opacity="0.7"/>',
            '  <path d="M9,19 Q22,8 35,19"',
            '        fill="none" stroke="#1abaaf" stroke-width="1.5" stroke-linecap="round" opacity="0.45"/>',

            '  <!-- Skull cranium -->',
            '  <ellipse cx="22" cy="21" rx="12" ry="11" fill="#e0dbc8"/>',

            '  <!-- Jaw -->',
            '  <rect x="13.5" y="28.5" width="17" height="8.5" rx="3.5" fill="#e0dbc8"/>',

            '  <!-- Jaw tooth dividers -->',
            '  <line x1="18" y1="29" x2="18" y2="37" stroke="#0d1a27" stroke-width="1.6" stroke-linecap="round"/>',
            '  <line x1="22" y1="29" x2="22" y2="37" stroke="#0d1a27" stroke-width="1.6" stroke-linecap="round"/>',
            '  <line x1="26" y1="29" x2="26" y2="37" stroke="#0d1a27" stroke-width="1.6" stroke-linecap="round"/>',

            '  <!-- Eye sockets (deep dark) -->',
            '  <ellipse cx="16.5" cy="20" rx="4.5" ry="5" fill="#0d1a27"/>',
            '  <ellipse cx="27.5" cy="20" rx="4.5" ry="5" fill="#0d1a27"/>',

            '  <!-- Teal eye outer glow layer -->',
            '  <ellipse cx="16.5" cy="20" rx="3.8" ry="4.2" fill="#00c8b8" opacity="0.18"/>',
            '  <ellipse cx="27.5" cy="20" rx="3.8" ry="4.2" fill="#00c8b8" opacity="0.18"/>',

            '  <!-- Teal eye iris -->',
            '  <ellipse cx="16.5" cy="20" rx="2.6" ry="3" fill="#00deca" opacity="0.92"/>',
            '  <ellipse cx="27.5" cy="20" rx="2.6" ry="3" fill="#00deca" opacity="0.92"/>',

            '  <!-- Eye specular highlight -->',
            '  <ellipse cx="15.6" cy="18.4" rx="0.9" ry="0.7" fill="#ffffff" opacity="0.55"/>',
            '  <ellipse cx="26.6" cy="18.4" rx="0.9" ry="0.7" fill="#ffffff" opacity="0.55"/>',

            '  <!-- Nasal cavity -->',
            '  <path d="M20,25.5 Q22,28 24,25.5"',
            '        fill="none" stroke="#0d1a27" stroke-width="2" stroke-linecap="round"/>',

            '  <!-- Water surface line — submerged hazard -->',
            '  <path d="M2,40 Q8,38 14,40 Q20,42 26,40 Q32,38 38,40 Q41,41 44,40"',
            '        fill="none" stroke="#1abaaf" stroke-width="1.4" stroke-linecap="round" opacity="0.45"/>',

            '  <!-- Hazard indicator dot -->',
            '  <circle cx="38.5" cy="5.5" r="3.5" fill="#c95d2e"/>',
            '  <circle cx="38.5" cy="5.5" r="1.8" fill="#ff7845" opacity="0.85"/>',

            '</svg>'
        ].join('\n');
    }

    window.deadHeadLogoSVG = deadHeadLogoSVG;
})();
