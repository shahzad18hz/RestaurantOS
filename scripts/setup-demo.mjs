import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const baseline = "20260912000000_complete_baseline";

async function main() {
  const original = await fs.readFile(envPath, "utf8").catch(() => {
    throw new Error("Create .env from .env.example and set your new database's DATABASE_URL first.");
  });
  const config = dotenv.parse(original);
  const schema = config.DEMO_DATABASE_SCHEMA || "restaurantos_demo_v2";
  if (!/^[a-z_][a-z0-9_]*$/.test(schema) || schema === "public" || schema === (config.APP_DATABASE_SCHEMA || "public")) {
    throw new Error("Demo setup requires a separate non-public schema. No main-data changes are allowed.");
  }
  if (!config.DATABASE_URL) throw new Error("DATABASE_URL is missing from .env.");
  const url = new URL(config.DEMO_DATABASE_URL || config.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("A PostgreSQL connection URL is required.");
  url.searchParams.set("schema", schema);
  url.searchParams.set("connect_timeout", "30");
  const connectionString = url.toString();
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 30000 });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query("SELECT pg_advisory_lock(76009112)");
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    const objects = await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p','v','m','S')", [schema]);
    if (objects.rows.length) {
      if (!objects.rows.some(row => row.relname === "_prisma_migrations")) {
        throw new Error("The isolated setup schema already contains unrecognized objects. Nothing has been deleted. Contact the developer.");
      }
      const history = await client.query(`SELECT migration_name, finished_at, rolled_back_at FROM "${schema}"."_prisma_migrations"`);
      if (history.rows.some(row => row.migration_name !== baseline || (!row.finished_at && !row.rolled_back_at))) {
        throw new Error("The isolated schema has unexpected or failed migrations. Nothing has been deleted. Contact the developer.");
      }
    }
    console.log("Setting up an isolated demo schema. Existing public-schema data will not be modified.");
    const result = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], {
      cwd: root,
      env: { ...process.env, ...config, DEMO_DATABASE_URL: connectionString, DEMO_DATABASE_SCHEMA: schema },
      stdio: "inherit",
    });
    if (result.error || result.status !== 0) throw new Error("Migration did not finish. Your .env was not changed. Do not reset the database; share the migration error.");
    const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_name IN ('User','Reservation','DemoSession','DemoRateLimit')", [schema]);
    if (tables.rows.length !== 4) throw new Error("Required tables are missing; .env was not changed.");
    console.log("Demo setup complete. Your .env and existing main schema were not changed. Normal login uses MAIN_DATABASE_URL (or DATABASE_URL), schema public. Run npm run dev.");
  } finally {
    if (connected) await client.end();
  }
}

main().catch(error => {
  console.error(error.code ? `Setup failed (${error.code}). Check the database connection or migration output.` : error.message);
  process.exitCode = 1;
});
