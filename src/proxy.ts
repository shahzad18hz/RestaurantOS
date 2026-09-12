import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";
import { DEMO_BLOCKED_API_PREFIXES, DEMO_BLOCKED_DASHBOARD_PREFIXES, matchesPrefix } from "@/lib/demo-policy";

type TokenPayload = {
  id: number;
  email: string;
  role: string;
  demoSessionId?: string;
};


const ACCESS: Record<string, string[]> = {
  MANAGER: [
    "/dashboard",
    "/dashboard/orders",
    "/dashboard/pos",
    "/dashboard/menu",
    "/dashboard/kitchen",
    "/dashboard/staff",
    "/dashboard/customers",
    "/dashboard/tables",
    "/dashboard/reservations",
    "/dashboard/inventory",
    "/dashboard/billing",
    "/dashboard/reports",
    "/dashboard/activity",
  ],

  CASHIER: [
    "/dashboard",
    "/dashboard/pos",
    "/dashboard/orders",
    "/dashboard/billing",
    "/dashboard/payments",
    "/dashboard/customers",
    "/dashboard/notifications",
  ],

  WAITER: [
    "/dashboard",
    "/dashboard/pos",
    "/dashboard/orders",
    "/dashboard/tables",
    "/dashboard/reservations",
    "/dashboard/customers",
  ],

  CHEF: [
    "/dashboard",
    "/dashboard/kitchen",
    "/dashboard/orders",
    "/dashboard/inventory",
  ],
};

function isAllowed(pathname: string, role: string) {
  if (role === "SUPER_ADMIN" || role === "OWNER") {
    return true;
  }

  const allowed = ACCESS[role] || ["/dashboard"];

  return allowed.some(
    (prefix) =>
      pathname === prefix ||
      (prefix !== "/dashboard" && pathname.startsWith(`${prefix}/`))
  );
}

export function proxy(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  const { pathname } = request.nextUrl;

  // Establish the opaque browser identity before any demo button can be used.
  // Separate tabs opened after the first response therefore share one claim.
  if (pathname === "/" && !request.cookies.has("restaurantos_demo_device")) {
    const response = NextResponse.next();
    response.cookies.set("restaurantos_demo_device", crypto.randomUUID(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return response;
  }

  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== request.nextUrl.host) return NextResponse.json({ success: false, message: "Cross-site request blocked." }, { status: 403 });
  }

  if ((pathname.startsWith("/dashboard") || pathname.startsWith("/api/owner") || pathname.startsWith("/api/restaurant") || pathname.startsWith("/api/upload") || pathname.startsWith("/api/admin") || pathname.startsWith("/api/webhooks")) && token) {
    try {
      const decoded = verifyToken(token) as TokenPayload;
      if (decoded.demoSessionId) {
        const blocked = matchesPrefix(pathname, pathname.startsWith("/dashboard") ? DEMO_BLOCKED_DASHBOARD_PREFIXES : DEMO_BLOCKED_API_PREFIXES);
        if (blocked) return pathname.startsWith("/api/") ? NextResponse.json({ success: false, code: "DEMO_ACTION_BLOCKED", message: "This action is unavailable in the demo workspace." }, { status: 403 }) : NextResponse.redirect(new URL("/unauthorized?reason=demo", request.url));
      }
    } catch {
      // The existing dashboard/API authentication flow handles invalid tokens.
    }
  }

  // Login page
  if (pathname === "/login" && token) {
    try {
      const decoded = verifyToken(token) as TokenPayload;

      return NextResponse.redirect(
        new URL(
          decoded.role === "SUPER_ADMIN"
            ? "/dashboard/restaurants/all"
            : "/dashboard",
          request.url
        )
      );
    } catch {
      // Invalid token
    }
  }

  // Dashboard protection
  if (pathname.startsWith("/dashboard")) {
    if (!token) {
      return NextResponse.redirect(new URL(request.cookies.has("restaurantos_demo_used") ? "/demo-ended" : "/login", request.url));
    }

    try {
      const decoded = verifyToken(token) as TokenPayload;

      // SUPER_ADMIN default redirect
      if (
        decoded.role === "SUPER_ADMIN" &&
        pathname === "/dashboard"
      ) {
        return NextResponse.redirect(
          new URL("/dashboard/restaurants/all", request.url)
        );
      }

      // Role permission check
      if (!isAllowed(pathname, decoded.role)) {
        return NextResponse.redirect(
          new URL("/unauthorized", request.url)
        );
      }

      return NextResponse.next();
    } catch {
      if (request.cookies.has("restaurantos_demo_used")) return NextResponse.redirect(new URL("/demo-ended", request.url));
      const response = NextResponse.redirect(
        new URL("/login", request.url)
      );

      response.cookies.delete("token");

      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/dashboard/:path*", "/api/:path*"],
};
