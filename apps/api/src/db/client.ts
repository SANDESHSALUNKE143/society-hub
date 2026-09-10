import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { mysqlConnectOptions } from "../lib/mysql-connect";
import * as schema from "./schema";

const url =
  process.env.DATABASE_URL ??
  "mysql://root:1900Summer%40@127.0.0.1:3306/societyhub";

const pool = mysql.createPool(mysqlConnectOptions(url));

export const db = drizzle(pool, { schema, mode: "default" });
export type Db = typeof db;

export async function closeDb() {
  await pool.end();
}
