import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readThumbnail } from './thumbnail';
import { deleteStoredFile, THUMBNAIL_SUFFIX } from './file-storage';

describe('thumbnails in local storage', () => {
  const originalRoot = process.env.STORAGE_ROOT;
  const originalBucket = process.env.STORAGE_S3_BUCKET;
  let root: string;

  function put(relativePath: string, bytes: Buffer): void {
    const full = join(root, relativePath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, bytes);
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'thumbs-'));
    process.env.STORAGE_ROOT = root;
    delete process.env.STORAGE_S3_BUCKET;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    if (originalRoot === undefined) delete process.env.STORAGE_ROOT;
    else process.env.STORAGE_ROOT = originalRoot;
    if (originalBucket === undefined) delete process.env.STORAGE_S3_BUCKET;
    else process.env.STORAGE_S3_BUCKET = originalBucket;
  });

  it('returns an already generated thumbnail without touching the original', async () => {
    const cached = Buffer.from('cached-thumbnail-bytes');
    put('photos/p1/a.jpg' + THUMBNAIL_SUFFIX, cached);
    // The original does not even exist: a stored thumbnail must be enough.
    expect(await readThumbnail('photos/p1/a.jpg')).toEqual(cached);
  });

  it('returns null for a stored file that is not an image', async () => {
    put('photos/p1/notes.bin', Buffer.from('not an image at all, just bytes'));
    expect(await readThumbnail('photos/p1/notes.bin')).toBeNull();
  });

  it('throws when the original does not exist and no thumbnail was generated', async () => {
    await expect(readThumbnail('photos/p1/missing.jpg')).rejects.toThrow();
  });

  it('deletes the thumbnail together with its original', async () => {
    put('photos/p1/b.jpg', Buffer.from('original'));
    put('photos/p1/b.jpg' + THUMBNAIL_SUFFIX, Buffer.from('thumb'));
    await deleteStoredFile('photos/p1/b.jpg');
    expect(existsSync(join(root, 'photos/p1/b.jpg'))).toBe(false);
    expect(existsSync(join(root, 'photos/p1/b.jpg' + THUMBNAIL_SUFFIX))).toBe(false);
  });

  it('deletes an original that never had a thumbnail', async () => {
    put('photos/p1/c.jpg', Buffer.from('original'));
    await expect(deleteStoredFile('photos/p1/c.jpg')).resolves.toBeUndefined();
    expect(existsSync(join(root, 'photos/p1/c.jpg'))).toBe(false);
  });
});
