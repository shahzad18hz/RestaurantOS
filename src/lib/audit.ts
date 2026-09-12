import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sqlTable } from "./sql-table";

export async function writeAuditLog(input: { restaurantId: number; actorId: number; action: string; entity: string; entityId?: string | number | null; details?: Record<string, unknown> }) {
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO ${await sqlTable("RestaurantAuditLog")} ("restaurantId", "actorId", "action", "entity", "entityId", "details", "createdAt")
      VALUES (${input.restaurantId}, ${input.actorId}, ${input.action}, ${input.entity}, ${input.entityId == null ? null : String(input.entityId)}, ${JSON.stringify(input.details || {})}::jsonb, NOW())
    `);
  } catch (error) {
    // Audit logging must never break an operational transaction if a migration was not deployed yet.
    console.warn("AUDIT LOG WRITE SKIPPED:", error);
  }
}
