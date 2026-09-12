import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";
import { assertRecipeStock } from "@/lib/inventory-bom";
import { calculateOrderTotals, getRestaurantTaxConfig } from "@/lib/restaurant-finance";
import { consumeDemoQuota, getDemoLimitFailure } from "@/lib/demo";

// ==============================
// ADD ITEM TO ORDER
// Body: { menuItemId, quantity, notes? }
// ==============================
export async function POST(
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
    if (!user || !["SUPER_ADMIN", "OWNER", "MANAGER", "CASHIER", "WAITER"].includes(user.role)) {
      return NextResponse.json({ success: false, message: "Your role cannot add items to an order." }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

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

    const menuItem = await prisma.menuItem.findFirst({
      where: { id: Number(body.menuItemId), restaurantId: restaurantId! },
    });

    if (!menuItem || menuItem.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, message: "Menu item not found or unavailable." },
        { status: 404 }
      );
    }

    const quantity = Math.max(1, Number(body.quantity) || 1);
    const price = Number(menuItem.price);

    const currentSubtotal = order.items.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0
    );
    const newSubtotal = currentSubtotal + price * quantity;
    const tax = await getRestaurantTaxConfig(restaurantId!);
    const { taxAmount, totalAmount } = calculateOrderTotals(newSubtotal, tax.rate, tax.inclusive, Number(order.discountAmount));

    const updatedOrder = await prisma.$transaction(async (tx) => {
      if (user!.isDemo && user!.demoSessionId) await consumeDemoQuota(tx, user!.demoSessionId, "record");
      await assertRecipeStock(tx, restaurantId!, [{ menuItemId: menuItem.id, quantity }]);
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          menuItemId: menuItem.id,
          nameSnapshot: menuItem.name,
          quantity,
          price,
          notes: body.notes || null,
          status: "PENDING",
        },
      });
      return tx.order.update({
        where: { id: order.id },
        data: { subtotal: newSubtotal, taxAmount, totalAmount },
        include: {
          table: { select: { id: true, name: true } },
          items: { include: { menuItem: { select: { id: true, name: true } } } },
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Item added to order.",
      data: updatedOrder,
    });
  } catch (error) {
    console.error(error);
    const demoLimit = getDemoLimitFailure(error);
    if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status });
    return NextResponse.json(
      { success: false, message: "Failed to add item." },
      { status: 500 }
    );
  }
}
