import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";
import { deductInventoryForOrder } from "@/lib/inventory-bom";
import { writeAuditLog } from "@/lib/audit";
import { consumeDemoQuota, getDemoLimitFailure } from "@/lib/demo";

const METHODS = ["CASH", "CARD", "ONLINE", "WALLET"] as const;

type SplitInput = { method?: string; amount?: number; reference?: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireRestaurantContext();
    if (context.errorStatus) {
      return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    }
    if (!context.user || !["SUPER_ADMIN", "OWNER", "MANAGER", "CASHIER"].includes(context.user.role)) {
      return NextResponse.json({ success: false, message: "Your role cannot record payments." }, { status: 403 });
    }

    const billId = Number((await params).id);
    const body = await request.json();
    const payments: SplitInput[] = Array.isArray(body.payments) ? body.payments : [];

    if (!payments.length) {
      return NextResponse.json({ success: false, message: "Add at least one payment." }, { status: 400 });
    }

    for (const row of payments) {
      if (!METHODS.includes(row.method as (typeof METHODS)[number])) {
        return NextResponse.json({ success: false, message: "Invalid split payment method." }, { status: 400 });
      }
      const amount = Number(row.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ success: false, message: "Every split payment amount must be greater than zero." }, { status: 400 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const bill = await tx.bill.findFirst({
        where: { id: billId, restaurantId: context.restaurantId! },
        include: { payments: true, order: { select: { id: true, tableId: true, status: true } } },
      });
      if (!bill) throw new Error("Bill not found.");
      if (["REFUNDED", "CANCELLED"].includes(bill.paymentStatus)) {
        throw new Error("Refunded or cancelled bills cannot receive payments.");
      }

      const alreadyPaid = bill.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const incoming = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const grandTotal = Number(bill.grandTotal);
      const nextPaid = Math.round((alreadyPaid + incoming) * 100) / 100;

      if (nextPaid > grandTotal + 0.009) {
        throw new Error(`Payment exceeds remaining balance by ${(nextPaid - grandTotal).toFixed(2)}.`);
      }

      if (context.user!.isDemo && context.user!.demoSessionId) await consumeDemoQuota(tx, context.user!.demoSessionId, "record", payments.length);
      await tx.billPayment.createMany({
        data: payments.map((payment) => ({
          billId: bill.id,
          method: payment.method as (typeof METHODS)[number],
          amount: Math.round(Number(payment.amount) * 100) / 100,
          reference: payment.reference?.trim() || null,
        })),
      });

      const fullyPaid = Math.abs(nextPaid - grandTotal) < 0.01;
      const paymentStatus = fullyPaid ? "PAID" : "PARTIALLY_PAID";
      const primaryMethod = payments.length === 1 ? payments[0].method : null;

      await tx.bill.update({
        where: { id: bill.id },
        data: { paymentStatus, paymentMethod: primaryMethod as never },
      });

      if (fullyPaid) {
        await deductInventoryForOrder(tx, context.restaurantId!, bill.orderId, context.user!.id, context.user!.demoSessionId);
        await tx.order.update({
          where: { id: bill.orderId },
          data: { paymentStatus: "PAID", paymentMethod: primaryMethod as never, status: "COMPLETED" },
        });
        if (bill.order.tableId) {
          await tx.diningTable.update({ where: { id: bill.order.tableId }, data: { status: "CLEANING" } });
        }
      } else {
        await tx.order.update({ where: { id: bill.orderId }, data: { paymentStatus: "PARTIALLY_PAID" } });
      }

      const saved = await tx.bill.findUnique({
        where: { id: bill.id },
        include: { payments: { orderBy: { createdAt: "asc" } } },
      });

      return { bill: saved, paid: nextPaid, remaining: Math.max(0, grandTotal - nextPaid) };
    });

    await writeAuditLog({ restaurantId: context.restaurantId!, actorId: context.user!.id, action: result.remaining <= 0.009 ? "BILL_PAID_SPLIT" : "BILL_PARTIAL_PAYMENT", entity: "Bill", entityId: billId, details: { methods: payments.map((p) => p.method), amount: payments.reduce((sum, p) => sum + Number(p.amount || 0), 0), remaining: result.remaining } });

    return NextResponse.json({
      success: true,
      message: result.remaining <= 0.009 ? "Payment completed. Inventory deducted and dine-in table moved to cleaning." : "Partial payment recorded.",
      data: result,
    });
  } catch (error) {
    console.error(error);
    const demoLimit = getDemoLimitFailure(error);
    if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status });
    const message = error instanceof Error ? error.message : "Split payment failed.";
    return NextResponse.json({ success: false, message }, { status: message.includes("not found") ? 404 : 400 });
  }
}
