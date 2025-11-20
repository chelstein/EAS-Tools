const footer = document.querySelector('footer');

footer.innerHTML = `
<ul class="footer-links">
    <li><p>Developed by <a href="https://github.com/wagwan-piffting-blud/">wagwan-piffting-blud</a></p></li>
    <li><p>Hosted on <a href="https://github.com/wagwan-piffting-blud/eas-tools">GitHub Pages</a></p></li>
    <li><p>Last updated: <span id="last-updated"><time datetime=""></time></span> (commit <span id="last-commit-hash"></span>)</p></li>
    <li><p><a href="docs.html">TTS Documentation</a></p></li>
    <li><p><a href="demos.html">TTS Voice Demos</a></p></li>
</ul>
`;

const lastUpdated = document.getElementById('last-updated');
const lastCommitHash = document.getElementById('last-commit-hash');

function formatTimestamps(commitDate) {
    const timeElements = document.querySelectorAll('time[datetime]');
    timeElements.forEach(timeEl => {
        const datetime = commitDate ? commitDate.toISOString() : timeEl.getAttribute('datetime');
        timeEl.setAttribute('datetime', datetime);

        if (!datetime) {
            return;
        }

        const dateObj = new Date(datetime);
        if (isNaN(dateObj.getTime())) {
            return;
        }

        const now = new Date();
        const diffMs = now - dateObj;
        const diffInSeconds = Math.floor(diffMs / 1000);
        let formatted = '';
        if (diffInSeconds < 60) {
            formatted = `${diffInSeconds}s ago`;
        } else if (diffInSeconds < 3600) {
            const minutes = Math.floor(diffInSeconds / 60);
            const seconds = diffInSeconds % 60;
            formatted = `${minutes}m ${seconds}s ago`;
        } else if (diffInSeconds < 86400) {
            const hours = Math.floor(diffInSeconds / 3600);
            formatted = `${hours} hour${hours === 1 ? '' : 's'} ago`;
        } else if (diffInSeconds < 604800) {
            const days = Math.floor(diffInSeconds / 86400);
            formatted = `${days} day${days === 1 ? '' : 's'} ago`;
        } else if (diffInSeconds < 2592000) {
            const weeks = Math.floor(diffInSeconds / 604800);
            formatted = `${weeks} week${weeks === 1 ? '' : 's'} ago`;
        } else if (diffInSeconds < 31536000) {
            const months = Math.floor(diffInSeconds / 2592000);
            formatted = `${months} month${months === 1 ? '' : 's'} ago`;
        } else {
            const years = Math.floor(diffInSeconds / 31536000);
            formatted = `${years} year${years === 1 ? '' : 's'} ago`;
        }

        timeEl.textContent = formatted;
    });
};

const cachedData = localStorage.getItem('githubCommitData');
if (cachedData) {
    const { commitDate, commitHash, timestamp } = JSON.parse(cachedData);

    lastCommitHash.innerHTML = `<a href="https://github.com/wagwan-piffting-blud/eas-tools/commit/${commitHash}">${commitHash.substring(0, 7)}</a>`;

    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
        fetch('https://api.github.com/repos/wagwan-piffting-blud/eas-tools/commits/main')
            .then(response => response.json())
            .then(data => {
                window.commitDate = new Date(data.commit.author.date);
                lastCommitHash.innerHTML = `<a href="https://github.com/wagwan-piffting-blud/eas-tools/commit/${data.sha}">${data.sha.substring(0, 7)}</a>`;

                localStorage.setItem('githubCommitData', JSON.stringify({
                    commitDate: window.commitDate,
                    commitHash: lastCommitHash.textContent,
                    timestamp: Date.now()
                }));
            });
    } else {
        fetch('https://api.github.com/repos/wagwan-piffting-blud/eas-tools/commits/main')
            .then(response => response.json())
            .then(data => {
            window.commitDate = new Date(data.commit.author.date);
            lastCommitHash.innerHTML = `<a href="https://github.com/wagwan-piffting-blud/eas-tools/commit/${data.sha}">${data.sha.substring(0, 7)}</a>`;
            localStorage.setItem('githubCommitData', JSON.stringify({
                commitDate: window.commitDate,
                commitHash: lastCommitHash.textContent,
                timestamp: Date.now()
            }));
        })
        .catch(error => {
            console.error('Error fetching commit data:', error);
        });
    }
} else {
    fetch('https://api.github.com/repos/wagwan-piffting-blud/eas-tools/commits/main')
        .then(response => response.json())
        .then(data => {
        window.commitDate = new Date(data.commit.author.date);
        lastCommitHash.innerHTML = `<a href="https://github.com/wagwan-piffting-blud/eas-tools/commit/${data.sha}">${data.sha.substring(0, 7)}</a>`;
        localStorage.setItem('githubCommitData', JSON.stringify({
            commitDate: window.commitDate,
            commitHash: lastCommitHash.textContent,
            timestamp: Date.now()
        }));
    })
    .catch(error => {
        console.error('Error fetching commit data:', error);
    });
}

formatTimestamps(window.commitDate);

setInterval(() => formatTimestamps(window.commitDate), 1000);
