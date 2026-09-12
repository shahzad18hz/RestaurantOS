import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { configureTestDatabase, requireLocalTestApp } from "./test-environment";

const appUrl = process.env.TEST_APP_URL?.replace(/\/$/, "");
const enabled = configureTestDatabase() && Boolean(appUrl);
if (enabled) requireLocalTestApp(appUrl!);
process.env.JWT_SECRET ||= "integration-test-jwt-secret-at-least-32-characters";
process.env.DEMO_DEVICE_SECRET ||= "integration-test-device-secret-at-least-32-characters";
process.env.DEMO_MAX_CONCURRENT ||= "20";

const devices = new Set<string>();
beforeEach(async () => {
  if (!enabled) return;
  const { demoPrisma: prisma } = await import("../src/lib/prisma");
  // These rows are reset only in an explicitly authorized disposable test database.
  await prisma.demoRateLimit.deleteMany({ where: { key: { startsWith: "demo-start:" } } });
});

afterEach(async () => {
  if (!enabled) return;
  const { hashDemoDevice } = await import("../src/lib/demo");
  const { demoPrisma: prisma } = await import("../src/lib/prisma");
  const sessions = await prisma.demoSession.findMany({ where: { browserHash: { in: [...devices].map(hashDemoDevice) } } });
  for (const session of sessions) {
    await prisma.$transaction(async tx => {
      if (session.restaurantId) await tx.restaurant.deleteMany({ where: { id: session.restaurantId, demoSession: { id: session.id } } });
      if (session.userId) await tx.user.deleteMany({ where: { id: session.userId, demoSession: { id: session.id } } });
      await tx.demoSession.delete({ where: { id: session.id } });
    });
  }
  devices.clear();
});

async function start(device: string) {
  devices.add(device);
  const response = await fetch(`${appUrl}/api/demo/start`, { method: "POST", headers: { cookie: `restaurantos_demo_device=${device}` } });
  const body = await response.json();
  if (body.code !== "DEMO_USED") assert.equal(response.status, 200, `Demo fixture failed: ${JSON.stringify(body)}`);
  const token = response.headers.get("set-cookie")?.match(/token=([^;,]+)/)?.[1];
  return { response, body, cookie: `restaurantos_demo_device=${device}; token=${token || ""}` };
}

async function sessionFor(device: string) {
  const { hashDemoDevice } = await import("../src/lib/demo");
  const { demoPrisma: prisma } = await import("../src/lib/prisma");
  return prisma.demoSession.findUniqueOrThrow({ where: { browserHash: hashDemoDevice(device) } });
}

