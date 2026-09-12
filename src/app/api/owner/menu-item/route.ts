import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";
import { consumeDemoQuota, getDemoLimitFailure } from "@/lib/demo";

// ==============================
// GET ALL MENU ITEMS
// (optional ?categoryId= filter)
// ==============================
export async function GET(request: NextRequest) {
  try {
    const { restaurantId, errorStatus, errorMessage } =
      await requireRestaurantContext();

    if (errorStatus) {
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: errorStatus }
      );
    }

    const categoryId = request.nextUrl.searchParams.get("categoryId");

    const menuItems = await prisma.menuItem.findMany({
      where: {
        restaurantId: restaurantId!,
        ...(categoryId ? { categoryId: Number(categoryId) } : {}),
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
        recipeIngredients: {
          include: { inventoryItem: { select: { id: true, name: true, unit: true, currentStock: true, minimumStock: true } } },
          orderBy: { id: "asc" },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({
      success: true,
      data: menuItems,
    });
  } catch (error) {
    console.error(error);
    const demoLimit = getDemoLimitFailure(error);
    if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status });

    return NextResponse.json(
      { success: false, message: "Failed to fetch menu items." },
      { status: 500 }
    );
  }
}

// ==============================
// CREATE MENU ITEM
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

    // ---- Validation ----
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { success: false, message: "Item name is required." },
        { status: 400 }
      );
    }

    if (!body.categoryId) {
      return NextResponse.json(
        { success: false, message: "Category is required." },
        { status: 400 }
      );
    }

    const price = Number(body.price);
    if (Number.isNaN(price) || price < 0) {
      return NextResponse.json(
        { success: false, message: "A valid, non-negative price is required." },
        { status: 400 }
      );
    }

    // ---- Category must belong to this restaurant ----
    const category = await prisma.category.findFirst({
      where: { id: Number(body.categoryId), restaurantId: restaurantId! },
    });

    if (!category) {
      return NextResponse.json(
        { success: false, message: "Category not found for this restaurant." },
        { status: 404 }
      );
    }

    // ---- Duplicate name check (tenant-scoped) ----
    const exists = await prisma.menuItem.findFirst({
      where: { restaurantId: restaurantId!, name: body.name.trim() },
    });

    if (exists) {
      return NextResponse.json(
        { success: false, message: "A menu item with this name already exists." },
        { status: 400 }
      );
    }

    const recipeIngredients = Array.isArray(body.recipeIngredients)
      ? body.recipeIngredients
          .map((row: { inventoryItemId?: number; quantity?: number }) => ({
            inventoryItemId: Number(row.inventoryItemId),
            quantity: Number(row.quantity),
          }))
          .filter((row: { inventoryItemId: number; quantity: number }) => Number.isInteger(row.inventoryItemId) && row.quantity > 0)
      : [];

    if (recipeIngredients.length) {
      if (new Set(recipeIngredients.map((row: { inventoryItemId: number }) => row.inventoryItemId)).size !== recipeIngredients.length) {
        return NextResponse.json({ success: false, message: "Each ingredient can only be added once per recipe." }, { status: 400 });
      }
      const validInventory = await prisma.inventoryItem.count({
        where: { restaurantId: restaurantId!, id: { in: recipeIngredients.map((row: { inventoryItemId: number }) => row.inventoryItemId) }, status: "ACTIVE" },
      });
      if (validInventory !== recipeIngredients.length) {
        return NextResponse.json({ success: false, message: "One or more recipe ingredients are invalid or inactive." }, { status: 400 });
      }
    }

    const menuItem = await prisma.$transaction(async (tx) => {
      if (user?.isDemo && user.demoSessionId) await consumeDemoQuota(tx, user.demoSessionId, "record");
      const created = await tx.menuItem.create({
        data: {
          restaurantId: restaurantId!,
          categoryId: Number(body.categoryId),
          name: body.name.trim(),
          description: body.description || null,
          image: body.image || null,
          price,
          isVeg: body.isVeg ?? true,
          preparationTime: body.preparationTime ? Number(body.preparationTime) : null,
          status: body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
          sortOrder: body.sortOrder ? Number(body.sortOrder) : 0,
        },
      });
      if (recipeIngredients.length) {
        await tx.recipeIngredient.createMany({
          data: recipeIngredients.map((row: { inventoryItemId: number; quantity: number }) => ({ ...row, menuItemId: created.id })),
        });
      }
      return created;
    });

    return NextResponse.json({
      success: true,
      message: "Menu item created successfully.",
      data: menuItem,
    });
  } catch (error) {
    console.error(error);

    const demoLimit = getDemoLimitFailure(error);
    if (demoLimit) return NextResponse.json(demoLimit.body, { status: demoLimit.status });
    return NextResponse.json(
      { success: false, message: "Menu item creation failed." },
      { status: 500 }
    );
  }
}
