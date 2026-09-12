import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";
import { assertRecipeStock } from "@/lib/inventory-bom";
import { calculateOrderTotals, getRestaurantTaxConfig } from "@/lib/restaurant-finance";
import { writeAuditLog } from "@/lib/audit";
import { consumeDemoQuota, getDemoLimitFailure } from "@/lib/demo";

function generateOrderNumber(restaurantId: number) {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 900 + 100);
  return `ORD-${restaurantId}-${stamp}${rand}`;
}

// ==============================
// GET ALL ORDERS
// (optional ?status=, ?type=, ?tableId=)
// ==============================
export async function GET(request: NextRequest) {
  try {
    const { restaurantId, errorStatus, errorMessage } =
      await requireRestaurantContext();

    if (errorStatus) {
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: errorStatus }
      );
    }

    const status = request.nextUrl.searchParams.get("status");
    const type = request.nextUrl.searchParams.get("type");
    const tableId = request.nextUrl.searchParams.get("tableId");

    const orders = await prisma.order.findMany({
      where: {
        restaurantId: restaurantId!,
        ...(status ? { status: status as never } : {}),
        ...(type ? { type: type as never } : {}),
        ...(tableId ? { tableId: Number(tableId) } : {}),
      },
      include: {
        table: { select: { id: true, name: true } },
        items: {
          include: { menuItem: { select: { id: true, name: true, image: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: orders });
  } catch (error) {
    console.error(error);
    const demoLimit = getDemoLimitFailure(error);
    if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status });

    return NextResponse.json(
      { success: false, message: "Failed to fetch orders." },
      { status: 500 }
    );
  }
}

// ==============================
// CREATE ORDER
// Body: { tableId?, type, customerName?, customerPhone?, notes?,
//         items: [{ menuItemId, quantity, notes? }] }
// ==============================
export async function POST(request: NextRequest) {
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
      return NextResponse.json({ success: false, message: "Your role cannot create POS orders." }, { status: 403 });
    }

    const body = await request.json();

    const items: { menuItemId: number; quantity: number; notes?: string }[] =
      body.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, message: "At least one item is required." },
        { status: 400 }
      );
    }

    if (items.length > 100) {
      return NextResponse.json({ success: false, message: "An order can contain at most 100 item lines." }, { status: 400 });
    }
    if (items.some(item => !item || !Number.isSafeInteger(Number(item.menuItemId)) || Number(item.menuItemId) <= 0 || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) <= 0)) {
      return NextResponse.json({ success: false, message: "Every item requires a valid menu item and a positive whole-number quantity." }, { status: 400 });
    }

    const type = ["DINE_IN", "TAKEAWAY", "DELIVERY"].includes(body.type)
      ? body.type
      : "DINE_IN";

    if (type === "DINE_IN" && !body.tableId) {
      return NextResponse.json(
        { success: false, message: "A table is required for dine-in orders." },
        { status: 400 }
      );
    }

    // ---- Validate table belongs to this restaurant & is free ----
    if (body.tableId) {
      const table = await prisma.diningTable.findFirst({
        where: { id: Number(body.tableId), restaurantId: restaurantId! },
      });

      if (!table) {
        return NextResponse.json(
          { success: false, message: "Table not found for this restaurant." },
          { status: 404 }
        );
      }

      if (table.status === "OCCUPIED") {
        const activeOrder = await prisma.order.findFirst({
          where: { tableId: table.id, status: { notIn: ["COMPLETED", "CANCELLED"] } },
        });

        if (activeOrder) {
          return NextResponse.json(
            {
              success: false,
              message: `Table ${table.name} already has an active order (#${activeOrder.orderNumber}).`,
            },
            { status: 400 }
          );
        }
      }
    }

    // ---- Validate & price items from the DB (never trust client price) ----
    const menuItemIds = items.map((i) => Number(i.menuItemId));

    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, restaurantId: restaurantId! },
    });

    if (menuItems.length !== new Set(menuItemIds).size) {
      return NextResponse.json(
        { success: false, message: "One or more menu items are invalid." },
        { status: 400 }
      );
    }

    const unavailable = menuItems.filter((m) => m.status !== "ACTIVE");
    if (unavailable.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `These items are currently unavailable: ${unavailable
            .map((m) => m.name)
            .join(", ")}`,
        },
        { status: 400 }
      );
    }

    let subtotal = 0;
    const orderItemsData = items.map((item) => {
      const menuItem = menuItems.find((m) => m.id === Number(item.menuItemId))!;
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const price = Number(menuItem.price);
      subtotal += price * quantity;

      return {
        menuItemId: menuItem.id,
        nameSnapshot: menuItem.name,
        quantity,
        price,
        notes: item.notes || null,
        status: "PENDING" as const,
      };
    });

    const tax = await getRestaurantTaxConfig(restaurantId!);
    const discountAmount = Math.max(0, Number(body.discountAmount) || 0);
    const { taxAmount, totalAmount } = calculateOrderTotals(subtotal, tax.rate, tax.inclusive, discountAmount);
    const order = await prisma.$transaction(async (tx) => {
      if (user!.isDemo && user!.demoSessionId) {
        await consumeDemoQuota(tx, user!.demoSessionId, "order");
        await consumeDemoQuota(tx, user!.demoSessionId, "record", orderItemsData.length);
      }
      await assertRecipeStock(tx, restaurantId!, orderItemsData.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })));

      const created = await tx.order.create({
        data: {
          restaurantId: restaurantId!,
          orderNumber: generateOrderNumber(restaurantId!),
          tableId: body.tableId ? Number(body.tableId) : null,
          type,
          status: "PENDING",
          paymentStatus: "UNPAID",
          customerName: body.customerName || null,
          customerPhone: body.customerPhone || null,
          subtotal,
          taxAmount,
          discountAmount,
          totalAmount,
          notes: body.notes || null,
          createdBy: user!.id,
          items: { create: orderItemsData },
        },
        include: {
          table: { select: { id: true, name: true } },
          items: { include: { menuItem: { select: { id: true, name: true } } } },
        },
      });

      if (body.tableId) {
        await tx.diningTable.update({
          where: { id: Number(body.tableId) },
          data: { status: "OCCUPIED" },
        });
      }

      return created;
    });

    await writeAuditLog({ restaurantId: restaurantId!, actorId: user!.id, action: "ORDER_CREATED", entity: "Order", entityId: order.id, details: { orderNumber: order.orderNumber, type: order.type, totalAmount: Number(order.totalAmount) } });
    return NextResponse.json({
      success: true,
      message: "Order created successfully.",
      data: order,
    });
  } catch (error) {
    console.error(error);

    const demoLimit = getDemoLimitFailure(error);
    if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status });
    return NextResponse.json(
      { success: false, message: "Order creation failed." },
      { status: 500 }
    );
  }
}
