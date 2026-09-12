import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";

async function getSupplier(id: string) {
  const context = await requireRestaurantContext();
  if (context.errorStatus) return { context, supplier: null };
  const supplier = await prisma.supplier.findFirst({
    where: { id: Number(id), restaurantId: context.restaurantId! },
    include: { items: { select: { id: true, name: true, sku: true, currentStock: true, unit: true, purchasePrice: true } } },
  });
  return { context, supplier };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { context, supplier } = await getSupplier((await params).id);
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!supplier) return NextResponse.json({ success: false, message: "Supplier not found." }, { status: 404 });
    return NextResponse.json({
      success: true,
      data: {
        ...supplier,
        history: {
          totalPurchases: 0,
          totalPayments: 0,
          outstandingBalance: 0,
          lastPurchaseDate: null,
          purchases: [],
        },
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Failed to fetch supplier details." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { context, supplier } = await getSupplier((await params).id);
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!supplier) return NextResponse.json({ success: false, message: "Supplier not found." }, { status: 404 });
    const body = await request.json();
    if (!body.name?.trim()) return NextResponse.json({ success: false, message: "Company name is required." }, { status: 400 });

    const duplicate = await prisma.supplier.findFirst({
      where: {
        restaurantId: context.restaurantId!,
        id: { not: supplier.id },
        OR: [
          ...(body.phone?.trim() ? [{ phone: body.phone.trim() }] : []),
          ...(body.whatsapp?.trim() ? [{ whatsapp: body.whatsapp.trim() }] : []),
          ...(body.email?.trim() ? [{ email: body.email.trim().toLowerCase() }] : []),
        ],
      },
      select: { name: true },
    });
    if (duplicate) return NextResponse.json({ success: false, message: `A supplier with these contact details already exists (${duplicate.name}).` }, { status: 409 });

    const updated = await prisma.supplier.update({
      where: { id: supplier.id },
      data: {
        name: body.name.trim(), contactPerson: body.contactPerson?.trim() || null,
        phone: body.phone?.trim() || null, whatsapp: body.whatsapp?.trim() || null,
        email: body.email?.trim().toLowerCase() || null, address: body.address?.trim() || null,
        city: body.city?.trim() || null, country: body.country?.trim() || null,
        taxNumber: body.taxNumber?.trim() || null, status: body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
        notes: body.notes?.trim() || null,
      },
    });
    return NextResponse.json({ success: true, message: "Supplier updated successfully.", data: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Supplier update failed." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { context, supplier } = await getSupplier((await params).id);
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!supplier) return NextResponse.json({ success: false, message: "Supplier not found." }, { status: 404 });
    if (supplier.items.length > 0) {
      await prisma.supplier.update({ where: { id: supplier.id }, data: { status: "INACTIVE" } });
      return NextResponse.json({ success: true, message: "Supplier is linked to inventory and was marked inactive." });
    }
    await prisma.supplier.delete({ where: { id: supplier.id } });
    return NextResponse.json({ success: true, message: "Supplier deleted successfully." });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Supplier deletion failed." }, { status: 500 });
  }
}
