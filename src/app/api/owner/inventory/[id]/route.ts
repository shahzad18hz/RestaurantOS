import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";
import { consumeDemoQuota, getDemoLimitFailure } from "@/lib/demo";
import { assertInventoryReferences, InventoryReferenceError, optionalPositiveId } from "@/lib/inventory-security";
import { sqlTable } from "@/lib/sql-table";

const TYPES = ["STOCK_IN", "STOCK_OUT", "ADJUSTMENT"] as const;

async function getItem(id: string) {
  const context = await requireRestaurantContext();
  if (context.errorStatus) return { context, item: null };
  const item = await prisma.inventoryItem.findFirst({ where: { id: Number(id), restaurantId: context.restaurantId! } });
  return { context, item };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { context, item } = await getItem((await params).id);
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!item) return NextResponse.json({ success: false, message: "Inventory item not found." }, { status: 404 });
    const history = await prisma.stockMovement.findMany({ where: { inventoryItemId: item.id, restaurantId: context.restaurantId! }, include: { createdBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ success: true, data: item, history });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Failed to fetch inventory details." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { context, item } = await getItem((await params).id);
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!item) return NextResponse.json({ success: false, message: "Inventory item not found." }, { status: 404 });
    const body = await request.json();
    const minimum = Number(body.minimumStock) || 0;
    if (!body.name?.trim() || !body.sku?.trim() || !body.unit?.trim() || minimum < 0) return NextResponse.json({ success: false, message: "Name, SKU, unit, and valid stock limits are required." }, { status: 400 });
    const categoryId = optionalPositiveId(body.categoryId);
    const supplierId = optionalPositiveId(body.supplierId);
    const updated = await prisma.$transaction(async (tx) => {
      await assertInventoryReferences(tx, context.restaurantId!, categoryId, supplierId);
      return tx.inventoryItem.update({ where: { id: item.id }, data: { categoryId, supplierId, name: body.name.trim(), sku: body.sku.trim(), unit: body.unit.trim(), minimumStock: minimum, maximumStock: body.maximumStock ? Number(body.maximumStock) : null, purchasePrice: Number(body.purchasePrice) || 0, sellingPrice: body.sellingPrice ? Number(body.sellingPrice) : null, storageLocation: body.storageLocation?.trim() || null, expiryDate: body.expiryDate ? new Date(body.expiryDate) : null, barcode: body.barcode?.trim() || null, status: body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE", notes: body.notes?.trim() || null } });
    });
    return NextResponse.json({ success: true, message: "Inventory item updated.", data: updated });
  } catch (error) {
    console.error(error);
    if (error instanceof InventoryReferenceError) return NextResponse.json({ success: false, code: error.code, message: error.message }, { status: 400 });
    return NextResponse.json({ success: false, message: "Inventory update failed." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { context, item } = await getItem((await params).id);
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!item) return NextResponse.json({ success: false, message: "Inventory item not found." }, { status: 404 });
    const body = await request.json();
    const type = body.type as (typeof TYPES)[number];
    const quantity = Number(body.quantity);
    if (!TYPES.includes(type) || !Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ success: false, message: "Movement type and a positive quantity are required." }, { status: 400 });
    const result = await prisma.$transaction(async (tx) => {
      if (context.user!.isDemo && context.user!.demoSessionId) await consumeDemoQuota(tx, context.user!.demoSessionId, "record");
      // Serialize movements before reading stock so concurrent requests cannot overwrite each other.
      const rows = await tx.$queryRaw<Array<{ currentStock: { toString(): string } }>>`
        SELECT "currentStock" FROM ${await sqlTable("InventoryItem")}
        WHERE "id" = ${item.id} AND "restaurantId" = ${context.restaurantId!}
        FOR UPDATE
      `;
      if (!rows.length) throw Object.assign(new Error("Inventory item not found."), { code: "STOCK_NOT_FOUND" });
      const previous = Number(rows[0].currentStock);
      const next = type === "STOCK_IN" ? previous + quantity : type === "STOCK_OUT" ? previous - quantity : quantity;
      if (next < 0) throw Object.assign(new Error("Stock cannot become negative."), { code: "INVALID_STOCK" });
      const updated = await tx.inventoryItem.update({ where: { id: item.id }, data: { currentStock: next } });
      const movement = await tx.stockMovement.create({ data: { restaurantId: context.restaurantId!, inventoryItemId: item.id, type, quantity, previousStock: previous, newStock: next, reason: body.reason?.trim() || null, createdById: context.user!.id } });
      return { updated, movement };
    });
    return NextResponse.json({ success: true, message: "Stock movement recorded.", data: result });
  } catch (error) {
    console.error(error);
    const demoFailure = getDemoLimitFailure(error);
    if (demoFailure) return NextResponse.json(demoFailure.body, { status: demoFailure.status });
    if (error && typeof error === "object" && "code" in error && (error.code === "INVALID_STOCK" || error.code === "STOCK_NOT_FOUND")) {
      return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Invalid stock movement." }, { status: error.code === "STOCK_NOT_FOUND" ? 404 : 400 });
    }
    return NextResponse.json({ success: false, message: "Stock movement failed." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { context, item } = await getItem((await params).id);
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!item) return NextResponse.json({ success: false, message: "Inventory item not found." }, { status: 404 });
    await prisma.inventoryItem.delete({ where: { id: item.id } });
    return NextResponse.json({ success: true, message: "Inventory item deleted." });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Inventory deletion failed." }, { status: 500 });
  }
}
