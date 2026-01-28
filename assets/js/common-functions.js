export async function saveFile(filename, content, mime) {
  const blob = (content instanceof Blob)
    ? content
    : new Blob([content], { type: mime });

  if (window.EASDownloads?.saveBlob) {
    await window.EASDownloads.saveBlob(blob, filename, mime);
    return;
  }

  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
