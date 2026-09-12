import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";
import { findReservationConflict, getReservationBufferMinutes } from "@/lib/reservation-workflow";
import { consumeDemoQuota, getDemoLimitFailure } from "@/lib/demo";

const VALID_STATUSES = ["PENDING", "CONFIRMED", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
type ReservationStatus = (typeof VALID_STATUSES)[number];

function reservationNumber(restaurantId: number) {
  return `RES-${restaurantId}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

function parseReservationAt(date: unknown, time: unknown) {
  if (typeof date !== "string" || typeof time !== "string" || !date || !time) return null;
  const value = new Date(`${date}T${time}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireRestaurantContext();
    if (context.errorStatus) {
      return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    }

    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize")) || 10));
    const search = request.nextUrl.searchParams.get("search")?.trim() || "";
    const status = request.nextUrl.searchParams.get("status");
    const date = request.nextUrl.searchParams.get("date");
    const now = new Date();
    const bufferMinutes = await getReservationBufferMinutes(context.restaurantId!);
    const noShowCutoff = new Date(now.getTime() - bufferMinutes * 60_000);

    await prisma.reservation.updateMany({
      where: {
        restaurantId: context.restaurantId!,
        reservationAt: { lt: noShowCutoff },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      data: { status: "NO_SHOW" },
    });

    const where = {
      restaurantId: context.restaurantId!,
      ...(status && VALID_STATUSES.includes(status as ReservationStatus) ? { status: status as ReservationStatus } : {}),
      ...(date ? { reservationAt: { gte: new Date(`${date}T00:00:00`), lt: new Date(`${date}T23:59:59.999`) } } : {}),
      ...(search ? {
        OR: [
          { reservationNumber: { contains: search, mode: "insensitive" as const } },
          { customerName: { contains: search, mode: "insensitive" as const } },
          { phoneNumber: { contains: search, mode: "insensitive" as const } },
        ],
      } : {}),
    };

    const [reservations, total, tables, staff] = await Promise.all([
      prisma.reservation.findMany({
        where,
        include: {
          table: { select: { id: true, name: true, capacity: true } },
          customer: { select: { id: true, name: true, phone: true, email: true } },
          assignedStaff: { select: { id: true, name: true, email: true } },
        },
        orderBy: { reservationAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.reservation.count({ where }),
      prisma.diningTable.findMany({
        where: { restaurantId: context.restaurantId! },
        select: { id: true, name: true, capacity: true, status: true },
        orderBy: { name: "asc" },
      }),
      prisma.staff.findMany({
        where: { restaurantId: context.restaurantId!, status: "ACTIVE" },
        select: { id: true, name: true, email: true, user: { select: { role: true } } },
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: reservations,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
      options: { tables, staff: staff.map((member) => ({ id: member.id, name: member.name || member.email || "Staff", email: member.email || "", role: member.user.role })) },
    });
  } catch (error) {
    console.error(error);
    const demoLimit = getDemoLimitFailure(error);
    if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status });
    return NextResponse.json({ success: false, message: "Failed to fetch reservations." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireRestaurantContext();
    if (context.errorStatus) {
      return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    }
    const body = await request.json();
    const reservationAt = parseReservationAt(body.reservationDate, body.reservationTime);
    const guests = Number(body.numberOfGuests);
    if (!body.customerName?.trim() || !body.phoneNumber?.trim() || !reservationAt || !Number.isInteger(guests) || guests < 1) {
      return NextResponse.json({ success: false, message: "Customer, phone, date, time, and a valid guest count are required." }, { status: 400 });
    }

    const tableId = body.tableId ? Number(body.tableId) : null;
    if (tableId) {
      const table = await prisma.diningTable.findFirst({ where: { id: tableId, restaurantId: context.restaurantId! } });
      if (!table) return NextResponse.json({ success: false, message: "Table not found for this restaurant." }, { status: 404 });
      if (guests > table.capacity) return NextResponse.json({ success: false, message: "Guest count exceeds table capacity." }, { status: 400 });
    }
    const conflict = await findReservationConflict({ restaurantId: context.restaurantId!, tableId, reservationAt, durationMinutes: Number(body.durationMinutes) || 90 });
    if (conflict) return NextResponse.json({ success: false, message: `Table is already booked at this time (#${conflict.reservationNumber}).` }, { status: 409 });

    const customerExists = await prisma.customer.findUnique({ where: { restaurantId_phone: { restaurantId: context.restaurantId!, phone: body.phoneNumber.trim() } }, select: { id: true } });
    const requestedStatus = body.status === "CONFIRMED" ? "CONFIRMED" : "PENDING";
    const created = await prisma.$transaction(async (tx) => {
      if (context.user!.isDemo && context.user!.demoSessionId) await consumeDemoQuota(tx, context.user!.demoSessionId, "record", customerExists ? 1 : 2);
      const customer = await tx.customer.upsert({
        where: { restaurantId_phone: { restaurantId: context.restaurantId!, phone: body.phoneNumber.trim() } },
        create: { restaurantId: context.restaurantId!, name: body.customerName.trim(), phone: body.phoneNumber.trim(), email: body.email?.trim() || null },
        update: { name: body.customerName.trim(), email: body.email?.trim() || null },
      });
      const reservation = await tx.reservation.create({
      data: {
        restaurantId: context.restaurantId!, reservationNumber: reservationNumber(context.restaurantId!),
        customerId: customer.id, customerName: body.customerName.trim(), phoneNumber: body.phoneNumber.trim(),
        email: body.email?.trim() || null, tableId, numberOfGuests: guests, guests, reservationAt, reservationDate: reservationAt, durationMinutes: Math.max(15, Number(body.durationMinutes) || 90),
        status: requestedStatus, notes: body.notes?.trim() || null,
        assignedStaffId: body.assignedStaffId ? Number(body.assignedStaffId) : null,
        createdBy: context.user!.id,
      },
      });
      if (tableId && requestedStatus === "CONFIRMED") {
        const table = await tx.diningTable.findUnique({ where: { id: tableId }, select: { status: true } });
        if (table?.status === "AVAILABLE") await tx.diningTable.update({ where: { id: tableId }, data: { status: "RESERVED" } });
      }
      return reservation;
    });
    return NextResponse.json({ success: true, message: "Reservation created successfully.", data: created });
  } catch (error) {
    console.error(error);
    const demoLimit = getDemoLimitFailure(error);
    if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status });
    return NextResponse.json({ success: false, message: "Reservation creation failed." }, { status: 500 });
  }
}
