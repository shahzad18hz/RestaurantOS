import { Prisma } from "@/generated/prisma/client";
import { consumeDemoQuota } from "@/lib/demo";

type Tx = Prisma.TransactionClient;

type CartInput = { menuItemId: number; quantity: number };

type Requirement = {
  inventoryItemId: number;
  name: string;
  unit: string;
  required: number;
  currentStock: number;
  minimumStock: number;
};

export async function getStockRequirements(
  tx: Tx,
  restaurantId: number,
  items: CartInput[]
): Promise<Requirement[]> {
  if (!items.length) return [];

  const ids = [...new Set(items.map((item) => Number(item.menuItemId)))];
  const menuItems = await tx.menuItem.findMany({
    where: { id: { in: ids }, restaurantId },
    select: {
      id: true,
      recipeIngredients: {
        select: {
          quantity: true,
          inventoryItem: {
            select: {
              id: true,
              name: true,
              unit: true,
              currentStock: true,
              minimumStock: true,
              status: true,
            },
          },
        },
      },
    },
  });

  const byId = new Map<number, Requirement>();
  for (const line of items) {
    const qty = Math.max(1, Number(line.quantity) || 1);
    const menuItem = menuItems.find((item) => item.id === Number(line.menuItemId));
    if (!menuItem) continue;

    for (const recipe of menuItem.recipeIngredients) {
      if (recipe.inventoryItem.status !== "ACTIVE") continue;
      const amount = Number(recipe.quantity) * qty;
      const current = byId.get(recipe.inventoryItem.id);
      if (current) {
        current.required += amount;
      } else {
        byId.set(recipe.inventoryItem.id, {
          inventoryItemId: recipe.inventoryItem.id,
          name: recipe.inventoryItem.name,
          unit: recipe.inventoryItem.unit,
          required: amount,
          currentStock: Number(recipe.inventoryItem.currentStock),
          minimumStock: Number(recipe.inventoryItem.minimumStock),
        });
      }
    }
  }

  return [...byId.values()];
}

export async function assertRecipeStock(
  tx: Tx,
  restaurantId: number,
  items: CartInput[]
) {
  const requirements = await getStockRequirements(tx, restaurantId, items);
  const shortages = requirements.filter((item) => item.currentStock + 1e-9 < item.required);

  if (shortages.length) {
    const details = shortages
      .map(
        (item) =>
          `${item.name}: need ${item.required.toFixed(3)} ${item.unit}, have ${item.currentStock.toFixed(3)} ${item.unit}`
      )
      .join("; ");
    throw new Error(`Insufficient ingredient stock. ${details}`);
  }

  return requirements;
}

export async function deductInventoryForOrder(
  tx: Tx,
  restaurantId: number,
  orderId: number,
  userId?: number,
  demoSessionId?: string | null,
) {
  const order = await tx.order.findFirst({
    where: { id: orderId, restaurantId },
    select: {
      id: true,
      inventoryDeductedAt: true,
      items: { select: { menuItemId: true, quantity: true } },
    },
  });

  if (!order) throw new Error("Order not found for inventory deduction.");
  if (order.inventoryDeductedAt) return { alreadyDeducted: true, movements: 0 };

  const requirements = await assertRecipeStock(tx, restaurantId, order.items);
  if (demoSessionId && requirements.length) await consumeDemoQuota(tx, demoSessionId, "record", requirements.length);

  for (const requirement of requirements) {
    const current = await tx.inventoryItem.findFirst({
      where: { id: requirement.inventoryItemId, restaurantId },
      select: { id: true, name: true, currentStock: true, minimumStock: true, unit: true },
    });
    if (!current) throw new Error(`Inventory item ${requirement.name} no longer exists.`);

    const previousStock = Number(current.currentStock);
    const newStock = previousStock - requirement.required;
    if (newStock < -1e-9) {
      throw new Error(
        `Insufficient ingredient stock for ${current.name}. Need ${requirement.required.toFixed(3)} ${current.unit}, have ${previousStock.toFixed(3)} ${current.unit}.`
      );
    }

    await tx.inventoryItem.update({
      where: { id: current.id },
      data: { currentStock: newStock },
    });

    await tx.stockMovement.create({
      data: {
        restaurantId,
        inventoryItemId: current.id,
        type: "STOCK_OUT",
        quantity: requirement.required,
        previousStock,
        newStock,
        reason: `Automatic recipe deduction for order #${orderId}`,
        createdById: userId ?? null,
      },
    });

    if (newStock <= Number(current.minimumStock)) {
      await tx.notification.upsert({
        where: { dedupeKey: `low-stock-${restaurantId}-${current.id}` },
        update: {
          title: `Low stock: ${current.name}`,
          message: `${newStock.toFixed(3)} ${current.unit} remaining (minimum ${Number(current.minimumStock).toFixed(3)}).`,
          priority: newStock <= 0 ? "CRITICAL" : "HIGH",
          isRead: false,
          readAt: null,
          createdAt: new Date(),
        },
        create: {
          restaurantId,
          type: newStock <= 0 ? "OUT_OF_STOCK_ALERT" : "LOW_STOCK_ALERT",
          priority: newStock <= 0 ? "CRITICAL" : "HIGH",
          channel: "IN_APP",
          title: `Low stock: ${current.name}`,
          message: `${newStock.toFixed(3)} ${current.unit} remaining (minimum ${Number(current.minimumStock).toFixed(3)}).`,
          relatedModule: "inventory",
          relatedId: current.id,
          dedupeKey: `low-stock-${restaurantId}-${current.id}`,
        },
      });
    }
  }

  await tx.order.update({
    where: { id: order.id },
    data: { inventoryDeductedAt: new Date() },
  });

  return { alreadyDeducted: false, movements: requirements.length };
}
