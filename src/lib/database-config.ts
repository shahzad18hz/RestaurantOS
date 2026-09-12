export type DatabaseKind = "main" | "demo";

export function databaseConfig(kind: DatabaseKind = "main") {
  const connectionString = kind === "demo" ? process.env.DEMO_DATABASE_URL || process.env.DATABASE_URL : process.env.MAIN_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const schema = kind === "demo" ? process.env.DEMO_DATABASE_SCHEMA || "restaurantos_demo_v2" : process.env.APP_DATABASE_SCHEMA || "public";
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Unsupported database schema name.");
  const url = new URL(connectionString);
  url.searchParams.set("schema", schema);
  const otherUrlValue = kind === "demo" ? process.env.MAIN_DATABASE_URL || process.env.DATABASE_URL : process.env.DEMO_DATABASE_URL || process.env.DATABASE_URL;
  const otherSchema = kind === "demo" ? process.env.APP_DATABASE_SCHEMA || "public" : process.env.DEMO_DATABASE_SCHEMA || "restaurantos_demo_v2";
  if (otherUrlValue) {
    const other = new URL(otherUrlValue);
    if (url.hostname === other.hostname && url.port === other.port && url.pathname === other.pathname && schema === otherSchema) {
      throw new Error("Main and demo must not use the same database schema.");
    }
  }
  return { connectionString: url.toString(), schema };
}
