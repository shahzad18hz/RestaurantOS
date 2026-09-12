export const DEMO_BLOCKED_DASHBOARD_PREFIXES = [
  "/dashboard/restaurants", "/dashboard/subscriptions", "/dashboard/payments", "/dashboard/system-configuration",
  "/dashboard/backups", "/dashboard/staff", "/dashboard/roles", "/dashboard/messaging", "/dashboard/settings",
  "/dashboard/restaurant-profile", "/dashboard/owner-profile", "/dashboard/branches", "/dashboard/suppliers",
  "/dashboard/expenses", "/dashboard/finance",
] as const;

export const DEMO_BLOCKED_API_PREFIXES = [
  "/api/restaurant", "/api/upload", "/api/webhooks", "/api/admin", "/api/owner/staff", "/api/owner/roles",
  "/api/owner/messaging", "/api/owner/settings", "/api/owner/restaurant-profile", "/api/owner/profile",
  "/api/owner/subscriptions", "/api/owner/backups", "/api/owner/payments", "/api/owner/branches", "/api/owner/supplier",
  "/api/owner/plans",
  "/api/owner/expense", "/api/owner/finance",
] as const;

export function matchesPrefix(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isExpired(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() <= now.getTime();
}

export function remainingSeconds(expiresAt: Date, now = new Date()) {
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}
