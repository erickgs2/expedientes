import { randomUUID } from 'crypto';
import { existsSync, realpathSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';

function storageRoot(): string {
  return process.env.STORAGE_ROOT ?? './storage';
}

export class InvalidFilePathError extends Error {}

/**
 * `category` and `patientId` are simple identifiers, never paths. Reject anything that could turn
 * a `join()` into a write outside the storage root if a future caller ever passes them through
 * from user input.
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

  const dir = join(storageRoot(), category, patientId);
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}${extname(originalName)}`;
  await writeFile(join(dir, filename), buffer);
  return join(category, patientId, filename);
}

function assertWithinRoot(root: string, target: string, relativePath: string): void {
  if (target !== root && !target.startsWith(root + sep)) {
    throw new InvalidFilePathError(`Path escapes storage root: ${relativePath}`);
  }
}

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
