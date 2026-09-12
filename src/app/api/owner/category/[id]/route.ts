import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";

// ==============================
// UPDATE CATEGORY
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

    const existing = await prisma.category.findFirst({
      where: { id: Number(id), restaurantId: restaurantId! },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Category not found." },
        { status: 404 }
      );
    }

    const category = await prisma.category.update({
      where: { id: Number(id) },
      data: {
        name: body.name?.trim() ?? existing.name,
        image: body.image ?? existing.image,
        description: body.description ?? existing.description,
        status: body.status === "ACTIVE" || body.status === "INACTIVE" ? body.status : existing.status,
        sortOrder: body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder)) && Number(body.sortOrder) >= 0
          ? Math.floor(Number(body.sortOrder))
          : existing.sortOrder,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Category updated successfully.",
      data: category,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Category update failed.",
      },
      { status: 500 }
    );
  }
}

// ==============================
// DELETE CATEGORY
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

    const existing = await prisma.category.findFirst({
      where: { id: Number(id), restaurantId: restaurantId! },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Category not found." },
        { status: 404 }
      );
    }

    const hasMenuItems = await prisma.menuItem.findFirst({
      where: { categoryId: Number(id) },
    });

    if (hasMenuItems) {
      return NextResponse.json(
        {
          success: false,
          message:
            "This category has menu items in it. Move or delete them first.",
        },
        { status: 400 }
      );
    }

    await prisma.category.delete({
      where: { id: Number(id) },
    });

    return NextResponse.json({
      success: true,
      message: "Category deleted successfully.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Category delete failed.",
      },
      { status: 500 }
    );
  }
}

// ==============================
// CHANGE STATUS
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

    if (!["ACTIVE", "INACTIVE"].includes(body.status)) {
      return NextResponse.json(
        { success: false, message: "Invalid status." },
        { status: 400 }
      );
    }

    const existing = await prisma.category.findFirst({
      where: { id: Number(id), restaurantId: restaurantId! },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Category not found." },
        { status: 404 }
      );
    }

    const category = await prisma.category.update({
      where: { id: Number(id) },
      data: { status: body.status },
    });

    return NextResponse.json({
      success: true,
      message: "Category status updated.",
      data: category,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Status update failed.",
      },
      { status: 500 }
    );
  }
}
