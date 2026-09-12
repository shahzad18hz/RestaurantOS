import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";

export async function requirePermission(module: string, action: string) {
  const context = await requireRestaurantContext();
  if (context.errorStatus) return { context, allowed: false };
  if (context.user!.role === "SUPER_ADMIN") return { context, allowed: true };
  const assignment = await prisma.userRoleAssignment.findUnique({ where: { restaurantId_userId: { restaurantId: context.restaurantId!, userId: context.user!.id } }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
  const allowed = Boolean(assignment?.role.permissions.some(item => item.permission.module === module && item.permission.action === action));
  return { context, allowed };
}
