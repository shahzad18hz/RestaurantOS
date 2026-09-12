import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";

const STATUS = ["ACTIVE", "INACTIVE"] as const;

function generateSupplierCode(restaurantId: number) {
  return `SUP-${restaurantId}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireRestaurantContext();
    if (context.errorStatus) {
      return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    }

    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page")) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(params.get("pageSize")) || 10));
    const search = params.get("search")?.trim() || "";
    const status = params.get("status");
    const where = {
      restaurantId: context.restaurantId!,
      ...(STATUS.includes(status as (typeof STATUS)[number]) ? { status: status as (typeof STATUS)[number] } : {}),
      ...(search
        ? {
            OR: [
              { supplierCode: { contains: search, mode: "insensitive" as const } },
              { name: { contains: search, mode: "insensitive" as const } },
              { contactPerson: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        include: { items: { select: { id: true, name: true, sku: true } } },
        orderBy: params.get("sort") === "recent" ? { createdAt: "desc" } : { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.supplier.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: suppliers,
      meta: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Failed to fetch suppliers." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireRestaurantContext();
    if (context.errorStatus) {
      return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    }
    const body = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ success: false, message: "Company name is required." }, { status: 400 });
    }

    const duplicate = await prisma.supplier.findFirst({
      where: {
        restaurantId: context.restaurantId!,
        OR: [
          ...(body.phone?.trim() ? [{ phone: body.phone.trim() }] : []),
          ...(body.whatsapp?.trim() ? [{ whatsapp: body.whatsapp.trim() }] : []),
          ...(body.email?.trim() ? [{ email: body.email.trim().toLowerCase() }] : []),
        ],
      },
      select: { name: true },
    });
    if (duplicate) {
      return NextResponse.json({ success: false, message: `A supplier with this phone, WhatsApp, or email already exists (${duplicate.name}).` }, { status: 409 });
    }

    const supplier = await prisma.supplier.create({
      data: {
        restaurantId: context.restaurantId!,
        supplierCode: generateSupplierCode(context.restaurantId!),
        name: body.name.trim(),
        contactPerson: body.contactPerson?.trim() || null,
        phone: body.phone?.trim() || null,
        whatsapp: body.whatsapp?.trim() || null,
        email: body.email?.trim().toLowerCase() || null,
        address: body.address?.trim() || null,
        city: body.city?.trim() || null,
        country: body.country?.trim() || null,
        taxNumber: body.taxNumber?.trim() || null,
        status: STATUS.includes(body.status) ? body.status : "ACTIVE",
        notes: body.notes?.trim() || null,
      },
    });
    return NextResponse.json({ success: true, message: "Supplier created successfully.", data: supplier });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Supplier creation failed." }, { status: 500 });
  }
}
