import { NextRequest, NextResponse } from "next/server";
import { createToken } from "@/lib/jwt";
import { checkDemoStartRateLimit, DEMO_COOKIE, DEMO_USED_COOKIE, findDemoSession, hashDemoDevice, newDemoDeviceId, provisionDemo } from "@/lib/demo";

export async function POST(request: NextRequest) {
  let deviceId = request.cookies.get(DEMO_COOKIE)?.value;
  if (!deviceId) deviceId = newDemoDeviceId();
  try {
    const browserHash = hashDemoDevice(deviceId);
    const known = await findDemoSession(browserHash);
    if (!(known?.status === "ACTIVE" && known.expiresAt && known.expiresAt > new Date())) {
      const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
      if (!(await checkDemoStartRateLimit(address))) return NextResponse.json({ success: false, code: "DEMO_RATE_LIMIT", message: "Too many demo requests. Please try again later." }, { status: 429 });
    }
    const session = await provisionDemo(browserHash);
    if (!session.userId || !session.expiresAt) throw new Error("Demo workspace is not ready.");
    const token = createToken({ id: session.userId, email: `demo-${session.id}@example.invalid`, role: "MANAGER", demoSessionId: session.id }, Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)));
    const response = NextResponse.json({ success: true, data: { expiresAt: session.expiresAt, redirectTo: "/dashboard" } });
    response.cookies.set(DEMO_COOKIE, deviceId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    response.cookies.set(DEMO_USED_COOKIE, "1", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    response.cookies.set("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: session.expiresAt });
    return response;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "DEMO_FAILED";
    const status = code === "DEMO_USED" ? 410 : code === "DEMO_PROVISIONING" ? 409 : code === "DEMO_CAPACITY" ? 503 : 500;
    const response = NextResponse.json({ success: false, code, message: error instanceof Error ? error.message : "Demo provisioning failed." }, { status });
    response.cookies.set(DEMO_COOKIE, deviceId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    if (code === "DEMO_USED") response.cookies.set(DEMO_USED_COOKIE, "1", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return response;
  }
}
