import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mysqlConnectOptions } from "../lib/mysql-connect";

const url =
  process.env.DATABASE_URL ??
  "mysql://root:1900Summer%40@127.0.0.1:3306/societyhub";

export async function applyMigrations() {
  const conn = await mysql.createConnection(mysqlConnectOptions(url));
  const db = drizzle(conn);
  const migrationsFolder = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../drizzle",
  );
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied");
  await conn.end();
}

if (import.meta.main) {
  applyMigrations().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
