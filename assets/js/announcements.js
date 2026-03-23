document.addEventListener('DOMContentLoaded', () => {
    fetch('https://wagspuzzle.space/tools/eas-tools/barker.php')
        .then(response => response.json())
        .then(data => {
            // Check if data is valid and has a title
            if (!data || !data.title) return;

            // Check if the announcement has expired
            if (data.until && new Date(data.until) < new Date()) return;

            // Build a unique key from title+posted so new announcements always show
            const announcementKey = 'dismissed_announcement_' + (data.id || '');

            if (localStorage.getItem(announcementKey)) return;

            // Convert basic markdown links [text](url) to <a> tags
            const renderMarkdown = (text) =>
                text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
                    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

            // Create the toast element
            const toast = document.createElement('div');
            toast.id = 'announcement-toast';
            toast.innerHTML = `
                <button id="announcement-dismiss" aria-label="Dismiss announcement">&times;</button>
                <strong>${renderMarkdown(data.title)}</strong>
                <p>${renderMarkdown(data.description)}</p>
            `;
            document.body.appendChild(toast);

            // Show/hide based on active tab
            const updateVisibility = () => {
                const decoderActive = document.querySelector('#decoder-panel.active');
                toast.style.display = decoderActive ? '' : 'none';
            };
            updateVisibility();

            // Watch for tab changes
            document.getElementById('tab-set')
                .addEventListener('click', () => setTimeout(updateVisibility, 0));
            const navSelect = document.getElementById('nav-select');
            if (navSelect) navSelect.addEventListener('change', () => setTimeout(updateVisibility, 0));

            // Dismiss handler
            document.getElementById('announcement-dismiss').addEventListener('click', () => {
                toast.classList.add('announcement-hiding');
                toast.addEventListener('animationend', () => toast.remove());
                localStorage.setItem(announcementKey, '1');
            });
        })
        .catch(error => {
            console.error('Error fetching announcement:', error);
        });
});
