import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireRestaurantContext } from "@/lib/auth";
import { deductInventoryForOrder } from "@/lib/inventory-bom";
import { calculateOrderTotals, getRestaurantTaxConfig } from "@/lib/restaurant-finance";
import { getDemoLimitFailure } from "@/lib/demo";

const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "SERVED",
  "COMPLETED",
  "CANCELLED",
];

// Statuses that release the table and are considered "final"
const FINAL_STATUSES = ["COMPLETED", "CANCELLED"];
const STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: ["COMPLETED", "CANCELLED"],
};
const PAYMENT_STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "REFUNDED", "CANCELLED"];
const PAYMENT_METHODS = ["CASH", "CARD", "ONLINE", "WALLET"];


// ==============================
// GET SINGLE ORDER
// ==============================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { restaurantId, errorStatus, errorMessage } =
      await requireRestaurantContext();

    if (errorStatus) {
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: errorStatus }
      );
    }

    const { id } = await params;

    const order = await prisma.order.findFirst({
      where: { id: Number(id), restaurantId: restaurantId! },
      include: {
        table: { select: { id: true, name: true } },
        items: { include: { menuItem: { select: { id: true, name: true, image: true } } } },
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    console.error(error);
    const demoLimit = getDemoLimitFailure(error);
    if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status });

    return NextResponse.json(
      { success: false, message: "Failed to fetch order." },
      { status: 500 }
    );
  }
}

// ==============================
// UPDATE ORDER DETAILS
// (customer info / notes / discount — not items or status)
// ==============================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { restaurantId, errorStatus, errorMessage } =
      await requireRestaurantContext();

    if (errorStatus) {
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: errorStatus }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.order.findFirst({
      where: { id: Number(id), restaurantId: restaurantId! },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Order not found." },
        { status: 404 }
      );
    }

    if (FINAL_STATUSES.includes(existing.status)) {
      return NextResponse.json(
        { success: false, message: "Completed or cancelled orders can't be edited." },
        { status: 400 }
      );
    }

    let discountAmount = existing.discountAmount;
    let totalAmount = existing.totalAmount;

    if (body.discountAmount !== undefined) {
      discountAmount = new Prisma.Decimal(Math.max(0, Number(body.discountAmount) || 0));
      const tax = await getRestaurantTaxConfig(restaurantId!);
      const totals = calculateOrderTotals(Number(existing.subtotal), tax.rate, tax.inclusive, Number(discountAmount));
      totalAmount = new Prisma.Decimal(totals.totalAmount);
    }

    const order = await prisma.order.update({
      where: { id: Number(id) },
      data: {
        customerName: body.customerName ?? existing.customerName,
        customerPhone: body.customerPhone ?? existing.customerPhone,
        notes: body.notes ?? existing.notes,
        discountAmount,
        totalAmount,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Order updated successfully.",
      data: order,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, message: "Order update failed." },
      { status: 500 }
    );
  }
}

// ==============================
// CANCEL / DELETE ORDER
// (soft: sets status to CANCELLED and frees the table)
// ==============================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { restaurantId, errorStatus, errorMessage } =
      await requireRestaurantContext();

    if (errorStatus) {
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: errorStatus }
      );
    }

    const { id } = await params;

    const existing = await prisma.order.findFirst({
      where: { id: Number(id), restaurantId: restaurantId! },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Order not found." },
        { status: 404 }
      );
    }

    if (existing.status === "COMPLETED") {
      return NextResponse.json(
        { success: false, message: "Completed orders can't be cancelled." },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: Number(id) },
        data: { status: "CANCELLED" },
      });

      if (existing.tableId) {
        await tx.diningTable.update({
          where: { id: existing.tableId },
          data: { status: "AVAILABLE" },
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: "Order cancelled successfully.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, message: "Order cancellation failed." },
      { status: 500 }
    );
  }
}

// ==============================
// CHANGE ORDER STATUS / RECORD PAYMENT
// Body: { status? , paymentStatus?, paymentMethod? }
// ==============================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, restaurantId, errorStatus, errorMessage } =
      await requireRestaurantContext();

    if (errorStatus) {
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: errorStatus }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.order.findFirst({
      where: { id: Number(id), restaurantId: restaurantId! },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Order not found." },
        { status: 404 }
      );
    }

    if (body.status && !ORDER_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { success: false, message: "Invalid order status." },
        { status: 400 }
      );
    }

    if (body.status && body.status !== existing.status && !STATUS_TRANSITIONS[existing.status]?.includes(body.status)) {
      return NextResponse.json(
        { success: false, message: `Invalid workflow: ${existing.status} cannot move directly to ${body.status}.` },
        { status: 409 }
      );
    }
    if (body.paymentStatus && !PAYMENT_STATUSES.includes(body.paymentStatus)) {
      return NextResponse.json({ success: false, message: "Invalid payment status." }, { status: 400 });
    }
    if (body.paymentMethod && !PAYMENT_METHODS.includes(body.paymentMethod)) {
      return NextResponse.json({ success: false, message: "Invalid payment method." }, { status: 400 });
    }

    if (FINAL_STATUSES.includes(existing.status)) {
      return NextResponse.json(
        { success: false, message: "This order is already closed." },
        { status: 400 }
      );
    }

    // Completing an order requires payment to be recorded.
    if (
      body.status === "COMPLETED" &&
      existing.paymentStatus !== "PAID" &&
      body.paymentStatus !== "PAID"
    ) {
      return NextResponse.json(
        { success: false, message: "Record payment before completing the order." },
        { status: 400 }
      );
    }

    const order = await prisma.$transaction(async (tx) => {
      const willBePaid = (body.paymentStatus ?? existing.paymentStatus) === "PAID";
      if (willBePaid) {
        await deductInventoryForOrder(tx, restaurantId!, existing.id, user?.id, user?.demoSessionId);
      }

      const updated = await tx.order.update({
        where: { id: Number(id) },
        data: {
          status: body.status ?? existing.status,
          paymentStatus: body.paymentStatus ?? existing.paymentStatus,
          paymentMethod: body.paymentMethod ?? existing.paymentMethod,
        },
      });

      if (body.status && FINAL_STATUSES.includes(body.status) && existing.tableId) {
        await tx.diningTable.update({
          where: { id: existing.tableId },
          data: { status: body.status === "COMPLETED" ? "CLEANING" : "AVAILABLE" },
        });
      }

      return updated;
    });

    return NextResponse.json({
      success: true,
      message: "Order updated.",
      data: order,
    });
  } catch (error) {
    console.error(error);

    const demoLimit = getDemoLimitFailure(error);
    if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status });
    return NextResponse.json(
      { success: false, message: "Order status update failed." },
      { status: 500 }
    );
  }
}
