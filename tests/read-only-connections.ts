import "dotenv/config";
import { mainPrisma, demoPrisma } from "../src/lib/prisma";

async function main() {
  const real = await mainPrisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return { admins: await tx.user.count({ where: { role: "SUPER_ADMIN" } }), owners: await tx.user.count({ where: { role: "OWNER" } }), restaurants: await tx.restaurant.count() };
  }, { timeout: 30000, maxWait: 15000 });
  const demo = await demoPrisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return { sessions: await tx.demoSession.count(), restaurants: await tx.restaurant.count() };
  }, { timeout: 30000, maxWait: 15000 });
  console.log(JSON.stringify({ real, demo, verification: "Read-only Prisma queries completed on separate configured connections" }));
}
main().catch(error => { console.error(error.code || error.name); process.exitCode = 1; }).finally(async () => { await mainPrisma.$disconnect(); await demoPrisma.$disconnect(); });
