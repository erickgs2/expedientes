import { NextRequest, NextResponse } from 'next/server';
import { deleteProduct, getProduct, updateProduct } from '../../../../../../lib/treatment/treatment-product';
import {
  InvalidExpiryError,
  normalizeExpiryToMonthEnd,
} from '../../../../../../lib/treatment/product-expiry';
import { saveFile } from '../../../../../../lib/storage/file-storage';
import { isJpeg } from '../../../../../../lib/storage/image-signature';
import { writeAuditLogSafe } from '../../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../../lib/http/require-auth';
import { apiError } from '../../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../../lib/http/with-api-errors';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MIN_PHOTO_BYTES = 1024;
const MAX_FIELD_LENGTH = 120;

export const PATCH = withApiErrors(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string; productId: string }> }
  ) => {
    const userId = await requireAuth(request, 'treatments', 'edit');
    const { id, productId } = await params;

    // Cheap early-out so an obviously-oversized request is never buffered — not authoritative,
    // the real check runs against the actually-read buffer below.
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PHOTO_BYTES) {
      return apiError('INVALID_INPUT', 'Photo is too large', 413);
    }

    const product = await getProduct(productId);
    if (!product || product.treatmentItemId !== id) {
      return apiError('NOT_FOUND', 'Product not found', 404);
    }

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

    // A superseded file is left on disk, matching how the app already treats replaced binaries.
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
      photoPath = await saveFile(buffer, 'treatment-products', product.patientId, 'product.jpg');
    }

    const updated = await updateProduct(productId, {
      brand: brand.trim(),
      lotNumber: lotNumber.trim(),
      expiryDate: normalizedExpiry,
      ...(photoPath ? { photoPath } : {}),
    });

    await writeAuditLogSafe({
      userId,
      action: 'update',
      entity: 'TreatmentItemProduct',
      entityId: productId,
      patientId: product.patientId,
    });

    return NextResponse.json({ product: updated });
  }
);

export const DELETE = withApiErrors(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string; productId: string }> }
  ) => {
    const userId = await requireAuth(request, 'treatments', 'edit');
    const { id, productId } = await params;

    const product = await getProduct(productId);
    if (!product || product.treatmentItemId !== id) {
      return apiError('NOT_FOUND', 'Product not found', 404);
    }

    await deleteProduct(productId);

    await writeAuditLogSafe({
      userId,
      action: 'delete',
      entity: 'TreatmentItemProduct',
      entityId: productId,
      patientId: product.patientId,
    });

    return NextResponse.json({ ok: true });
  }
);
