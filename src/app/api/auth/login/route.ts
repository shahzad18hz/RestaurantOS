


import { NextResponse } from "next/server";
import { mainPrisma as prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createToken } from "@/lib/jwt";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const address = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rate = checkRateLimit(`login:${address}`);
    if (!rate.allowed) {
      return NextResponse.json({ success: false, message: "Too many login attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
    }
    const body = await req.json();

    const { email, password } = body;

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
          message: "Email and password are required.",
        },
        {
          status: 400,
        }
      );
    }

    // Normalize Email
    const normalizedEmail = email.trim().toLowerCase();

    // Find User
    const user = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
      select: { id: true, name: true, email: true, password: true, role: true },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid email or password.",
        },
        {
          status: 404,
        }
      );
    }

    // Compare Password
    if (!["SUPER_ADMIN", "OWNER", "MANAGER", "CASHIER", "WAITER", "CHEF"].includes(user.role)) {
      return NextResponse.json({ success: false, message: "The configured main database does not match RestaurantOS. Check MAIN_DATABASE_URL." }, { status: 503 });
    }
    const isPasswordCorrect = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordCorrect) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid email or password.",
        },
        {
          status: 401,
        }
      );
    }

    // Create a revocable session identifier alongside the JWT.
    const tokenId = crypto.randomUUID();
    const token = createToken({
      id: user.id,
      email: user.email,
      role: user.role,
      jti: tokenId,
    });

    await prisma.loginSession.create({ data: { userId: user.id, tokenId, userAgent: req.headers.get("user-agent"), ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });

    // Response
    const response = NextResponse.json(
      {
        success: true,
        message: "Login successful.",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      {
        status: 200,
      }
    );

    // Save Cookie
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 Days
    });

    return response;
  } catch (error) {
    console.error("LOGIN ERROR:", error);

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
