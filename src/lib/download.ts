/**
 * Hand `text` to the browser as a file named `name`: an `<a download>` on a
 * blob URL. The Apple apps' web view turns it into a save panel (Mac) or
 * the share sheet (iOS).
 */
export function downloadFile(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // After the download has read it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
