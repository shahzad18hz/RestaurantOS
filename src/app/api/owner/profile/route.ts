import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

const fail = (message: string, status: number) => NextResponse.json({ success: false, message }, { status });

async function owner() {
  const user = await getSessionUser();
  if (!user) return { user: null, error: fail("Unauthorized.", 401) };
  if (user.role !== "OWNER") return { user: null, error: fail("Only the owner can manage this profile.", 403) };
  return { user, error: null };
}

export async function GET(request: NextRequest) {
  const auth = await owner();
  if (auth.error || !auth.user) return auth.error;
  try {
    const action = request.nextUrl.searchParams.get("action");
    if (action === "sessions") {
      const sessions = await prisma.loginSession.findMany({
        where: { userId: auth.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastSeenAt: "desc" },
        select: { id: true, userAgent: true, ipAddress: true, lastSeenAt: true, expiresAt: true, createdAt: true },
      });
      return NextResponse.json({ success: true, data: sessions });
    }
    const data = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { id: true, name: true, email: true, phone: true, address: true, profileImage: true, emailVerifiedAt: true, role: true },
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return fail("Unable to load profile.", 500);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await owner();
  if (auth.error || !auth.user) return auth.error;
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("A valid name and email are required.", 400);
    const duplicate = await prisma.user.findFirst({ where: { email, NOT: { id: auth.user.id } }, select: { id: true } });
    if (duplicate) return fail("Email is already in use.", 409);
    const data = await prisma.user.update({
      where: { id: auth.user.id },
      data: { name, email, phone: typeof body.phone === "string" ? body.phone.trim() || null : null, address: typeof body.address === "string" ? body.address.trim() || null : null, profileImage: typeof body.profileImage === "string" ? body.profileImage || null : null },
      select: { id: true, name: true, email: true, phone: true, address: true, profileImage: true, emailVerifiedAt: true, role: true },
    });
    await prisma.profileActivity.create({ data: { userId: auth.user.id, action: "PROFILE_UPDATED", metadata: { fields: Object.keys(body) } } });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return fail("Profile could not be updated.", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await owner();
  if (auth.error || !auth.user) return auth.error;
  try {
    const body = await request.json() as Record<string, unknown>;
    const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const next = typeof body.newPassword === "string" ? body.newPassword : "";
    if (next.length < 8 || !/[A-Z]/.test(next) || !/[a-z]/.test(next) || !/\d/.test(next)) return fail("Password must be at least 8 characters with upper, lower, and numeric characters.", 400);
    const user = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { password: true } });
    if (!user || !(await bcrypt.compare(current, user.password))) return fail("Current password is incorrect.", 400);
    await prisma.user.update({ where: { id: auth.user.id }, data: { password: await bcrypt.hash(next, 12) } });
    await prisma.loginSession.updateMany({ where: { userId: auth.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.profileActivity.create({ data: { userId: auth.user.id, action: "PASSWORD_CHANGED" } });
    return NextResponse.json({ success: true, message: "Password changed. Please sign in again." });
  } catch (error) {
    console.error(error);
    return fail("Password could not be changed.", 500);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await owner();
  if (auth.error || !auth.user) return auth.error;
  try {
    const id = Number(request.nextUrl.searchParams.get("sessionId"));
    if (!Number.isInteger(id)) return fail("A valid session is required.", 400);
    await prisma.loginSession.updateMany({ where: { id, userId: auth.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.profileActivity.create({ data: { userId: auth.user.id, action: "SESSION_REVOKED", metadata: { sessionId: id } } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return fail("Session could not be revoked.", 500);
  }
}
