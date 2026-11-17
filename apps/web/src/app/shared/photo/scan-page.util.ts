/** Longest edge of a stored scan page. Enough to read a printed letter, small enough to upload. */
export const SCAN_PAGE_MAX_EDGE = 2000;
const SCAN_PAGE_JPEG_QUALITY = 0.85;

/** The size an image of `width`×`height` takes when its longest edge is limited to `maxEdge`. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Re-encodes a picked or photographed page to a downscaled JPEG. Always re-encodes rather than
 * uploading the original: a phone photo is 4-8 MB (a few of them overrun the proxy's body limit),
 * iOS may hand back HEIC which the API rejects, and `imageOrientation: 'from-image'` bakes the EXIF
 * rotation into the pixels so a page shot sideways is not stored sideways. Null when the browser
 * cannot decode the file.
 */
export async function toScanPageJpeg(file: File, pageNumber: number): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const size = fitWithin(bitmap.width, bitmap.height, SCAN_PAGE_MAX_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', SCAN_PAGE_JPEG_QUALITY)
    );
    return blob ? new File([blob], `page-${pageNumber}.jpg`, { type: 'image/jpeg' }) : null;
  } catch (error) {
    console.error('Failed to process a scan page', error);
    return null;
  }
}
