import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { checkDemoRequestRateLimit } from "@/lib/demo";

export interface SessionUser {
  id: number;
  email: string;
  role: string;
  restaurantId: number | null;
  isDemo: boolean;
  demoSessionId: string | null;
  demoExpiresAt: Date | null;
  demoRequestAllowed: boolean;
}

/**
 * Reads the "token" cookie, verifies it, and returns the logged-in user
 * plus their active restaurant (first restaurant they're linked to).
 *
 * Returns null when there's no valid session — callers should respond
 * with 401 Unauthorized in that case.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) return null;

    const payload = verifyToken(token) as {
      id: number;
      email: string;
      role: string;
      demoSessionId?: string;
    };

    if (payload.demoSessionId) {
      const demo = await prisma.demoSession.findFirst({
        where: { id: payload.demoSessionId, userId: payload.id, status: "ACTIVE" },
        select: { id: true, userId: true, restaurantId: true, expiresAt: true },
      });
      if (!demo?.userId || !demo.restaurantId || !demo.expiresAt || demo.expiresAt <= new Date()) {
        if (demo) await prisma.demoSession.updateMany({ where: { id: demo.id, status: "ACTIVE" }, data: { status: "EXPIRED" } });
        return null;
      }
      const demoRequestAllowed = await checkDemoRequestRateLimit(demo.id);
      await prisma.demoSession.update({ where: { id: demo.id }, data: { lastSeenAt: new Date() } });
      return { id: payload.id, email: payload.email, role: "MANAGER", restaurantId: demo.restaurantId, isDemo: true, demoSessionId: demo.id, demoExpiresAt: demo.expiresAt, demoRequestAllowed };
    }

    // SUPER_ADMIN has no single restaurant — tenant scoping doesn't apply.
    if (payload.role === "SUPER_ADMIN") {
      return {
        id: payload.id,
        email: payload.email,
        role: payload.role,
        restaurantId: null,
        isDemo: false,
        demoSessionId: null,
        demoExpiresAt: null,
        demoRequestAllowed: true,
      };
    }

    const link = await prisma.restaurantUser.findFirst({
      where: { userId: payload.id },
      orderBy: { createdAt: "asc" },
      select: { restaurantId: true },
    });

    return {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      restaurantId: link?.restaurantId ?? null,
      isDemo: false,
      demoSessionId: null,
      demoExpiresAt: null,
      demoRequestAllowed: true,
    };
  } catch {
    return null;
  }
}

/**
 * Convenience helper for API routes that require a resolved restaurant.
 * Returns either { user } or { error: NextResponse } to short-circuit with.
 */
export async function requireRestaurantContext() {
  const user = await getSessionUser();

  if (!user) {
    return {
      user: null,
      restaurantId: null,
      errorStatus: 401 as const,
      errorMessage: "Unauthorized. Please log in again.",
    };
  }

  if (!user.restaurantId) {
    return {
      user,
      restaurantId: null,
      errorStatus: 403 as const,
      errorMessage: "No restaurant is linked to this account.",
    };
  }

  if (user.isDemo && !user.demoRequestAllowed) {
    return { user, restaurantId: user.restaurantId, errorStatus: 429 as const, errorMessage: "Demo request limit reached. Please wait a moment." };
  }

  return {
    user,
    restaurantId: user.restaurantId,
    errorStatus: null,
    errorMessage: null,
  };
}
