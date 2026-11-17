import {
  currentClinicId,
  currentClinicIdOrNull,
  NoClinicContextError,
  runAsClinic,
  runWithRequestContext,
  setCurrentClinic,
} from './context';

describe('tenancy context', () => {
  it('has no clinic outside any context', () => {
    expect(currentClinicIdOrNull()).toBeNull();
    expect(() => currentClinicId()).toThrow(NoClinicContextError);
  });

  it('keeps the clinic set during a request across awaits', async () => {
    await runWithRequestContext(async () => {
      expect(currentClinicIdOrNull()).toBeNull();
      setCurrentClinic('clinic-a');
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(currentClinicId()).toBe('clinic-a');
    });
  });

  it('isolates concurrent requests from each other', async () => {
    const seen: string[] = [];
    const request = (clinic: string, delay: number) =>
      runWithRequestContext(async () => {
        setCurrentClinic(clinic);
        await new Promise((resolve) => setTimeout(resolve, delay));
        seen.push(`${clinic}:${currentClinicId()}`);
      });
    await Promise.all([request('clinic-a', 5), request('clinic-b', 1)]);
    expect(seen.sort()).toEqual(['clinic-a:clinic-a', 'clinic-b:clinic-b']);
  });

  it('refuses to switch clinic in the middle of a request', async () => {
    await runWithRequestContext(async () => {
      setCurrentClinic('clinic-a');
      setCurrentClinic('clinic-a');
      expect(() => setCurrentClinic('clinic-b')).toThrow(NoClinicContextError);
    });
  });

  it('runs background work as a given clinic', async () => {
    const clinic = await runAsClinic('clinic-z', async () => currentClinicId());
    expect(clinic).toBe('clinic-z');
    expect(currentClinicIdOrNull()).toBeNull();
  });

  it('cannot set a clinic outside a request context', () => {
    expect(() => setCurrentClinic('clinic-a')).toThrow(NoClinicContextError);
  });
});
