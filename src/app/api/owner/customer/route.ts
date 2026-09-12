import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";
import { consumeDemoQuota, getDemoLimitFailure } from "@/lib/demo";

const STATUSES = ["ACTIVE", "INACTIVE", "BLOCKED", "VIP"] as const;
const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
function customerCode(restaurantId: number) { return `CUS-${restaurantId}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`; }
function validDate(value: unknown) { if (!value) return null; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? null : date; }

async function stats(restaurantId: number, customer: { id: number; phone: string }) {
  const [orders, reservations] = await Promise.all([
    prisma.order.findMany({ where: { restaurantId, customerPhone: customer.phone, status: { not: "CANCELLED" } }, include: { bill: { select: { grandTotal: true, paymentStatus: true } }, items: { select: { nameSnapshot: true, quantity: true, menuItem: { select: { category: { select: { name: true } } } } } } }, orderBy: { createdAt: "desc" } }),
    prisma.reservation.count({ where: { restaurantId, customerId: customer.id, status: { not: "CANCELLED" } } }),
  ]);
  const spending = orders.reduce((sum, order) => sum + Number(order.bill?.grandTotal ?? order.totalAmount), 0);
  const items = new Map<string, number>(); const categories = new Map<string, number>();
  for (const order of orders) for (const item of order.items) { items.set(item.nameSnapshot, (items.get(item.nameSnapshot) || 0) + item.quantity); const category = item.menuItem.category?.name; if (category) categories.set(category, (categories.get(category) || 0) + item.quantity); }
  const favourite = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { totalOrders: orders.length, totalReservations: reservations, totalSpending: spending, averageOrderValue: orders.length ? spending / orders.length : 0, lastVisit: orders[0]?.createdAt || null, favouriteItem: favourite(items), favouriteCategory: favourite(categories) };
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireRestaurantContext(); if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    const p = request.nextUrl.searchParams; const page = Math.max(1, Number(p.get("page")) || 1); const pageSize = Math.min(50, Math.max(1, Number(p.get("pageSize")) || 10)); const search = p.get("search")?.trim() || ""; const status = p.get("status");
    const where = { restaurantId: context.restaurantId!, ...(STATUSES.includes(status as (typeof STATUSES)[number]) ? { status: status as (typeof STATUSES)[number] } : {}), ...(search ? { OR: [{ customerCode: { contains: search, mode: "insensitive" as const } }, { name: { contains: search, mode: "insensitive" as const } }, { phone: { contains: search, mode: "insensitive" as const } }, { email: { contains: search, mode: "insensitive" as const } }] } : {}) };
    const [customers, total] = await Promise.all([prisma.customer.findMany({ where, orderBy: p.get("sort") === "recent" ? { createdAt: "desc" } : { name: "asc" }, skip: (page - 1) * pageSize, take: pageSize }), prisma.customer.count({ where })]);
    const data = await Promise.all(customers.map(async customer => ({ ...customer, stats: await stats(context.restaurantId!, customer) })));
    return NextResponse.json({ success: true, data, meta: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
  } catch (error) { console.error(error); return NextResponse.json({ success: false, message: "Failed to fetch customers." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireRestaurantContext(); if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus }); const body = await request.json();
    if (!body.name?.trim() || !body.phone?.trim()) return NextResponse.json({ success: false, message: "Name and phone are required." }, { status: 400 });
    const duplicate = await prisma.customer.findFirst({ where: { restaurantId: context.restaurantId!, OR: [{ phone: body.phone.trim() }, ...(body.email?.trim() ? [{ email: body.email.trim().toLowerCase() }] : [])] } }); if (duplicate) return NextResponse.json({ success: false, message: "Phone or email is already registered." }, { status: 409 });
    const customer = await prisma.$transaction(async (tx) => {
      if (context.user!.isDemo && context.user!.demoSessionId) await consumeDemoQuota(tx, context.user!.demoSessionId, "record");
      return tx.customer.create({ data: { restaurantId: context.restaurantId!, customerCode: customerCode(context.restaurantId!), name: body.name.trim(), profileImage: body.profileImage || null, phone: body.phone.trim(), email: body.email?.trim().toLowerCase() || null, dateOfBirth: validDate(body.dateOfBirth), gender: GENDERS.includes(body.gender) ? body.gender : null, address: body.address?.trim() || null, city: body.city?.trim() || null, notes: body.notes?.trim() || null, registrationDate: validDate(body.registrationDate) || new Date(), status: STATUSES.includes(body.status) ? body.status : "ACTIVE" } });
    });
    return NextResponse.json({ success: true, message: "Customer created successfully.", data: customer });
  } catch (error) { console.error(error); const demoLimit = getDemoLimitFailure(error); if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status }); return NextResponse.json({ success: false, message: "Customer creation failed." }, { status: 500 }); }
}
