import { Prisma } from "@/generated/prisma/client";
import { databaseConfig } from "./database-config";
import { requestDatabaseKind } from "./prisma";

export async function sqlTable(table: "DemoRateLimit" | "InventoryItem" | "RestaurantAuditLog" | "User", kind?: "main" | "demo") {
  const { schema } = databaseConfig(kind ?? await requestDatabaseKind());
  return Prisma.raw(`"${schema}"."${table}"`);
}
