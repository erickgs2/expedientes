import { prisma } from '../prisma/client';
import { getClinicSettings } from '../clinic/clinic-settings';
import { THUMBNAIL_SUFFIX } from './file-storage';

export type StoredFileOwner =
  | { kind: 'clinic-asset'; path: string }
  | { kind: 'patient'; patientId: string }
  | { kind: 'unknown' };

/**
 * Who a stored path belongs to, from its shape. Patient files are `category/<patientId>/<uuid>.ext`;
 * the clinic's own assets (logo, physician signature) live under `clinic/`. A thumbnail belongs to
 * whoever owns its original.
 */
export function parseStoredFileOwner(segments: string[]): StoredFileOwner {
  const relative = segments.join('/');
  const original = relative.endsWith(THUMBNAIL_SUFFIX)
    ? relative.slice(0, -THUMBNAIL_SUFFIX.length)
    : relative;
  if (segments[0] === 'clinic') return { kind: 'clinic-asset', path: original };
  if (segments.length >= 3 && segments[1]) return { kind: 'patient', patientId: segments[1] };
  return { kind: 'unknown' };
}

/**
 * Whether the current clinic may read this stored file. Paths are guessable enough (a patient id
 * plus a UUID) that a permission alone is not enough: the patient must be one of this clinic's, and a
 * clinic asset must be the logo or signature this clinic's settings point to.
 */
export async function storedFileBelongsToCurrentClinic(segments: string[]): Promise<boolean> {
  const owner = parseStoredFileOwner(segments);
  if (owner.kind === 'patient') {
    return (await prisma.patient.count({ where: { id: owner.patientId } })) > 0;
  }
  if (owner.kind === 'clinic-asset') {
    const settings = await getClinicSettings();
    return Boolean(
      settings &&
        (settings.doctorSignaturePath === owner.path || settings.clinicLogoPath === owner.path)
    );
  }
  return false;
}
