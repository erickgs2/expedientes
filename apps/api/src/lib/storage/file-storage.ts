import { randomUUID } from 'crypto';
import { existsSync, realpathSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

function storageRoot(): string {
  return process.env.STORAGE_ROOT ?? './storage';
}

/**
 * The bucket to store uploads in. Unset — the default, and what local development uses — keeps
 * everything on the local disk under `STORAGE_ROOT`.
 *
 * The stored path is identical either way (`category/patientId/uuid.ext`), so it is a filesystem
 * path in local mode and an object key in S3 mode. Nothing outside this module knows which, and no
 * database column changes when a deployment switches.
 */
function s3Bucket(): string | null {
  return process.env.STORAGE_S3_BUCKET?.trim() || null;
}

let cachedClient: S3Client | null = null;

function s3(): S3Client {
  // Built once per process and reused: each client holds its own connection pool and credential
  // cache, and constructing one per request would re-resolve instance-role credentials every time.
  cachedClient ??= new S3Client({
    region: process.env.AWS_REGION?.trim() || 'us-east-1',
  });
  return cachedClient;
}

export class InvalidFilePathError extends Error {}

/**
 * `category` and `patientId` are simple identifiers, never paths. Reject anything that could turn
 * a `join()` into a write outside the storage root — or an object key outside its intended prefix —
 * if a future caller ever passes them through from user input.
 */
function assertSafeSegment(value: string, label: string): void {
  if (!value || value.includes('..') || value.includes('/') || value.includes('\\') || value.includes(sep)) {
    throw new InvalidFilePathError(`Invalid ${label}: ${value}`);
  }
}

export async function saveFile(
  buffer: Buffer,
  category: string,
  patientId: string,
  originalName: string
): Promise<string> {
  assertSafeSegment(category, 'category');
  assertSafeSegment(patientId, 'patientId');

  const key = `${category}/${patientId}/${randomUUID()}${extname(originalName)}`;
  const bucket = s3Bucket();

  if (bucket) {
    await s3().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        // Patient photos and signatures. The bucket must also block public access at the bucket
        // level — this app never issues presigned URLs, every read is proxied through
        // `/api/files/[...path]`, which is what applies the permission check and writes the audit
        // entry. Serving these straight from S3 would bypass both.
        ContentType: contentTypeFor(originalName),
      })
    );
    return key;
  }

  const dir = join(storageRoot(), category, patientId);
  await mkdir(dir, { recursive: true });
  // `key` is built with forward slashes; split it back apart so the local path uses this platform's
  // separator rather than embedding a literal "/" in a Windows filename.
  await writeFile(join(dir, key.split('/')[2]), buffer);
  return key;
}

function contentTypeFor(originalName: string): string {
  const ext = extname(originalName).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function assertWithinRoot(root: string, target: string, relativePath: string): void {
  if (target !== root && !target.startsWith(root + sep)) {
    throw new InvalidFilePathError(`Path escapes storage root: ${relativePath}`);
  }
}

/**
 * Local-disk only. Kept for callers that genuinely need a filesystem path; anything that just wants
 * the bytes must use `readStoredFile`, which works under both storage drivers.
 */
export function resolveFilePath(relativePath: string): string {
  const root = resolve(storageRoot());
  const target = resolve(root, relativePath);
  assertWithinRoot(root, target, relativePath);

  // Defense in depth: `..` normalization alone can't catch a symlink planted *inside* the storage
  // root that points outside it, so re-check the containment against the real (link-resolved)
  // paths whenever the target already exists.
  if (existsSync(target)) {
    assertWithinRoot(realpathSync(root), realpathSync(target), relativePath);
  }

  return target;
}

/**
 * Reads a stored file's bytes, from S3 or the local disk depending on configuration.
 *
 * Throws when the object is missing or unreadable, exactly as `readFile` did — every caller already
 * treats a failed read as "this one file is unavailable" and carries on, so the S3 driver
 * deliberately does not soften a missing object into an empty buffer.
 */
export async function readStoredFile(relativePath: string): Promise<Buffer> {
  const bucket = s3Bucket();
  if (!bucket) {
    return readFile(resolveFilePath(relativePath));
  }

  // A key arriving here came from a database column this app wrote, but treat it as untrusted
  // anyway: a leading slash or a `..` segment would address a different object.
  if (relativePath.includes('..') || relativePath.startsWith('/')) {
    throw new InvalidFilePathError(`Invalid storage key: ${relativePath}`);
  }

  const response = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: relativePath }));
  if (!response.Body) {
    throw new Error(`Empty response body for storage key: ${relativePath}`);
  }
  return Buffer.from(await response.Body.transformToByteArray());
}
