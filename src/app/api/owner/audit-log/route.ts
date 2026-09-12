import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";
import { sqlTable } from "@/lib/sql-table";

export async function GET(request: NextRequest) {
  try {
    const c = await requireRestaurantContext();
    if (c.errorStatus) return NextResponse.json({ success: false, message: c.errorMessage }, { status: c.errorStatus });
    if (!c.user || !["OWNER", "MANAGER", "SUPER_ADMIN"].includes(c.user.role)) return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
    const limit = Math.min(100, Math.max(10, Number(request.nextUrl.searchParams.get("limit")) || 50));
    const rows = await prisma.$queryRaw<Array<{ id: number; action: string; entity: string; entityId: string | null; details: unknown; createdAt: Date; actorId: number; actorName: string | null; actorEmail: string }>>(Prisma.sql`
      SELECT l."id", l."action", l."entity", l."entityId", l."details", l."createdAt", l."actorId", u."name" AS "actorName", u."email" AS "actorEmail"
      FROM ${await sqlTable("RestaurantAuditLog")} l JOIN ${await sqlTable("User")} u ON u."id" = l."actorId"
      WHERE l."restaurantId" = ${c.restaurantId!}
      ORDER BY l."createdAt" DESC LIMIT ${limit}
    `);
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Audit log is unavailable. Deploy the V8 database migration first." }, { status: 503 });
  }
}
