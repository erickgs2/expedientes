import { inlineImageType } from './image-signature';
import { readStoredFile, THUMBNAIL_SUFFIX, writeStoredFileAt } from './file-storage';

/**
 * Longest edge of a thumbnail, in pixels. Gallery tiles are a few hundred CSS pixels wide; 640 keeps
 * them sharp on a 2x tablet screen while weighing roughly a tenth of the 1920 px original.
 */
const THUMBNAIL_MAX_EDGE = 640;
const THUMBNAIL_JPEG_QUALITY = 75;

type SharpFactory = typeof import('sharp');

let sharpLoader: Promise<SharpFactory | null> | null = null;

/**
 * sharp is a native module (it ships with Next.js, which uses it for images). If it cannot be loaded
 * in some environment, thumbnails are skipped and callers serve the original: slower, but never
 * broken.
 */
function loadSharp(): Promise<SharpFactory | null> {
  sharpLoader ??= import('sharp')
    .then((module) => ((module as { default?: SharpFactory }).default ?? (module as unknown as SharpFactory)))
    .catch((error) => {
      console.warn('sharp is unavailable; serving original images instead of thumbnails', error);
      return null;
    });
  return sharpLoader;
}

/**
 * The thumbnail of a stored JPEG or PNG, generated the first time it is asked for and stored next to
 * the original (path + THUMBNAIL_SUFFIX), so photos uploaded before thumbnails existed get one too,
 * with no migration.
 *
 * Returns null when no thumbnail can be produced (not an image, or sharp unavailable): the caller
 * then serves the original. Throws, like readStoredFile, when the original itself does not exist.
 */
export async function readThumbnail(relativePath: string): Promise<Buffer | null> {
  const thumbnailPath = relativePath + THUMBNAIL_SUFFIX;
  try {
    return await readStoredFile(thumbnailPath);
  } catch {
    // Not generated yet.
  }

  const original = await readStoredFile(relativePath);
  if (!inlineImageType(original)) return null;

  const sharp = await loadSharp();
  if (!sharp) return null;

  let thumbnail: Buffer;
  try {
    thumbnail = await sharp(original)
      // Applies the EXIF orientation, so a portrait photo from a phone is not shown sideways.
      .rotate()
      .resize({
        width: THUMBNAIL_MAX_EDGE,
        height: THUMBNAIL_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: THUMBNAIL_JPEG_QUALITY })
      .toBuffer();
  } catch (error) {
    console.error('thumbnail generation failed', relativePath, error);
    return null;
  }

  try {
    await writeStoredFileAt(thumbnailPath, thumbnail);
  } catch (error) {
    // Still serve it; the next request simply generates it again.
    console.error('thumbnail save failed', thumbnailPath, error);
  }
  return thumbnail;
}
