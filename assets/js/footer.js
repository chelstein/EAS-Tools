const lastUpdated = document.getElementById('last-updated');
const lastCommitHash = document.getElementById('last-commit-hash');

lastUpdated.textContent = 'Unknown';
lastCommitHash.textContent = 'Unknown';

function commitDateToRelativeString(commitDate) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - commitDate) / 1000);
    if (diffInSeconds < 60) {
        return `${diffInSeconds} second${diffInSeconds === 1 ? '' : 's'} ago`;
    } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    } else if (diffInSeconds < 604800) {
        const days = Math.floor(diffInSeconds / 86400);
        return `${days} day${days === 1 ? '' : 's'} ago`;
    } else if (diffInSeconds < 2592000) {
        const weeks = Math.floor(diffInSeconds / 604800);
        return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    } else if (diffInSeconds < 31536000) {
        const months = Math.floor(diffInSeconds / 2592000);
        return `${months} month${months === 1 ? '' : 's'} ago`;
    } else {
        const years = Math.floor(diffInSeconds / 31536000);
        return `${years} year${years === 1 ? '' : 's'} ago`;
    }
}

const cachedData = localStorage.getItem('githubCommitData');
if (cachedData) {
    const { commitDate, commitHash, timestamp } = JSON.parse(cachedData);

    lastCommitHash.innerHTML = `<a href="https://github.com/wagwan-piffting-blud/eas-tools/commit/${commitHash}">${commitHash.substring(0, 7)}</a>`;
    lastUpdated.textContent = commitDateToRelativeString(new Date(commitDate));

    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
        fetch('https://api.github.com/repos/wagwan-piffting-blud/eas-tools/commits/main')
            .then(response => response.json())
            .then(data => {
                const commitDate = new Date(data.commit.author.date);
                lastCommitHash.innerHTML = `<a href="https://github.com/wagwan-piffting-blud/eas-tools/commit/${data.sha}">${data.sha.substring(0, 7)}</a>`;
                lastUpdated.textContent = commitDateToRelativeString(new Date(commitDate));

                localStorage.setItem('githubCommitData', JSON.stringify({
                    commitDate: lastUpdated.textContent,
                    commitHash: lastCommitHash.textContent,
                    timestamp: Date.now()
                }));
            });
    } else {
        fetch('https://api.github.com/repos/wagwan-piffting-blud/eas-tools/commits/main')
            .then(response => response.json())
            .then(data => {
            const commitDate = new Date(data.commit.author.date);
            lastUpdated.textContent = commitDateToRelativeString(commitDate);
            lastCommitHash.innerHTML = `<a href="https://github.com/wagwan-piffting-blud/eas-tools/commit/${data.sha}">${data.sha.substring(0, 7)}</a>`;
            localStorage.setItem('githubCommitData', JSON.stringify({
                commitDate: lastUpdated.textContent,
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
        const commitDate = new Date(data.commit.author.date);
        lastUpdated.textContent = commitDateToRelativeString(commitDate);
        lastCommitHash.innerHTML = `<a href="https://github.com/wagwan-piffting-blud/eas-tools/commit/${data.sha}">${data.sha.substring(0, 7)}</a>`;
        localStorage.setItem('githubCommitData', JSON.stringify({
            commitDate: lastUpdated.textContent,
            commitHash: lastCommitHash.textContent,
            timestamp: Date.now()
        }));
    })
    .catch(error => {
        console.error('Error fetching commit data:', error);
    });
}
