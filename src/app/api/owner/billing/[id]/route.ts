import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";
import { deductInventoryForOrder } from "@/lib/inventory-bom";
import { writeAuditLog } from "@/lib/audit";
import { getDemoLimitFailure } from "@/lib/demo";

const METHODS = ["CASH", "CARD", "ONLINE", "WALLET"] as const;
const STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "REFUNDED", "CANCELLED"] as const;

async function getBill(id: string) {
  const context = await requireRestaurantContext();
  if (context.errorStatus) return { context, bill: null };
  if (!context.user || !["SUPER_ADMIN", "OWNER", "MANAGER", "CASHIER"].includes(context.user.role)) return { context: { ...context, errorStatus: 403 as const, errorMessage: "Your role cannot access billing." }, bill: null };
  const bill = await prisma.bill.findFirst({
    where: { id: Number(id), restaurantId: context.restaurantId! },
    include: { order: { include: { table: true, items: { include: { menuItem: { select: { name: true } } } } } }, createdBy: { select: { id: true, name: true } }, payments: { orderBy: { createdAt: "asc" } } },
  });
  return { context, bill };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { context, bill } = await getBill((await params).id);
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!bill) return NextResponse.json({ success: false, message: "Bill not found." }, { status: 404 });
    return NextResponse.json({ success: true, data: bill });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Failed to fetch bill." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { context, bill } = await getBill((await params).id);
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!bill) return NextResponse.json({ success: false, message: "Bill not found." }, { status: 404 });
    const body = await request.json();
    if (!STATUSES.includes(body.paymentStatus) || (body.paymentMethod && !METHODS.includes(body.paymentMethod))) {
      return NextResponse.json({ success: false, message: "Invalid payment status or method." }, { status: 400 });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.bill.update({ where: { id: bill.id }, data: { paymentStatus: body.paymentStatus, paymentMethod: body.paymentMethod || null, notes: body.notes ?? bill.notes } });
      if (body.paymentStatus === "PAID") {
        await deductInventoryForOrder(tx, context.restaurantId!, bill.orderId, context.user!.id, context.user!.demoSessionId);
        await tx.order.update({ where: { id: bill.orderId }, data: { paymentStatus: "PAID", paymentMethod: body.paymentMethod || null, status: "COMPLETED" } });
        if (bill.order.tableId) await tx.diningTable.update({ where: { id: bill.order.tableId }, data: { status: "CLEANING" } });
      }
      if (body.paymentStatus === "REFUNDED") await tx.order.update({ where: { id: bill.orderId }, data: { paymentStatus: "REFUNDED" } });
      if (body.paymentStatus === "CANCELLED") await tx.order.update({ where: { id: bill.orderId }, data: { paymentStatus: "CANCELLED" } });
      return saved;
    });
    await writeAuditLog({ restaurantId: context.restaurantId!, actorId: context.user!.id, action: `BILL_${body.paymentStatus}`, entity: "Bill", entityId: bill.id, details: { billNumber: bill.billNumber, paymentMethod: body.paymentMethod || null } }); return NextResponse.json({ success: true, message: "Bill payment updated.", data: updated });
  } catch (error) {
    console.error(error);
    const demoLimit = getDemoLimitFailure(error);
    if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status });
    return NextResponse.json({ success: false, message: "Bill update failed." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { context, bill } = await getBill((await params).id);
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!bill) return NextResponse.json({ success: false, message: "Bill not found." }, { status: 404 });
    if (bill.paymentStatus === "PAID") return NextResponse.json({ success: false, message: "Paid bills must be refunded instead of cancelled." }, { status: 400 });
    await prisma.$transaction([
      prisma.bill.update({ where: { id: bill.id }, data: { paymentStatus: "CANCELLED" } }),
      prisma.order.update({ where: { id: bill.orderId }, data: { paymentStatus: "CANCELLED" } }),
    ]);
    return NextResponse.json({ success: true, message: "Bill cancelled." });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Bill cancellation failed." }, { status: 500 });
  }
}
