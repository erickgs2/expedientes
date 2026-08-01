import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';

function storageRoot(): string {
  return process.env.STORAGE_ROOT ?? './storage';
}

export async function saveFile(
  buffer: Buffer,
  category: string,
  patientId: string,
  originalName: string
): Promise<string> {
  const dir = join(storageRoot(), category, patientId);
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}${extname(originalName)}`;
  await writeFile(join(dir, filename), buffer);
  return join(category, patientId, filename);
}

export class InvalidFilePathError extends Error {}

export function resolveFilePath(relativePath: string): string {
  const root = resolve(storageRoot());
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new InvalidFilePathError(`Path escapes storage root: ${relativePath}`);
  }
  return target;
}
