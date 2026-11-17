import { parseStoredFileOwner } from './file-access';
import { THUMBNAIL_SUFFIX } from './file-storage';

describe('parseStoredFileOwner', () => {
  it('reads the patient id from a patient file path', () => {
    expect(parseStoredFileOwner(['photos', 'p-123', 'a.jpg'])).toEqual({ kind: 'patient', patientId: 'p-123' });
  });

  it('treats a thumbnail like its original', () => {
    expect(parseStoredFileOwner(['photos', 'p-123', 'a.jpg' + THUMBNAIL_SUFFIX])).toEqual({
      kind: 'patient',
      patientId: 'p-123',
    });
  });

  it('recognises a clinic asset and strips the thumbnail suffix', () => {
    expect(parseStoredFileOwner(['clinic', 'settings', 'logo.png' + THUMBNAIL_SUFFIX])).toEqual({
      kind: 'clinic-asset',
      path: 'clinic/settings/logo.png',
    });
  });

  it('refuses a path with no owner segment', () => {
    expect(parseStoredFileOwner(['photos'])).toEqual({ kind: 'unknown' });
    expect(parseStoredFileOwner(['photos', 'a.jpg'])).toEqual({ kind: 'unknown' });
  });
});
