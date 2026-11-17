/**
 * A pointing device that can hover and click precisely means a desktop browser — one with a
 * built-in PDF viewer and room for a second tab. Phones and tablets (including a tablet with a
 * keyboard case) report a coarse pointer and no hover, and a touchscreen laptop still reports
 * fine/hover because of its trackpad, which is the answer we want in both cases.
 */
function isDesktopBrowser(): boolean {
  return (
    window.matchMedia?.('(pointer: fine)').matches === true &&
    window.matchMedia?.('(hover: hover)').matches === true
  );
}

/**
 * Hands the finished PDF to the user.
 *
 * On a phone or tablet: iOS/WKWebView — where this app runs inside the native shell — ignores an
 * anchor's `download` attribute, so the click that works on desktop silently does nothing there.
 * The PDF goes to the native share sheet instead ("Guardar en Archivos", mail, AirDrop), falling
 * back to the anchor download if sharing isn't available or fails.
 *
 * On desktop: the file downloads and also opens in a new tab, so the record can be read straight
 * away instead of being hunted down in the downloads folder.
 */
export async function deliverPdf(blob: Blob, fileName: string): Promise<void> {
  const file = new File([blob], fileName, { type: 'application/pdf' });
  const isDesktop = isDesktopBrowser();

  // Desktop deliberately skips the share sheet. macOS Safari implements the Web Share API with
  // files, so without this check a Mac gets an AirDrop/Mail panel — useful on a phone, a detour
  // on a desktop where the point is to read the record straight away.
  if (!isDesktop && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return;
    } catch (error) {
      // Dismissing the share sheet is a normal outcome, not a failure to report.
      if ((error as DOMException | null)?.name === 'AbortError') return;
      console.warn('Sharing the export failed; falling back to a download', error);
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // The download above always happens; the preview tab is a bonus on top of it. Generating the
  // PDF takes long enough that the browser's user-activation window may have lapsed, so a popup
  // blocker can refuse this — the user still has the downloaded file either way.
  const previewTab = isDesktop ? window.open(url, '_blank') : null;
  if (isDesktop && !previewTab) {
    console.info('The export preview tab was blocked; the PDF was downloaded instead.');
  }

  // Revoking synchronously can cancel the transfer before the browser has finished reading the
  // blob. Once a preview tab holds the URL, keep it alive for this page's lifetime instead —
  // revoking would break the tab on reload for the sake of memory the user is still using.
  if (!previewTab) {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
