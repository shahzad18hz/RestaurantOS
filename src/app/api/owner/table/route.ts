import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";
import { consumeDemoQuota, getDemoLimitFailure } from "@/lib/demo";

// ==============================
// GET ALL TABLES
// ==============================
export async function GET() {
  try {
    const { restaurantId, errorStatus, errorMessage } =
      await requireRestaurantContext();

    if (errorStatus) {
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: errorStatus }
      );
    }

    const tables = await prisma.diningTable.findMany({
      where: { restaurantId: restaurantId! },
      include: {
        orders: {
          where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
          select: { id: true, orderNumber: true, status: true, totalAmount: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: tables });
  } catch (error) {
    console.error(error);
    const demoLimit = getDemoLimitFailure(error);
    if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status });

    return NextResponse.json(
      { success: false, message: "Failed to fetch tables." },
      { status: 500 }
    );
  }
}

// ==============================
// CREATE TABLE
// ==============================
export async function POST(request: NextRequest) {
  try {
    const { user, restaurantId, errorStatus, errorMessage } =
      await requireRestaurantContext();

    if (errorStatus) {
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: errorStatus }
      );
    }

    const body = await request.json();

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { success: false, message: "Table name/number is required." },
        { status: 400 }
      );
    }

    const capacity = body.capacity !== undefined ? Number(body.capacity) : 2;
    if (Number.isNaN(capacity) || capacity < 1) {
      return NextResponse.json(
        { success: false, message: "Capacity must be at least 1." },
        { status: 400 }
      );
    }

    const exists = await prisma.diningTable.findFirst({
      where: { restaurantId: restaurantId!, name: body.name.trim() },
    });

    if (exists) {
      return NextResponse.json(
        { success: false, message: "A table with this name already exists." },
        { status: 400 }
      );
    }

    const table = await prisma.$transaction(async (tx) => {
      if (user!.isDemo && user!.demoSessionId) await consumeDemoQuota(tx, user!.demoSessionId, "record");
      return tx.diningTable.create({ data: {
        restaurantId: restaurantId!,
        name: body.name.trim(),
        capacity,
        location: body.location || null,
        status: body.status || "AVAILABLE",
      } });
    });

    return NextResponse.json({
      success: true,
      message: "Table created successfully.",
      data: table,
    });
  } catch (error) {
    console.error(error);

    const demoLimit = getDemoLimitFailure(error);
    if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status });
    return NextResponse.json(
      { success: false, message: "Table creation failed." },
      { status: 500 }
    );
  }
}
