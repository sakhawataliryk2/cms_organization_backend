/**
 * Seed up to 500 fields for Placements Executive Search (field management).
 * Ensures total count is exactly 500: if some already exist, adds only enough (Field_1..Field_500, skipping existing names).
 * Field name and label: Field_1, Field_2, ... Field_500 (same as other modules). New ones are hidden.
 * Run from backend root: node scripts/seed-placement-executive-search-fields.js
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const { getPool } = require("../config/getPool");

const ENTITY_TYPE = "placements-executive-search";
const TARGET_TOTAL = 500;

async function run() {
  let pool;
  let client;
  try {
    pool = getPool();
    client = await pool.connect();
  } catch (err) {
    console.error("Database connection failed:", err.message);
    throw err;
  }

  try {
    const existing = await client.query(
      "SELECT field_name FROM custom_field_definitions WHERE entity_type = $1",
      [ENTITY_TYPE]
    );
    const existingNames = new Set(existing.rows.map((r) => r.field_name));
    const existingCount = existing.rows.length;
    const needed = TARGET_TOTAL - existingCount;

    if (needed <= 0) {
      console.log(`${ENTITY_TYPE} already has ${existingCount} fields (target ${TARGET_TOTAL}). Nothing to add.`);
      return;
    }

    const toInsert = [];
    for (let i = 1; i <= TARGET_TOTAL && toInsert.length < needed; i++) {
      const name = `Field_${i}`;
      if (existingNames.has(name)) continue;
      toInsert.push({ name, sortOrder: i });
    }

    const BATCH_SIZE = 50;
    let inserted = 0;
    for (let b = 0; b < toInsert.length; b += BATCH_SIZE) {
      const batch = toInsert.slice(b, b + BATCH_SIZE);
      for (const { name, sortOrder } of batch) {
        await client.query(
          `INSERT INTO custom_field_definitions (
            entity_type, field_name, field_label, field_type,
            is_required, is_hidden, is_read_only, sort_order,
            created_by, updated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL)
          ON CONFLICT (entity_type, field_name) DO NOTHING`,
          [ENTITY_TYPE, name, name, "text", false, true, false, sortOrder]
        );
        inserted++;
      }
      if (inserted % 100 === 0) console.log(`Inserted ${inserted}/${needed}...`);
    }

    const newTotal = existingCount + inserted;
    console.log(`Done. Added ${inserted} fields. ${ENTITY_TYPE} now has ${newTotal} fields total (target ${TARGET_TOTAL}).`);
  } catch (err) {
    console.error("Seed script error:", err.message);
    if (err.code) console.error("Code:", err.code);
    throw err;
  } finally {
    if (client) client.release();
    if (pool && typeof pool.end === "function") await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
