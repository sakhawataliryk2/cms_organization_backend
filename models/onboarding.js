// models/onboarding.js
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

class Onboarding {
  constructor(pool) {
    this.pool = pool;
  }

  async initTables() {
    const client = await this.pool.connect();
    try {
      // 1) onboarding_sends
      await client.query(`
        CREATE TABLE IF NOT EXISTS onboarding_sends (
          id SERIAL PRIMARY KEY,
          job_seeker_id INTEGER NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
          recipient_email VARCHAR(255) NOT NULL,
          created_by INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 2) onboarding_send_items
      await client.query(`
        CREATE TABLE IF NOT EXISTS onboarding_send_items (
          id SERIAL PRIMARY KEY,
          onboarding_send_id INTEGER NOT NULL REFERENCES onboarding_sends(id) ON DELETE CASCADE,
          template_document_id INTEGER NOT NULL REFERENCES template_documents(id),
          status VARCHAR(20) NOT NULL DEFAULT 'SENT',
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP NULL,
          UNIQUE(onboarding_send_id, template_document_id)
        )
      `);
      // ✅ If table already existed (old version), make sure required columns exist
        await client.query(`
          ALTER TABLE onboarding_send_items
          ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'SENT'
        `);

        await client.query(`
          ALTER TABLE onboarding_send_items
          ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        `);

        await client.query(`
          ALTER TABLE onboarding_send_items
          ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP NULL
        `);


      // 3) portal accounts table (job seeker login)
      await client.query(`
        CREATE TABLE IF NOT EXISTS job_seeker_portal_accounts (
          id SERIAL PRIMARY KEY,
          job_seeker_id INTEGER NOT NULL UNIQUE REFERENCES job_seekers(id) ON DELETE CASCADE,
          email VARCHAR(255) NOT NULL,
          password_hash TEXT NOT NULL,
          must_reset_password BOOLEAN DEFAULT TRUE,
          created_by INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`
  ALTER TABLE job_seeker_portal_accounts
  ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN NOT NULL DEFAULT true
`);


      // indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_onboarding_sends_job_seeker
        ON onboarding_sends(job_seeker_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_onboarding_send_items_send
        ON onboarding_send_items(onboarding_send_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_onboarding_send_items_status
        ON onboarding_send_items(status)
      `);

      return true;
    } finally {
      client.release();
    }
  }

  async resolveTemplateDocIds({ packet_ids = [], document_ids = [] }) {
    const client = await this.pool.connect();
    try {
      const packetDocIds = [];

      if (Array.isArray(packet_ids) && packet_ids.length) {
        const r = await client.query(
          `
          SELECT DISTINCT pd.template_document_id
          FROM packet_documents pd
          JOIN packets p ON p.id = pd.packet_id
          JOIN template_documents td ON td.id = pd.template_document_id
          WHERE pd.packet_id = ANY($1::int[])
            AND p.status = TRUE
            AND td.status = TRUE
          `,
          [packet_ids.map(Number)]
        );

        for (const row of r.rows) {
          packetDocIds.push(Number(row.template_document_id));
        }
      }

      const direct = (Array.isArray(document_ids) ? document_ids : [])
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0);

      const combined = [...packetDocIds, ...direct];
      return [...new Set(combined)];
    } finally {
      client.release();
    }
  }

  async hasAnySend(job_seeker_id) {
    const client = await this.pool.connect();
    try {
      const r = await client.query(
        `SELECT 1 FROM onboarding_sends WHERE job_seeker_id=$1 LIMIT 1`,
        [Number(job_seeker_id)]
      );
      return r.rowCount > 0;
    } finally {
      client.release();
    }
  }

  generateTempPassword() {
    // readable temp password
    return crypto.randomBytes(6).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
  }

  async getOrCreatePortalAccount({ job_seeker_id, email, created_by }) {
    const client = await this.pool.connect();
    try {
      // already exists?
      const existing = await client.query(
        `SELECT id, email FROM job_seeker_portal_accounts WHERE job_seeker_id=$1`,
        [Number(job_seeker_id)]
      );

      if (existing.rowCount) {
        return { created: false, tempPassword: null };
      }

      const tempPassword = this.generateTempPassword();
      const password_hash = await bcrypt.hash(tempPassword, 10);

      // ✅ IMPORTANT FIX:
      // columns count == values count
      await client.query(
        `
        INSERT INTO job_seeker_portal_accounts
          (job_seeker_id, email, password_hash, must_reset_password, created_by)
        VALUES ($1, $2, $3, TRUE, $4)
        `,
        [Number(job_seeker_id), String(email || ""), password_hash, created_by || null]
      );

      return { created: true, tempPassword };
    } finally {
      client.release();
    }
  }

  async createSend({ job_seeker_id, recipient_email, created_by, template_document_ids }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // ✅ IMPORTANT FIX:
      // do NOT include created_at in insert columns (it has default)
      const sendRes = await client.query(
        `
        INSERT INTO onboarding_sends (job_seeker_id, recipient_email, created_by)
        VALUES ($1, $2, $3)
        RETURNING *
        `,
        [Number(job_seeker_id), String(recipient_email || ""), created_by || null]
      );

      const sendRow = sendRes.rows[0];

      if (Array.isArray(template_document_ids) && template_document_ids.length) {
        const ids = template_document_ids.map(Number).filter((n) => n > 0);

        const values = [];
        const placeholders = ids
          .map((docId, i) => {
            const base = i * 2;
            values.push(sendRow.id, docId);
            return `($${base + 1}, $${base + 2})`;
          })
          .join(",");

        await client.query(
          `
          INSERT INTO onboarding_send_items (onboarding_send_id, template_document_id)
          VALUES ${placeholders}
          ON CONFLICT (onboarding_send_id, template_document_id) DO NOTHING
          `,
          values
        );
      }

      await client.query("COMMIT");
      return sendRow;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async getSendDetails(sendId) {
    const client = await this.pool.connect();
    try {
      const s = await client.query(`SELECT * FROM onboarding_sends WHERE id=$1`, [Number(sendId)]);
      const send = s.rows[0];
      if (!send) return null;

      const items = await client.query(
        `
        SELECT
          osi.id,
          osi.template_document_id,
          osi.status,
          td.document_name,
          td.category
        FROM onboarding_send_items osi
        JOIN template_documents td ON td.id = osi.template_document_id
        WHERE osi.onboarding_send_id = $1
        ORDER BY osi.id ASC
        `,
        [Number(sendId)]
      );

      return { send, items: items.rows || [] };
    } finally {
      client.release();
    }
  }

async listForJobSeeker(job_seeker_id) {
  const client = await this.pool.connect();
  try {
    const r = await client.query(
      `
      SELECT
        osi.id,
        td.id as template_document_id,
        td.document_name,
        osi.status,
        osi.sent_at,
        osi.completed_at,
        td.file_url, -- Fetch the file_url from the template_documents table
        td.file_name, -- Optionally, you can also fetch file_name if needed
        td.mime_type, -- Fetch mime type, useful for rendering
        json_agg(
  json_build_object(
    'field_name', f.field_name,
    'field_label', f.field_label,
    'field_type', f.field_type,
    'x', f.x,   -- Yeh add karein
    'y', f.y,   -- Yeh add karein
    'w', f.w,   -- Yeh add karein
    'h', f.h    -- Yeh add karein
  )
) as mapped_fields
      FROM onboarding_sends os
      JOIN onboarding_send_items osi ON osi.onboarding_send_id = os.id
      JOIN template_documents td ON td.id = osi.template_document_id
      LEFT JOIN template_document_mappings f ON f.template_document_id = td.id
      WHERE os.job_seeker_id = $1
      GROUP BY osi.id, td.id
      ORDER BY osi.sent_at DESC
      `,
      [Number(job_seeker_id)]
    );
    return r.rows || []; // Return documents with mapped fields and file_url
  } finally {
    client.release(); // Always release the client after the query
  }
}
async getJobseekerData(job_seeker_id, template_document_id) {
  const client = await this.pool.connect();
  try {
    // 1. Pehle mappings uthain (e.g., Field_1 -> "First Name")
    const mappingsResult = await client.query(
      `SELECT field_name, field_label FROM template_document_mappings WHERE template_document_id = $1`,
      [template_document_id]
    );

    // 2. Jobseeker ka poora data uthain (including custom_fields)
    const jobseekerResult = await client.query(
      `SELECT * FROM job_seekers WHERE id = $1`,
      [Number(job_seeker_id)]
    );

    const js = jobseekerResult.rows[0];
    if (!js) return {};

    const mappedData = {};

    // 3. Mapping loop: label match karein
    mappingsResult.rows.forEach(mapping => {
      const label = mapping.field_label; // e.g., "First Name" or "Address"
      
      // Pehle check karein agar ye standard column hai (lowercase check)
      const standardKey = label.toLowerCase().replace(" ", "_");
      
      if (js[standardKey] !== undefined) {
        mappedData[mapping.field_name] = js[standardKey];
      } 
      // Phir check karein custom_fields JSON ke andar
      else if (js.custom_fields && js.custom_fields[label] !== undefined) {
        mappedData[mapping.field_name] = js.custom_fields[label];
      }
      else {
        mappedData[mapping.field_name] = ""; // Agar kuch na mile
      }
    });

    return mappedData;
  } finally {
    client.release();
  }
}
async getJobseekerProfile(job_seeker_id) {
  const client = await this.pool.connect();
  try {
    // Fetch jobseeker data without specifying each field
    const jobseekerResult = await client.query(
      `SELECT * FROM job_seekers WHERE id = $1`, [Number(job_seeker_id)]
    );

    const js = jobseekerResult.rows[0];
    if (!js) return {};

    // Return the entire record as the profile data
    return js;
  } finally {
    client.release();
  }
}


}

module.exports = Onboarding;
