import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireRestaurantContext } from "@/lib/auth";
import { sqlTable } from "@/lib/sql-table";

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;

export async function GET() {
  const context = await requireRestaurantContext();
  if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });

  try {
    const restaurantId = context.restaurantId!;
    const now = new Date();
    const today = startOfDay(now);
    const month = startOfMonth(now);
    const trendStart = new Date(today);
    trendStart.setDate(trendStart.getDate() - 29);
    const [orderCounts, todayOrderCounts, revenue, todayRevenue, monthlyRevenue, monthlyExpenses, counts, tableCounts, reservationsToday, inventoryCounts, lowStock, outOfStock, topSelling, recentOrders, recentReservations, recentPayments, recentExpenses, recentCustomers, unreadNotifications, failedPayments, subscription] = await Promise.all([
      prisma.order.groupBy({ by: ["status"], where: { restaurantId }, _count: { _all: true } }),
      prisma.order.groupBy({ by: ["status"], where: { restaurantId, createdAt: { gte: today } }, _count: { _all: true } }),
      prisma.bill.aggregate({ where: { restaurantId, paymentStatus: "PAID" }, _sum: { grandTotal: true } }),
      prisma.bill.aggregate({ where: { restaurantId, paymentStatus: "PAID", billingDate: { gte: today } }, _sum: { grandTotal: true } }),
      prisma.bill.aggregate({ where: { restaurantId, paymentStatus: "PAID", billingDate: { gte: month } }, _sum: { grandTotal: true } }),
      prisma.expense.aggregate({ where: { restaurantId, status: "PAID", expenseDate: { gte: month } }, _sum: { amount: true } }),
      Promise.all([
        prisma.customer.count({ where: { restaurantId } }),
        prisma.staff.count({ where: { restaurantId, status: "ACTIVE" } }),
        prisma.menuItem.count({ where: { restaurantId, status: "ACTIVE" } }),
        prisma.category.count({ where: { restaurantId, status: "ACTIVE" } }),
        prisma.inventoryItem.count({ where: { restaurantId, status: "ACTIVE" } }),
        prisma.supplier.count({ where: { restaurantId, status: "ACTIVE" } }),
      ]),
      prisma.diningTable.groupBy({ by: ["status"], where: { restaurantId }, _count: { _all: true } }),
      prisma.reservation.count({ where: { restaurantId, reservationAt: { gte: today, lt: new Date(today.getTime() + 86400000) }, status: { not: "CANCELLED" } } }),
      prisma.inventoryItem.count({ where: { restaurantId, currentStock: { lte: 0 } } }),
      prisma.inventoryItem.findMany({ where: { restaurantId, currentStock: { gt: 0 } }, select: { id: true, name: true, sku: true, currentStock: true, minimumStock: true }, orderBy: { name: "asc" }, take: 10 }),
      prisma.inventoryItem.findMany({ where: { restaurantId, currentStock: { lte: 0 } }, select: { id: true, name: true, sku: true, currentStock: true, minimumStock: true }, orderBy: { name: "asc" }, take: 10 }),
      prisma.orderItem.groupBy({ by: ["menuItemId"], where: { order: { restaurantId } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: "desc" } }, take: 5 }),
      prisma.order.findMany({ where: { restaurantId }, select: { id: true, orderNumber: true, status: true, totalAmount: true, createdAt: true, customerName: true }, orderBy: { createdAt: "desc" }, take: 6 }),
      prisma.reservation.findMany({ where: { restaurantId }, select: { id: true, reservationNumber: true, customerName: true, reservationAt: true, status: true }, orderBy: { reservationAt: "desc" }, take: 6 }),
      prisma.paymentTransaction.findMany({ where: { restaurantId }, select: { id: true, transactionId: true, amount: true, status: true, paymentDate: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 6 }),
      prisma.expense.findMany({ where: { restaurantId }, select: { id: true, expenseNumber: true, title: true, amount: true, status: true, expenseDate: true }, orderBy: { expenseDate: "desc" }, take: 6 }),
      prisma.customer.findMany({ where: { restaurantId }, select: { id: true, name: true, phone: true, registrationDate: true }, orderBy: { registrationDate: "desc" }, take: 6 }),
      prisma.notification.count({ where: { restaurantId, isRead: false, OR: [{ recipientId: context.user?.id }, { recipientId: null, targetRole: context.user?.role as never }] } }),
      prisma.paymentTransaction.count({ where: { restaurantId, status: "FAILED" } }),
      prisma.subscription.findUnique({ where: { restaurantId }, select: { expiryDate: true, status: true } }),
    ]);

    const lowStockCount = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${await sqlTable("InventoryItem")} WHERE "restaurantId" = ${restaurantId} AND "currentStock" > 0 AND "currentStock" <= "minimumStock"`);
    const menuIds = topSelling.map((item) => item.menuItemId);
    const menuItems = await prisma.menuItem.findMany({ where: { id: { in: menuIds }, restaurantId }, select: { id: true, name: true } });
    const menuNames = new Map(menuItems.map((item) => [item.id, item.name]));
    const orderStatus = Object.fromEntries(orderCounts.map((item) => [item.status, item._count._all]));
    const tableStatus = Object.fromEntries(tableCounts.map((item) => [item.status, item._count._all]));
    const allTrendBills = await prisma.bill.findMany({ where: { restaurantId, paymentStatus: "PAID", billingDate: { gte: trendStart } }, select: { grandTotal: true, billingDate: true } });
    const allTrendExpenses = await prisma.expense.findMany({ where: { restaurantId, status: "PAID", expenseDate: { gte: trendStart } }, select: { amount: true, expenseDate: true } });
    const trend = new Map<string, { revenue: number; expenses: number }>();
    for (const bill of allTrendBills) { const key = bill.billingDate.toISOString().slice(0, 10); const value = trend.get(key) || { revenue: 0, expenses: 0 }; value.revenue += Number(bill.grandTotal); trend.set(key, value); }
    for (const expense of allTrendExpenses) { const key = expense.expenseDate.toISOString().slice(0, 10); const value = trend.get(key) || { revenue: 0, expenses: 0 }; value.expenses += Number(expense.amount); trend.set(key, value); }

    const totalOrders = orderCounts.reduce((sum, item) => sum + item._count._all, 0);
    const todayOrders = todayOrderCounts.reduce((sum, item) => sum + item._count._all, 0);
    const monthlyProfit = Number(monthlyRevenue._sum.grandTotal || 0) - Number(monthlyExpenses._sum.amount || 0);
    return NextResponse.json({
      success: true,
      data: {
        isDemo: Boolean(context.user?.isDemo),
        orders: { total: totalOrders, today: todayOrders, pending: orderStatus.PENDING || 0, completed: orderStatus.COMPLETED || 0, cancelled: orderStatus.CANCELLED || 0, statuses: orderStatus },
        revenue: { today: money(todayRevenue._sum.grandTotal), monthly: money(monthlyRevenue._sum.grandTotal), total: money(revenue._sum.grandTotal), expenses: money(monthlyExpenses._sum.amount), profit: money(monthlyProfit) },
        counts: { customers: counts[0], staff: counts[1], menuItems: counts[2], categories: counts[3], inventoryItems: counts[4], suppliers: counts[5] },
        tables: { active: (tableStatus.AVAILABLE || 0) + (tableStatus.OCCUPIED || 0) + (tableStatus.RESERVED || 0), occupied: tableStatus.OCCUPIED || 0 },
        reservationsToday,
        inventory: { lowStock: Number(lowStockCount[0]?.count || 0), outOfStock: inventoryCounts, lowStockItems: lowStock.filter((item) => Number(item.currentStock) <= Number(item.minimumStock)), outOfStockItems: outOfStock },
        charts: { trend: [...trend.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, revenue: money(value.revenue), expenses: money(value.expenses) })), orderStatuses: orderStatus, topSelling: topSelling.map((item) => ({ name: menuNames.get(item.menuItemId) || "Unknown item", quantity: item._sum.quantity || 0 })) },
        recent: { orders: recentOrders.map((item) => ({ ...item, totalAmount: money(item.totalAmount) })), reservations: recentReservations, payments: recentPayments.map((item) => ({ ...item, amount: money(item.amount) })), expenses: recentExpenses.map((item) => ({ ...item, amount: money(item.amount) })), customers: recentCustomers },
        alerts: { pendingReservations: await prisma.reservation.count({ where: { restaurantId, status: "PENDING" } }), failedPayments, unreadNotifications, subscriptionExpiry: subscription?.expiryDate || null },
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Failed to load dashboard data." }, { status: 500 });
  }
}
