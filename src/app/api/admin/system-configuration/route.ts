import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

const defaults: Record<string, unknown> = {
  appName: "ERP",
  companyName: "",
  logo: null,
  favicon: null,
  defaultLanguage: "ENGLISH",
  timezone: "UTC",
  currency: "USD",
  dateFormat: "YYYY-MM-DD",
  timeFormat: "24H",
  passwordPolicy: { minLength: 8, requireUppercase: true, requireNumber: true, requireSymbol: false },
  sessionTimeout: 60,
  loginAttempts: 5,
  twoFactorReady: false,
  apiConfiguration: { enabled: true, baseUrl: "", apiVersion: "v1" },
  corsConfiguration: { origins: [] },
  csrfEnabled: true,
  rateLimit: 100,
  storageConfiguration: { provider: "LOCAL", bucket: "", region: "" },
  cacheConfiguration: { enabled: false, provider: "MEMORY", ttl: 300 },
  queueConfiguration: { enabled: false, provider: "DATABASE", retryAttempts: 3 },
  rtlSupport: false,
  numberFormat: "#,##0.00",
  maintenanceMode: false,
  maintenanceMessage: "System maintenance in progress.",
  allowedIps: [],
  featureFlags: {},
};

function response(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

async function authorized() {
  const user = await getSessionUser();
  if (!user) return { user: null, error: response("Unauthorized.", 401) };
  if (user.role !== "SUPER_ADMIN") return { user: null, error: response("Only Super Admin can modify system configuration.", 403) };
  return { user, error: null };
}

function validate(input: Record<string, unknown>) {
  const data = { ...defaults, ...input };
  if (typeof data.appName !== "string" || !data.appName.trim()) return "App name is required.";
  for (const key of ["sessionTimeout", "loginAttempts", "rateLimit"]) {
    if (!Number.isInteger(Number(data[key])) || Number(data[key]) < 1) return `${key} must be a positive integer.`;
  }
  if (!["12H", "24H"].includes(String(data.timeFormat))) return "Invalid time format.";
  return null;
}

async function load() {
  return prisma.systemConfiguration.findFirst({ orderBy: { id: "asc" } });
}

export async function GET() {
  try {
    const auth = await authorized();
    if (auth.error) return auth.error;
    const config = await load();
    const changes = await prisma.systemConfigChange.findMany({
      orderBy: { createdAt: "desc" }, take: 20,
      include: { actor: { select: { id: true, email: true } } },
    });
    return NextResponse.json({ success: true, data: config ?? defaults, changes });
  } catch (error) {
    console.error(error);
    return response("Failed to load system configuration.", 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authorized();
    if (auth.error || !auth.user) return auth.error;
    const body = await request.json() as Record<string, unknown>;
    const error = validate(body);
    if (error) return response(error, 400);
    const previous = await load();
    const data = { ...defaults, ...body };
    const config = previous
      ? await prisma.systemConfiguration.update({ where: { id: previous.id }, data: { ...data, updatedById: auth.user.id } })
      : await prisma.systemConfiguration.create({ data: { ...data, updatedById: auth.user.id } });
    await prisma.systemConfigChange.create({
      data: { actorId: auth.user.id, action: "UPDATE", changedKeys: Object.keys(body), snapshot: config },
    });
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error(error);
    return response("System configuration could not be saved.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorized();
    if (auth.error || !auth.user) return auth.error;
    const body = await request.json() as { action?: string; configuration?: Record<string, unknown> };
    const input = body.action === "RESET" ? defaults : body.configuration;
    if (!input) return response("Configuration is required.", 400);
    const error = validate(input);
    if (error) return response(error, 400);
    const previous = await load();
    const data = { ...defaults, ...input };
    const config = previous
      ? await prisma.systemConfiguration.update({ where: { id: previous.id }, data: { ...data, updatedById: auth.user.id } })
      : await prisma.systemConfiguration.create({ data: { ...data, updatedById: auth.user.id } });
    await prisma.systemConfigChange.create({
      data: { actorId: auth.user.id, action: body.action === "RESET" ? "RESET" : "IMPORT", changedKeys: Object.keys(data), snapshot: config },
    });
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error(error);
    return response("Configuration action failed.", 500);
  }
}


