import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredDemos } from "@/lib/demo";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  const result = await cleanupExpiredDemos();
  return NextResponse.json({ success: true, data: result });
}
