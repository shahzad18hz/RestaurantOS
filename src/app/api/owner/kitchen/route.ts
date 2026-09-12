import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";

// ==============================
// GET ACTIVE KITCHEN TICKETS
// Orders that aren't served/completed/cancelled yet, oldest first.
// ==============================
export async function GET() {
  try {
    const { user, restaurantId, errorStatus, errorMessage } =
      await requireRestaurantContext();

    if (errorStatus) {
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: errorStatus }
      );
    }
    if (!user || !["SUPER_ADMIN", "OWNER", "MANAGER", "CHEF"].includes(user.role)) {
      return NextResponse.json({ success: false, message: "Your role cannot access the kitchen display." }, { status: 403 });
    }

    const orders = await prisma.order.findMany({
      where: {
        restaurantId: restaurantId!,
        status: { in: ["PENDING", "CONFIRMED", "PREPARING", "READY"] },
      },
      include: {
        table: { select: { id: true, name: true } },
        items: {
          where: { status: { not: "CANCELLED" } },
          include: { menuItem: { select: { id: true, name: true, preparationTime: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: orders });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch kitchen tickets." },
      { status: 500 }
    );
  }
}
