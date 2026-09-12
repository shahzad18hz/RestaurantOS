import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";

const ROLES = ["OWNER", "MANAGER", "CASHIER", "WAITER", "CHEF"] as const;
const DEPARTMENTS = ["MANAGEMENT", "KITCHEN", "SERVICE", "CASHIER", "INVENTORY", "CLEANING"] as const;
const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY"] as const;
const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
const STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED", "RESIGNED"] as const;

function employeeId(restaurantId: number) {
  return `EMP-${restaurantId}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

const staffInclude = {
  user: { select: { id: true, name: true, email: true, role: true } },
} as const;

export async function GET(request: NextRequest) {
  try {
    const context = await requireRestaurantContext();
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page")) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(params.get("pageSize")) || 10));
    const search = params.get("search")?.trim() || "";
    const status = params.get("status");
    const department = params.get("department");
    const where = {
      restaurantId: context.restaurantId!,
      ...(STATUSES.includes(status as (typeof STATUSES)[number]) ? { status: status as (typeof STATUSES)[number] } : {}),
      ...(DEPARTMENTS.includes(department as (typeof DEPARTMENTS)[number]) ? { department: department as (typeof DEPARTMENTS)[number] } : {}),
      ...(search ? { OR: [
        { employeeId: { contains: search, mode: "insensitive" as const } },
        { user: { name: { contains: search, mode: "insensitive" as const } } },
        { user: { email: { contains: search, mode: "insensitive" as const } } },
        { phone: { contains: search, mode: "insensitive" as const } },
      ] } : {}),
    };
    const [staff, total] = await Promise.all([
      prisma.staff.findMany({ where, include: staffInclude, orderBy: params.get("sort") === "recent" ? { createdAt: "desc" } : { employeeId: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.staff.count({ where }),
    ]);
    return NextResponse.json({ success: true, data: staff, meta: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Failed to fetch staff." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireRestaurantContext();
    if (context.errorStatus) return NextResponse.json({ success: false, message: context.errorMessage }, { status: context.errorStatus });
    const body = await request.json();
    if (!body.name?.trim() || !body.email?.trim() || !body.phone?.trim()) return NextResponse.json({ success: false, message: "Name, email, and phone are required." }, { status: 400 });
    if (!ROLES.includes(body.role) || !DEPARTMENTS.includes(body.department) || !EMPLOYMENT_TYPES.includes(body.employmentType)) return NextResponse.json({ success: false, message: "Role, department, and employment type are required." }, { status: 400 });
    const duplicate = await prisma.user.findFirst({ where: { OR: [{ email: body.email.trim().toLowerCase() }, { staffProfile: { phone: body.phone.trim() } }] }, select: { id: true } });
    if (duplicate) return NextResponse.json({ success: false, message: "Email or phone is already used by another staff member." }, { status: 409 });
    const temporaryPassword = body.password?.trim() || `Staff@${Math.floor(100000 + Math.random() * 900000)}`;
    const generatedEmployeeId = employeeId(context.restaurantId!);
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({ data: { name: body.name.trim(), email: body.email.trim().toLowerCase(), password: await bcrypt.hash(temporaryPassword, 12), role: body.role } });
      await tx.restaurantUser.create({ data: { restaurantId: context.restaurantId!, userId: createdUser.id, role: body.role } });
      await tx.staff.create({ data: {
        restaurantId: context.restaurantId!, userId: createdUser.id, employeeId: generatedEmployeeId, phone: body.phone.trim(), profileImage: body.profileImage || null,
        cnic: body.cnic?.trim() || null, gender: GENDERS.includes(body.gender) ? body.gender : null, dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        address: body.address?.trim() || null, joiningDate: body.joiningDate ? new Date(body.joiningDate) : new Date(), department: body.department,
        branch: body.branch?.trim() || null, salary: body.salary ? Number(body.salary) : null, employmentType: body.employmentType, shift: body.shift?.trim() || null,
        emergencyContact: body.emergencyContact?.trim() || null, status: STATUSES.includes(body.status) ? body.status : "ACTIVE", notes: body.notes?.trim() || null,
      } });
      return createdUser;
    });
    return NextResponse.json({ success: true, message: "Staff member created successfully.", data: { id: user.id, employeeId: generatedEmployeeId, temporaryPassword } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Staff creation failed." }, { status: 500 });
  }
}
