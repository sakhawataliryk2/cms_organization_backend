// models/tearsheet.js
class Tearsheet {
  constructor(pool) {
    this.pool = pool;
  }

  async initTable() {
    let client;
    try {
      client = await this.pool.connect();

      await client.query(`
        CREATE TABLE IF NOT EXISTS tearsheets (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          visibility VARCHAR(50) NOT NULL DEFAULT 'Existing',
          job_seeker_id INTEGER REFERENCES job_seekers(id) ON DELETE SET NULL,
          hiring_manager_id INTEGER REFERENCES hiring_managers(id) ON DELETE SET NULL,
          job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
          lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tearsheets_created_by ON tearsheets(created_by)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tearsheets_job_id ON tearsheets(job_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tearsheets_created_at ON tearsheets(created_at)
      `);

      return true;
    } catch (error) {
      console.error("❌ Error initializing tearsheets table:", error.message);
      throw error;
    } finally {
      if (client) client.release();
    }
  }

  async create(data) {
    const {
      name,
      visibility = "Existing",
      job_seeker_id = null,
      hiring_manager_id = null,
      job_id = null,
      lead_id = null,
      created_by = null,
    } = data;

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
          INSERT INTO tearsheets
            (name, visibility, job_seeker_id, hiring_manager_id, job_id, lead_id, created_by, created_at, updated_at)
          VALUES
            ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          RETURNING *
        `,
        [name, visibility, job_seeker_id, hiring_manager_id, job_id, lead_id, created_by]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

 async getAll() {
  const client = await this.pool.connect();
  try {
    const result = await client.query(`
      SELECT
        t.*,
        u.name AS owner_name,
        CONCAT_WS(' ', js.first_name, js.last_name) AS job_seeker_name,
        CONCAT_WS(' ', hm.first_name, hm.last_name) AS hiring_manager_name,
        j.job_title AS job_order,
        CONCAT_WS(' ', l.first_name, l.last_name) AS lead_name
      FROM tearsheets t
      LEFT JOIN users u ON t.created_by = u.id
      LEFT JOIN job_seekers js ON t.job_seeker_id = js.id
      LEFT JOIN hiring_managers hm ON t.hiring_manager_id = hm.id
      LEFT JOIN jobs j ON t.job_id = j.id
      LEFT JOIN leads l ON t.lead_id = l.id
      ORDER BY t.created_at DESC
    `);
    return result.rows;
  } finally {
    client.release();
  }
}

}

module.exports = Tearsheet;


