import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.isDemo || !user.demoExpiresAt) return NextResponse.json({ success: false, code: "DEMO_EXPIRED", message: "Your demo session has ended." }, { status: 401 });
  return NextResponse.json({ success: true, data: { isDemo: true, expiresAt: user.demoExpiresAt, remainingSeconds: Math.max(0, Math.floor((user.demoExpiresAt.getTime() - Date.now()) / 1000)) } });
}
