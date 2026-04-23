// Zero Trust Radio / buoyIQ brand configuration.
// EAS Lab is the broadcast integrity + synthetic alert module.
// This module renders the shared header/footer lockup and exposes
// BRAND as a global for other scripts that want the canonical names.
(function () {
    const BRAND = {
        platform: "Zero Trust Radio",
        product: "buoyIQ",
        module: "EAS Lab",
        subtitle: "a Zero Trust Radio tool",
        tagline: "Synthetic alert generation, decode, validation, and station fire simulation.",
        notice: "For lab, simulation, validation, and authorized testing workflows only.",
        statement: "Zero Trust Radio applies validation, observability, and signal integrity principles to broadcast infrastructure. EAS Lab extends that model with synthetic alert generation, parsing, and test workflows.",
        alliance: "Zero Trust Radio Alliance",
        nav: {
            decoder: "Decode",
            encoder: "Generate",
            crawl: "Crawl Builder",
            splicer: "Audio Assembly",
            phoneme: "Phoneme Lab",
            normalizer: "Product Normalizer",
            muxer: "Artifacts"
        }
    };

    const docTitle = (page) => `${BRAND.module} · ${BRAND.product} · ${BRAND.platform}${page ? ` — ${page}` : ""}`;

    const renderBrandHeader = (options = {}) => {
        const host = document.querySelector('[data-brand-header]') || document.querySelector('header');
        if (!host) return;
        const includeNav = options.includeNav !== false && !!host.querySelector('#tab-set');
        const existingNav = includeNav ? host.querySelector('#tab-set').outerHTML : '';
        const subPage = options.subPage || '';
        host.classList.add('ztr-header');
        host.innerHTML = `
            <div class="ztr-lockup">
                <a class="ztr-lockup__home" href="./index.html" aria-label="${BRAND.module} home">
                    <span class="ztr-lockup__mark" aria-hidden="true"></span>
                    <span class="ztr-lockup__text">
                        <span class="ztr-lockup__eyebrow">${BRAND.platform}</span>
                        <span class="ztr-lockup__product">${BRAND.product}<span class="ztr-lockup__sep"> / </span><span class="ztr-lockup__module">${BRAND.module}</span>${subPage ? ` <span class="ztr-lockup__sub">— ${subPage}</span>` : ''}</span>
                        <span class="ztr-lockup__subtitle">${BRAND.subtitle}</span>
                    </span>
                </a>
            </div>
            ${existingNav}
        `;
    };

    const renderBrandHero = () => {
        const hero = document.querySelector('[data-brand-hero]');
        if (!hero) return;
        hero.innerHTML = `
            <div class="ztr-hero">
                <div class="ztr-hero__title">
                    <span class="ztr-hero__kicker">${BRAND.platform} · ${BRAND.product}</span>
                    <h2 class="ztr-hero__module">${BRAND.module}</h2>
                    <p class="ztr-hero__tagline">${BRAND.tagline}</p>
                </div>
                <div class="ztr-hero__aside">
                    <div class="ztr-badge" role="note" aria-label="Usage notice">
                        <span class="ztr-badge__dot" aria-hidden="true"></span>
                        <span class="ztr-badge__text">${BRAND.notice}</span>
                    </div>
                    <p class="ztr-hero__statement">${BRAND.statement}</p>
                </div>
            </div>
        `;
    };

    const applyDocumentTitle = (page) => {
        if (!document.title || document.title.indexOf(BRAND.module) === -1) {
            document.title = docTitle(page);
        }
    };

    window.BRAND = BRAND;
    window.ZTR = { BRAND, docTitle, renderBrandHeader, renderBrandHero, applyDocumentTitle };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            renderBrandHeader();
            renderBrandHero();
        });
    } else {
        renderBrandHeader();
        renderBrandHero();
    }
})();
