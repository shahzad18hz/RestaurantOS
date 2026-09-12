import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";

const ROLES = ["OWNER", "MANAGER", "CASHIER", "WAITER", "CHEF"] as const;
const DEPARTMENTS = ["MANAGEMENT", "KITCHEN", "SERVICE", "CASHIER", "INVENTORY", "CLEANING"] as const;
const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY"] as const;
const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
const STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED", "RESIGNED"] as const;

async function findStaff(id: string) {
  const context = await requireRestaurantContext();
  if (context.errorStatus) return { context, staff: null };
  const staff = await prisma.staff.findFirst({ where: { id: Number(id), restaurantId: context.restaurantId! }, include: { user: { select: { id: true, name: true, email: true, role: true } } } });
  return { context, staff };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { context, staff } = await findStaff((await params).id);
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!staff) return NextResponse.json({ success: false, message: "Staff member not found." }, { status: 404 });
    const [reservations, orders] = await Promise.all([
      prisma.reservation.count({ where: { assignedStaffId: staff.userId } }),
      prisma.order.count({ where: { restaurantId: context.restaurantId!, createdBy: staff.userId } }),
    ]);
    return NextResponse.json({ success: true, data: { ...staff, usage: { reservations, orders } } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Failed to fetch staff details." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { context, staff } = await findStaff((await params).id);
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!staff) return NextResponse.json({ success: false, message: "Staff member not found." }, { status: 404 });
    const body = await request.json();
    if (!body.name?.trim() || !body.email?.trim() || !body.phone?.trim()) return NextResponse.json({ success: false, message: "Name, email, and phone are required." }, { status: 400 });
    if (!ROLES.includes(body.role) || !DEPARTMENTS.includes(body.department) || !EMPLOYMENT_TYPES.includes(body.employmentType)) return NextResponse.json({ success: false, message: "Role, department, and employment type are required." }, { status: 400 });
    const duplicate = await prisma.user.findFirst({ where: { id: { not: staff.userId }, OR: [{ email: body.email.trim().toLowerCase() }, { staffProfile: { phone: body.phone.trim() } }] }, select: { id: true } });
    if (duplicate) return NextResponse.json({ success: false, message: "Email or phone is already used by another staff member." }, { status: 409 });
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id: staff.userId }, data: { name: body.name.trim(), email: body.email.trim().toLowerCase(), role: body.role, ...(body.password?.trim() ? { password: await bcrypt.hash(body.password.trim(), 12) } : {}) } });
      const profile = await tx.staff.update({ where: { id: staff.id }, data: {
        phone: body.phone.trim(), profileImage: body.profileImage || null, cnic: body.cnic?.trim() || null, gender: GENDERS.includes(body.gender) ? body.gender : null, dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        address: body.address?.trim() || null, joiningDate: body.joiningDate ? new Date(body.joiningDate) : staff.joiningDate, department: body.department, branch: body.branch?.trim() || null,
        salary: body.salary ? Number(body.salary) : null, employmentType: body.employmentType, shift: body.shift?.trim() || null, emergencyContact: body.emergencyContact?.trim() || null,
        status: STATUSES.includes(body.status) ? body.status : "ACTIVE", notes: body.notes?.trim() || null,
      } });
      await tx.restaurantUser.updateMany({ where: { restaurantId: context.restaurantId!, userId: staff.userId }, data: { role: body.role } });
      return { user, profile };
    });
    return NextResponse.json({ success: true, message: "Staff member updated successfully.", data: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Staff update failed." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { context, staff } = await findStaff((await params).id);
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    if (!staff) return NextResponse.json({ success: false, message: "Staff member not found." }, { status: 404 });
    const [reservationCount, orderCount] = await Promise.all([
      prisma.reservation.count({ where: { assignedStaffId: staff.userId } }),
      prisma.order.count({ where: { restaurantId: context.restaurantId!, createdBy: staff.userId } }),
    ]);
    if (reservationCount || orderCount) {
      await prisma.staff.update({ where: { id: staff.id }, data: { status: "INACTIVE" } });
      return NextResponse.json({ success: true, message: "Staff member is assigned to records and was marked inactive." });
    }
    await prisma.user.delete({ where: { id: staff.userId } });
    return NextResponse.json({ success: true, message: "Staff member deleted successfully." });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Staff deletion failed." }, { status: 500 });
  }
}
