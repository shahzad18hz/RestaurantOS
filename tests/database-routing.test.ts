import assert from "node:assert/strict";
import test from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRoutedClient } from "../src/lib/routed-client";
import { databaseConfig } from "../src/lib/database-config";

test("real records do not follow an old demo-schema URL", () => {
  const saved = { ...process.env };
  try {
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test?schema=restaurantos_demo_v2";
    delete process.env.MAIN_DATABASE_URL;
    delete process.env.APP_DATABASE_SCHEMA;
    delete process.env.DEMO_DATABASE_URL;
    delete process.env.DEMO_DATABASE_SCHEMA;
    assert.equal(databaseConfig("main").schema, "public");
    assert.equal(databaseConfig("demo").schema, "restaurantos_demo_v2");
    process.env.MAIN_DATABASE_URL = "postgresql://test:test@localhost/old_restaurant";
    assert.equal(new URL(databaseConfig("main").connectionString).pathname, "/old_restaurant");
    assert.equal(new URL(databaseConfig("demo").connectionString).pathname, "/test");
    process.env.APP_DATABASE_SCHEMA = 'public"; DROP SCHEMA public;';
    assert.throws(() => databaseConfig("main"));
    delete process.env.MAIN_DATABASE_URL;
    process.env.APP_DATABASE_SCHEMA = "restaurantos_demo_v2";
    assert.throws(() => databaseConfig("main"), /must not use the same/);
  } finally { process.env = saved; }
});

test("concurrent requests and both transaction styles stay on their selected client", async () => {
  const context = new AsyncLocalStorage<"main" | "demo">();
  const calls: string[] = [];
  const client = (name: string) => ({
    user: { findMany: () => { calls.push(name); return Promise.resolve([name]); } },
    $transaction: (input: any) => Array.isArray(input) ? Promise.all(input) : input(client(name)),
  });
  const clients = { main: client("main"), demo: client("demo") };
  const routed = createRoutedClient<typeof clients.main>(async () => clients[context.getStore()!]);
  const results = await Promise.all((["main", "demo"] as const).map(kind => context.run(kind, async () => {
    await Promise.resolve();
    assert.deepEqual(await routed.user.findMany(), [kind]);
    assert.deepEqual(await routed.$transaction([routed.user.findMany(), routed.user.findMany()]), [[kind], [kind]]);
    return routed.$transaction((tx: typeof clients.main) => tx.user.findMany());
  })));
  assert.deepEqual(results, [["main"], ["demo"]]);
  assert.equal(calls.filter(name => name === "main").length, 4);
  assert.equal(calls.filter(name => name === "demo").length, 4);
});

test("resolver failure never falls back to another database", async () => {
  const routed = createRoutedClient<any>(async () => { throw new Error("expired token"); });
  await assert.rejects(async () => await routed.user.findMany(), /expired token/);
  await assert.rejects(async () => await routed.$transaction([routed.user.findMany()]), /expired token/);
});
