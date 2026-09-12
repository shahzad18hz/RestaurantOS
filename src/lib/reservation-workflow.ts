import { prisma } from "@/lib/prisma";

const ACTIVE_RESERVATION_STATUSES = ["PENDING", "CONFIRMED", "SEATED"] as const;

export async function getReservationBufferMinutes(restaurantId: number) {
  const settings = await prisma.restaurantSettings.findUnique({
    where: { restaurantId },
    select: { reservationBufferMinutes: true },
  });
  return Math.max(0, Number(settings?.reservationBufferMinutes ?? 15));
}

export async function findReservationConflict(args: {
  restaurantId: number;
  tableId: number | null;
  reservationAt: Date;
  durationMinutes?: number;
  ignoreId?: number;
}) {
  if (!args.tableId) return null;
  const bufferMinutes = await getReservationBufferMinutes(args.restaurantId);
  const durationMinutes = Math.max(15, Number(args.durationMinutes || 90));
  const requestedStart = args.reservationAt.getTime() - bufferMinutes * 60_000;
  const requestedEnd = args.reservationAt.getTime() + (durationMinutes + bufferMinutes) * 60_000;
  const windowStart = new Date(args.reservationAt.getTime() - 24 * 60 * 60_000);
  const windowEnd = new Date(args.reservationAt.getTime() + 24 * 60 * 60_000);

  const candidates = await prisma.reservation.findMany({
    where: {
      restaurantId: args.restaurantId,
      tableId: args.tableId,
      reservationAt: { gte: windowStart, lte: windowEnd },
      status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      ...(args.ignoreId ? { id: { not: args.ignoreId } } : {}),
    },
    select: { id: true, reservationNumber: true, reservationAt: true, durationMinutes: true, status: true },
  });

  return candidates.find((candidate) => {
    if (!candidate.reservationAt) return false;
    const existingStart = candidate.reservationAt.getTime() - bufferMinutes * 60_000;
    const existingEnd = candidate.reservationAt.getTime() + (Math.max(15, candidate.durationMinutes || 90) + bufferMinutes) * 60_000;
    return requestedStart < existingEnd && requestedEnd > existingStart;
  }) || null;
}

export async function nextSafeTableStatus(restaurantId: number, tableId: number) {
  const activeOrder = await prisma.order.findFirst({
    where: { restaurantId, tableId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    select: { id: true },
  });
  if (activeOrder) return "OCCUPIED" as const;

  const now = new Date();
  const soon = new Date(now.getTime() + 2 * 60 * 60_000);
  const upcoming = await prisma.reservation.findFirst({
    where: {
      restaurantId,
      tableId,
      reservationAt: { gte: now, lte: soon },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { id: true },
  });
  return upcoming ? "RESERVED" as const : "AVAILABLE" as const;
}
