import { NextResponse } from "next/server";
import { requireRestaurantContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const context = await requireRestaurantContext();
  if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
  try {
    const data = await prisma.restaurantSettings.findUnique({
      where: { restaurantId: context.restaurantId! },
      select: { currency: true, taxPercentage: true, taxName: true, taxInclusive: true, receiptHeader: true, receiptFooter: true, printLogo: true, autoPrintReceipt: true, restaurant: { select: { name: true, phone: true, address: true, logo: true } } },
    });
    return NextResponse.json({ success: true, data: data ? { ...data, autoPrintReceipt: context.user!.isDemo ? false : data.autoPrintReceipt } : { currency: "USD", taxPercentage: 0, taxName: "Tax" } });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to load workspace preferences." }, { status: 500 });
  }
}
