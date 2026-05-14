// SandBarIQ badge — inline SVG component.
// Call sandbarIQLogo(size) to get a scalable inline SVG string.
// Default size: 44. Legible at 24, 32, 44, 52, and 80px.
(function () {
    function sandbarIQLogo(size) {
        size = size || 44;
        return [
            '<svg xmlns="http://www.w3.org/2000/svg"',
            '     viewBox="0 0 44 44"',
            '     width="' + size + '" height="' + size + '"',
            '     role="img" aria-label="SandBarIQ"',
            '     class="dh-badge">',

            '  <!-- Background — warm sand -->',
            '  <rect width="44" height="44" rx="10" fill="#f5e9cc"/>',

            '  <!-- Sun halo outer -->',
            '  <circle cx="22" cy="21" r="15" fill="#f0c070" opacity="0.38"/>',

            '  <!-- Sun halo inner -->',
            '  <circle cx="22" cy="21" r="10" fill="#e8860a" opacity="0.45"/>',

            '  <!-- Sun core -->',
            '  <circle cx="22" cy="21" r="6.5" fill="#e8860a" opacity="0.9"/>',

            '  <!-- 8-point compass star (dark navy) -->',
            '  <!-- Cardinal points -->',
            '  <polygon points="22,6 23.3,19 22,21 20.7,19" fill="#1a2438"/>',
            '  <polygon points="38,21 25,22.3 23,22 25,20.7" fill="#1a2438"/>',
            '  <polygon points="22,36 20.7,23 22,21 23.3,23" fill="#1a2438"/>',
            '  <polygon points="6,21 19,20.7 21,22 19,23.3" fill="#1a2438"/>',
            '  <!-- Intercardinal points (shorter) -->',
            '  <polygon points="33.2,10.8 24.3,20.3 22.5,21.5 23.5,19.5" fill="#1a2438" opacity="0.65"/>',
            '  <polygon points="33.2,31.2 23.7,21.7 22.5,19.5 24.5,20.5" fill="#1a2438" opacity="0.65"/>',
            '  <polygon points="10.8,31.2 20.3,21.7 21.5,22.5 19.5,23.5" fill="#1a2438" opacity="0.65"/>',
            '  <polygon points="10.8,10.8 20.5,20.5 21.5,22.5 19.5,21.5" fill="#1a2438" opacity="0.65"/>',

            '  <!-- Center dot -->',
            '  <circle cx="22" cy="21" r="2.2" fill="#1a2438"/>',

            '  <!-- Water / horizon line -->',
            '  <path d="M1,34 Q5.5,32 11,34 Q16.5,36 22,34 Q27.5,32 33,34 Q38.5,36 43,34"',
            '        fill="none" stroke="#1a2438" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>',

            '  <!-- Tiny sailboat silhouette -->',
            '  <path d="M30,34 L30,27 L36,33 Z" fill="#1a2438" opacity="0.65"/>',
            '  <rect x="29.2" y="33.5" width="7.5" height="1.5" rx="0.7" fill="#1a2438" opacity="0.55"/>',

            '  <!-- Island/sandbar hump -->',
            '  <ellipse cx="12" cy="34" rx="7" ry="2.2" fill="#c9922a" opacity="0.75"/>',

        '</svg>'
        ].join('\n');
    }

    window.sandbarIQLogo = sandbarIQLogo;
})();
