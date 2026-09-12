export function configureTestDatabase() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) return false;
  const url = new URL(databaseUrl);
  if (!decodeURIComponent(url.pathname).endsWith("_test") || process.env.TEST_ALLOW_DATABASE_RESET !== "1") {
    throw new Error("Integration tests require a disposable database ending in _test and TEST_ALLOW_DATABASE_RESET=1. Never use production data.");
  }
  process.env.DATABASE_URL = databaseUrl;
  process.env.MAIN_DATABASE_URL = databaseUrl;
  process.env.DEMO_DATABASE_URL = databaseUrl;
  return true;
}

export function requireLocalTestApp(appUrl: string) {
  const url = new URL(appUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("TEST_APP_URL must be a local disposable test server using TEST_DATABASE_URL and the same secrets.");
  }
}
