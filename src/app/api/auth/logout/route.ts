import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (token) {
    try {
      const payload = verifyToken(token) as { jti?: string };
      if (payload.jti) await prisma.loginSession.updateMany({ where: { tokenId: payload.jti, revokedAt: null }, data: { revokedAt: new Date() } });
    } catch {
      // The cookie is cleared even when its token is already invalid.
    }
  }
  const response = NextResponse.json({ success: true, message: "Logout successful" });
  response.cookies.set("token", "", { maxAge: 0, path: "/", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" });
  return response;
}
