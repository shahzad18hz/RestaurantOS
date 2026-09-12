import type { Prisma } from "@/generated/prisma/client";

export class InventoryReferenceError extends Error {
  readonly code = "INVALID_INVENTORY_REFERENCE";
  constructor() {
    super("Selected category or supplier is unavailable for this restaurant.");
  }
}

export function optionalPositiveId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new InventoryReferenceError();
  return id;
}

export async function assertInventoryReferences(
  tx: Prisma.TransactionClient,
  restaurantId: number,
  categoryId: number | null,
  supplierId: number | null,
) {
  const [category, supplier] = await Promise.all([
    categoryId ? tx.category.findFirst({ where: { id: categoryId, restaurantId }, select: { id: true } }) : null,
    supplierId ? tx.supplier.findFirst({ where: { id: supplierId, restaurantId }, select: { id: true } }) : null,
  ]);
  if ((categoryId && !category) || (supplierId && !supplier)) throw new InventoryReferenceError();
}
