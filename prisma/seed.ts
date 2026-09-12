import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { UserRole } from "../src/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { databaseConfig } from "../src/lib/database-config";

const { schema, ...connection } = databaseConfig();
const adapter = new PrismaPg(connection, { schema });

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  if (process.env.ALLOW_ADMIN_SEED !== "1") throw new Error("Admin seed disabled to preserve existing accounts. Use normal login. Only set ALLOW_ADMIN_SEED=1 when intentionally creating or resetting an administrator.");
  console.log("🌱 Seeding Started...");

  const adminName = process.env.SEED_ADMIN_NAME?.trim() || "Super Admin";
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error(
      "Missing SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD. Copy .env.example to .env and set fresh seed credentials before running prisma db seed."
    );
  }

  if (adminPassword.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters long.");
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: {
      email: adminEmail,
    },
    update: {
      name: adminName,
      password: hashedPassword,
      role: UserRole.SUPER_ADMIN,
    },
    create: {
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      role: UserRole.SUPER_ADMIN,
    },
  });

  console.log("✅ Super Admin Created/Updated Successfully");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
