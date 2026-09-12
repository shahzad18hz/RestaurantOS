import fs from "node:fs/promises";
import dotenv from "dotenv";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
const config = dotenv.parse(await fs.readFile(".env", "utf8"));
const reference = new PGlite();
const remote = new pg.Client({ connectionString: config.MAIN_DATABASE_URL || config.DATABASE_URL, connectionTimeoutMillis: 20000 });
try {
  await reference.exec(await fs.readFile("prisma/fresh-migrations/20260912000000_complete_baseline/migration.sql", "utf8"));
  const query = "SELECT table_name,column_name,udt_name FROM information_schema.columns WHERE table_schema=$1";
  const expected = (await reference.query(query, ["public"])).rows.filter(row => !["DemoSession","DemoRateLimit"].includes(row.table_name));
  await remote.connect();
  await remote.query("BEGIN READ ONLY");
  const actual = (await remote.query(query, [config.APP_DATABASE_SCHEMA || "public"])).rows;
  const differences = expected.filter(row => !actual.some(found => found.table_name === row.table_name && found.column_name === row.column_name && found.udt_name === row.udt_name));
  console.log(JSON.stringify({ expectedBusinessColumns: expected.length, incompatibleColumns: differences.map(row => `${row.table_name}.${row.column_name}`), mode: "READ ONLY" }));
  if (differences.length) process.exitCode = 1;
  await remote.query("ROLLBACK");
} catch (error) { console.error(error.code || error.name); process.exitCode = 1; }
finally { await reference.close(); await remote.end(); }
