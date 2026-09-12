import "dotenv/config";
import { defineConfig } from "prisma/config";
const demoUrl = process.env.DEMO_DATABASE_URL || process.env.DATABASE_URL;
const migrationUrl = demoUrl ? new URL(demoUrl) : null;
if (migrationUrl) migrationUrl.searchParams.set("schema", process.env.DEMO_DATABASE_SCHEMA || "restaurantos_demo_v2");

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/fresh-migrations",
    seed: "tsx prisma/seed.ts",
  },

  datasource: {
    url: migrationUrl?.toString(),
  },
});
