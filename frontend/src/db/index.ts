import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import * as schema from "./schema";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const sslCaPath = process.env.DB_SSL_CA;
const buildingForProduction = process.env.NEXT_PHASE === "phase-production-build";
if (process.env.NODE_ENV === "production" && !buildingForProduction && !sslCaPath) {
  throw new Error("DB_SSL_CA is required in production to verify the Aiven TLS certificate");
}

const ssl = sslCaPath
  ? { ca: readFileSync(sslCaPath), rejectUnauthorized: true }
  : { rejectUnauthorized: false };

const globalForDb = globalThis as typeof globalThis & {
  __edusphereMysqlPool?: ReturnType<typeof createPool>;
};

export const pool =
  globalForDb.__edusphereMysqlPool ??
  createPool({
    host: required("DB_HOST"),
    port: Number(process.env.DB_PORT ?? "3306"),
    user: required("DB_USER"),
    password: required("DB_PASSWORD"),
    database: required("DB_NAME"),
    charset: "utf8mb4",
    timezone: "Z",
    ssl,
    connectionLimit: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__edusphereMysqlPool = pool;
}

export const db = drizzle(pool, { schema, mode: "default" });
