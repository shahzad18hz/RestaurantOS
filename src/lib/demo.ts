import crypto from "crypto";
import bcrypt from "bcryptjs";
import { demoPrisma as prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { sqlTable } from "./sql-table";

export const DEMO_COOKIE = "restaurantos_demo_device";
export const DEMO_USED_COOKIE = "restaurantos_demo_used";
export const DEMO_DURATION_MINUTES = Math.max(5, Number(process.env.DEMO_DURATION_MINUTES || 60));
export const DEMO_MAX_ORDERS = Math.max(1, Number(process.env.DEMO_MAX_ORDERS || 10));
export const DEMO_MAX_RECORDS = Math.max(1, Number(process.env.DEMO_MAX_RECORDS || 30));
export const DEMO_MAX_CONCURRENT = Math.max(1, Number(process.env.DEMO_MAX_CONCURRENT || 10));
export const DEMO_REQUESTS_PER_MINUTE = Math.max(30, Number(process.env.DEMO_REQUESTS_PER_MINUTE || 240));

export function newDemoDeviceId() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashDemoDevice(value: string) {
  const secret = process.env.DEMO_DEVICE_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("DEMO_DEVICE_SECRET or JWT_SECRET is required.");
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export async function checkDemoStartRateLimit(rawAddress: string) {
  const key = `demo-start:${hashDemoDevice(rawAddress || "unknown")}`;
  const windowMs = 15 * 60_000;
  const limit = Math.max(1, Number(process.env.DEMO_STARTS_PER_IP_WINDOW || 5));
  const now = new Date();
  const bucket = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const bucketedKey = `${key}:${bucket.getTime()}`;
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO ${await sqlTable("DemoRateLimit", "demo")} ("key", "count", "windowStart", "updatedAt")
    VALUES (${bucketedKey}, 1, ${bucket}, ${now})
    ON CONFLICT ("key") DO UPDATE SET "count" = "DemoRateLimit"."count" + 1, "updatedAt" = ${now}
    RETURNING "count"`;
  return Number(rows[0]?.count || 0) <= limit;
}

export async function checkDemoRequestRateLimit(sessionId: string) {
  const now = new Date();
  const bucket = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const key = `demo-request:${sessionId}:${bucket.getTime()}`;
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO ${await sqlTable("DemoRateLimit", "demo")} ("key", "count", "windowStart", "updatedAt")
    VALUES (${key}, 1, ${bucket}, ${now})
    ON CONFLICT ("key") DO UPDATE SET "count" = "DemoRateLimit"."count" + 1, "updatedAt" = ${now}
    RETURNING "count"`;
  return Number(rows[0]?.count || 0) <= DEMO_REQUESTS_PER_MINUTE;
}

export function findDemoSession(browserHash: string) {
  return prisma.demoSession.findUnique({ where: { browserHash } });
}

async function seedDemoWorkspace(tx: Prisma.TransactionClient, suffix: string) {
  const password = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
  const user = await tx.user.create({
    data: { name: "Demo Manager", email: `demo-${suffix}@example.invalid`, password, role: "MANAGER" },
  });
  const restaurant = await tx.restaurant.create({
    data: {
      name: "Harbour & Hearth — Demo",
      email: `restaurant-${suffix}@example.invalid`,
      phone: "+0000000000",
      address: "Fictional Riverside District",
      description: "Temporary sample workspace. All data is fictional and resets after the demo.",
      status: "ACTIVE",
      users: { create: { userId: user.id, role: "MANAGER" } },
      restaurantSettings: { create: { currency: "PKR", timezone: "Asia/Karachi", taxName: "GST", taxPercentage: 16, receiptHeader: "DEMO RECEIPT — NOT A REAL TRANSACTION", receiptFooter: "Sample output only", emailNotifications: false, smsNotifications: false, pushNotifications: false } },
    },
  });

  const categories = await Promise.all([
    tx.category.create({ data: { restaurantId: restaurant.id, name: "Signature Plates", description: "Kitchen favourites", sortOrder: 10 } }),
    tx.category.create({ data: { restaurantId: restaurant.id, name: "Small Plates", description: "Starters and sides", sortOrder: 20 } }),
    tx.category.create({ data: { restaurantId: restaurant.id, name: "Drinks", description: "Freshly prepared beverages", sortOrder: 30 } }),
  ]);
  const inventory = await Promise.all([
    ["Chicken Breast", "DEMO-CHK", "kg", 18, 4, 780], ["Basmati Rice", "DEMO-RCE", "kg", 25, 6, 420],
    ["Tomatoes", "DEMO-TOM", "kg", 12, 3, 180], ["Cooking Oil", "DEMO-OIL", "litre", 14, 4, 520],
    ["Potatoes", "DEMO-POT", "kg", 20, 5, 150], ["Coffee Beans", "DEMO-COF", "kg", 7, 2, 2200],
  ].map(([name, sku, unit, currentStock, minimumStock, purchasePrice]) => tx.inventoryItem.create({ data: { restaurantId: restaurant.id, name: String(name), sku: String(sku), unit: String(unit), currentStock: Number(currentStock), minimumStock: Number(minimumStock), purchasePrice: Number(purchasePrice), status: "ACTIVE" } })));
  const menu = await Promise.all([
    ["Herb Chicken & Rice", 1450, 0, 25], ["Charred Tomato Pasta", 1250, 0, 22],
    ["Crispy Potato Bites", 650, 1, 14], ["Garden Tomato Salad", 550, 1, 10],
    ["House Cold Coffee", 620, 2, 8], ["Sparkling Citrus", 480, 2, 5],
  ].map(([name, price, categoryIndex, preparationTime], index) => tx.menuItem.create({ data: { restaurantId: restaurant.id, categoryId: categories[Number(categoryIndex)].id, name: String(name), description: "Fictional demo menu item", price: Number(price), preparationTime: Number(preparationTime), isVeg: index !== 0, sortOrder: index + 1 } })));
  await tx.recipeIngredient.createMany({ data: [
    { menuItemId: menu[0].id, inventoryItemId: inventory[0].id, quantity: 0.25 },
    { menuItemId: menu[0].id, inventoryItemId: inventory[1].id, quantity: 0.18 },
    { menuItemId: menu[0].id, inventoryItemId: inventory[3].id, quantity: 0.03 },
    { menuItemId: menu[1].id, inventoryItemId: inventory[2].id, quantity: 0.16 },
    { menuItemId: menu[1].id, inventoryItemId: inventory[3].id, quantity: 0.02 },
    { menuItemId: menu[2].id, inventoryItemId: inventory[4].id, quantity: 0.22 },
    { menuItemId: menu[4].id, inventoryItemId: inventory[5].id, quantity: 0.025 },
  ] });
  const tables = await Promise.all(Array.from({ length: 8 }, (_, index) => tx.diningTable.create({ data: { restaurantId: restaurant.id, name: `Table ${index + 1}`, capacity: index < 4 ? 2 : 4, location: index < 4 ? "Window" : "Main floor" } })));
  const customers = await Promise.all([
    ["Ayesha Khan", "+0000000101"], ["Omar Siddiqui", "+0000000102"], ["Sara Ahmed", "+0000000103"],
  ].map(([name, phone], index) => tx.customer.create({ data: { restaurantId: restaurant.id, customerCode: `DEMO-C${index + 1}`, name, phone, email: `customer${index + 1}@example.invalid` } })));
  await tx.reservation.create({ data: { restaurantId: restaurant.id, reservationNumber: `DEMO-RSV-${suffix}`, customerName: customers[0].name, customerPhone: customers[0].phone, customerId: customers[0].id, tableId: tables[4].id, guests: 4, reservationAt: new Date(Date.now() + 2 * 60 * 60 * 1000), status: "CONFIRMED", notes: "Fictional demo booking" } });
  const historic = await tx.order.create({ data: { restaurantId: restaurant.id, orderNumber: `DEMO-ORD-${suffix}`, tableId: tables[1].id, type: "DINE_IN", status: "COMPLETED", paymentStatus: "PAID", paymentMethod: "CASH", customerName: customers[1].name, subtotal: 2070, taxAmount: 331.2, totalAmount: 2401.2, inventoryDeductedAt: new Date(), createdBy: user.id, items: { create: [
    { menuItemId: menu[0].id, nameSnapshot: menu[0].name, quantity: 1, price: menu[0].price, status: "SERVED" },
    { menuItemId: menu[4].id, nameSnapshot: menu[4].name, quantity: 1, price: menu[4].price, status: "SERVED" },
  ] } } });
  await tx.bill.create({ data: { restaurantId: restaurant.id, orderId: historic.id, billNumber: `DEMO-INV-${suffix}`, subtotal: 2070, taxAmount: 331.2, grandTotal: 2401.2, paymentStatus: "PAID", paymentMethod: "CASH", notes: "DEMO / SAMPLE — no payment collected", createdById: user.id } });
  return { user, restaurant };
}

export async function provisionDemo(browserHash: string) {
  return prisma.$transaction(async (tx) => {
    // One lock protects this browser claim; the second protects global capacity.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${browserHash}, 0))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(76009101)`;
    const now = new Date();
    const existing = await tx.demoSession.findUnique({ where: { browserHash } });

    if (existing?.status === "ACTIVE" && existing.expiresAt && existing.expiresAt > now && existing.userId && existing.restaurantId) {
      return existing;
    }
    if (existing && (existing.startedAt || existing.status === "EXPIRED" || String(existing.status) === "CLEANING" || existing.status === "CLEANUP_FAILED")) {
      if (existing.status === "ACTIVE") await tx.demoSession.update({ where: { id: existing.id }, data: { status: "EXPIRED" } });
      throw Object.assign(new Error("This browser's demo session has ended."), { code: "DEMO_USED" });
    }

    // A committed fresh PROVISIONING row belongs to another worker. A stale row
    // is safe to recover because a real provisioning transaction is never
    // committed until its workspace and ACTIVE state are both ready.
    if (existing?.status === "PROVISIONING" && now.getTime() - existing.updatedAt.getTime() < 2 * 60_000) {
      throw Object.assign(new Error("Your demo workspace is still being prepared. Please retry shortly."), { code: "DEMO_PROVISIONING" });
    }
    if (existing?.restaurantId) await tx.restaurant.deleteMany({ where: { id: existing.restaurantId, demoSession: { id: existing.id } } });
    if (existing?.userId) await tx.user.deleteMany({ where: { id: existing.userId, demoSession: { id: existing.id } } });
    if (existing) await tx.demoSession.delete({ where: { id: existing.id } });

    const active = await tx.demoSession.count({ where: { status: "ACTIVE", expiresAt: { gt: now } } });
    if (active >= DEMO_MAX_CONCURRENT) throw Object.assign(new Error("All demo spaces are currently in use. Please try again shortly."), { code: "DEMO_CAPACITY" });

    const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
    const { user, restaurant } = await seedDemoWorkspace(tx, suffix);
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + DEMO_DURATION_MINUTES * 60_000);
    return tx.demoSession.create({ data: { browserHash, status: "ACTIVE", userId: user.id, restaurantId: restaurant.id, startedAt, expiresAt, lastSeenAt: startedAt } });
  }, { timeout: 30_000 });
}

export async function consumeDemoQuota(tx: Prisma.TransactionClient, sessionId: string, kind: "order" | "record", amount = 1) {
  const where = kind === "order"
    ? { id: sessionId, status: "ACTIVE" as const, expiresAt: { gt: new Date() }, createdOrders: { lte: DEMO_MAX_ORDERS - amount }, createdRecords: { lte: DEMO_MAX_RECORDS - amount } }
    : { id: sessionId, status: "ACTIVE" as const, expiresAt: { gt: new Date() }, createdRecords: { lte: DEMO_MAX_RECORDS - amount } };
  const data = kind === "order"
    ? { createdOrders: { increment: amount }, createdRecords: { increment: amount }, lastSeenAt: new Date() }
    : { createdRecords: { increment: amount }, lastSeenAt: new Date() };
  const result = await tx.demoSession.updateMany({ where, data });
  if (!result.count) throw Object.assign(new Error("This demo has reached its creation limit. Existing sample data is still available to explore."), { code: "DEMO_LIMIT_REACHED" });
}

export function getDemoLimitFailure(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "DEMO_LIMIT_REACHED") {
    return { status: 429, body: { success: false, code: "DEMO_LIMIT_REACHED", message: error instanceof Error ? error.message : "This demo has reached its creation limit." } } as const;
  }
  return null;
}

