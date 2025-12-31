class TemplateDocument {
  constructor(pool) {
    this.pool = pool;
  }

  async initTable() {
    let client;
    try {
      client = await this.pool.connect();

      await client.query(`
        CREATE TABLE IF NOT EXISTS template_documents (
          id SERIAL PRIMARY KEY,
          document_name VARCHAR(255) NOT NULL,
          category VARCHAR(80) NOT NULL,
          description TEXT,
          approval_required BOOLEAN DEFAULT FALSE,
          additional_docs_required BOOLEAN DEFAULT FALSE,

          file_name VARCHAR(255),
          file_path TEXT,
          file_size INTEGER,
          mime_type VARCHAR(100),

          created_by INTEGER REFERENCES users(id),
          status BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS template_document_notifications (
          id SERIAL PRIMARY KEY,
          template_document_id INTEGER REFERENCES template_documents(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_template_documents_status
        ON template_documents(status)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_template_document_notifications_doc
        ON template_document_notifications(template_document_id)
      `);

      return true;
    } finally {
      if (client) client.release();
    }
  }

  async getAll() {
    const client = await this.pool.connect();
    try {
      const q = `
        SELECT td.*, u.name AS created_by_name
        FROM template_documents td
        LEFT JOIN users u ON u.id = td.created_by
        WHERE td.status = TRUE
        ORDER BY td.created_at DESC
      `;
      const r = await client.query(q);
      return r.rows;
    } finally {
      client.release();
    }
  }

  async getById(id) {
    const client = await this.pool.connect();
    try {
      const q = `
        SELECT td.*, u.name AS created_by_name
        FROM template_documents td
        LEFT JOIN users u ON u.id = td.created_by
        WHERE td.id = $1
      `;
      const r = await client.query(q, [id]);
      return r.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async create(data) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const q = `
        INSERT INTO template_documents (
          document_name, category, description,
          approval_required, additional_docs_required,
          file_name, file_path, file_size, mime_type,
          created_by, status, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,NOW(),NOW())
        RETURNING *
      `;

      const values = [
        data.document_name,
        data.category,
        data.description || null,
        !!data.approval_required,
        !!data.additional_docs_required,
        data.file_name || null,
        data.file_path || null,
        data.file_size || null,
        data.mime_type || null,
        data.created_by || null,
      ];

      const inserted = await client.query(q, values);
      const doc = inserted.rows[0];

      // notifications mapping
      if (
        Array.isArray(data.notification_user_ids) &&
        data.notification_user_ids.length
      ) {
        const rows = data.notification_user_ids.map((uid) => [doc.id, uid]);
        const flat = rows.flat();

        // build ($1,$2),($3,$4) ...
        const placeholders = rows
          .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)
          .join(",");

        await client.query(
          `INSERT INTO template_document_notifications (template_document_id, user_id) VALUES ${placeholders}`,
          flat
        );
      }

      await client.query("COMMIT");
      return doc;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async update(id, data) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const q = `
        UPDATE template_documents
        SET document_name = COALESCE($1, document_name),
            category = COALESCE($2, category),
            description = COALESCE($3, description),
            approval_required = COALESCE($4, approval_required),
            additional_docs_required = COALESCE($5, additional_docs_required),
            file_name = COALESCE($6, file_name),
            file_path = COALESCE($7, file_path),
            file_size = COALESCE($8, file_size),
            mime_type = COALESCE($9, mime_type),
            updated_at = NOW()
        WHERE id = $10
        RETURNING *
      `;

      const r = await client.query(q, [
        data.document_name ?? null,
        data.category ?? null,
        data.description ?? null,
        typeof data.approval_required === "boolean"
          ? data.approval_required
          : null,
        typeof data.additional_docs_required === "boolean"
          ? data.additional_docs_required
          : null,
        data.file_name ?? null,
        data.file_path ?? null,
        data.file_size ?? null,
        data.mime_type ?? null,
        id,
      ]);

      // replace notifications if provided
      if (Array.isArray(data.notification_user_ids)) {
        await client.query(
          `DELETE FROM template_document_notifications WHERE template_document_id = $1`,
          [id]
        );

        if (data.notification_user_ids.length) {
          const rows = data.notification_user_ids.map((uid) => [id, uid]);
          const flat = rows.flat();
          const placeholders = rows
            .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)
            .join(",");
          await client.query(
            `INSERT INTO template_document_notifications (template_document_id, user_id) VALUES ${placeholders}`,
            flat
          );
        }
      }

      await client.query("COMMIT");
      return r.rows[0] || null;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async softDelete(id) {
    const client = await this.pool.connect();
    try {
      const q = `UPDATE template_documents SET status = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *`;
      const r = await client.query(q, [id]);
      return r.rows[0] || null;
    } finally {
      client.release();
    }
  }
}

module.exports = TemplateDocument;
