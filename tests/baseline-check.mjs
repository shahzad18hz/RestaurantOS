import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
try {
  const sql = await fs.readFile(new URL("../prisma/fresh-migrations/20260912000000_complete_baseline/migration.sql", import.meta.url), "utf8");
  await db.exec("CREATE TABLE public.keep_me (id integer); INSERT INTO public.keep_me VALUES (42); CREATE SCHEMA restaurantos_demo_v2; SET search_path TO restaurantos_demo_v2;");
  await db.exec(sql);
  const tables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='restaurantos_demo_v2'");
  const names = new Set(tables.rows.map(row => row.table_name));
  const schema = await fs.readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(match => match[1]);
  for (const model of models) assert.ok(names.has(model), `Missing table ${model}`);
  assert.equal(names.size, models.length);
  assert.equal((await db.query("SELECT id FROM public.keep_me")).rows[0].id, 42);
  await db.exec(`INSERT INTO "DemoSession" (id,"browserHash",status,"updatedAt") VALUES ('check','hash','ACTIVE',now()); UPDATE "DemoSession" SET status='CLEANING' WHERE id='check';`);
  assert.equal((await db.query('SELECT status FROM "DemoSession"')).rows[0].status, "CLEANING");
  await db.exec("SET search_path TO public;");
  for (let i = 0; i < 2; i++) await db.exec(`INSERT INTO "restaurantos_demo_v2"."DemoRateLimit" ("key","count","windowStart","updatedAt") VALUES ('test',1,now(),now()) ON CONFLICT ("key") DO UPDATE SET "count"="DemoRateLimit"."count"+1;`);
  assert.equal((await db.query('SELECT count FROM "restaurantos_demo_v2"."DemoRateLimit"')).rows[0].count, 2);
  console.log(`PASS: all ${models.length} tables, demo status, qualified rate-limit SQL, and public-schema preservation.`);
} finally {
  await db.close();
}
