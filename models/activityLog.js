class ActivityLog {
  constructor(pool) {
    this.pool = pool;
  }

  // Initialize the activity_logs table if it doesn't exist
  async initTable() {
    let client;
    try {
      console.log("Initializing activity_logs table if needed...");
      client = await this.pool.connect();

      await client.query(`
        CREATE TABLE IF NOT EXISTS activity_logs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          user_name VARCHAR(255),
          action VARCHAR(100) NOT NULL,
          entity_type VARCHAR(100),
          entity_id VARCHAR(100),
          entity_label VARCHAR(500),
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Basic indexes for common filters
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id
        ON activity_logs(user_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
        ON activity_logs(created_at)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_activity_logs_action
        ON activity_logs(action)
      `);
    } catch (error) {
      console.error("Error initializing activity_logs table:", error);
      throw error;
    } finally {
      if (client) client.release();
    }
  }

  async logActivity({
    userId,
    userName,
    action,
    entityType,
    entityId,
    entityLabel,
    metadata,
    createdAt,
  }) {
    let client;
    try {
      client = await this.pool.connect();
      const result = await client.query(
        `
        INSERT INTO activity_logs
          (user_id, user_name, action, entity_type, entity_id, entity_label, metadata, created_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, CURRENT_TIMESTAMP))
        RETURNING *
      `,
        [
          userId || null,
          userName || null,
          action,
          entityType || null,
          entityId != null ? String(entityId) : null,
          entityLabel || null,
          metadata || null,
          createdAt || null,
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error("Error logging activity:", error);
      throw error;
    } finally {
      if (client) client.release();
    }
  }

  async getActivities({
    userId,
    startDate,
    endDate,
    action,
    entityType,
    limit = 100,
    offset = 0,
  }) {
    let client;
    try {
      client = await this.pool.connect();

      const conditions = [];
      const params = [];

      if (userId) {
        params.push(userId);
        conditions.push(`user_id = $${params.length}`);
      }

      if (startDate) {
        params.push(startDate);
        conditions.push(`created_at >= $${params.length}`);
      }

      if (endDate) {
        // include end of day
        params.push(`${endDate} 23:59:59`);
        conditions.push(`created_at <= $${params.length}`);
      }

      if (action) {
        params.push(action);
        conditions.push(`action = $${params.length}`);
      }

      if (entityType) {
        params.push(entityType);
        conditions.push(`entity_type = $${params.length}`);
      }

      params.push(limit);
      const limitIndex = params.length;
      params.push(offset);
      const offsetIndex = params.length;

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const query = `
        SELECT *
        FROM activity_logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
      `;

      const result = await client.query(query, params);

      // Total count for pagination
      const countResult = await client.query(
        `
        SELECT COUNT(*) AS count
        FROM activity_logs
        ${whereClause}
      `,
        params.slice(0, params.length - 2)
      );

      return {
        activities: result.rows,
        total: parseInt(countResult.rows[0].count, 10) || 0,
      };
    } catch (error) {
      console.error("Error fetching activities:", error);
      throw error;
    } finally {
      if (client) client.release();
    }
  }

  async getSummary({ userId, startDate, endDate }) {
    let client;
    try {
      client = await this.pool.connect();

      const conditions = [];
      const params = [];

      if (userId) {
        params.push(userId);
        conditions.push(`user_id = $${params.length}`);
      }

      if (startDate) {
        params.push(startDate);
        conditions.push(`created_at >= $${params.length}`);
      }

      if (endDate) {
        params.push(`${endDate} 23:59:59`);
        conditions.push(`created_at <= $${params.length}`);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // Summary by action and entity_type
      const result = await client.query(
        `
        SELECT
          COALESCE(action, 'unknown') AS action,
          COALESCE(entity_type, 'unknown') AS entity_type,
          COUNT(*) AS count
        FROM activity_logs
        ${whereClause}
        GROUP BY COALESCE(action, 'unknown'), COALESCE(entity_type, 'unknown')
        ORDER BY count DESC
      `,
        params
      );

      return result.rows;
    } catch (error) {
      console.error("Error fetching activity summary:", error);
      throw error;
    } finally {
      if (client) client.release();
    }
  }
}

module.exports = ActivityLog;

