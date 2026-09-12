import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { configureTestDatabase } from "./test-environment";

const enabled = configureTestDatabase();
process.env.JWT_SECRET ||= "integration-test-jwt-secret-at-least-32-characters";
process.env.DEMO_DEVICE_SECRET ||= "integration-test-device-secret-at-least-32-characters";
process.env.DEMO_MAX_CONCURRENT ||= "20";

afterEach(async () => {
  if (!enabled) return;
  const { demoPrisma: prisma } = await import("../src/lib/prisma");
  const sessions = await prisma.demoSession.findMany({ where: { browserHash: { startsWith: "test-" } } });
  for (const session of sessions) {
    await prisma.$transaction(async tx => {
      if (session.restaurantId) await tx.restaurant.deleteMany({ where: { id: session.restaurantId, demoSession: { id: session.id } } });
      if (session.userId) await tx.user.deleteMany({ where: { id: session.userId, demoSession: { id: session.id } } });
      await tx.demoSession.delete({ where: { id: session.id } });
    });
  }
});

test("same-browser concurrency creates exactly one workspace", { skip: !enabled, timeout: 120_000 }, async () => {
  const { provisionDemo } = await import("../src/lib/demo");
  const { demoPrisma: prisma } = await import("../src/lib/prisma");
  const browserHash = `test-same-${Date.now()}`;
  const sessions = await Promise.all(Array.from({ length: 5 }, () => provisionDemo(browserHash)));
  assert.equal(new Set(sessions.map(item => item.id)).size, 1);
  assert.equal(new Set(sessions.map(item => item.restaurantId)).size, 1);
  assert.equal(await prisma.demoSession.count({ where: { browserHash } }), 1);
});

test("five visitors receive separate tenants and cannot cross-read", { skip: !enabled, timeout: 180_000 }, async () => {
  const { provisionDemo } = await import("../src/lib/demo");
  const { demoPrisma: prisma } = await import("../src/lib/prisma");
  const stamp = Date.now();
  const sessions = await Promise.all(Array.from({ length: 5 }, (_, index) => provisionDemo(`test-visitor-${stamp}-${index}`)));
  const restaurantIds = sessions.map(item => item.restaurantId!);
  assert.equal(new Set(restaurantIds).size, 5);
  const foreignMenu = await prisma.menuItem.findFirst({ where: { restaurantId: restaurantIds[1] } });
  assert.ok(foreignMenu);
  assert.equal(await prisma.menuItem.findFirst({ where: { id: foreignMenu.id, restaurantId: restaurantIds[0] } }), null);
});

test("quota increment is atomic and unsuccessful work rolls back", { skip: !enabled, timeout: 60_000 }, async () => {
  const { consumeDemoQuota, DEMO_MAX_RECORDS, provisionDemo } = await import("../src/lib/demo");
  const { demoPrisma: prisma } = await import("../src/lib/prisma");
  const session = await provisionDemo(`test-quota-${Date.now()}`);
  await prisma.demoSession.update({ where: { id: session.id }, data: { createdRecords: DEMO_MAX_RECORDS - 2 } });
  await assert.rejects(() => prisma.$transaction(async tx => { await consumeDemoQuota(tx, session.id, "record"); throw new Error("deliberate write failure"); }));
  assert.equal((await prisma.demoSession.findUniqueOrThrow({ where: { id: session.id } })).createdRecords, DEMO_MAX_RECORDS - 2);
  await prisma.demoSession.update({ where: { id: session.id }, data: { createdRecords: DEMO_MAX_RECORDS - 1 } });
  const results = await Promise.allSettled(Array.from({ length: 2 }, () => prisma.$transaction(tx => consumeDemoQuota(tx, session.id, "record"))));
  assert.equal(results.filter(item => item.status === "fulfilled").length, 1);
  assert.equal((await prisma.demoSession.findUniqueOrThrow({ where: { id: session.id } })).createdRecords, DEMO_MAX_RECORDS);
});

test("cleanup reaches EXPIRED records and remains idempotent", { skip: !enabled, timeout: 60_000 }, async () => {
  const { cleanupExpiredDemos, provisionDemo } = await import("../src/lib/demo");
  const { demoPrisma: prisma } = await import("../src/lib/prisma");
  const normal = await prisma.restaurant.create({ data: { name: "Normal cleanup control", email: `normal-cleanup-${Date.now()}@example.test`, phone: "000", address: "Disposable test database", status: "ACTIVE" } });
  const session = await provisionDemo(`test-cleanup-${Date.now()}`);
  await prisma.demoSession.update({ where: { id: session.id }, data: { status: "EXPIRED", expiresAt: new Date(Date.now() - 60_000) } });
  await cleanupExpiredDemos();
  const cleaned = await prisma.demoSession.findUniqueOrThrow({ where: { id: session.id } });
  assert.equal(cleaned.restaurantId, null);
  assert.equal(cleaned.userId, null);
  assert.ok(cleaned.cleanedAt);
  await cleanupExpiredDemos();
  assert.deepEqual(await prisma.demoSession.findUniqueOrThrow({ where: { id: session.id } }), cleaned);
  assert.equal(await prisma.restaurant.count({ where: { id: normal.id } }), 1);
  await prisma.restaurant.delete({ where: { id: normal.id } });
});