export async function cleanupExpiredDemos() {
  const now = new Date();
  const stale = new Date(now.getTime() - 5 * 60_000);
  const sessions = await prisma.demoSession.findMany({ where: { cleanedAt: null, OR: [
    { status: "ACTIVE", expiresAt: { lte: now } },
    { status: { in: ["EXPIRED", "CLEANUP_FAILED"] }, OR: [{ restaurantId: { not: null } }, { userId: { not: null } }] },
    { status: "PROVISIONING", updatedAt: { lte: stale } },
    { status: "CLEANING" as never, updatedAt: { lte: stale } },
  ] }, orderBy: { updatedAt: "asc" }, take: 25 });
  let cleaned = 0;
  for (const session of sessions) {
    try {
      const claimed = await prisma.demoSession.updateMany({ where: { id: session.id, cleanedAt: null, status: session.status, updatedAt: session.updatedAt }, data: { status: "CLEANING" as never, cleanupError: null } });
      if (!claimed.count) continue;
      await prisma.$transaction(async (tx) => {
        if (session.restaurantId) await tx.restaurant.deleteMany({ where: { id: session.restaurantId, demoSession: { id: session.id } } });
        if (session.userId) await tx.user.deleteMany({ where: { id: session.userId, demoSession: { id: session.id } } });
        await tx.demoSession.update({ where: { id: session.id }, data: { status: "EXPIRED", restaurantId: null, userId: null, cleanedAt: new Date(), cleanupError: null } });
      });
      cleaned++;
    } catch (error) {
      await prisma.demoSession.update({ where: { id: session.id }, data: { status: "CLEANUP_FAILED", cleanupError: error instanceof Error ? error.message.slice(0, 500) : "Unknown cleanup error" } });
    }
  }
  await prisma.demoRateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } });
  return { inspected: sessions.length, cleaned };
}
