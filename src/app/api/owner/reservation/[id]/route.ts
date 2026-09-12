import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";
import { findReservationConflict, nextSafeTableStatus } from "@/lib/reservation-workflow";
import { writeAuditLog } from "@/lib/audit";

const STATUSES = ["PENDING", "CONFIRMED", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
const TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["SEATED", "CANCELLED", "NO_SHOW"],
  SEATED: ["COMPLETED", "CANCELLED"],
};

async function contextFor(id: string) {
  const context = await requireRestaurantContext();
  if (context.errorStatus) return { context, reservation: null };
  const reservation = await prisma.reservation.findFirst({ where: { id: Number(id), restaurantId: context.restaurantId! } });
  return { context, reservation };
}

async function syncTableAfterReservation(restaurantId: number, tableId: number | null, status: string) {
  if (!tableId) return;
  if (status === "CONFIRMED") {
    const table = await prisma.diningTable.findFirst({ where: { id: tableId, restaurantId }, select: { status: true } });
    if (table?.status === "AVAILABLE") await prisma.diningTable.update({ where: { id: tableId }, data: { status: "RESERVED" } });
    return;
  }
  if (status === "SEATED") {
    await prisma.diningTable.update({ where: { id: tableId }, data: { status: "OCCUPIED" } });
    return;
  }
  if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(status)) {
    const nextStatus = await nextSafeTableStatus(restaurantId, tableId);
    await prisma.diningTable.update({ where: { id: tableId }, data: { status: nextStatus } });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { context, reservation } = await contextFor(id);
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!reservation) return NextResponse.json({ success: false, message: "Reservation not found." }, { status: 404 });
    const body = await request.json();
    const status = String(body.status || "");
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) return NextResponse.json({ success: false, message: "Invalid reservation status." }, { status: 400 });
    if (status !== reservation.status && !TRANSITIONS[reservation.status]?.includes(status)) {
      return NextResponse.json({ success: false, message: `Invalid reservation workflow: ${reservation.status} cannot move directly to ${status}.` }, { status: 409 });
    }
    if (["CONFIRMED", "SEATED"].includes(status) && reservation.tableId && reservation.reservationAt) {
      const conflict = await findReservationConflict({ restaurantId: reservation.restaurantId, tableId: reservation.tableId, reservationAt: reservation.reservationAt, durationMinutes: reservation.durationMinutes, ignoreId: reservation.id });
      if (conflict) return NextResponse.json({ success: false, message: `Table overlaps reservation #${conflict.reservationNumber}.` }, { status: 409 });
    }
    const updated = await prisma.reservation.update({ where: { id: reservation.id }, data: { status: status as never } });
    await syncTableAfterReservation(reservation.restaurantId, reservation.tableId, status);
    await writeAuditLog({ restaurantId: reservation.restaurantId, actorId: context.user!.id, action: "RESERVATION_STATUS", entity: "Reservation", entityId: reservation.id, details: { reservationNumber: reservation.reservationNumber, from: reservation.status, to: status } });
    return NextResponse.json({ success: true, message: "Reservation status updated.", data: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Reservation update failed." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { context, reservation } = await contextFor(id);
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!reservation) return NextResponse.json({ success: false, message: "Reservation not found." }, { status: 404 });
    if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(reservation.status)) return NextResponse.json({ success: false, message: "Closed reservations cannot be edited." }, { status: 400 });
    const body = await request.json();
    const reservationAt = new Date(`${body.reservationDate}T${body.reservationTime}:00`);
    const guests = Number(body.numberOfGuests);
    const durationMinutes = Math.max(15, Number(body.durationMinutes) || reservation.durationMinutes || 90);
    if (!body.customerName?.trim() || !body.phoneNumber?.trim() || Number.isNaN(reservationAt.getTime()) || !Number.isInteger(guests) || guests < 1) return NextResponse.json({ success: false, message: "Customer, phone, date, time, and a valid guest count are required." }, { status: 400 });
    const tableId = body.tableId ? Number(body.tableId) : null;
    const table = tableId ? await prisma.diningTable.findFirst({ where: { id: tableId, restaurantId: context.restaurantId! } }) : null;
    if (tableId && !table) return NextResponse.json({ success: false, message: "Table not found for this restaurant." }, { status: 404 });
    if (table && guests > table.capacity) return NextResponse.json({ success: false, message: "Guest count exceeds table capacity." }, { status: 400 });
    const conflict = await findReservationConflict({ restaurantId: context.restaurantId!, tableId, reservationAt, durationMinutes, ignoreId: reservation.id });
    if (conflict) return NextResponse.json({ success: false, message: `Table overlaps reservation #${conflict.reservationNumber}.` }, { status: 409 });
    const customer = await prisma.customer.upsert({
      where: { restaurantId_phone: { restaurantId: context.restaurantId!, phone: body.phoneNumber.trim() } },
      create: { restaurantId: context.restaurantId!, name: body.customerName.trim(), phone: body.phoneNumber.trim(), email: body.email?.trim() || null },
      update: { name: body.customerName.trim(), email: body.email?.trim() || null },
    });
    const oldTableId = reservation.tableId;
    const updated = await prisma.reservation.update({ where: { id: reservation.id }, data: {
      customerId: customer.id, customerName: body.customerName.trim(), customerPhone: body.phoneNumber.trim(), phoneNumber: body.phoneNumber.trim(), customerEmail: body.email?.trim() || null, email: body.email?.trim() || null,
      tableId, numberOfGuests: guests, guests, reservationAt, reservationDate: reservationAt, durationMinutes, notes: body.notes?.trim() || null, assignedStaffId: body.assignedStaffId ? Number(body.assignedStaffId) : null,
    } });
    if (oldTableId && oldTableId !== tableId) await syncTableAfterReservation(context.restaurantId!, oldTableId, "CANCELLED");
    if (tableId && ["CONFIRMED", "SEATED"].includes(updated.status)) await syncTableAfterReservation(context.restaurantId!, tableId, updated.status);
    return NextResponse.json({ success: true, message: "Reservation updated successfully.", data: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Reservation update failed." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { context, reservation } = await contextFor(id);
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!reservation) return NextResponse.json({ success: false, message: "Reservation not found." }, { status: 404 });
    if (reservation.status === "COMPLETED") return NextResponse.json({ success: false, message: "Completed reservations are kept for history and cannot be deleted." }, { status: 400 });
    const updated = await prisma.reservation.update({ where: { id: reservation.id }, data: { status: "CANCELLED" } });
    await syncTableAfterReservation(reservation.restaurantId, reservation.tableId, "CANCELLED");
    await writeAuditLog({ restaurantId: reservation.restaurantId, actorId: context.user!.id, action: "RESERVATION_CANCELLED", entity: "Reservation", entityId: reservation.id, details: { reservationNumber: reservation.reservationNumber } });
    return NextResponse.json({ success: true, message: "Reservation cancelled and kept in history.", data: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Reservation cancellation failed." }, { status: 500 });
  }
}
