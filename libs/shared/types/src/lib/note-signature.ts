/** The notes that carry an author and an electronic signature (NOM-004-SSA3-2012 5.10). */
export type NoteKind = 'valoracion' | 'treatment' | 'historiaClinica';

/** Who recorded a note and when, and who signed it, as the API returns it. */
export interface NoteSignature {
  createdAt: string;
  /** Null when the author could not be recovered for an older note. */
  createdByName: string | null;
  signed: { at: string; name: string; title: string | null; license: string | null } | null;
  /** Written before electronic signatures existed; never signed after the fact. */
  legacy: boolean;
}

/** One of the user's own recent notes still waiting for their signature. */
export interface UnsignedNote {
  kind: NoteKind;
  id: string;
  patientId: string;
  patientName: string;
  createdAt: string;
}

/** The signed-in user's profile: what prints with the notes they sign. */
export interface UserProfile {
  fullName: string;
  email: string;
  professionalTitle: string | null;
  professionalLicense: string | null;
  hasSigningPin: boolean;
}
