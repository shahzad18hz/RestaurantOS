import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";
import { consumeDemoQuota, getDemoLimitFailure } from "@/lib/demo";

// ==============================
// GET ALL CATEGORIES (tenant-scoped)
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

    const categories = await prisma.category.findMany({
      where: { restaurantId: restaurantId! },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error(error);
    const demoLimit = getDemoLimitFailure(error);
    if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status });

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch categories.",
      },
      { status: 500 }
    );
  }
}

// ==============================
// CREATE CATEGORY
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
        { success: false, message: "Category name is required." },
        { status: 400 }
      );
    }

    const exists = await prisma.category.findFirst({
      where: {
        restaurantId: restaurantId!,
        name: body.name.trim(),
      },
    });

    if (exists) {
      return NextResponse.json(
        {
          success: false,
          message: "Category already exists.",
        },
        { status: 400 }
      );
    }

    const category = await prisma.$transaction(async (tx) => {
      if (user!.isDemo && user!.demoSessionId) await consumeDemoQuota(tx, user!.demoSessionId, "record");
      return tx.category.create({ data: {
        restaurantId: restaurantId!,
        name: body.name.trim(),
        image: body.image || null,
        description: body.description || null,
        status: body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
        sortOrder: Number.isFinite(Number(body.sortOrder)) && Number(body.sortOrder) >= 0 ? Math.floor(Number(body.sortOrder)) : 0,
      } });
    });

    return NextResponse.json({
      success: true,
      message: "Category created successfully.",
      data: category,
    });
  } catch (error) {
    console.error(error);

    const demoLimit = getDemoLimitFailure(error);
    if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status });
    return NextResponse.json(
      {
        success: false,
        message: "Category creation failed.",
      },
      { status: 500 }
    );
  }
}
