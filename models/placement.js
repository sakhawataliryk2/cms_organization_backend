// models/placement.js
class Placement {
    constructor(pool) {
        this.pool = pool;
    }

    // Initialize the placements table if it doesn't exist
    async initTable() {
        let client;
        try {
            console.log('Initializing placements table if needed...');
            client = await this.pool.connect();

            await client.query(`
                CREATE TABLE IF NOT EXISTS placements (
                    id SERIAL PRIMARY KEY,
                    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                    job_seeker_id INTEGER NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
                    status VARCHAR(50) NOT NULL DEFAULT 'Pending',
                    start_date DATE NOT NULL,
                    internal_email_notification TEXT,
                    -- Permanent Employment Info
                    salary NUMERIC,
                    placement_fee_percent NUMERIC,
                    placement_fee_flat NUMERIC,
                    days_guaranteed INTEGER,
                    -- Contract Employment Info
                    hours_per_day VARCHAR(50),
                    hours_of_operation VARCHAR(100),
                    -- Pay Rate Information
                    pay_rate NUMERIC,
                    pay_rate_checked BOOLEAN DEFAULT false,
                    effective_date DATE,
                    effective_date_checked BOOLEAN DEFAULT false,
                    overtime_exemption BOOLEAN DEFAULT false,
                    created_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create indexes for better query performance
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_placements_job_id ON placements(job_id)
            `);
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_placements_job_seeker_id ON placements(job_seeker_id)
            `);
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_placements_status ON placements(status)
            `);

            console.log('✅ Placements table initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Error initializing placements table:', error.message);
            throw error;
        } finally {
            if (client) {
                client.release();
            }
        }
    }

    // Create a new placement
    async create(placementData) {
        const {
            job_id,
            job_seeker_id,
            status,
            start_date,
            internal_email_notification,
            salary,
            placement_fee_percent,
            placement_fee_flat,
            days_guaranteed,
            hours_per_day,
            hours_of_operation,
            pay_rate,
            pay_rate_checked,
            effective_date,
            effective_date_checked,
            overtime_exemption,
            created_by
        } = placementData;

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const insertQuery = `
                INSERT INTO placements (
                    job_id, job_seeker_id, status, start_date, internal_email_notification,
                    salary, placement_fee_percent, placement_fee_flat, days_guaranteed,
                    hours_per_day, hours_of_operation,
                    pay_rate, pay_rate_checked, effective_date, effective_date_checked,
                    overtime_exemption, created_by, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
                RETURNING *
            `;

            const values = [
                job_id,
                job_seeker_id,
                status || 'Pending',
                start_date,
                internal_email_notification || null,
                salary || null,
                placement_fee_percent || null,
                placement_fee_flat || null,
                days_guaranteed || null,
                hours_per_day || null,
                hours_of_operation || null,
                pay_rate || null,
                pay_rate_checked || false,
                effective_date || null,
                effective_date_checked || false,
                overtime_exemption || false,
                created_by || null
            ];

            const result = await client.query(insertQuery, values);

            await client.query('COMMIT');

            return this.formatPlacement(result.rows[0]);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error creating placement:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get all placements
    async getAll(userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT 
                    p.*,
                    j.job_title,
                    j.status as job_status,
                    js.first_name,
                    js.last_name,
                    js.email as job_seeker_email,
                    js.phone as job_seeker_phone,
                    u.name as created_by_name
                FROM placements p
                LEFT JOIN jobs j ON p.job_id = j.id
                LEFT JOIN job_seekers js ON p.job_seeker_id = js.id
                LEFT JOIN users u ON p.created_by = u.id
            `;

            const params = [];
            if (userId) {
                query += ` WHERE p.created_by = $1`;
                params.push(userId);
            }

            query += ` ORDER BY p.created_at DESC`;

            const result = await client.query(query, params);
            return result.rows.map(row => this.formatPlacement(row));
        } catch (error) {
            console.error('Error getting placements:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get placement by ID
    async findById(id) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT 
                    p.*,
                    j.job_title,
                    j.status as job_status,
                    js.first_name,
                    js.last_name,
                    js.email as job_seeker_email,
                    js.phone as job_seeker_phone,
                    u.name as created_by_name
                FROM placements p
                LEFT JOIN jobs j ON p.job_id = j.id
                LEFT JOIN job_seekers js ON p.job_seeker_id = js.id
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.id = $1
            `;
            const result = await client.query(query, [id]);
            return result.rows.length > 0 ? this.formatPlacement(result.rows[0]) : null;
        } catch (error) {
            console.error('Error finding placement by ID:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get placements by job ID
    async findByJobId(jobId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT 
                    p.*,
                    j.job_title,
                    j.status as job_status,
                    js.first_name,
                    js.last_name,
                    js.email as job_seeker_email,
                    js.phone as job_seeker_phone,
                    u.name as created_by_name
                FROM placements p
                LEFT JOIN jobs j ON p.job_id = j.id
                LEFT JOIN job_seekers js ON p.job_seeker_id = js.id
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.job_id = $1
                ORDER BY p.created_at DESC
            `;
            const result = await client.query(query, [jobId]);
            return result.rows.map(row => this.formatPlacement(row));
        } catch (error) {
            console.error('Error finding placements by job ID:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get placements by job seeker ID
    async findByJobSeekerId(jobSeekerId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT 
                    p.*,
                    j.job_title,
                    j.status as job_status,
                    js.first_name,
                    js.last_name,
                    js.email as job_seeker_email,
                    js.phone as job_seeker_phone,
                    u.name as created_by_name
                FROM placements p
                LEFT JOIN jobs j ON p.job_id = j.id
                LEFT JOIN job_seekers js ON p.job_seeker_id = js.id
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.job_seeker_id = $1
                ORDER BY p.created_at DESC
            `;
            const result = await client.query(query, [jobSeekerId]);
            return result.rows.map(row => this.formatPlacement(row));
        } catch (error) {
            console.error('Error finding placements by job seeker ID:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Update placement
    async update(id, placementData) {
        const {
            status,
            start_date,
            internal_email_notification,
            salary,
            placement_fee_percent,
            placement_fee_flat,
            days_guaranteed,
            hours_per_day,
            hours_of_operation,
            pay_rate,
            pay_rate_checked,
            effective_date,
            effective_date_checked,
            overtime_exemption
        } = placementData;

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const updateQuery = `
                UPDATE placements
                SET 
                    status = COALESCE($1, status),
                    start_date = COALESCE($2, start_date),
                    internal_email_notification = COALESCE($3, internal_email_notification),
                    salary = COALESCE($4, salary),
                    placement_fee_percent = COALESCE($5, placement_fee_percent),
                    placement_fee_flat = COALESCE($6, placement_fee_flat),
                    days_guaranteed = COALESCE($7, days_guaranteed),
                    hours_per_day = COALESCE($8, hours_per_day),
                    hours_of_operation = COALESCE($9, hours_of_operation),
                    pay_rate = COALESCE($10, pay_rate),
                    pay_rate_checked = COALESCE($11, pay_rate_checked),
                    effective_date = COALESCE($12, effective_date),
                    effective_date_checked = COALESCE($13, effective_date_checked),
                    overtime_exemption = COALESCE($14, overtime_exemption),
                    updated_at = NOW()
                WHERE id = $15
                RETURNING *
            `;

            const values = [
                status,
                start_date,
                internal_email_notification,
                salary,
                placement_fee_percent,
                placement_fee_flat,
                days_guaranteed,
                hours_per_day,
                hours_of_operation,
                pay_rate,
                pay_rate_checked,
                effective_date,
                effective_date_checked,
                overtime_exemption,
                id
            ];

            const result = await client.query(updateQuery, values);

            await client.query('COMMIT');

            return result.rows.length > 0 ? this.formatPlacement(result.rows[0]) : null;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error updating placement:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Delete placement
    async delete(id) {
        const client = await this.pool.connect();
        try {
            const query = 'DELETE FROM placements WHERE id = $1 RETURNING *';
            const result = await client.query(query, [id]);
            return result.rows.length > 0 ? this.formatPlacement(result.rows[0]) : null;
        } catch (error) {
            console.error('Error deleting placement:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Format placement data for response
    formatPlacement(row) {
        if (!row) return null;

        return {
            id: row.id,
            jobId: row.job_id,
            jobSeekerId: row.job_seeker_id,
            status: row.status,
            startDate: row.start_date,
            internalEmailNotification: row.internal_email_notification,
            salary: row.salary,
            placementFeePercent: row.placement_fee_percent,
            placementFeeFlat: row.placement_fee_flat,
            daysGuaranteed: row.days_guaranteed,
            hoursPerDay: row.hours_per_day,
            hoursOfOperation: row.hours_of_operation,
            payRate: row.pay_rate,
            payRateChecked: row.pay_rate_checked,
            effectiveDate: row.effective_date,
            effectiveDateChecked: row.effective_date_checked,
            overtimeExemption: row.overtime_exemption,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            // Related data
            jobTitle: row.job_title,
            jobStatus: row.job_status,
            jobSeekerName: row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim(),
            jobSeekerEmail: row.job_seeker_email,
            jobSeekerPhone: row.job_seeker_phone,
            createdByName: row.created_by_name
        };
    }
}

module.exports = Placement;

