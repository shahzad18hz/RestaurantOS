import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const restaurant = await prisma.restaurant.update({
      where: {
        id: Number(id),
      },
      data: {
        name: body.restaurantName,
        email: body.restaurantEmail,
        phone: body.phone,
        address: body.address,
        logo: body.logo,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Restaurant updated successfully.",
      data: restaurant,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Update failed.",
      },
      { status: 500 }
    );
  }
}