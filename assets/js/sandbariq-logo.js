// SandbarIQ badge — inline SVG component.
// Call sandbarIQLogo(size) to get a scalable inline SVG string.
// Default size: 44. Legible at 24, 32, and 44px.
(function () {
    function sandbarIQLogo(size) {
        size = size || 44;
        return [
            '<svg xmlns="http://www.w3.org/2000/svg"',
            '     viewBox="0 0 44 44"',
            '     width="' + size + '" height="' + size + '"',
            '     role="img" aria-label="SandbarIQ"',
            '     class="dh-badge">',

            '  <!-- Background — deep water -->',
            '  <rect width="44" height="44" rx="10" fill="#0d1a27"/>',

            '  <!-- Danger border -->',
            '  <rect width="44" height="44" rx="10" fill="none" stroke="#c95d2e" stroke-width="2" opacity="0.28"/>',

            '  <!-- Sandbar body — broad sandy shoal -->',
            '  <ellipse cx="22" cy="31" rx="20" ry="13" fill="#b8882a"/>',

            '  <!-- Dry sand highlight on exposed hump -->',
            '  <ellipse cx="22" cy="26" rx="14" ry="5.5" fill="#d4a43c" opacity="0.7"/>',

            '  <!-- Sand contour / tide lines on exposed surface -->',
            '  <path d="M13,22 Q22,20 31,22"',
            '        fill="none" stroke="#e8c060" stroke-width="0.9" stroke-linecap="round" opacity="0.5"/>',
            '  <path d="M9,24.5 Q22,22.5 35,24.5"',
            '        fill="none" stroke="#e8c060" stroke-width="0.7" stroke-linecap="round" opacity="0.35"/>',

            '  <!-- Dark water body — covers submerged sandbar -->',
            '  <path d="M0,26 Q5.5,24 11,26 Q16.5,28 22,26 Q27.5,24 33,26 Q38.5,28 44,26 L44,44 L0,44 Z"',
            '        fill="#07101a" opacity="0.7"/>',

            '  <!-- Teal wave surface -->',
            '  <path d="M0,26 Q5.5,24 11,26 Q16.5,28 22,26 Q27.5,24 33,26 Q38.5,28 44,26"',
            '        fill="none" stroke="#1abaaf" stroke-width="2.2" stroke-linecap="round" opacity="0.92"/>',

            '  <!-- Side ripples where sandbar edges break surface -->',
            '  <ellipse cx="5" cy="27" rx="4.5" ry="1.5" fill="none" stroke="#1abaaf" stroke-width="0.9" opacity="0.45"/>',
            '  <ellipse cx="39" cy="27" rx="4.5" ry="1.5" fill="none" stroke="#1abaaf" stroke-width="0.9" opacity="0.45"/>',

            '  <!-- Center ripples -->',
            '  <ellipse cx="22" cy="30" rx="14" ry="1.8" fill="none" stroke="#1abaaf" stroke-width="0.8" opacity="0.28"/>',
            '  <ellipse cx="22" cy="32.5" rx="8" ry="1.2" fill="none" stroke="#1abaaf" stroke-width="0.6" opacity="0.15"/>',

            '  <!-- Hazard dot -->',
            '  <circle cx="38.5" cy="5.5" r="3" fill="#c95d2e"/>',
            '  <circle cx="38.5" cy="5.5" r="1.5" fill="#ff7845" opacity="0.85"/>',

            '</svg>'
        ].join('\n');
    }

    window.sandbarIQLogo = sandbarIQLogo;
})();
