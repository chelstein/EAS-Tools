export async function saveFile(filename, content, mime, opts = {}) {
    const blob = (content instanceof Blob) ? content : new Blob([content], { type: mime });

    if (window.EASDownloads?.saveBlob) {
        await window.EASDownloads.saveBlob(blob, filename, mime, opts);
        return;
    }

    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } finally {
        URL.revokeObjectURL(url);
    }
}
