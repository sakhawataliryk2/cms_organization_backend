class OrganizationDefaultDocument {
  constructor(pool) {
    this.pool = pool;
  }

  async initTable() {
    let client;
    try {
      client = await this.pool.connect();

      await client.query(`
        CREATE TABLE IF NOT EXISTS organization_default_documents (
          id SERIAL PRIMARY KEY,
          slot VARCHAR(50) NOT NULL UNIQUE,
          template_document_id INTEGER REFERENCES template_documents(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_org_default_docs_slot
        ON organization_default_documents(slot)
      `);

      return true;
    } finally {
      if (client) client.release();
    }
  }

  async getBySlot(slot) {
    let client;
    try {
      client = await this.pool.connect();
      const q = `
        SELECT odd.*, td.document_name, td.file_url, td.file_path, td.file_name, td.mime_type
        FROM organization_default_documents odd
        LEFT JOIN template_documents td ON td.id = odd.template_document_id
        WHERE odd.slot = $1
      `;
      const r = await client.query(q, [slot]);
      return r.rows[0] || null;
    } finally {
      if (client) client.release();
    }
  }

  async getAll() {
    let client;
    try {
      client = await this.pool.connect();
      const q = `
        SELECT odd.*, td.document_name, td.file_url, td.file_path, td.file_name, td.mime_type, td.category
        FROM organization_default_documents odd
        LEFT JOIN template_documents td ON td.id = odd.template_document_id
        ORDER BY odd.slot
      `;
      const r = await client.query(q);
      return r.rows;
    } finally {
      if (client) client.release();
    }
  }

  async setSlot(slot, template_document_id) {
    let client;
    try {
      client = await this.pool.connect();

      const existing = await this.getBySlot(slot);

      if (existing) {
        const q = `
          UPDATE organization_default_documents
          SET template_document_id = $2, updated_at = CURRENT_TIMESTAMP
          WHERE slot = $1
          RETURNING *
        `;
        const r = await client.query(q, [slot, template_document_id]);
        return r.rows[0];
      } else {
        const q = `
          INSERT INTO organization_default_documents (slot, template_document_id)
          VALUES ($1, $2)
          RETURNING *
        `;
        const r = await client.query(q, [slot, template_document_id]);
        return r.rows[0];
      }
    } finally {
      if (client) client.release();
    }
  }

  async clearSlot(slot) {
    let client;
    try {
      client = await this.pool.connect();
      const q = `
        UPDATE organization_default_documents
        SET template_document_id = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE slot = $1
        RETURNING *
      `;
      const r = await client.query(q, [slot]);
      return r.rows[0];
    } finally {
      if (client) client.release();
    }
  }
}

module.exports = OrganizationDefaultDocument;
