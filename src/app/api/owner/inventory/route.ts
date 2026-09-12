import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";
import { consumeDemoQuota, getDemoLimitFailure } from "@/lib/demo";
import { assertInventoryReferences, InventoryReferenceError, optionalPositiveId } from "@/lib/inventory-security";

const statuses = ["ACTIVE", "INACTIVE"] as const;
export async function GET(request: NextRequest) {
  try {
    const context = await requireRestaurantContext();
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page")) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(params.get("pageSize")) || 10));
    const search = params.get("search")?.trim() || "";
    const filter = params.get("filter");
    const where = {
      restaurantId: context.restaurantId!,
      ...(params.get("status") && statuses.includes(params.get("status") as (typeof statuses)[number]) ? { status: params.get("status") as (typeof statuses)[number] } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { sku: { contains: search, mode: "insensitive" as const } }, { barcode: { contains: search, mode: "insensitive" as const } }] } : {}),
    };
    const all = await prisma.inventoryItem.findMany({ where, include: { category: { select: { id: true, name: true } }, supplier: { select: { id: true, name: true } }, movements: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: params.get("sort") === "stock" ? { currentStock: "asc" } : { name: "asc" } });
    const filtered = filter === "OUT_OF_STOCK" ? all.filter((item) => Number(item.currentStock) <= 0) : filter === "LOW_STOCK" ? all.filter((item) => Number(item.currentStock) > 0 && Number(item.currentStock) <= Number(item.minimumStock)) : filter === "EXPIRED" ? all.filter((item) => item.expiryDate && item.expiryDate < new Date()) : all;
    const [categories, suppliers] = await Promise.all([
      prisma.category.findMany({ where: { restaurantId: context.restaurantId! }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.supplier.findMany({ where: { restaurantId: context.restaurantId! }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return NextResponse.json({ success: true, data: filtered.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total: filtered.length, pageCount: Math.max(1, Math.ceil(filtered.length / pageSize)) }, options: { categories, suppliers }, summary: { total: all.length, low: all.filter((i) => Number(i.currentStock) > 0 && Number(i.currentStock) <= Number(i.minimumStock)).length, out: all.filter((i) => Number(i.currentStock) <= 0).length, expired: all.filter((i) => i.expiryDate && i.expiryDate < new Date()).length } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Failed to fetch inventory." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireRestaurantContext();
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    const body = await request.json();
    if (!body.name?.trim() || !body.sku?.trim() || !body.unit?.trim()) return NextResponse.json({ success: false, message: "Name, SKU, and unit are required." }, { status: 400 });
    const current = Number(body.currentStock) || 0;
    const minimum = Number(body.minimumStock) || 0;
    if (current < 0 || minimum < 0) return NextResponse.json({ success: false, message: "Stock values cannot be negative." }, { status: 400 });
    const categoryId = optionalPositiveId(body.categoryId);
    const supplierId = optionalPositiveId(body.supplierId);
    const item = await prisma.$transaction(async (tx) => {
      await assertInventoryReferences(tx, context.restaurantId!, categoryId, supplierId);
      if (context.user!.isDemo && context.user!.demoSessionId) await consumeDemoQuota(tx, context.user!.demoSessionId, "record", current > 0 ? 2 : 1);
      const created = await tx.inventoryItem.create({ data: { restaurantId: context.restaurantId!, categoryId, supplierId, name: body.name.trim(), sku: body.sku.trim(), unit: body.unit.trim(), currentStock: current, minimumStock: minimum, maximumStock: body.maximumStock ? Number(body.maximumStock) : null, purchasePrice: Number(body.purchasePrice) || 0, sellingPrice: body.sellingPrice ? Number(body.sellingPrice) : null, storageLocation: body.storageLocation?.trim() || null, expiryDate: body.expiryDate ? new Date(body.expiryDate) : null, barcode: body.barcode?.trim() || null, status: statuses.includes(body.status) ? body.status : "ACTIVE", notes: body.notes?.trim() || null } });
      if (current > 0) await tx.stockMovement.create({ data: { restaurantId: context.restaurantId!, inventoryItemId: created.id, type: "ADJUSTMENT", quantity: current, previousStock: 0, newStock: current, reason: "Opening stock", createdById: context.user!.id } });
      return created;
    });
    return NextResponse.json({ success: true, message: "Inventory item created.", data: item });
  } catch (error) {
    console.error(error);
    const demoFailure = getDemoLimitFailure(error);
    if (demoFailure) return NextResponse.json(demoFailure.body, { status: demoFailure.status });
    if (error instanceof InventoryReferenceError) return NextResponse.json({ success: false, code: error.code, message: error.message }, { status: 400 });
    return NextResponse.json({ success: false, message: "Inventory item creation failed." }, { status: 500 });
  }
}
