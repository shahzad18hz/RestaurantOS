import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";

function startOfDay(date: Date) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value; }
function endOfDay(date: Date) { const value = new Date(date); value.setHours(23, 59, 59, 999); return value; }
function money(value: number) { return Math.round(value * 100) / 100; }
function dateKey(value: Date) { return value.toISOString().slice(0, 10); }
function range(value: string | null, fallback: Date) { const parsed = value ? new Date(`${value}T00:00:00`) : fallback; return Number.isNaN(parsed.getTime()) ? fallback : parsed; }

export async function GET(request: NextRequest) {
  try {
    const context = await requireRestaurantContext();
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    const params = request.nextUrl.searchParams;
    const now = new Date();
    const from = startOfDay(range(params.get("from"), new Date(now.getTime() - 29 * 86400000)));
    const to = endOfDay(range(params.get("to"), now));
    if (from > to) return NextResponse.json({ success: false, message: "The start date must be before the end date." }, { status: 400 });
    const restaurantId = context.restaurantId!;
    const period = { gte: from, lte: to };
    const [bills, orders, customers, reservations, inventory, movements, staff] = await Promise.all([
      prisma.bill.findMany({ where: { restaurantId, billingDate: period }, select: { grandTotal: true, paymentStatus: true, billingDate: true, order: { select: { type: true, customerName: true, customerPhone: true } } } }),
      prisma.order.findMany({ where: { restaurantId, createdAt: period }, select: { id: true, status: true, type: true, totalAmount: true, customerName: true, customerPhone: true, createdAt: true } }),
      prisma.customer.findMany({ where: { restaurantId, registrationDate: period }, select: { id: true, name: true, phone: true, registrationDate: true, status: true } }),
      prisma.reservation.findMany({ where: { restaurantId, reservationAt: period }, select: { status: true, reservationAt: true } }),
      prisma.inventoryItem.findMany({ where: { restaurantId }, select: { id: true, name: true, sku: true, currentStock: true, minimumStock: true, status: true } }),
      prisma.stockMovement.findMany({ where: { restaurantId, createdAt: period }, select: { type: true, quantity: true, createdAt: true, inventoryItem: { select: { name: true, sku: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
      prisma.staff.groupBy({ by: ["department", "status"], where: { restaurantId }, _count: { _all: true } }),
    ]);
    const revenue = bills.filter(b => b.paymentStatus !== "CANCELLED").reduce((sum, b) => sum + Number(b.grandTotal), 0);
    const salesByDay = new Map<string, { sales: number; orders: number }>();
    for (const bill of bills) { if (bill.paymentStatus === "CANCELLED") continue; const key = dateKey(bill.billingDate); const current = salesByDay.get(key) || { sales: 0, orders: 0 }; current.sales += Number(bill.grandTotal); current.orders += 1; salesByDay.set(key, current); }
    for (const order of orders) { const key = dateKey(order.createdAt); if (!salesByDay.has(key)) salesByDay.set(key, { sales: 0, orders: 0 }); }
    const salesSeries = [...salesByDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, sales: money(value.sales), orders: value.orders }));
    const by = <T extends string>(values: T[]) => values.reduce<Record<string, number>>((result, value) => { result[value] = (result[value] || 0) + 1; return result; }, {});
    const orderStatuses = by(orders.map(o => o.status)); const orderTypes = by(orders.map(o => o.type)); const reservationStatuses = by(reservations.map(r => r.status));
    const customerPhones = new Map<string, { name: string; orders: number; spending: number }>();
    for (const order of orders) { if (!order.customerPhone) continue; const current = customerPhones.get(order.customerPhone) || { name: order.customerName || "Guest", orders: 0, spending: 0 }; current.orders += 1; current.spending += Number(order.totalAmount); customerPhones.set(order.customerPhone, current); }
    const topCustomers = [...customerPhones.values()].sort((a, b) => b.spending - a.spending).slice(0, 10).map(c => ({ ...c, spending: money(c.spending) }));
    const lowStock = inventory.filter(i => Number(i.currentStock) > 0 && Number(i.currentStock) <= Number(i.minimumStock)); const outOfStock = inventory.filter(i => Number(i.currentStock) <= 0);
    const today = startOfDay(now); const week = startOfDay(new Date(now.getTime() - 6 * 86400000)); const month = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    const totals = (since: Date) => bills.filter(b => b.billingDate >= since && b.billingDate <= now && b.paymentStatus !== "CANCELLED").reduce((sum, b) => sum + Number(b.grandTotal), 0);
    return NextResponse.json({ success: true, range: { from: from.toISOString(), to: to.toISOString() }, data: { summary: { todaySales: money(totals(today)), weeklySales: money(totals(week)), monthlySales: money(totals(month)), totalOrders: orders.length, totalCustomers: await prisma.customer.count({ where: { restaurantId } }), totalReservations: reservations.length, totalRevenue: money(revenue), lowStockItems: lowStock.length }, sales: { revenue: money(revenue), bills: bills.length, series: salesSeries }, orders: { total: orders.length, statuses: orderStatuses, types: orderTypes, pending: orderStatuses.PENDING || 0, completed: orderStatuses.COMPLETED || 0, cancelled: orderStatuses.CANCELLED || 0 }, customers: { newCustomers: customers.length, returningCustomers: topCustomers.filter(c => c.orders > 1).length, top: topCustomers }, inventory: { current: inventory.length, lowStock: lowStock.length, outOfStock: outOfStock.length, movements: movements.map(m => ({ ...m, quantity: Number(m.quantity) })) }, reservations: { total: reservations.length, statuses: reservationStatuses, completed: reservationStatuses.COMPLETED || 0, cancelled: reservationStatuses.CANCELLED || 0, noShow: reservationStatuses.NO_SHOW || 0 }, staff: staff.map(group => ({ department: group.department, status: group.status, count: group._count._all })) } });
  } catch (error) { console.error(error); return NextResponse.json({ success: false, message: "Failed to generate reports." }, { status: 500 }); }
}
