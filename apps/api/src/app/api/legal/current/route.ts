import { NextResponse } from 'next/server';
import { currentLegalDocuments } from '../../../../lib/legal/legal-documents';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

/** Public. The privacy notice and terms in force, for the sign-up and invitation screens. */
export const GET = withApiErrors(async () => NextResponse.json(await currentLegalDocuments()));
