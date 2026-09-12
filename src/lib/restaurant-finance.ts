import { prisma } from "@/lib/prisma";

export async function getRestaurantTaxConfig(restaurantId: number) {
  const settings = await prisma.restaurantSettings.findUnique({
    where: { restaurantId },
    select: { taxPercentage: true, taxInclusive: true },
  });
  return {
    rate: Math.max(0, Number(settings?.taxPercentage || 0)) / 100,
    inclusive: Boolean(settings?.taxInclusive),
  };
}

export async function getRestaurantTaxRate(restaurantId: number) {
  return (await getRestaurantTaxConfig(restaurantId)).rate;
}

export function calculateOrderTotals(subtotal: number, taxRate: number, taxInclusive: boolean, discountAmount = 0) {
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);
  const safeDiscount = Math.max(0, Number(discountAmount) || 0);
  const rate = Math.max(0, Number(taxRate) || 0);
  const taxAmount = taxInclusive && rate > 0
    ? Math.round((safeSubtotal - safeSubtotal / (1 + rate)) * 100) / 100
    : Math.round(safeSubtotal * rate * 100) / 100;
  const gross = taxInclusive ? safeSubtotal : safeSubtotal + taxAmount;
  const totalAmount = Math.max(0, Math.round((gross - safeDiscount) * 100) / 100);
  return { taxAmount, totalAmount };
}
