import "dotenv/config";
import { readFileSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

const caPath = process.env.DB_SSL_CA;

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    host: process.env.DB_HOST ?? "",
    port: Number(process.env.DB_PORT ?? "3306"),
    user: process.env.DB_USER ?? "",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "",
    ssl: caPath
      ? { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  },
});
