class Onboarding {
  constructor(pool) {
    this.pool = pool;
  }

  async initTables() {
    let client;
    try {
      client = await this.pool.connect();

      await client.query(`
        CREATE TABLE IF NOT EXISTS onboarding_sends (
          id SERIAL PRIMARY KEY,
          job_seeker_id INTEGER NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
          recipient_email VARCHAR(255) NOT NULL,
          created_by INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

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
      if (client) client.release();
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
        for (const row of r.rows)
          packetDocIds.push(Number(row.template_document_id));
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

  async createSend({
    job_seeker_id,
    recipient_email,
    created_by,
    template_document_ids,
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const sendRes = await client.query(
        `
        INSERT INTO onboarding_sends (job_seeker_id, recipient_email, created_by, created_at)
        VALUES ($1,$2,$3,NOW())
        RETURNING *
        `,
        [job_seeker_id, recipient_email, created_by || null]
      );

      const sendRow = sendRes.rows[0];

      if (template_document_ids.length) {
        const values = [];
        const placeholders = template_document_ids
          .map((docId, i) => {
            const base = i * 2;
            values.push(sendRow.id, docId);
            return `($${base + 1}, $${base + 2})`;
          })
          .join(",");

        await client.query(
          `
          INSERT INTO onboarding_send_items (onboarding_send_id, template_document_id, status, sent_at)
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
      const s = await client.query(
        `SELECT * FROM onboarding_sends WHERE id=$1`,
        [sendId]
      );
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
        [sendId]
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
          td.document_name,
          osi.status,
          osi.sent_at,
          osi.completed_at
        FROM onboarding_sends os
        JOIN onboarding_send_items osi ON osi.onboarding_send_id = os.id
        JOIN template_documents td ON td.id = osi.template_document_id
        WHERE os.job_seeker_id = $1
        ORDER BY osi.sent_at DESC
        `,
        [job_seeker_id]
      );
      return r.rows || [];
    } finally {
      client.release();
    }
  }
}

module.exports = Onboarding;
