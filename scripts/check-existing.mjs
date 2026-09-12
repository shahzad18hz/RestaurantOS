import fs from "node:fs/promises";
import dotenv from "dotenv";
import pg from "pg";
let input = "";
if (process.argv[2] === "--stdin") { for await (const chunk of process.stdin) input += chunk; }
else input = await fs.readFile(process.argv[2] || ".env", "utf8");
const config = dotenv.parse(input);
const client = new pg.Client({ connectionString: config.MAIN_DATABASE_URL || config.DATABASE_URL, connectionTimeoutMillis: 20000 });
try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const columns = await client.query("SELECT table_schema,table_name,column_name,udt_name,is_nullable FROM information_schema.columns WHERE table_schema IN ('public','restaurantos_demo_v2') ORDER BY table_schema,table_name,ordinal_position");
  const main = columns.rows.filter(row => row.table_schema === "public");
  const demo = columns.rows.filter(row => row.table_schema === "restaurantos_demo_v2");
  const missing = demo.filter(row => !main.some(old => old.table_name === row.table_name && old.column_name === row.column_name));
  const users = await client.query('SELECT role, count(*)::int AS count FROM public."User" GROUP BY role');
  console.log(JSON.stringify({ mainTables: [...new Set(main.map(row => row.table_name))], demoTableCount: new Set(demo.map(row => row.table_name)).size, users: users.rows, missingColumnCount: missing.length, missingFromMain: missing.slice(0,15).map(row => `${row.table_name}.${row.column_name}`) }, null, 2));
  await client.query("ROLLBACK");
} catch (error) { console.error("Read-only check failed:", error.code || error.name); process.exitCode = 1; }
finally { await client.end(); }
