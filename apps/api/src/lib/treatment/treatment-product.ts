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
