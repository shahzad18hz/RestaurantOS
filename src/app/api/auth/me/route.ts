import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  try {
    const user = await prisma.user.findUnique({ where: { id: session.id }, select: { id: true, name: true, email: true, phone: true, address: true, profileImage: true, emailVerifiedAt: true, role: true, restaurants: { include: { restaurant: { select: { id: true, name: true, email: true, phone: true, address: true, logo: true } } } } } });
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    return NextResponse.json({ success: true, user: { ...user, isDemo: session.isDemo } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Unable to load account." }, { status: 500 });
  }
}
