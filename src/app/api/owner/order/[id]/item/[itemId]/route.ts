import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";
import { calculateOrderTotals, getRestaurantTaxConfig } from "@/lib/restaurant-finance";
import { writeAuditLog } from "@/lib/audit";

const ITEM_STATUSES = ["PENDING", "PREPARING", "READY", "SERVED", "CANCELLED"];
const ITEM_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED"],
};

// ==============================
// UPDATE ITEM STATUS (Kitchen Display System)
// Body: { status }
// ==============================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
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
    if (!user || !["SUPER_ADMIN", "OWNER", "MANAGER", "CHEF"].includes(user.role)) {
      return NextResponse.json({ success: false, message: "Your role cannot update kitchen item status." }, { status: 403 });
    }

    const { id, itemId } = await params;
    const body = await request.json();

    if (!ITEM_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { success: false, message: "Invalid item status." },
        { status: 400 }
      );
    }

    const order = await prisma.order.findFirst({
      where: { id: Number(id), restaurantId: restaurantId! },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found." },
        { status: 404 }
      );
    }

    const item = order.items.find((i) => i.id === Number(itemId));

    if (!item) {
      return NextResponse.json(
        { success: false, message: "Order item not found." },
        { status: 404 }
      );
    }

    if (body.status !== item.status && !ITEM_TRANSITIONS[item.status]?.includes(body.status)) {
      return NextResponse.json(
        { success: false, message: `Invalid kitchen workflow: ${item.status} cannot move directly to ${body.status}.` },
        { status: 409 }
      );
    }

    const updatedItem = await prisma.orderItem.update({
      where: { id: item.id },
      data: { status: body.status },
    });

    // If every item is READY (or beyond), auto-bump the order to READY.
    // If the order is still PENDING and an item starts PREPARING, confirm it.
    const siblings = order.items.map((i) => (i.id === item.id ? updatedItem : i));
    const rank: Record<string, number> = {
      PENDING: 0,
      PREPARING: 1,
      READY: 2,
      SERVED: 3,
      CANCELLED: 3,
    };
    const active = siblings.filter((i) => i.status !== "CANCELLED");
    const minRank = active.length
      ? Math.min(...active.map((i) => rank[i.status]))
      : 0;

    let nextOrderStatus: string | null = null;
    if (order.status === "PENDING" && minRank >= 1) nextOrderStatus = "CONFIRMED";
    if (["PENDING", "CONFIRMED"].includes(order.status) && minRank >= 1)
      nextOrderStatus = "PREPARING";
    if (minRank >= 2 && order.status !== "SERVED" && order.status !== "COMPLETED")
      nextOrderStatus = "READY";

    if (nextOrderStatus && nextOrderStatus !== order.status) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: nextOrderStatus as never },
      });
    }

    await writeAuditLog({ restaurantId: restaurantId!, actorId: user!.id, action: "KITCHEN_ITEM_STATUS", entity: "OrderItem", entityId: updatedItem.id, details: { orderId: Number(id), status: body.status } });
    return NextResponse.json({
      success: true,
      message: "Item status updated.",
      data: updatedItem,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, message: "Failed to update item status." },
      { status: 500 }
    );
  }
}

// ==============================
// REMOVE ITEM FROM ORDER
// ==============================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
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
    if (!user || !["SUPER_ADMIN", "OWNER", "MANAGER", "CASHIER", "WAITER"].includes(user.role)) {
      return NextResponse.json({ success: false, message: "Your role cannot remove order items." }, { status: 403 });
    }

    const { id, itemId } = await params;

    const order = await prisma.order.findFirst({
      where: { id: Number(id), restaurantId: restaurantId! },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found." },
        { status: 404 }
      );
    }

    if (["COMPLETED", "CANCELLED"].includes(order.status)) {
      return NextResponse.json(
        { success: false, message: "This order is closed." },
        { status: 400 }
      );
    }

    const item = order.items.find((i) => i.id === Number(itemId));

    if (!item) {
      return NextResponse.json(
        { success: false, message: "Order item not found." },
        { status: 404 }
      );
    }

    if (order.items.length === 1) {
      return NextResponse.json(
        {
          success: false,
          message: "An order needs at least one item — cancel the order instead.",
        },
        { status: 400 }
      );
    }

    const remainingSubtotal = order.items
      .filter((i) => i.id !== item.id)
      .reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);

    const tax = await getRestaurantTaxConfig(restaurantId!);
    const { taxAmount, totalAmount } = calculateOrderTotals(remainingSubtotal, tax.rate, tax.inclusive, Number(order.discountAmount));

    await prisma.$transaction([
      prisma.orderItem.delete({ where: { id: item.id } }),
      prisma.order.update({
        where: { id: order.id },
        data: { subtotal: remainingSubtotal, taxAmount, totalAmount },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Item removed from order.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, message: "Failed to remove item." },
      { status: 500 }
    );
  }
}
