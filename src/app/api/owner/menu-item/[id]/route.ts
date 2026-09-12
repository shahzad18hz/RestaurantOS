import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";

// ==============================
// UPDATE MENU ITEM
// ==============================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { restaurantId, errorStatus, errorMessage } =
      await requireRestaurantContext();

    if (errorStatus) {
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: errorStatus }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.menuItem.findFirst({
      where: { id: Number(id), restaurantId: restaurantId! },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Menu item not found." },
        { status: 404 }
      );
    }

    if (body.price !== undefined) {
      const price = Number(body.price);
      if (Number.isNaN(price) || price < 0) {
        return NextResponse.json(
          { success: false, message: "A valid, non-negative price is required." },
          { status: 400 }
        );
      }
    }

    const recipeIngredients = body.recipeIngredients === undefined
      ? undefined
      : Array.isArray(body.recipeIngredients)
        ? body.recipeIngredients
            .map((row: { inventoryItemId?: number; quantity?: number }) => ({ inventoryItemId: Number(row.inventoryItemId), quantity: Number(row.quantity) }))
            .filter((row: { inventoryItemId: number; quantity: number }) => Number.isInteger(row.inventoryItemId) && row.quantity > 0)
        : [];

    if (recipeIngredients) {
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
      const updated = await tx.menuItem.update({
        where: { id: Number(id) },
        data: {
          name: body.name?.trim() ?? existing.name,
          description: body.description ?? existing.description,
          image: body.image ?? existing.image,
          price: body.price !== undefined ? Number(body.price) : undefined,
          categoryId: body.categoryId ? Number(body.categoryId) : undefined,
          isVeg: body.isVeg ?? existing.isVeg,
          preparationTime: body.preparationTime !== undefined ? Number(body.preparationTime) : existing.preparationTime,
          status: body.status ?? existing.status,
          sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : existing.sortOrder,
        },
      });
      if (recipeIngredients !== undefined) {
        await tx.recipeIngredient.deleteMany({ where: { menuItemId: updated.id } });
        if (recipeIngredients.length) {
          await tx.recipeIngredient.createMany({ data: recipeIngredients.map((row: { inventoryItemId: number; quantity: number }) => ({ ...row, menuItemId: updated.id })) });
        }
      }
      return updated;
    });

    return NextResponse.json({
      success: true,
      message: "Menu item updated successfully.",
      data: menuItem,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, message: "Menu item update failed." },
      { status: 500 }
    );
  }
}

// ==============================
// DELETE MENU ITEM
// ==============================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { restaurantId, errorStatus, errorMessage } =
      await requireRestaurantContext();

    if (errorStatus) {
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: errorStatus }
      );
    }

    const { id } = await params;

    const existing = await prisma.menuItem.findFirst({
      where: { id: Number(id), restaurantId: restaurantId! },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Menu item not found." },
        { status: 404 }
      );
    }

    // Block delete if the item has ever been ordered — deactivate instead,
    // so historical orders keep a valid reference.
    const usedInOrders = await prisma.orderItem.findFirst({
      where: { menuItemId: Number(id) },
    });

    if (usedInOrders) {
      await prisma.menuItem.update({
        where: { id: Number(id) },
        data: { status: "INACTIVE" },
      });

      return NextResponse.json({
        success: true,
        message:
          "This item has past orders, so it was deactivated instead of deleted.",
      });
    }

    await prisma.menuItem.delete({ where: { id: Number(id) } });

    return NextResponse.json({
      success: true,
      message: "Menu item deleted successfully.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, message: "Menu item delete failed." },
      { status: 500 }
    );
  }
}

// ==============================
// TOGGLE STATUS
// ==============================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { restaurantId, errorStatus, errorMessage } =
      await requireRestaurantContext();

    if (errorStatus) {
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: errorStatus }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.menuItem.findFirst({
      where: { id: Number(id), restaurantId: restaurantId! },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Menu item not found." },
        { status: 404 }
      );
    }

    const menuItem = await prisma.menuItem.update({
      where: { id: Number(id) },
      data: { status: body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE" },
    });

    return NextResponse.json({
      success: true,
      message: "Menu item status updated.",
      data: menuItem,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, message: "Status update failed." },
      { status: 500 }
    );
  }
}
