import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";
import { deductInventoryForOrder } from "@/lib/inventory-bom";
import { getRestaurantTaxConfig } from "@/lib/restaurant-finance";
import { consumeDemoQuota, getDemoLimitFailure } from "@/lib/demo";

const PAYMENT_STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "REFUNDED", "CANCELLED"] as const;
const PAYMENT_METHODS = ["CASH", "CARD", "ONLINE", "WALLET"] as const;

function billNumber(restaurantId: number) {
  return `INV-${restaurantId}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireRestaurantContext();
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!context.user || !["SUPER_ADMIN", "OWNER", "MANAGER", "CASHIER"].includes(context.user.role)) return NextResponse.json({ success: false, message: "Your role cannot access billing." }, { status: 403 });
    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page")) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(params.get("pageSize")) || 10));
    const search = params.get("search")?.trim() || "";
    const status = params.get("status");
    const sort = params.get("sort") === "total" ? { grandTotal: "desc" as const } : { billingDate: "desc" as const };
    const where = {
      restaurantId: context.restaurantId!,
      ...(status && PAYMENT_STATUSES.includes(status as (typeof PAYMENT_STATUSES)[number]) ? { paymentStatus: status as (typeof PAYMENT_STATUSES)[number] } : {}),
      ...(search ? { OR: [
        { billNumber: { contains: search, mode: "insensitive" as const } },
        { order: { orderNumber: { contains: search, mode: "insensitive" as const } } },
        { order: { customerName: { contains: search, mode: "insensitive" as const } } },
      ] } : {}),
    };
    const [bills, total, orders] = await Promise.all([
      prisma.bill.findMany({
        where, include: {
          order: { include: { table: { select: { id: true, name: true } }, items: { select: { id: true, nameSnapshot: true, quantity: true, price: true } } } },
          createdBy: { select: { id: true, name: true } },
          payments: { orderBy: { createdAt: "asc" } },
        }, orderBy: sort, skip: (page - 1) * pageSize, take: pageSize,
      }),
      prisma.bill.count({ where }),
      prisma.order.findMany({
        where: { restaurantId: context.restaurantId!, status: { not: "CANCELLED" }, bill: null },
        include: { table: { select: { id: true, name: true } }, items: { select: { id: true, nameSnapshot: true, quantity: true, price: true } } },
        orderBy: { createdAt: "desc" }, take: 100,
      }),
    ]);
    return NextResponse.json({ success: true, data: bills, orders, meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Failed to fetch billing records." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireRestaurantContext();
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!context.user || !["SUPER_ADMIN", "OWNER", "MANAGER", "CASHIER"].includes(context.user.role)) return NextResponse.json({ success: false, message: "Your role cannot access billing." }, { status: 403 });
    const body = await request.json();
    const orderId = Number(body.orderId);
    if (!Number.isInteger(orderId)) return NextResponse.json({ success: false, message: "An order is required." }, { status: 400 });
    const order = await prisma.order.findFirst({ where: { id: orderId, restaurantId: context.restaurantId! }, include: { bill: true } });
    if (!order) return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
    if (order.bill) return NextResponse.json({ success: false, message: `This order already has bill #${order.bill.billNumber}.` }, { status: 409 });
    const serviceCharges = Math.max(0, Number(body.serviceCharges) || 0);
    const deliveryCharges = Math.max(0, Number(body.deliveryCharges) || 0);
    const discountAmount = Math.max(0, Number(body.discountAmount ?? order.discountAmount) || 0);
    const subtotal = Number(order.subtotal);
    const taxAmount = Number(order.taxAmount);
    const tax = await getRestaurantTaxConfig(context.restaurantId!);
    const taxableBase = tax.inclusive ? subtotal : subtotal + taxAmount;
    const grandTotal = Math.max(0, taxableBase + serviceCharges + deliveryCharges - discountAmount);
    const paymentStatus = PAYMENT_STATUSES.includes(body.paymentStatus) ? body.paymentStatus : "UNPAID";
    const paymentMethod = PAYMENT_METHODS.includes(body.paymentMethod) ? body.paymentMethod : null;
    const bill = await prisma.$transaction(async (tx) => {
      if (context.user!.isDemo && context.user!.demoSessionId) await consumeDemoQuota(tx, context.user!.demoSessionId, "record");
      const created = await tx.bill.create({ data: {
        restaurantId: context.restaurantId!, orderId, billNumber: billNumber(context.restaurantId!), subtotal,
        discountAmount, taxAmount, serviceCharges, deliveryCharges, grandTotal, paymentStatus, paymentMethod,
        notes: body.notes?.trim() || null, createdById: context.user!.id,
      }, include: { order: { include: { table: true, items: true } } } });
      if (paymentStatus === "PAID") {
        await deductInventoryForOrder(tx, context.restaurantId!, orderId, context.user!.id, context.user!.demoSessionId);
        await tx.order.update({ where: { id: orderId }, data: { paymentStatus: "PAID", paymentMethod, status: "COMPLETED" } });
        if (order.tableId) await tx.diningTable.update({ where: { id: order.tableId }, data: { status: "CLEANING" } });
      }
      return created;
    });
    return NextResponse.json({ success: true, message: "Bill generated successfully.", data: bill });
  } catch (error) {
    console.error(error);
    const demoLimit = getDemoLimitFailure(error);
    if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status });
    return NextResponse.json({ success: false, message: "Bill generation failed." }, { status: 500 });
  }
}
