import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const context = await requireRestaurantContext();
    if (context.errorStatus) {
      return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    }
    if (!context.user || !["SUPER_ADMIN", "OWNER", "MANAGER", "WAITER"].includes(context.user.role)) {
      return NextResponse.json({ success: false, message: "Your role cannot transfer or merge tables." }, { status: 403 });
    }

    const body = await request.json();
    const sourceTableId = Number(body.sourceTableId);
    const targetTableId = Number(body.targetTableId);
    const action = body.action === "MERGE" ? "MERGE" : "TRANSFER";

    if (!Number.isInteger(sourceTableId) || !Number.isInteger(targetTableId) || sourceTableId === targetTableId) {
      return NextResponse.json({ success: false, message: "Choose two different valid tables." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const tables = await tx.diningTable.findMany({
        where: { restaurantId: context.restaurantId!, id: { in: [sourceTableId, targetTableId] } },
        include: {
          orders: {
            where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
            include: { bill: true, items: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });
      const source = tables.find((table) => table.id === sourceTableId);
      const target = tables.find((table) => table.id === targetTableId);
      if (!source || !target) throw new Error("Source or destination table was not found.");

      const sourceOrder = source.orders[0];
      const targetOrder = target.orders[0];
      if (!sourceOrder) throw new Error(`${source.name} has no active order to move.`);
      if (sourceOrder.paymentStatus !== "UNPAID" || sourceOrder.bill) {
        throw new Error("Paid/partially paid or already billed orders cannot be moved or merged.");
      }

      if (action === "TRANSFER") {
        if (targetOrder) throw new Error(`${target.name} already has an active order. Use Merge instead.`);
        if (target.status === "RESERVED") throw new Error(`${target.name} is reserved. Clear the reservation before transferring.`);

        const updated = await tx.order.update({ where: { id: sourceOrder.id }, data: { tableId: target.id } });
        await tx.diningTable.update({ where: { id: source.id }, data: { status: "AVAILABLE" } });
        await tx.diningTable.update({ where: { id: target.id }, data: { status: "OCCUPIED" } });
        return { action, orderId: updated.id, message: `Order transferred from ${source.name} to ${target.name}.` };
      }

      if (!targetOrder) throw new Error(`${target.name} has no active order. Use Transfer instead.`);
      if (targetOrder.paymentStatus !== "UNPAID" || targetOrder.bill) {
        throw new Error("Destination order is already billed or has payment activity and cannot be merged.");
      }

      await tx.orderItem.updateMany({ where: { orderId: sourceOrder.id }, data: { orderId: targetOrder.id } });
      const subtotal = Number(sourceOrder.subtotal) + Number(targetOrder.subtotal);
      const discountAmount = Number(sourceOrder.discountAmount) + Number(targetOrder.discountAmount);
      const taxAmount = Number(sourceOrder.taxAmount) + Number(targetOrder.taxAmount);
      const totalAmount = Math.max(0, subtotal + taxAmount - discountAmount);
      const mergeNote = `Merged order ${sourceOrder.orderNumber} from ${source.name}.`;

      await tx.order.update({
        where: { id: targetOrder.id },
        data: {
          subtotal,
          discountAmount,
          taxAmount,
          totalAmount,
          notes: targetOrder.notes ? `${targetOrder.notes}\n${mergeNote}` : mergeNote,
        },
      });
      await tx.order.update({
        where: { id: sourceOrder.id },
        data: { status: "CANCELLED", notes: sourceOrder.notes ? `${sourceOrder.notes}\nMerged into ${targetOrder.orderNumber}.` : `Merged into ${targetOrder.orderNumber}.` },
      });
      await tx.diningTable.update({ where: { id: source.id }, data: { status: "AVAILABLE" } });
      await tx.diningTable.update({ where: { id: target.id }, data: { status: "OCCUPIED" } });

      return { action, orderId: targetOrder.id, message: `${source.name} merged into ${target.name}. Items now share one bill.` };
    });

    await writeAuditLog({ restaurantId: context.restaurantId!, actorId: context.user!.id, action: `TABLE_${result.action}`, entity: "DiningTable", entityId: sourceTableId, details: { targetTableId, orderId: result.orderId } });
    return NextResponse.json({ success: true, message: result.message, data: result });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Table action failed.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
