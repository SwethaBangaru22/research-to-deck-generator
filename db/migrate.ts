import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(schema);
    console.log("Migration applied successfully.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
