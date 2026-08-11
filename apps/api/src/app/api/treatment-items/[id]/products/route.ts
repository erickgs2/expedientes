import { NextRequest, NextResponse } from 'next/server';
import { createProduct, listProducts } from '../../../../../lib/treatment/treatment-product';
import { getTreatmentItemDetail } from '../../../../../lib/treatment/consent';
import {
  InvalidExpiryError,
  normalizeExpiryToMonthEnd,
} from '../../../../../lib/treatment/product-expiry';
import { saveFile } from '../../../../../lib/storage/file-storage';
import { isJpeg } from '../../../../../lib/storage/image-signature';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MIN_PHOTO_BYTES = 1024;
const MAX_FIELD_LENGTH = 120;

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'view');
    const { id } = await params;

    const item = await getTreatmentItemDetail(id);
    if (!item) return apiError('NOT_FOUND', 'Treatment item not found', 404);

    const products = await listProducts(id);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'TreatmentItemProductList',
      entityId: id,
      patientId: item.patientId,
    });

    return NextResponse.json({ products });
  }
);

export const POST = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'edit');
    const { id } = await params;

    // Cheap early-out so an obviously-oversized request is never buffered — not authoritative,
    // the real check runs against the actually-read buffer below.
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PHOTO_BYTES) {
      return apiError('INVALID_INPUT', 'Photo is too large', 413);
    }

    const item = await getTreatmentItemDetail(id);
    if (!item) return apiError('NOT_FOUND', 'Treatment item not found', 404);

    const formData = await request.formData();
    const brand = formData.get('brand');
    const lotNumber = formData.get('lotNumber');
    const expiryDate = formData.get('expiryDate');
    const file = formData.get('photo');

    if (
      typeof brand !== 'string' ||
      !brand.trim() ||
      brand.trim().length > MAX_FIELD_LENGTH
    ) {
      return apiError('INVALID_INPUT', 'brand is required and must be at most 120 characters', 400);
    }
    if (
      typeof lotNumber !== 'string' ||
      !lotNumber.trim() ||
      lotNumber.trim().length > MAX_FIELD_LENGTH
    ) {
      return apiError(
        'INVALID_INPUT',
        'lotNumber is required and must be at most 120 characters',
        400
      );
    }

    let normalizedExpiry: Date | null;
    try {
      normalizedExpiry = normalizeExpiryToMonthEnd(typeof expiryDate === 'string' ? expiryDate : '');
    } catch (error) {
      if (error instanceof InvalidExpiryError) {
        return apiError('INVALID_INPUT', 'expiryDate is not a valid date', 400);
      }
      throw error;
    }

    let photoPath: string | undefined;
    if (file instanceof Blob) {
      const buffer = Buffer.from(await file.arrayBuffer());
      // The authoritative size check: what was actually read, not what the client declared.
      if (buffer.length > MAX_PHOTO_BYTES || buffer.length < MIN_PHOTO_BYTES) {
        return apiError('INVALID_INPUT', 'Photo is too large or too small', 400);
      }
      // Never trust the client's declared content-type — verify the actual bytes.
      if (!isJpeg(buffer)) {
        return apiError('INVALID_INPUT', 'File must be a JPEG image', 400);
      }
      photoPath = await saveFile(buffer, 'treatment-products', item.patientId, 'product.jpg');
    }

    const product = await createProduct(id, item.patientId, {
      brand: brand.trim(),
      lotNumber: lotNumber.trim(),
      expiryDate: normalizedExpiry,
      ...(photoPath ? { photoPath } : {}),
    });

    await writeAuditLogSafe({
      userId,
      action: 'create',
      entity: 'TreatmentItemProduct',
      entityId: product.id,
      patientId: item.patientId,
    });

    return NextResponse.json({ product }, { status: 201 });
  }
);