async function login(email: string, password: string) {
  const response = await fetch(`${appUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `127.0.0.${Math.floor(Math.random() * 200) + 1}` }, body: JSON.stringify({ email, password }) });
  const token = response.headers.get("set-cookie")?.match(/token=([^;,]+)/)?.[1];
  return { response, cookie: `token=${token || ""}` };
}

test("five API visitors are isolated and a recognized browser resumes without extending expiry", { skip: !enabled, timeout: 180_000 }, async () => {
  const stamp = Date.now();
  const visitors = await Promise.all(Array.from({ length: 5 }, (_, i) => start(`api-five-${stamp}-${i}`)));
  visitors.forEach(({ response }) => assert.equal(response.status, 200));
  const sessions = await Promise.all(Array.from({ length: 5 }, (_, i) => sessionFor(`api-five-${stamp}-${i}`)));
  assert.equal(new Set(sessions.map(row => row.restaurantId)).size, 5);
  const resumed = await start(`api-five-${stamp}-0`);
  assert.equal(resumed.response.status, 200);
  const after = await sessionFor(`api-five-${stamp}-0`);
  assert.equal(after.id, sessions[0].id);
  assert.equal(after.expiresAt?.getTime(), sessions[0].expiresAt?.getTime());
});

test("authenticated inventory APIs reject foreign category/supplier without writes or quota use", { skip: !enabled, timeout: 180_000 }, async () => {
  const { demoPrisma: prisma } = await import("../src/lib/prisma");
  const stamp = Date.now();
  const [a] = await Promise.all([start(`api-tenant-a-${stamp}`), start(`api-tenant-b-${stamp}`)]);
  const [sa, sb] = await Promise.all([sessionFor(`api-tenant-a-${stamp}`), sessionFor(`api-tenant-b-${stamp}`)]);
  const foreignCategory = await prisma.category.findFirstOrThrow({ where: { restaurantId: sb.restaurantId! } });
  const foreignSupplier = await prisma.supplier.create({ data: { restaurantId: sb.restaurantId!, supplierCode: `SUP-X-${stamp}`, name: `Foreign ${stamp}`, contactPerson: "Test", phone: "000", status: "ACTIVE" } });
  const before = sa.createdRecords;
  const sku = `CROSS-${stamp}`;
  const create = await fetch(`${appUrl}/api/owner/inventory`, { method: "POST", headers: { cookie: a.cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "Blocked", sku, unit: "kg", categoryId: foreignCategory.id, supplierId: foreignSupplier.id }) });
  assert.equal(create.status, 400);
  assert.equal((await create.json()).code, "INVALID_INVENTORY_REFERENCE");
  assert.equal(await prisma.inventoryItem.count({ where: { restaurantId: sa.restaurantId!, sku } }), 0);
  assert.equal((await prisma.demoSession.findUniqueOrThrow({ where: { id: sa.id } })).createdRecords, before);
  const own = await prisma.inventoryItem.findFirstOrThrow({ where: { restaurantId: sa.restaurantId! } });
  const original = { categoryId: own.categoryId, supplierId: own.supplierId, name: own.name };
  const update = await fetch(`${appUrl}/api/owner/inventory/${own.id}`, { method: "PUT", headers: { cookie: a.cookie, "content-type": "application/json" }, body: JSON.stringify({ name: own.name, sku: own.sku, unit: own.unit, minimumStock: own.minimumStock, categoryId: foreignCategory.id, supplierId: foreignSupplier.id }) });
  assert.equal(update.status, 400);
  const unchanged = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: own.id } });
  assert.deepEqual({ categoryId: unchanged.categoryId, supplierId: unchanged.supplierId, name: unchanged.name }, original);
  assert.equal((await prisma.demoSession.findUniqueOrThrow({ where: { id: sa.id } })).createdRecords, before);
});

test("stock movement API enforces atomic record quota and failed requests preserve stock", { skip: !enabled, timeout: 120_000 }, async () => {
  const { DEMO_MAX_RECORDS } = await import("../src/lib/demo");
  const { demoPrisma: prisma } = await import("../src/lib/prisma");
  const device = `api-stock-${Date.now()}`;
  const visitor = await start(device);
  const session = await sessionFor(device);
  const item = await prisma.inventoryItem.findFirstOrThrow({ where: { restaurantId: session.restaurantId! } });
  await prisma.demoSession.update({ where: { id: session.id }, data: { createdRecords: DEMO_MAX_RECORDS - 1 } });
  const request = () => fetch(`${appUrl}/api/owner/inventory/${item.id}`, { method: "POST", headers: { cookie: visitor.cookie, "content-type": "application/json" }, body: JSON.stringify({ type: "STOCK_IN", quantity: 1, reason: "quota test" }) });
  const responses = await Promise.all([request(), request()]);
  assert.deepEqual(responses.map(row => row.status).sort(), [200, 429]);
  const limited = responses.find(row => row.status === 429)!;
  assert.equal((await limited.json()).code, "DEMO_LIMIT_REACHED");
  assert.equal((await prisma.demoSession.findUniqueOrThrow({ where: { id: session.id } })).createdRecords, DEMO_MAX_RECORDS);
  assert.equal(await prisma.stockMovement.count({ where: { inventoryItemId: item.id, reason: "quota test" } }), 1);
});

test("expired API session cannot read/write, open kitchen stream closes, and browser is used", { skip: !enabled, timeout: 30_000 }, async () => {
  const { demoPrisma: prisma } = await import("../src/lib/prisma");
  const device = `api-expiry-${Date.now()}`;
  const visitor = await start(device);
  const session = await sessionFor(device);
  const stream = await fetch(`${appUrl}/api/owner/kitchen/stream`, { headers: { cookie: visitor.cookie } });
  assert.equal(stream.status, 200);
  await prisma.demoSession.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() - 1), status: "ACTIVE" } });
  assert.equal((await fetch(`${appUrl}/api/owner/inventory`, { headers: { cookie: visitor.cookie } })).status, 401);
  assert.equal((await fetch(`${appUrl}/api/owner/inventory`, { method: "POST", headers: { cookie: visitor.cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "Expired", sku: "EXPIRED", unit: "kg" }) })).status, 401);
  const reader = stream.body!.getReader();
  let closed = false;
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) { const chunk = await reader.read(); if (chunk.done) { closed = true; break; } }
  assert.equal(closed, true);
  const used = await start(device);
  assert.equal(used.response.status, 410);
  assert.equal(used.body.code, "DEMO_USED");
});

test("concurrent stock movements preserve totals and insufficient stock rolls back quota", { skip: !enabled, timeout: 120_000 }, async () => {
  const { demoPrisma: prisma } = await import("../src/lib/prisma");
  const device = `api-stock-concurrent-${Date.now()}`;
  const visitor = await start(device);
  const session = await sessionFor(device);
  const item = await prisma.inventoryItem.findFirstOrThrow({ where: { restaurantId: session.restaurantId! } });
  await prisma.inventoryItem.update({ where: { id: item.id }, data: { currentStock: 10 } });
  const move = (type: string, quantity: number) => fetch(`${appUrl}/api/owner/inventory/${item.id}`, {
    method: "POST", headers: { cookie: visitor.cookie, "content-type": "application/json" },
    body: JSON.stringify({ type, quantity, reason: "concurrent regression" }),
  });
  const additions = await Promise.all([move("STOCK_IN", 1), move("STOCK_IN", 1)]);
  assert.deepEqual(additions.map(r => r.status), [200, 200]);
  assert.equal(Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock), 12);
  const movements = await prisma.stockMovement.findMany({ where: { inventoryItemId: item.id, reason: "concurrent regression" }, orderBy: { id: "asc" } });
  assert.deepEqual(movements.map(m => [Number(m.previousStock), Number(m.newStock)]), [[10, 11], [11, 12]]);
  const removals = await Promise.all([move("STOCK_OUT", 8), move("STOCK_OUT", 8)]);
  assert.deepEqual(removals.map(r => r.status).sort(), [200, 400]);
  assert.equal(Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock), 4);
  assert.equal((await prisma.demoSession.findUniqueOrThrow({ where: { id: session.id } })).createdRecords, session.createdRecords + 3);
});

test("initial order lines count toward quota and oversized orders make no writes", { skip: !enabled, timeout: 120_000 }, async () => {
  const { demoPrisma: prisma } = await import("../src/lib/prisma");
  const { DEMO_MAX_RECORDS } = await import("../src/lib/demo");
  const device = `api-order-lines-${Date.now()}`;
  const visitor = await start(device);
  const session = await sessionFor(device);
  const menu = await prisma.menuItem.findFirstOrThrow({ where: { restaurantId: session.restaurantId!, status: "ACTIVE" } });
  const create = (count: number) => fetch(`${appUrl}/api/owner/order`, {
    method: "POST", headers: { cookie: visitor.cookie, "content-type": "application/json" },
    body: JSON.stringify({ type: "TAKEAWAY", items: Array.from({ length: count }, () => ({ menuItemId: menu.id, quantity: 1 })) }),
  });
  const originalOrders = await prisma.order.count({ where: { restaurantId: session.restaurantId! } });
  await prisma.demoSession.update({ where: { id: session.id }, data: { createdRecords: DEMO_MAX_RECORDS - 2 } });
  assert.equal((await create(2)).status, 429);
  assert.equal((await create(101)).status, 400);
  const rejected = await prisma.demoSession.findUniqueOrThrow({ where: { id: session.id } });
  assert.equal(rejected.createdRecords, DEMO_MAX_RECORDS - 2);
  assert.equal(rejected.createdOrders, session.createdOrders);
  assert.equal(await prisma.order.count({ where: { restaurantId: session.restaurantId! } }), originalOrders);
  await prisma.demoSession.update({ where: { id: session.id }, data: { createdRecords: 0 } });
  assert.equal((await create(2)).status, 200);
  const accepted = await prisma.demoSession.findUniqueOrThrow({ where: { id: session.id } });
  assert.equal(accepted.createdRecords, 3);
  assert.equal(accepted.createdOrders, session.createdOrders + 1);
});

test("normal owner, staff and Super Admin authentication workflows remain available", { skip: !enabled, timeout: 60_000 }, async () => {
  const bcrypt = (await import("bcryptjs")).default;
  const { mainPrisma: prisma } = await import("../src/lib/prisma");
  const stamp = Date.now();
  const password = "Disposable-test-password-42!";
  const hash = await bcrypt.hash(password, 4);
  const restaurant = await prisma.restaurant.create({ data: { name: "Workflow control", email: `workflow-restaurant-${stamp}@example.test`, phone: "000", address: "Disposable test database", status: "ACTIVE" } });
  const owner = await prisma.user.create({ data: { name: "Owner Test", email: `owner-${stamp}@example.test`, password: hash, role: "OWNER", emailVerifiedAt: new Date(), restaurants: { create: { restaurantId: restaurant.id, role: "OWNER" } } } });
  const staff = await prisma.user.create({ data: { name: "Staff Test", email: `staff-${stamp}@example.test`, password: hash, role: "WAITER", emailVerifiedAt: new Date(), restaurants: { create: { restaurantId: restaurant.id, role: "WAITER" } } } });
  const admin = await prisma.user.create({ data: { name: "Admin Test", email: `admin-${stamp}@example.test`, password: hash, role: "SUPER_ADMIN", emailVerifiedAt: new Date() } });
  try {
    const [ownerLogin, staffLogin, adminLogin] = await Promise.all([login(owner.email, password), login(staff.email, password), login(admin.email, password)]);
    assert.equal(ownerLogin.response.status, 200);
    assert.equal(staffLogin.response.status, 200);
    assert.equal(adminLogin.response.status, 200);
    assert.equal((await fetch(`${appUrl}/api/owner/inventory`, { headers: { cookie: ownerLogin.cookie } })).status, 200);
    assert.equal((await fetch(`${appUrl}/api/owner/order`, { headers: { cookie: staffLogin.cookie } })).status, 200);
    assert.equal((await fetch(`${appUrl}/api/restaurant`, { headers: { cookie: adminLogin.cookie } })).status, 200);
  } finally {
    await prisma.loginSession.deleteMany({ where: { userId: { in: [owner.id, staff.id, admin.id] } } });
    await prisma.restaurant.delete({ where: { id: restaurant.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, staff.id, admin.id] } } });
  }
});
