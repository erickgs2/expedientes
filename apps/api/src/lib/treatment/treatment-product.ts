import { prisma } from '../prisma/client';

export interface ProductWriteData {
  brand: string;
  lotNumber: string;
  expiryDate: Date | null;
  photoPath?: string;
}

export function listProducts(treatmentItemId: string) {
  return prisma.treatmentItemProduct.findMany({
    where: { treatmentItemId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Resolves a treatment item's `patientId`, or `null` if the item doesn't exist. The product routes
 * only need this one field to authorize/scope their writes, but `getTreatmentItemDetail` also
 * queries clinic settings and assembles the full consent document block list — expensive work every
 * product list/create/update/delete call would otherwise pay for and immediately discard. Use this
 * targeted lookup instead in that path.
 */
export async function getTreatmentItemPatientId(id: string): Promise<string | null> {
  const item = await prisma.treatmentItem.findUnique({
    where: { id },
    select: { treatment: { select: { patientId: true } } },
  });
  return item?.treatment.patientId ?? null;
}

export function getProduct(id: string) {
  return prisma.treatmentItemProduct.findUnique({ where: { id } });
}

export function createProduct(treatmentItemId: string, patientId: string, data: ProductWriteData) {
  return prisma.treatmentItemProduct.create({
    data: { treatmentItemId, patientId, ...data },
  });
}

export function updateProduct(id: string, data: ProductWriteData) {
  return prisma.treatmentItemProduct.update({ where: { id }, data });
}

export function deleteProduct(id: string) {
  return prisma.treatmentItemProduct.delete({ where: { id } });
}

/**
 * Powers the brand autocomplete. Brand names are not patient data, so this is deliberately not
 * scoped to a patient — the whole point is to suggest brands entered on other patients' records.
 * The route still requires `treatments:view` so it cannot be used as an unauthenticated probe.
 */
export async function listBrands(prefix: string): Promise<string[]> {
  const rows = await prisma.treatmentItemProduct.findMany({
    where: { brand: { startsWith: prefix, mode: 'insensitive' } },
    distinct: ['brand'],
    select: { brand: true },
    orderBy: { brand: 'asc' },
    take: 10,
  });
  return rows.map((r) => r.brand);
}
