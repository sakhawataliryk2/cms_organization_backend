const bcrypt = require('bcrypt');

class JobSeeker {
    constructor(pool) {
        this.pool = pool;
    }

    // Initialize the job seekers table if it doesn't exist
    async initTable() {
        let client;
        try {
            console.log('Initializing job seekers table if needed...');
            client = await this.pool.connect();

            await client.query(`
                CREATE TABLE IF NOT EXISTS job_seekers (
                    id SERIAL PRIMARY KEY,
                    first_name VARCHAR(255) NOT NULL,
                    last_name VARCHAR(255) NOT NULL,
                    email VARCHAR(255),
                    phone VARCHAR(50),
                    mobile_phone VARCHAR(50),
                    address TEXT,
                    city VARCHAR(100),
                    state VARCHAR(50),
                    zip VARCHAR(20),
                    status VARCHAR(50) DEFAULT 'New lead',
                    current_organization VARCHAR(255),
                    title VARCHAR(255),
                    resume_text TEXT,
                    skills TEXT,
                    desired_salary VARCHAR(50),
                    owner VARCHAR(255),
                    date_added DATE DEFAULT CURRENT_DATE,
                    last_contact_date DATE,
                    created_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    custom_fields JSONB
                )
            `);

            // Also create a table for job seeker notes if it doesn't exist
            await client.query(`
                CREATE TABLE IF NOT EXISTS job_seeker_notes (
                    id SERIAL PRIMARY KEY,
                    job_seeker_id INTEGER NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
                    text TEXT NOT NULL,
                    created_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create a table for job seeker history
            await client.query(`
                CREATE TABLE IF NOT EXISTS job_seeker_history (
                    id SERIAL PRIMARY KEY,
                    job_seeker_id INTEGER NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
                    action VARCHAR(50) NOT NULL,
                    details JSONB,
                    performed_by INTEGER REFERENCES users(id),
                    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('✅ Job seekers tables initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Error initializing job seekers tables:', error.message);
            throw error;
        } finally {
            if (client) {
                client.release();
            }
        }
    }

    // Create a new job seeker
    async create(jobSeekerData) {
        const {
            firstName,
            lastName,
            email,
            phone,
            mobilePhone,
            address,
            city,
            state,
            zip,
            status,
            currentOrganization,
            title,
            resumeText,
            skills,
            desiredSalary,
            owner,
            dateAdded,
            lastContactDate,
            userId,
            customFields = {}
        } = jobSeekerData;

        console.log("JobSeeker model - create function input:", JSON.stringify(jobSeekerData, null, 2));

        const client = await this.pool.connect();

        try {
            // Begin transaction
            await client.query('BEGIN');

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
            const insertJobSeekerQuery = `
                INSERT INTO job_seekers (
                    first_name,
                    last_name,
                    email,
                    phone,
                    mobile_phone,
                    address,
                    city,
                    state,
                    zip,
                    status,
                    current_organization,
                    title,
                    resume_text,
                    skills,
                    desired_salary,
                    owner,
                    date_added,
                    last_contact_date,
                    created_by,
                    custom_fields
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                RETURNING *
            `;

            // Prepare values in the same order as the columns in the query
            const values = [
                firstName,
                lastName,
                email,
                phone,
                mobilePhone || phone, // If no mobile phone, use primary phone
                address,
                city,
                state,
                zip,
                status || 'New lead',
                currentOrganization,
                title,
                resumeText,
                skills,
                desiredSalary,
                owner,
                dateAdded || new Date().toISOString().split('T')[0],
                lastContactDate || null,
                userId,
                customFieldsJson
            ];

            // Debug log the SQL and values
            console.log("SQL Query:", insertJobSeekerQuery);
            console.log("Query values:", values);

            const result = await client.query(insertJobSeekerQuery, values);

            // Add an entry to history
            const historyQuery = `
                INSERT INTO job_seeker_history (
                    job_seeker_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                result.rows[0].id,
                'CREATE',
                JSON.stringify(jobSeekerData),
                userId
            ];

            await client.query(historyQuery, historyValues);

            // Commit transaction
            await client.query('COMMIT');

            console.log("Created job seeker:", result.rows[0]);
            return result.rows[0];
        } catch (error) {
            // Rollback transaction in case of error
            await client.query('ROLLBACK');
            console.error("Error in create job seeker:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get all job seekers (with optional filtering by created_by user)
    async getAll(userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT js.*, u.name as created_by_name,
                CONCAT(js.last_name, ', ', js.first_name) as full_name,
                js.date_added::text, js.last_contact_date::text
                FROM job_seekers js
                LEFT JOIN users u ON js.created_by = u.id
            `;

            const values = [];

            // If userId is provided, filter jobs by the user that created them
            if (userId) {
                query += ` WHERE js.created_by = $1`;
                values.push(userId);
            }

            query += ` ORDER BY js.created_at DESC`;

            const result = await client.query(query, values);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get job seeker by ID, optionally checking created_by user
    async getById(id, userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT js.*, u.name as created_by_name,
                CONCAT(js.last_name, ', ', js.first_name) as full_name,
                js.date_added::text, js.last_contact_date::text
                FROM job_seekers js
                LEFT JOIN users u ON js.created_by = u.id
                WHERE js.id = $1
            `;

            const values = [id];

            // If userId is provided, ensure the job seeker was created by this user
            if (userId) {
                query += ` AND js.created_by = $2`;
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

    // Update job seeker by ID
    async update(id, updateData, userId = null) {
        const client = await this.pool.connect();
        try {
            // Begin transaction
            await client.query('BEGIN');

            // First, get the job seeker to ensure it exists and check permissions
            const getJobSeekerQuery = 'SELECT * FROM job_seekers WHERE id = $1';
            const jobSeekerResult = await client.query(getJobSeekerQuery, [id]);

            if (jobSeekerResult.rows.length === 0) {
                throw new Error('Job seeker not found');
            }

            const jobSeeker = jobSeekerResult.rows[0];

            // If userId is provided (not admin/owner), check permission
            if (userId !== null && jobSeeker.created_by !== userId) {
                throw new Error('You do not have permission to update this job seeker');
            }

            // Store the old state for audit
            const oldState = { ...jobSeeker };

            // Build update query dynamically based on provided fields
            const updateFields = [];
            const queryParams = [];
            let paramCount = 1;

            // Handle all possible fields to update - Map camelCase keys to snake_case database columns
            const fieldMapping = {
                firstName: 'first_name',
                lastName: 'last_name',
                email: 'email',
                phone: 'phone',
                mobilePhone: 'mobile_phone',
                address: 'address',
                city: 'city',
                state: 'state',
                zip: 'zip',
                status: 'status',
                currentOrganization: 'current_organization',
                title: 'title',
                resumeText: 'resume_text',
                skills: 'skills',
                desiredSalary: 'desired_salary',
                owner: 'owner',
                dateAdded: 'date_added',
                lastContactDate: 'last_contact_date',
                customFields: 'custom_fields'
            };

            // Log the incoming update data for debugging
            console.log("Update data received:", updateData);

            // Special handling for customFields which needs to be merged
            if (updateData.customFields) {
                let newCustomFields = {};

                // Parse existing custom fields
                try {
                    const existingCustomFields = typeof jobSeeker.custom_fields === 'string'
                        ? JSON.parse(jobSeeker.custom_fields || '{}')
                        : (jobSeeker.custom_fields || {});

                    // Parse update custom fields
                    const updateCustomFields = typeof updateData.customFields === 'string'
                        ? JSON.parse(updateData.customFields)
                        : updateData.customFields;

                    // Merge them
                    newCustomFields = {
                        ...existingCustomFields,
                        ...updateCustomFields
                    };
                } catch (error) {
                    console.error("Error parsing custom fields:", error);
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

            // Process all other fields - Map from camelCase to snake_case
            for (const [key, value] of Object.entries(updateData)) {
                if (key !== 'customFields' && fieldMapping[key] && value !== undefined) {
                    updateFields.push(`${fieldMapping[key]} = $${paramCount}`);
                    queryParams.push(value);
                    paramCount++;
                }
            }

            // Always update the updated_at timestamp
            updateFields.push(`updated_at = NOW()`);

            // If no fields to update, just return the existing job
            if (updateFields.length === 0) {
                await client.query('ROLLBACK');
                return jobSeeker; // No fields to update
            }

            // Construct the full update query
            const updateQuery = `
                UPDATE job_seekers 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            queryParams.push(id);

            // Log the update query and parameters
            console.log("Update query:", updateQuery);
            console.log("Update params:", queryParams);

            const result = await client.query(updateQuery, queryParams);
            const updatedJobSeeker = result.rows[0];

            // Add history entry
            const historyQuery = `
                INSERT INTO job_seeker_history (
                    job_seeker_id,
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
                    after: updatedJobSeeker
                }),
                userId || jobSeeker.created_by
            ];

            await client.query(historyQuery, historyValues);

            // Commit transaction
            await client.query('COMMIT');

            console.log("Job seeker updated successfully:", updatedJobSeeker);
            return updatedJobSeeker;
        } catch (error) {
            // Rollback transaction in case of error
            await client.query('ROLLBACK');
            console.error("Error updating job seeker:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Delete job seeker by ID
    async delete(id, userId = null) {
        const client = await this.pool.connect();
        try {
            // Begin transaction
            await client.query('BEGIN');

            // First, get the job seeker to ensure it exists and for audit
            const getJobSeekerQuery = 'SELECT * FROM job_seekers WHERE id = $1';
            const jobSeekerResult = await client.query(getJobSeekerQuery, [id]);

            if (jobSeekerResult.rows.length === 0) {
                throw new Error('Job seeker not found');
            }

            const jobSeeker = jobSeekerResult.rows[0];

            // If userId is provided (not admin/owner), check permission
            if (userId !== null && jobSeeker.created_by !== userId) {
                throw new Error('You do not have permission to delete this job seeker');
            }

            // Add an entry to history before deleting
            const historyQuery = `
                INSERT INTO job_seeker_history (
                    job_seeker_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                id,
                'DELETE',
                JSON.stringify(jobSeeker),
                userId || jobSeeker.created_by // Use original creator if no specific user
            ];

            await client.query(historyQuery, historyValues);

            // Delete the job seeker
            const deleteQuery = 'DELETE FROM job_seekers WHERE id = $1 RETURNING *';
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

    // Add a note to a job seeker
    async addNote(jobSeekerId, text, userId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Insert the note
            const noteQuery = `
                INSERT INTO job_seeker_notes (job_seeker_id, text, created_by)
                VALUES ($1, $2, $3)
                RETURNING id, text, created_at
            `;

            const noteResult = await client.query(noteQuery, [jobSeekerId, text, userId]);

            // Add history entry for the note
            const historyQuery = `
                INSERT INTO job_seeker_history (
                    job_seeker_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                jobSeekerId,
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

    // Add this new method to the JobSeeker class in models/jobseeker.js

    // Add a note to a job seeker and automatically update last contact date
    async addNoteAndUpdateContact(jobSeekerId, text, userId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Insert the note
            const noteQuery = `
                INSERT INTO job_seeker_notes (job_seeker_id, text, created_by)
                VALUES ($1, $2, $3)
                RETURNING id, text, created_at
            `;

            const noteResult = await client.query(noteQuery, [jobSeekerId, text, userId]);

            // Update last contact date to current date
            const updateContactQuery = `
                UPDATE job_seekers 
                SET last_contact_date = CURRENT_DATE, updated_at = NOW()
                WHERE id = $1
            `;

            await client.query(updateContactQuery, [jobSeekerId]);

            // Add history entry for the note
            const historyQuery = `
                INSERT INTO job_seeker_history (
                    job_seeker_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                jobSeekerId,
                'ADD_NOTE',
                JSON.stringify({
                    noteId: noteResult.rows[0].id,
                    text,
                    lastContactDateUpdated: true
                }),
                userId
            ];

            await client.query(historyQuery, historyValues);

            // Add history entry for last contact date update
            const contactHistoryQuery = `
                INSERT INTO job_seeker_history (
                    job_seeker_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const contactHistoryValues = [
                jobSeekerId,
                'UPDATE_CONTACT_DATE',
                JSON.stringify({
                    lastContactDate: new Date().toISOString().split('T')[0],
                    triggeredBy: 'note_addition',
                    noteId: noteResult.rows[0].id
                }),
                userId
            ];

            await client.query(contactHistoryQuery, contactHistoryValues);

            await client.query('COMMIT');

            console.log(`Note added and last contact date updated for job seeker ${jobSeekerId}`);

            return {
                ...noteResult.rows[0],
                lastContactDateUpdated: true
            };
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error adding note and updating contact date:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Keep the existing addNote method for backward compatibility but make it call the new method
    async addNote(jobSeekerId, text, userId) {
        return await this.addNoteAndUpdateContact(jobSeekerId, text, userId);
    }

    // Get notes for a job seeker
    async getNotes(jobSeekerId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT n.*, u.name as created_by_name
                FROM job_seeker_notes n
                LEFT JOIN users u ON n.created_by = u.id
                WHERE n.job_seeker_id = $1
                ORDER BY n.created_at DESC
            `;

            const result = await client.query(query, [jobSeekerId]);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get history for a job seeker
    async getHistory(jobSeekerId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT h.*, u.name as performed_by_name
                FROM job_seeker_history h
                LEFT JOIN users u ON h.performed_by = u.id
                WHERE h.job_seeker_id = $1
                ORDER BY h.performed_at DESC
            `;

            const result = await client.query(query, [jobSeekerId]);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = JobSeeker;