import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";

const fail = (message: string, status: number) => NextResponse.json({ success: false, message }, { status });
const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const schedule = Object.fromEntries(days.map((day) => [day, { enabled: true, openingTime: "09:00", closingTime: "23:00" }]));

export async function GET() {
  const auth = await requireRestaurantContext();
  if (auth.errorStatus) return fail(auth.errorMessage, auth.errorStatus);
  if (!auth.user || !["OWNER", "MANAGER"].includes(auth.user.role)) return fail("You are not allowed to manage this restaurant.", 403);
  try {
    const data = await prisma.restaurant.findUnique({
      where: { id: auth.restaurantId! },
      select: { id: true, name: true, email: true, phone: true, address: true, logo: true, description: true, restaurantSettings: true },
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return fail("Unable to load restaurant profile.", 500);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRestaurantContext();
  if (auth.errorStatus) return fail(auth.errorMessage, auth.errorStatus);
  if (!auth.user || !["OWNER", "MANAGER"].includes(auth.user.role)) return fail("You are not allowed to manage this restaurant.", 403);
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("A valid restaurant name and email are required.", 400);
    const duplicate = await prisma.restaurant.findFirst({ where: { email, NOT: { id: auth.restaurantId! } }, select: { id: true } });
    if (duplicate) return fail("Restaurant email is already in use.", 409);
    const settings = {
      coverImage: typeof body.coverImage === "string" ? body.coverImage || null : undefined,
      website: typeof body.website === "string" ? body.website.trim() || null : undefined,
      city: typeof body.city === "string" ? body.city.trim() || null : undefined,
      country: typeof body.country === "string" ? body.country.trim() || null : undefined,
      currency: typeof body.currency === "string" && body.currency.trim() ? body.currency.trim().toUpperCase() : "USD",
      timezone: typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "UTC",
      taxNumber: typeof body.taxNumber === "string" ? body.taxNumber.trim() || null : undefined,
      registrationNumber: typeof body.registrationNumber === "string" ? body.registrationNumber.trim() || null : undefined,
      receiptLogo: typeof body.receiptLogo === "string" ? body.receiptLogo || null : undefined,
      favicon: typeof body.favicon === "string" ? body.favicon || null : undefined,
      weeklySchedule: body.weeklySchedule && typeof body.weeklySchedule === "object" ? body.weeklySchedule : schedule,
    };
    const result = await prisma.$transaction(async (tx) => {
      await tx.restaurant.update({ where: { id: auth.restaurantId! }, data: { name, email, phone: typeof body.phone === "string" ? body.phone.trim() : "", address: typeof body.address === "string" ? body.address.trim() : "", logo: typeof body.logo === "string" ? body.logo || null : undefined } });
      return tx.restaurantSettings.upsert({ where: { restaurantId: auth.restaurantId! }, create: { restaurantId: auth.restaurantId!, ...settings, kitchenDisplaySettings: {}, weeklySchedule: settings.weeklySchedule ?? schedule }, update: settings });
    });
    await prisma.profileActivity.create({ data: { userId: auth.user.id, action: "RESTAURANT_PROFILE_UPDATED", metadata: { restaurantId: auth.restaurantId } } });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error(error);
    return fail("Restaurant profile could not be updated.", 500);
  }
}
