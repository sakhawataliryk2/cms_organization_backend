// This is the updated Job model - models/job.js 
const bcrypt = require('bcrypt');

class Job {
    constructor(pool) {
        this.pool = pool;
    }

    // Initialize the jobs table if it doesn't exist
    async initTable() {
        let client;
        try {
            console.log('Initializing jobs table if needed...');
            client = await this.pool.connect();

            await client.query(`
                CREATE TABLE IF NOT EXISTS jobs (
                id SERIAL PRIMARY KEY,
                job_title VARCHAR(255) NOT NULL,
                category VARCHAR(100),
                organization_id INTEGER REFERENCES organizations(id),
                hiring_manager VARCHAR(255),
                status VARCHAR(50) DEFAULT 'Open',
                priority VARCHAR(10),
                employment_type VARCHAR(50),
                start_date DATE,
                worksite_location TEXT,
                remote_option VARCHAR(50),
                job_description TEXT,
                salary_type VARCHAR(20) DEFAULT 'yearly',
                min_salary NUMERIC,
                max_salary NUMERIC,
                benefits TEXT,
                required_skills TEXT,
                job_board_status VARCHAR(50) DEFAULT 'Not Posted',
                owner VARCHAR(255),
                date_added DATE,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                custom_fields JSONB
                )
            `);

            // Also create a table for job notes if it doesn't exist
            await client.query(`
                CREATE TABLE IF NOT EXISTS job_notes (
                id SERIAL PRIMARY KEY,
                job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create a table for job history
            await client.query(`
                CREATE TABLE IF NOT EXISTS job_history (
                id SERIAL PRIMARY KEY,
                job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                action VARCHAR(50) NOT NULL,
                details JSONB,
                performed_by INTEGER REFERENCES users(id),
                performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('✅ Jobs tables initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Error initializing jobs tables:', error.message);
            throw error;
        } finally {
            if (client) {
                client.release();
            }
        }
    }

    // Create a new job
    async create(jobData) {
        const {
            jobTitle,
            category,
            organizationId,
            hiringManager,
            status,
            priority,
            employmentType,
            startDate,
            worksiteLocation,
            remoteOption,
            jobDescription,
            salaryType,
            minSalary,
            maxSalary,
            benefits,
            requiredSkills,
            jobBoardStatus,
            owner,
            dateAdded,
            userId,
            customFields = {}
        } = jobData;

        console.log("Job model - create function input:", JSON.stringify(jobData, null, 2));

        const client = await this.pool.connect();

        try {
            // Begin transaction
            await client.query('BEGIN');

            // Handle organization ID resolution
            let orgId = null;
            if (organizationId) {
                if (!isNaN(parseInt(organizationId))) {
                    orgId = parseInt(organizationId);
                } else {
                    try {
                        const orgQuery = 'SELECT id FROM organizations WHERE name = $1';
                        const orgResult = await client.query(orgQuery, [organizationId]);
                        if (orgResult.rows.length > 0) {
                            orgId = orgResult.rows[0].id;
                        }
                    } catch (error) {
                        console.log("Error finding organization by name:", error.message);
                    }
                }
            }

            // Properly handle custom fields
            let customFieldsJson = '{}';
            if (customFields) {
                // Check if customFields is already a string
                if (typeof customFields === 'string') {
                    try {
                        // Verify it's valid JSON
                        JSON.parse(customFields);
                        customFieldsJson = customFields;
                    } catch (e) {
                        console.log("Invalid JSON string in customFields, using empty object");
                        customFieldsJson = '{}';
                    }
                } else if (typeof customFields === 'object') {
                    // Convert object to JSON string
                    customFieldsJson = JSON.stringify(customFields);
                }
            }

            // Set up insert statement with column names matching the database
            const insertJobQuery = `
            INSERT INTO jobs (
            job_title,
            category,
            organization_id,
            hiring_manager,
            status,
            priority,
            employment_type,
            start_date,
            worksite_location,
            remote_option,
            job_description,
            salary_type,
            min_salary,
            max_salary,
            benefits,
            required_skills,
            job_board_status,
            owner,
            date_added,
            created_by,
            custom_fields
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
            RETURNING *
        `;

            // Prepare values in the same order as the columns in the query
            const values = [
                jobTitle,
                category,
                orgId,
                hiringManager,
                status || 'Open',
                priority,
                employmentType,
                startDate || null,
                worksiteLocation,
                remoteOption,
                jobDescription,
                salaryType || 'yearly',
                minSalary ? parseFloat(minSalary) : null,
                maxSalary ? parseFloat(maxSalary) : null,
                benefits,
                requiredSkills,
                jobBoardStatus || 'Not Posted',
                owner,
                dateAdded || new Date().toISOString().split('T')[0],
                userId,
                customFieldsJson  // Use our properly formatted JSON string
            ];

            // Debug log the SQL and values
            console.log("SQL Query:", insertJobQuery);
            console.log("Query values:", values);

            const result = await client.query(insertJobQuery, values);

            // Add an entry to history
            const historyQuery = `
            INSERT INTO job_history (
            job_id,
            action,
            details,
            performed_by
            )
            VALUES ($1, $2, $3, $4)
        `;

            const historyValues = [
                result.rows[0].id,
                'CREATE',
                JSON.stringify(jobData),
                userId
            ];

            await client.query(historyQuery, historyValues);

            // Commit transaction
            await client.query('COMMIT');

            console.log("Created job:", result.rows[0]);
            return result.rows[0];
        } catch (error) {
            // Rollback transaction in case of error
            await client.query('ROLLBACK');
            console.error("Error in create job:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get all jobs (with optional filtering by created_by user)
    async getAll(userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT j.*, u.name as created_by_name,
                o.name as organization_name
                FROM jobs j
                LEFT JOIN users u ON j.created_by = u.id
                LEFT JOIN organizations o ON j.organization_id = o.id
            `;

            const values = [];

            // If userId is provided, filter jobs by the user that created them
            if (userId) {
                query += ` WHERE j.created_by = $1`;
                values.push(userId);
            }

            query += ` ORDER BY j.created_at DESC`;

            const result = await client.query(query, values);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get job by ID, optionally checking created_by user
    async getById(id, userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT j.*, u.name as created_by_name,
                o.name as organization_name
                FROM jobs j
                LEFT JOIN users u ON j.created_by = u.id
                LEFT JOIN organizations o ON j.organization_id = o.id
                WHERE j.id = $1
            `;

            const values = [id];

            // If userId is provided, ensure the job was created by this user
            if (userId) {
                query += ` AND j.created_by = $2`;
                values.push(userId);
            }

            const result = await client.query(query, values);
            return result.rows[0] || null;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // IMPORTANT: Fixed update method with improved field mapping
    async update(id, updateData, userId = null) {
        const client = await this.pool.connect();
        try {
            // Begin transaction
            await client.query('BEGIN');

            // First, get the job to ensure it exists and check permissions
            const getJobQuery = 'SELECT * FROM jobs WHERE id = $1';
            const jobResult = await client.query(getJobQuery, [id]);

            if (jobResult.rows.length === 0) {
                throw new Error('Job not found');
            }

            const job = jobResult.rows[0];

            // If userId is provided (not admin/owner), check permission
            if (userId !== null && job.created_by !== userId) {
                throw new Error('You do not have permission to update this job');
            }

            // Store the old state for audit
            const oldState = { ...job };

            // Build update query dynamically based on provided fields
            const updateFields = [];
            const queryParams = [];
            let paramCount = 1;

            // Handle all possible fields to update - Map camelCase keys to snake_case database columns
            const fieldMapping = {
                jobTitle: 'job_title',
                category: 'category',
                organizationId: 'organization_id',
                hiringManager: 'hiring_manager',
                status: 'status',
                priority: 'priority',
                employmentType: 'employment_type',
                startDate: 'start_date',
                worksiteLocation: 'worksite_location',
                remoteOption: 'remote_option',
                jobDescription: 'job_description',
                salaryType: 'salary_type',
                minSalary: 'min_salary',
                maxSalary: 'max_salary',
                benefits: 'benefits',
                requiredSkills: 'required_skills',
                jobBoardStatus: 'job_board_status',
                owner: 'owner',
                dateAdded: 'date_added',
                customFields: 'custom_fields'
            };

            // Log the incoming update data for debugging
            console.log("Update data received:", updateData);

            // Special handling for customFields which needs to be merged
            if (updateData.customFields) {
                let newCustomFields = {};

                // Parse existing custom fields
                try {
                    const existingCustomFields = typeof job.custom_fields === 'string'
                        ? JSON.parse(job.custom_fields || '{}')
                        : (job.custom_fields || {});

                    // Parse update custom fields
                    const updateCustomFields = typeof updateData.customFields === 'string'
                        ? JSON.parse(updateData.customFields)
                        : updateData.customFields;

                    // Merge them
                    newCustomFields = {
                        ...existingCustomFields,
                        ...updateCustomFields
                    };
                } catch (e) {
                    console.error("Error parsing custom fields:", e);
                    // If there's an error, just use the new value
                    newCustomFields = typeof updateData.customFields === 'string'
                        ? updateData.customFields
                        : JSON.stringify(updateData.customFields);
                }

                updateFields.push(`custom_fields = $${paramCount}`);
                queryParams.push(typeof newCustomFields === 'string'
                    ? newCustomFields
                    : JSON.stringify(newCustomFields));
                paramCount++;
            }

            // Handle organization ID conversion
            if (updateData.organizationId !== undefined) {
                let orgId = null;

                if (!isNaN(parseInt(updateData.organizationId))) {
                    orgId = parseInt(updateData.organizationId);
                } else if (typeof updateData.organizationId === 'string' && updateData.organizationId.trim() !== '') {
                    try {
                        const orgQuery = 'SELECT id FROM organizations WHERE name = $1';
                        const orgResult = await client.query(orgQuery, [updateData.organizationId]);
                        if (orgResult.rows.length > 0) {
                            orgId = orgResult.rows[0].id;
                        }
                    } catch (error) {
                        console.log("Error finding organization by name:", error.message);
                    }
                }

                updateFields.push(`organization_id = $${paramCount}`);
                queryParams.push(orgId);
                paramCount++;

                // Remove from normal processing
                delete updateData.organizationId;
            }

            // Process all other fields - Map from camelCase to snake_case
            for (const [key, value] of Object.entries(updateData)) {
                if (key !== 'customFields' && key !== 'organizationId' && fieldMapping[key] && value !== undefined) {
                    updateFields.push(`${fieldMapping[key]} = $${paramCount}`);

                    // Handle numeric conversions
                    if (key === 'minSalary' || key === 'maxSalary') {
                        queryParams.push(value ? parseFloat(value) : null);
                    } else {
                        queryParams.push(value);
                    }

                    paramCount++;
                }
            }

            // Always update the updated_at timestamp
            updateFields.push(`updated_at = NOW()`);

            // If no fields to update, just return the existing job
            if (updateFields.length === 0) {
                await client.query('ROLLBACK');
                return job; // No fields to update
            }

            // Construct the full update query
            const updateQuery = `
                UPDATE jobs 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            queryParams.push(id);

            // Log the update query and parameters
            console.log("Update query:", updateQuery);
            console.log("Update params:", queryParams);

            const result = await client.query(updateQuery, queryParams);
            const updatedJob = result.rows[0];

            // Add history entry
            const historyQuery = `
                INSERT INTO job_history (
                    job_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                id,
                'UPDATE',
                JSON.stringify({
                    before: oldState,
                    after: updatedJob
                }),
                userId || job.created_by
            ];

            await client.query(historyQuery, historyValues);

            // Commit transaction
            await client.query('COMMIT');

            console.log("Job updated successfully:", updatedJob);
            return updatedJob;
        } catch (error) {
            // Rollback transaction in case of error
            await client.query('ROLLBACK');
            console.error("Error updating job:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Delete job by ID
    async delete(id, userId = null) {
        const client = await this.pool.connect();
        try {
            // Begin transaction
            await client.query('BEGIN');

            // First, get the job to ensure it exists and for audit
            const getJobQuery = 'SELECT * FROM jobs WHERE id = $1';
            const jobResult = await client.query(getJobQuery, [id]);

            if (jobResult.rows.length === 0) {
                throw new Error('Job not found');
            }

            const job = jobResult.rows[0];

            // If userId is provided (not admin/owner), check permission
            if (userId !== null && job.created_by !== userId) {
                throw new Error('You do not have permission to delete this job');
            }

            // Add an entry to history before deleting
            const historyQuery = `
                INSERT INTO job_history (
                    job_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                id,
                'DELETE',
                JSON.stringify(job),
                userId || job.created_by // Use original creator if no specific user
            ];

            await client.query(historyQuery, historyValues);

            // Delete the job
            const deleteQuery = 'DELETE FROM jobs WHERE id = $1 RETURNING *';
            const result = await client.query(deleteQuery, [id]);

            // Commit transaction
            await client.query('COMMIT');

            return result.rows[0];
        } catch (error) {
            // Rollback transaction in case of error
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Add a note to a job
    async addNote(jobId, text, userId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Insert the note
            const noteQuery = `
                INSERT INTO job_notes (job_id, text, created_by)
                VALUES ($1, $2, $3)
                RETURNING id, text, created_at
            `;

            const noteResult = await client.query(noteQuery, [jobId, text, userId]);

            // Add history entry for the note
            const historyQuery = `
                INSERT INTO job_history (
                    job_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                jobId,
                'ADD_NOTE',
                JSON.stringify({ noteId: noteResult.rows[0].id, text }),
                userId
            ];

            await client.query(historyQuery, historyValues);

            await client.query('COMMIT');

            return noteResult.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Get notes for a job
    async getNotes(jobId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT n.*, u.name as created_by_name
                FROM job_notes n
                LEFT JOIN users u ON n.created_by = u.id
                WHERE n.job_id = $1
                ORDER BY n.created_at DESC
            `;

            const result = await client.query(query, [jobId]);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get history for a job
    async getHistory(jobId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT h.*, u.name as performed_by_name
                FROM job_history h
                LEFT JOIN users u ON h.performed_by = u.id
                WHERE h.job_id = $1
                ORDER BY h.performed_at DESC
            `;

            const result = await client.query(query, [jobId]);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = Job;