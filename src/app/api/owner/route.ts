import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getSessionUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session || session.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, message: "Forbidden" }, { status: session ? 403 : 401 });
  try {
    const body = await request.json();

    const { name, email, password } = body;

    // Validation
    if (!name || !email || !password) {
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

    const normalizedEmail = email.trim().toLowerCase();

    // Check existing owner
    const existingOwner = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
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

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create Owner
    const owner = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        password: hashedPassword,
        role: "OWNER",
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Owner created successfully.",
        data: owner,
      },
      {
        status: 201,
      }
    );

  } catch (error) {
    console.error("CREATE OWNER ERROR:", error);

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
