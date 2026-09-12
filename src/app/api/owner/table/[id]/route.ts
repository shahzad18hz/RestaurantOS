import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";

// ==============================
// UPDATE TABLE
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

    const existing = await prisma.diningTable.findFirst({
      where: { id: Number(id), restaurantId: restaurantId! },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Table not found." },
        { status: 404 }
      );
    }

    const table = await prisma.diningTable.update({
      where: { id: Number(id) },
      data: {
        name: body.name?.trim() ?? existing.name,
        capacity: body.capacity !== undefined ? Number(body.capacity) : existing.capacity,
        location: body.location ?? existing.location,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Table updated successfully.",
      data: table,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, message: "Table update failed." },
      { status: 500 }
    );
  }
}

// ==============================
// DELETE TABLE
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

    const existing = await prisma.diningTable.findFirst({
      where: { id: Number(id), restaurantId: restaurantId! },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Table not found." },
        { status: 404 }
      );
    }

    const activeOrder = await prisma.order.findFirst({
      where: { tableId: Number(id), status: { notIn: ["COMPLETED", "CANCELLED"] } },
    });

    if (activeOrder) {
      return NextResponse.json(
        {
          success: false,
          message: "This table has an active order and can't be deleted.",
        },
        { status: 400 }
      );
    }

    await prisma.diningTable.delete({ where: { id: Number(id) } });

    return NextResponse.json({
      success: true,
      message: "Table deleted successfully.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, message: "Table delete failed." },
      { status: 500 }
    );
  }
}

// ==============================
// CHANGE STATUS (Available / Occupied / Reserved / Cleaning)
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

    const validStatuses = ["AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING"];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        { success: false, message: "Invalid table status." },
        { status: 400 }
      );
    }

    const existing = await prisma.diningTable.findFirst({
      where: { id: Number(id), restaurantId: restaurantId! },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Table not found." },
        { status: 404 }
      );
    }

    const table = await prisma.diningTable.update({
      where: { id: Number(id) },
      data: { status: body.status },
    });

    return NextResponse.json({
      success: true,
      message: "Table status updated.",
      data: table,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, message: "Status update failed." },
      { status: 500 }
    );
  }
}
