import { cpuPercentBetween, parseMeminfo, parseProcStat } from './server-metrics';

describe('server metrics parsing', () => {
  it('reads the aggregate CPU line and computes busy time between two readings', () => {
    const before = parseProcStat('cpu  100 0 100 700 100 0 0 0 0 0\ncpu0 1 2 3 4\n');
    const after = parseProcStat('cpu  200 0 200 1300 100 0 0 0 0 0\n');
    expect(before).toEqual({ idle: 800, total: 1000 });
    expect(after).toEqual({ idle: 1400, total: 1800 });
    expect(cpuPercentBetween(before!, after!)).toBe(25);
  });

  it('reads total and available memory', () => {
    const text = 'MemTotal:        3906000 kB\nMemFree:          100000 kB\nMemAvailable:    1953000 kB\n';
    expect(parseMeminfo(text)).toEqual({ total: 3906000 * 1024, available: 1953000 * 1024 });
    expect(parseMeminfo('nothing')).toBeNull();
  });
});
