import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';

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

export function resolveFilePath(relativePath: string): string {
  return join(storageRoot(), relativePath);
}
