/** Points DATABASE_URL at a sibling database in the same Postgres instance, so tests never touch dev data. */
export function testDatabaseUrl(base = process.env.DATABASE_URL): string {
  if (!base) throw new Error("DATABASE_URL is not set (check backend/.env)");
  const url = new URL(base);
  url.pathname = "/digital_wealth_test";
  return url.toString();
}
