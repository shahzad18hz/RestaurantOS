import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
function adminGuard() { return getSessionUser().then((user) => user?.role === "SUPER_ADMIN" ? null : NextResponse.json({ success: false, message: "Forbidden" }, { status: user ? 403 : 401 })); }
import bcrypt from "bcryptjs";

/* =====================================================
   GET ALL RESTAURANTS
===================================================== */

export async function GET() {
  const guard = await adminGuard();
  if (guard) return guard;
  try {
    const restaurants = await prisma.restaurant.findMany({
      include: {
        users: {
          where: {
            role: "OWNER",
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(
      {
        success: true,
        count: restaurants.length,
        data: restaurants,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error("GET RESTAURANTS ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}

/* =====================================================
   CREATE RESTAURANT
===================================================== */

export async function POST(request: NextRequest) {
  const guard = await adminGuard();
  if (guard) return guard;
  try {
    const body = await request.json();

    const {
      restaurantName,
      restaurantEmail,
      phone,
      address,
      logo,
      ownerName,
      ownerEmail,
      ownerPassword,
    } = body;
        if (
      !restaurantName ||
      !restaurantEmail ||
      !phone ||
      !address ||
      !ownerName ||
      !ownerEmail ||
      !ownerPassword
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "All fields are required.",
        },
        {
          status: 400,
        }
      );
    }

    const normalizedRestaurantEmail = restaurantEmail.trim().toLowerCase();
    const normalizedOwnerEmail = ownerEmail.trim().toLowerCase();

    // Check Restaurant Email
    const existingRestaurant = await prisma.restaurant.findUnique({
      where: {
        email: normalizedRestaurantEmail,
      },
    });

    if (existingRestaurant) {
      return NextResponse.json(
        {
          success: false,
          message: "Restaurant email already exists.",
        },
        {
          status: 400,
        }
      );
    }

    // Check Owner Email
    const existingOwner = await prisma.user.findUnique({
      where: {
        email: normalizedOwnerEmail,
      },
    });

    if (existingOwner) {
      return NextResponse.json(
        {
          success: false,
          message: "Owner email already exists.",
        },
        {
          status: 400,
        }
      );
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(ownerPassword, 10);

    // Create Restaurant + Owner
    const result = await prisma.$transaction(async (tx) => {
      const owner = await tx.user.create({
        data: {
          name: ownerName,
          email: normalizedOwnerEmail,
          password: hashedPassword,
          role: "OWNER",
        },
      });

      const restaurant = await tx.restaurant.create({
        data: {
          name: restaurantName,
          email: normalizedRestaurantEmail,
          phone,
          address,
          logo,
        },
      });

      await tx.restaurantUser.create({
        data: {
          restaurantId: restaurant.id,
          userId: owner.id,
          role: "OWNER",
        },
      });

      // A fresh restaurant must be usable immediately. Menu items require a
      // categoryId, so create a small, editable starter taxonomy in the same
      // transaction instead of leaving the Menu/POS flows blocked.
      await tx.category.createMany({
        data: [
          { restaurantId: restaurant.id, name: "Starters", description: "Appetizers and small plates", sortOrder: 10 },
          { restaurantId: restaurant.id, name: "Main Course", description: "Main dishes and entrees", sortOrder: 20 },
          { restaurantId: restaurant.id, name: "Beverages", description: "Hot and cold drinks", sortOrder: 30 },
          { restaurantId: restaurant.id, name: "Desserts", description: "Desserts and sweet dishes", sortOrder: 40 },
        ],
      });

      return {
        owner,
        restaurant,
      };
    });
        return NextResponse.json(
      {
        success: true,
        message: "Restaurant created successfully.",
        data: result,
      },
      {
        status: 201,
      }
    );

  } catch (error) {
    console.error("CREATE RESTAURANT ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}

/* =====================================================
   UPDATE RESTAURANT
===================================================== */

export async function PUT(request: NextRequest) {
  const guard = await adminGuard();
  if (guard) return guard;
  try {
    const body = await request.json();

    const {
      id,
      restaurantName,
      restaurantEmail,
      phone,
      address,
      logo,
      ownerName,
      ownerEmail,
    } = body;
        if (!id) {
      return NextResponse.json(
        {
          success: false,
          message: "Restaurant ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: {
        id: Number(id),
      },
      include: {
        users: true,
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        {
          success: false,
          message: "Restaurant not found.",
        },
        {
          status: 404,
        }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.restaurant.update({
        where: {
          id: Number(id),
        },
        data: {
          name: restaurantName,
          email: restaurantEmail?.trim().toLowerCase(),
          phone,
          address,
          logo,
        },
      });

      const ownerRelation = restaurant.users.find(
        (u) => u.role === "OWNER"
      );

      if (ownerRelation) {
        await tx.user.update({
          where: {
            id: ownerRelation.userId,
          },
          data: {
            name: ownerName,
            email: ownerEmail?.trim().toLowerCase(),
          },
        });
      }
    });

    return NextResponse.json(
      {
        success: true,
        message: "Restaurant updated successfully.",
      },
      {
        status: 200,
      }
    );

  } catch (error) {
    console.error("UPDATE RESTAURANT ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}

/* =====================================================
   PATCH RESTAURANT STATUS
===================================================== */

export async function PATCH(request: NextRequest) {
  const guard = await adminGuard();
  if (guard) return guard;
  try {
    const body = await request.json();

    const { id, status } = body;
        if (!id || !status) {
      return NextResponse.json(
        {
          success: false,
          message: "Restaurant ID and status are required.",
        },
        {
          status: 400,
        }
      );
    }

    const allowedStatus = [
      "PENDING",
      "ACTIVE",
      "SUSPENDED",
      "REJECTED",
    ];

    if (!allowedStatus.includes(status)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid restaurant status.",
        },
        {
          status: 400,
        }
      );
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: {
        id: Number(id),
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        {
          success: false,
          message: "Restaurant not found.",
        },
        {
          status: 404,
        }
      );
    }

    const updatedRestaurant = await prisma.restaurant.update({
      where: {
        id: Number(id),
      },
      data: {
        status,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Restaurant status updated successfully.",
        data: updatedRestaurant,
      },
      {
        status: 200,
      }
    );

  } catch (error) {
    console.error("PATCH RESTAURANT ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}

/* =====================================================
   DELETE RESTAURANT
===================================================== */

export async function DELETE(request: NextRequest) {
  const guard = await adminGuard();
  if (guard) return guard;
  try {
    const body = await request.json();

    const { id } = body;
        if (!id) {
      return NextResponse.json(
        {
          success: false,
          message: "Restaurant ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: {
        id: Number(id),
      },
      include: {
        users: true,
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        {
          success: false,
          message: "Restaurant not found.",
        },
        {
          status: 404,
        }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Delete Restaurant Users
      await tx.restaurantUser.deleteMany({
        where: {
          restaurantId: Number(id),
        },
      });

      // Delete Owner User
      const owner = restaurant.users.find(
        (user) => user.role === "OWNER"
      );

      if (owner) {
        await tx.user.delete({
          where: {
            id: owner.userId,
          },
        });
      }

      // Delete Restaurant
      await tx.restaurant.delete({
        where: {
          id: Number(id),
        },
      });
    });

    return NextResponse.json(
      {
        success: true,
        message: "Restaurant deleted successfully.",
      },
      {
        status: 200,
      }
    );

  } catch (error) {
    console.error("DELETE RESTAURANT ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}

