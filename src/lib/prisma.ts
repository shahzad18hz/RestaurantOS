import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseConfig } from "./database-config";
import { cookies } from "next/headers";
import { verifyToken } from "./jwt";
import { createRoutedClient } from "./routed-client";

const globalDatabase = globalThis as unknown as { restaurantClients?: Map<string, PrismaClient> };
const clients = globalDatabase.restaurantClients ??= new Map();
function clientFor(kind: "main" | "demo") {
  const { schema, connectionString } = databaseConfig(kind);
  const key = `${kind}:${connectionString}`;
  let client = clients.get(key);
  if (!client) {
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }), transactionOptions: { maxWait: 15000, timeout: 20000 } });
    clients.set(key, client);
  }
  return client;
}
export async function requestDatabaseKind(): Promise<"main" | "demo"> {
  let token: string | undefined;
  try {
    token = (await cookies()).get("token")?.value;
  } catch { return "main"; }
  // An expired/invalid demo token must fail, never fall through to real records with matching IDs.
  if (token && (verifyToken(token) as { demoSessionId?: string }).demoSessionId) return "demo";
  return "main";
}
export const mainPrisma = createRoutedClient<PrismaClient>(async () => clientFor("main"));
export const demoPrisma = createRoutedClient<PrismaClient>(async () => clientFor("demo"));
export const prisma = createRoutedClient<PrismaClient>(async () => clientFor(await requestDatabaseKind()));
