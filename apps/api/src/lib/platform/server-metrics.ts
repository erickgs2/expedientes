import { readFile, statfs } from 'fs/promises';
import os from 'os';
import type { ServerMetricPoint, ServerMetricsNow } from '@expedientes/shared-types';
import { prismaUnscoped } from '../prisma/client';

/**
 * Load of the machine the app runs on, for the portal.
 *
 * Inside Docker, os.totalmem() and os.cpus() already describe the host, and so do /proc/stat and
 * /proc/meminfo, which are not namespaced: that is the server as a whole (the MacBook, later the
 * EC2), not just this container. Disk is the filesystem holding the uploads. Read every 30 seconds;
 * one sample every 5 minutes is stored and kept 7 days.
 */

export interface CpuTimes {
  idle: number;
  total: number;
}

/** Parses the aggregate `cpu` line of /proc/stat. */
export function parseProcStat(text: string): CpuTimes | null {
  const line = text.split('\n').find((l) => l.startsWith('cpu '));
  if (!line) return null;
  const values = line.trim().split(/\s+/).slice(1).map(Number);
  if (values.length < 4 || values.some(Number.isNaN)) return null;
  const idle = values[3] + (values[4] ?? 0); // idle + iowait
  const total = values.reduce((sum, value) => sum + value, 0);
  return { idle, total };
}

export function cpuPercentBetween(before: CpuTimes, after: CpuTimes): number {
  const total = after.total - before.total;
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, ((total - (after.idle - before.idle)) / total) * 100));
}

/** Total and available memory from /proc/meminfo, in bytes. */
export function parseMeminfo(text: string): { total: number; available: number } | null {
  const read = (key: string) => {
    const match = new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(text);
    return match ? Number(match[1]) * 1024 : null;
  };
  const total = read('MemTotal');
  const available = read('MemAvailable');
  return total && available !== null ? { total, available } : null;
}

async function cpuTimes(): Promise<CpuTimes> {
  try {
    const parsed = parseProcStat(await readFile('/proc/stat', 'utf8'));
    if (parsed) return parsed;
  } catch {
    // Not Linux (development on a Mac): fall back to Node's view.
  }
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }
  return { idle, total };
}

async function memory(): Promise<{ used: number; total: number }> {
  try {
    const parsed = parseMeminfo(await readFile('/proc/meminfo', 'utf8'));
    if (parsed) return { used: parsed.total - parsed.available, total: parsed.total };
  } catch {
    // Not Linux.
  }
  return { used: os.totalmem() - os.freemem(), total: os.totalmem() };
}

async function disk(): Promise<{ used: number; total: number }> {
  try {
    const stats = await statfs(process.env.STORAGE_ROOT ?? '.');
    const total = stats.blocks * stats.bsize;
    return { used: total - stats.bavail * stats.bsize, total };
  } catch {
    return { used: 0, total: 0 };
  }
}

async function databaseSize(): Promise<number> {
  try {
    const rows = await prismaUnscoped.$queryRaw<Array<{ size: bigint }>>`
      SELECT pg_database_size(current_database()) AS size`;
    return Number(rows[0]?.size ?? 0);
  } catch {
    return 0;
  }
}

const percent = (used: number, total: number) => (total > 0 ? Math.round((used / total) * 1000) / 10 : 0);

let previousCpu: CpuTimes | null = null;
let latest: ServerMetricsNow | null = null;
let samplesSincePersist = 0;
let timer: ReturnType<typeof setInterval> | null = null;

const SAMPLE_MS = 30_000;
const PERSIST_EVERY = 10; // × 30 s = 5 minutes
const RETENTION_MS = 7 * 86_400_000;

async function sample(): Promise<ServerMetricsNow> {
  const cpu = await cpuTimes();
  const cpuPercent = previousCpu ? cpuPercentBetween(previousCpu, cpu) : 0;
  previousCpu = cpu;
  const [mem, storage, dbSizeBytes] = await Promise.all([memory(), disk(), databaseSize()]);
  latest = {
    takenAt: new Date().toISOString(),
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    memPercent: percent(mem.used, mem.total),
    diskPercent: percent(storage.used, storage.total),
    memUsedBytes: mem.used,
    memTotalBytes: mem.total,
    diskUsedBytes: storage.used,
    diskTotalBytes: storage.total,
    dbSizeBytes,
    processRssBytes: process.memoryUsage().rss,
    uptimeSeconds: Math.round(os.uptime()),
  };
  return latest;
}

async function persist(now: ServerMetricsNow): Promise<void> {
  await prismaUnscoped.serverMetricSample.create({
    data: {
      takenAt: new Date(now.takenAt),
      cpuPercent: now.cpuPercent,
      memUsedBytes: BigInt(now.memUsedBytes),
      memTotalBytes: BigInt(now.memTotalBytes),
      diskUsedBytes: BigInt(now.diskUsedBytes),
      diskTotalBytes: BigInt(now.diskTotalBytes),
      dbSizeBytes: BigInt(now.dbSizeBytes),
      processRssBytes: BigInt(now.processRssBytes),
    },
  });
  await prismaUnscoped.serverMetricSample.deleteMany({
    where: { takenAt: { lt: new Date(Date.now() - RETENTION_MS) } },
  });
}

/** Starts sampling; the first stored sample comes after the first CPU interval can be measured. */
export function startServerMetrics(): void {
  if (timer) return;
  void sample();
  timer = setInterval(async () => {
    try {
      const now = await sample();
      samplesSincePersist++;
      if (samplesSincePersist >= PERSIST_EVERY) {
        samplesSincePersist = 0;
        await persist(now);
      }
    } catch (error) {
      console.error('Server metrics sample failed', error);
    }
  }, SAMPLE_MS);
  timer.unref?.();
}

/** The latest reading; measured on the spot if the sampler has not run yet in this process. */
export async function currentServerMetrics(): Promise<ServerMetricsNow> {
  return latest ?? sample();
}

/** Stored samples of the last `hours`, oldest first. */
export async function serverMetricSeries(hours = 24): Promise<ServerMetricPoint[]> {
  const rows = await prismaUnscoped.serverMetricSample.findMany({
    where: { takenAt: { gte: new Date(Date.now() - hours * 3_600_000) } },
    orderBy: { takenAt: 'asc' },
  });
  return rows.map((row) => ({
    takenAt: row.takenAt.toISOString(),
    cpuPercent: row.cpuPercent,
    memPercent: percent(Number(row.memUsedBytes), Number(row.memTotalBytes)),
    diskPercent: percent(Number(row.diskUsedBytes), Number(row.diskTotalBytes)),
  }));
}
