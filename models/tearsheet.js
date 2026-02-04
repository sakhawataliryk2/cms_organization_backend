// models/tearsheet.js
class Tearsheet {
  constructor(pool) {
    this.pool = pool;
  }

  async initTable() {
    let client;
    try {
      client = await this.pool.connect();

      // Create main tearsheets table
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

      // Create junction tables for many-to-many relationships
      await client.query(`
        CREATE TABLE IF NOT EXISTS tearsheet_job_seekers (
          tearsheet_id INTEGER REFERENCES tearsheets(id) ON DELETE CASCADE,
          job_seeker_id INTEGER REFERENCES job_seekers(id) ON DELETE CASCADE,
          added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (tearsheet_id, job_seeker_id)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS tearsheet_hiring_managers (
          tearsheet_id INTEGER REFERENCES tearsheets(id) ON DELETE CASCADE,
          hiring_manager_id INTEGER REFERENCES hiring_managers(id) ON DELETE CASCADE,
          added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (tearsheet_id, hiring_manager_id)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS tearsheet_jobs (
          tearsheet_id INTEGER REFERENCES tearsheets(id) ON DELETE CASCADE,
          job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
          added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (tearsheet_id, job_id)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS tearsheet_leads (
          tearsheet_id INTEGER REFERENCES tearsheets(id) ON DELETE CASCADE,
          lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
          added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (tearsheet_id, lead_id)
        )
      `);

      // Migrate existing data from single FKs to junction tables
      await client.query(`
        INSERT INTO tearsheet_job_seekers (tearsheet_id, job_seeker_id)
        SELECT id, job_seeker_id FROM tearsheets 
        WHERE job_seeker_id IS NOT NULL
        ON CONFLICT DO NOTHING
      `);

      await client.query(`
        INSERT INTO tearsheet_hiring_managers (tearsheet_id, hiring_manager_id)
        SELECT id, hiring_manager_id FROM tearsheets 
        WHERE hiring_manager_id IS NOT NULL
        ON CONFLICT DO NOTHING
      `);

      await client.query(`
        INSERT INTO tearsheet_jobs (tearsheet_id, job_id)
        SELECT id, job_id FROM tearsheets 
        WHERE job_id IS NOT NULL
        ON CONFLICT DO NOTHING
      `);

      await client.query(`
        INSERT INTO tearsheet_leads (tearsheet_id, lead_id)
        SELECT id, lead_id FROM tearsheets 
        WHERE lead_id IS NOT NULL
        ON CONFLICT DO NOTHING
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tearsheets_created_by ON tearsheets(created_by)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tearsheets_job_id ON tearsheets(job_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tearsheets_created_at ON tearsheets(created_at)
      `);

      console.log("✅ Tearsheets tables and junction tables initialized");
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
          t.id,
          t.name,
          t.visibility,
          t.created_at,
          u.name AS owner_name,
          COUNT(DISTINCT tjs.job_seeker_id) as job_seeker_count,
          COUNT(DISTINCT thm.hiring_manager_id) as hiring_manager_count,
          COUNT(DISTINCT tj.job_id) as job_order_count,
          COUNT(DISTINCT tl.lead_id) as lead_count,
          (SELECT COUNT(DISTINCT org_id) FROM (
            SELECT hm.organization_id AS org_id
            FROM tearsheet_hiring_managers thm2
            JOIN hiring_managers hm ON thm2.hiring_manager_id = hm.id
            WHERE thm2.tearsheet_id = t.id AND hm.organization_id IS NOT NULL
            UNION
            SELECT j.organization_id AS org_id
            FROM tearsheet_jobs tj2
            JOIN jobs j ON tj2.job_id = j.id
            WHERE tj2.tearsheet_id = t.id AND j.organization_id IS NOT NULL
          ) sub) AS organization_count,
          (SELECT COUNT(*) FROM placements p
           WHERE EXISTS (SELECT 1 FROM tearsheet_job_seekers tjs WHERE tjs.tearsheet_id = t.id AND tjs.job_seeker_id = p.job_seeker_id)
              OR EXISTS (SELECT 1 FROM tearsheet_jobs tj WHERE tj.tearsheet_id = t.id AND tj.job_id = p.job_id)) AS placement_count
        FROM tearsheets t
        LEFT JOIN users u ON t.created_by = u.id
        LEFT JOIN tearsheet_job_seekers tjs ON t.id = tjs.tearsheet_id
        LEFT JOIN tearsheet_hiring_managers thm ON t.id = thm.tearsheet_id
        LEFT JOIN tearsheet_jobs tj ON t.id = tj.tearsheet_id
        LEFT JOIN tearsheet_leads tl ON t.id = tl.tearsheet_id
        GROUP BY t.id, t.name, t.visibility, t.created_at, u.name
        ORDER BY t.created_at DESC
      `);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getRecordsByType(tearsheetId, type) {
    const client = await this.pool.connect();
    try {
      let query = '';

      switch (type) {
        case 'job_seekers':
          query = `
            SELECT js.id, CONCAT_WS(' ', js.first_name, js.last_name) as name, js.email
            FROM tearsheet_job_seekers tjs
            JOIN job_seekers js ON tjs.job_seeker_id = js.id
            WHERE tjs.tearsheet_id = $1
            ORDER BY js.first_name, js.last_name
          `;
          break;
        case 'hiring_managers':
          query = `
            SELECT hm.id, CONCAT_WS(' ', hm.first_name, hm.last_name) as name, hm.email
            FROM tearsheet_hiring_managers thm
            JOIN hiring_managers hm ON thm.hiring_manager_id = hm.id
            WHERE thm.tearsheet_id = $1
            ORDER BY hm.first_name, hm.last_name
          `;
          break;
        case 'jobs':
          query = `
            SELECT j.id, j.job_title as name, o.name as company
            FROM tearsheet_jobs tj
            JOIN jobs j ON tj.job_id = j.id
            LEFT JOIN organizations o ON j.organization_id = o.id
            WHERE tj.tearsheet_id = $1
            ORDER BY j.job_title
          `;
          break;
        case 'leads':
          query = `
            SELECT l.id, CONCAT_WS(' ', l.first_name, l.last_name) as name, l.email
            FROM tearsheet_leads tl
            JOIN leads l ON tl.lead_id = l.id
            WHERE tl.tearsheet_id = $1
            ORDER BY l.first_name, l.last_name
          `;
          break;
        default:
          throw new Error('Invalid record type');
      }

      const result = await client.query(query, [tearsheetId]);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getOrganizations(tearsheetId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT DISTINCT o.id, o.name
        FROM (
          SELECT hm.organization_id AS org_id
          FROM tearsheet_hiring_managers thm
          JOIN hiring_managers hm ON thm.hiring_manager_id = hm.id
          WHERE thm.tearsheet_id = $1 AND hm.organization_id IS NOT NULL
          UNION
          SELECT j.organization_id AS org_id
          FROM tearsheet_jobs tj
          JOIN jobs j ON tj.job_id = j.id
          WHERE tj.tearsheet_id = $1 AND j.organization_id IS NOT NULL
        ) sub
        JOIN organizations o ON o.id = sub.org_id
        ORDER BY o.name
        `,
        [tearsheetId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getPlacements(tearsheetId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT DISTINCT p.id, p.job_id, p.job_seeker_id, p.status, p.start_date,
          js.first_name AS js_first_name, js.last_name AS js_last_name, js.email AS js_email,
          j.job_title, o.name AS organization_name
        FROM placements p
        JOIN job_seekers js ON p.job_seeker_id = js.id
        JOIN jobs j ON p.job_id = j.id
        LEFT JOIN organizations o ON j.organization_id = o.id
        WHERE EXISTS (SELECT 1 FROM tearsheet_job_seekers tjs WHERE tjs.tearsheet_id = $1 AND tjs.job_seeker_id = p.job_seeker_id)
           OR EXISTS (SELECT 1 FROM tearsheet_jobs tj WHERE tj.tearsheet_id = $1 AND tj.job_id = p.job_id)
        ORDER BY p.start_date DESC, p.id
        `,
        [tearsheetId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  async delete(id) {
    const client = await this.pool.connect();
    try {
      // Delete the tearsheet - junction tables will cascade delete automatically
      const result = await client.query(
        `DELETE FROM tearsheets WHERE id = $1 RETURNING *`,
        [id]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async associate(tearsheetId, data) {
    const { job_seeker_id, hiring_manager_id, job_id, lead_id } = data;
    const client = await this.pool.connect();
    try {
      console.log(`Starting association for tearsheet ${tearsheetId}`, data);

      if (job_seeker_id) {
        console.log(`Adding job seeker ${job_seeker_id} to tearsheet ${tearsheetId}`);
        await client.query(
          `INSERT INTO tearsheet_job_seekers (tearsheet_id, job_seeker_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [tearsheetId, job_seeker_id]
        );
      }

      if (hiring_manager_id) {
        console.log(`Adding hiring manager ${hiring_manager_id} to tearsheet ${tearsheetId}`);
        await client.query(
          `INSERT INTO tearsheet_hiring_managers (tearsheet_id, hiring_manager_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [tearsheetId, hiring_manager_id]
        );
      }

      if (job_id) {
        console.log(`Adding job ${job_id} to tearsheet ${tearsheetId}`);
        await client.query(
          `INSERT INTO tearsheet_jobs (tearsheet_id, job_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [tearsheetId, job_id]
        );
      }

      if (lead_id) {
        console.log(`Adding lead ${lead_id} to tearsheet ${tearsheetId}`);
        await client.query(
          `INSERT INTO tearsheet_leads (tearsheet_id, lead_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [tearsheetId, lead_id]
        );
      }

      console.log(`Successfully completed association for tearsheet ${tearsheetId}`);
      return { success: true };
    } catch (error) {
      console.error(`Error in Tearsheet.associate for tearsheet ${tearsheetId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getTearsheetsForOrganization(organizationId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT DISTINCT t.id, t.name, t.created_at
        FROM tearsheets t
        WHERE EXISTS (
          SELECT 1 FROM tearsheet_hiring_managers thm
          JOIN hiring_managers hm ON thm.hiring_manager_id = hm.id
          WHERE thm.tearsheet_id = t.id AND hm.organization_id = $1
        )
        OR EXISTS (
          SELECT 1 FROM tearsheet_jobs tj
          JOIN jobs j ON tj.job_id = j.id
          WHERE tj.tearsheet_id = t.id AND j.organization_id = $1
        )
        ORDER BY t.name
        `,
        [organizationId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

}

module.exports = Tearsheet;


