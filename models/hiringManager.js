const bcrypt = require('bcrypt');

class HiringManager {
    constructor(pool) {
        this.pool = pool;
    }

    // Initialize the hiring_managers table if it doesn't exist
    async initTable() {
        let client;
        try {
            console.log('Initializing hiring_managers table if needed...');
            client = await this.pool.connect();

            await client.query(`
                CREATE TABLE IF NOT EXISTS hiring_managers (
                    id SERIAL PRIMARY KEY,
                    first_name VARCHAR(255) NOT NULL,
                    last_name VARCHAR(255) NOT NULL,
                    status VARCHAR(50) DEFAULT 'Active',
                    nickname VARCHAR(255),
                    title VARCHAR(255),
                    organization_id INTEGER REFERENCES organizations(id),
                    organization_name VARCHAR(255),
                    department VARCHAR(100),
                    reports_to VARCHAR(255),
                    owner VARCHAR(255),
                    secondary_owners VARCHAR(255),
                    email VARCHAR(255),
                    email2 VARCHAR(255),
                    phone VARCHAR(50),
                    mobile_phone VARCHAR(50),
                    direct_line VARCHAR(50),
                    linkedin_url VARCHAR(500),
                    address TEXT,
                    date_added DATE DEFAULT CURRENT_DATE,
                    created_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    custom_fields JSONB
                )
            `);

            // Create a table for hiring manager notes
            await client.query(`
                CREATE TABLE IF NOT EXISTS hiring_manager_notes (
                    id SERIAL PRIMARY KEY,
                    hiring_manager_id INTEGER NOT NULL REFERENCES hiring_managers(id) ON DELETE CASCADE,
                    text TEXT NOT NULL,
                    created_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create a table for hiring manager history
            await client.query(`
                CREATE TABLE IF NOT EXISTS hiring_manager_history (
                    id SERIAL PRIMARY KEY,
                    hiring_manager_id INTEGER NOT NULL REFERENCES hiring_managers(id) ON DELETE CASCADE,
                    action VARCHAR(50) NOT NULL,
                    details JSONB,
                    performed_by INTEGER REFERENCES users(id),
                    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('✅ Hiring managers tables initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Error initializing hiring managers tables:', error.message);
            throw error;
        } finally {
            if (client) {
                client.release();
            }
        }
    }

    // Create a new hiring manager
    async create(hiringManagerData) {
        const {
            firstName,
            lastName,
            status,
            nickname,
            title,
            organizationId,
            organizationName,
            department,
            reportsTo,
            owner,
            secondaryOwners,
            email,
            email2,
            phone,
            mobilePhone,
            directLine,
            linkedinUrl,
            address,
            dateAdded,
            userId,
            customFields = {}
        } = hiringManagerData;

        console.log("HiringManager model - create function input:", JSON.stringify(hiringManagerData, null, 2));

        const client = await this.pool.connect();

        try {
            // Begin transaction
            await client.query('BEGIN');

            // Handle organization ID resolution
            let orgId = null;
            let orgName = organizationName;

            if (organizationId) {
                if (!isNaN(parseInt(organizationId))) {
                    orgId = parseInt(organizationId);
                    // Get organization name if not provided
                    if (!orgName) {
                        try {
                            const orgQuery = 'SELECT name FROM organizations WHERE id = $1';
                            const orgResult = await client.query(orgQuery, [orgId]);
                            if (orgResult.rows.length > 0) {
                                orgName = orgResult.rows[0].name;
                            }
                        } catch (error) {
                            console.log("Error finding organization by ID:", error.message);
                        }
                    }
                } else {
                    // Try to find organization by name
                    try {
                        const orgQuery = 'SELECT id, name FROM organizations WHERE name = $1';
                        const orgResult = await client.query(orgQuery, [organizationId]);
                        if (orgResult.rows.length > 0) {
                            orgId = orgResult.rows[0].id;
                            orgName = orgResult.rows[0].name;
                        } else {
                            // Store as text if not found
                            orgName = organizationId;
                        }
                    } catch (error) {
                        console.log("Error finding organization by name:", error.message);
                        orgName = organizationId;
                    }
                }
            }

            // Properly handle custom fields
            let customFieldsJson = '{}';
            if (customFields) {
                if (typeof customFields === 'string') {
                    try {
                        JSON.parse(customFields);
                        customFieldsJson = customFields;
                    } catch (e) {
                        console.log("Invalid JSON string in customFields, using empty object");
                        customFieldsJson = '{}';
                    }
                } else if (typeof customFields === 'object') {
                    customFieldsJson = JSON.stringify(customFields);
                }
            }

            // Set up insert statement
            const insertHiringManagerQuery = `
                INSERT INTO hiring_managers (
                    first_name,
                    last_name,
                    status,
                    nickname,
                    title,
                    organization_id,
                    organization_name,
                    department,
                    reports_to,
                    owner,
                    secondary_owners,
                    email,
                    email2,
                    phone,
                    mobile_phone,
                    direct_line,
                    linkedin_url,
                    address,
                    date_added,
                    created_by,
                    custom_fields
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                RETURNING *
            `;

            const values = [
                firstName,
                lastName,
                status || 'Active',
                nickname,
                title,
                orgId,
                orgName,
                department,
                reportsTo,
                owner,
                secondaryOwners,
                email,
                email2,
                phone,
                mobilePhone,
                directLine,
                linkedinUrl,
                address,
                dateAdded || new Date().toISOString().split('T')[0],
                userId,
                customFieldsJson
            ];

            console.log("SQL Query:", insertHiringManagerQuery);
            console.log("Query values:", values);

            const result = await client.query(insertHiringManagerQuery, values);

            // Add an entry to history
            const historyQuery = `
                INSERT INTO hiring_manager_history (
                    hiring_manager_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                result.rows[0].id,
                'CREATE',
                JSON.stringify(hiringManagerData),
                userId
            ];

            await client.query(historyQuery, historyValues);

            // Commit transaction
            await client.query('COMMIT');

            console.log("Created hiring manager:", result.rows[0]);
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Error in create hiring manager:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get all hiring managers (with optional filtering by created_by user)
    async getAll(userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT hm.*, u.name as created_by_name,
                CONCAT(hm.last_name, ', ', hm.first_name) as full_name,
                o.name as organization_name_from_org
                FROM hiring_managers hm
                LEFT JOIN users u ON hm.created_by = u.id
                LEFT JOIN organizations o ON hm.organization_id = o.id
            `;

            const values = [];

            if (userId) {
                query += ` WHERE hm.created_by = $1`;
                values.push(userId);
            }

            query += ` ORDER BY hm.created_at DESC`;

            const result = await client.query(query, values);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get hiring manager by ID
    async getById(id, userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT hm.*, u.name as created_by_name,
                CONCAT(hm.last_name, ', ', hm.first_name) as full_name,
                o.name as organization_name_from_org
                FROM hiring_managers hm
                LEFT JOIN users u ON hm.created_by = u.id
                LEFT JOIN organizations o ON hm.organization_id = o.id
                WHERE hm.id = $1
            `;

            const values = [id];

            if (userId) {
                query += ` AND hm.created_by = $2`;
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





    // Add this method to the HiringManager class
    async getCustomFields() {
        const client = await this.pool.connect();
        try {
            const query = `
            SELECT cfd.*, 
                   u.name as created_by_name,
                   u2.name as updated_by_name
            FROM custom_field_definitions cfd
            LEFT JOIN users u ON cfd.created_by = u.id
            LEFT JOIN users u2 ON cfd.updated_by = u2.id
            WHERE cfd.entity_type = 'hiring-managers'
            ORDER BY cfd.sort_order, cfd.created_at
        `;

            const result = await client.query(query);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }


    // Update hiring manager by ID
    async update(id, updateData, userId = null) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // First, get the hiring manager to ensure it exists and check permissions
            const getHiringManagerQuery = 'SELECT * FROM hiring_managers WHERE id = $1';
            const hiringManagerResult = await client.query(getHiringManagerQuery, [id]);

            if (hiringManagerResult.rows.length === 0) {
                throw new Error('Hiring manager not found');
            }

            const hiringManager = hiringManagerResult.rows[0];

            if (userId !== null && hiringManager.created_by !== userId) {
                throw new Error('You do not have permission to update this hiring manager');
            }

            const oldState = { ...hiringManager };

            // Build update query dynamically
            const updateFields = [];
            const queryParams = [];
            let paramCount = 1;

            const fieldMapping = {
                firstName: 'first_name',
                lastName: 'last_name',
                status: 'status',
                nickname: 'nickname',
                title: 'title',
                organizationId: 'organization_id',
                organizationName: 'organization_name',
                department: 'department',
                reportsTo: 'reports_to',
                owner: 'owner',
                secondaryOwners: 'secondary_owners',
                email: 'email',
                email2: 'email2',
                phone: 'phone',
                mobilePhone: 'mobile_phone',
                directLine: 'direct_line',
                linkedinUrl: 'linkedin_url',
                address: 'address',
                dateAdded: 'date_added',
                customFields: 'custom_fields'
            };

            // Handle organization ID conversion
            if (updateData.organizationId !== undefined) {
                let orgId = null;
                let orgName = updateData.organizationName;

                if (!isNaN(parseInt(updateData.organizationId))) {
                    orgId = parseInt(updateData.organizationId);
                    if (!orgName) {
                        try {
                            const orgQuery = 'SELECT name FROM organizations WHERE id = $1';
                            const orgResult = await client.query(orgQuery, [orgId]);
                            if (orgResult.rows.length > 0) {
                                orgName = orgResult.rows[0].name;
                            }
                        } catch (error) {
                            console.log("Error finding organization by ID:", error.message);
                        }
                    }
                } else if (typeof updateData.organizationId === 'string' && updateData.organizationId.trim() !== '') {
                    try {
                        const orgQuery = 'SELECT id, name FROM organizations WHERE name = $1';
                        const orgResult = await client.query(orgQuery, [updateData.organizationId]);
                        if (orgResult.rows.length > 0) {
                            orgId = orgResult.rows[0].id;
                            orgName = orgResult.rows[0].name;
                        } else {
                            orgName = updateData.organizationId;
                        }
                    } catch (error) {
                        console.log("Error finding organization by name:", error.message);
                        orgName = updateData.organizationId;
                    }
                }

                updateFields.push(`organization_id = $${paramCount}`);
                queryParams.push(orgId);
                paramCount++;

                updateFields.push(`organization_name = $${paramCount}`);
                queryParams.push(orgName);
                paramCount++;

                delete updateData.organizationId;
                delete updateData.organizationName;
            }

            // Handle custom fields merging
            if (updateData.customFields) {
                let newCustomFields = {};

                try {
                    const existingCustomFields = typeof hiringManager.custom_fields === 'string'
                        ? JSON.parse(hiringManager.custom_fields || '{}')
                        : (hiringManager.custom_fields || {});

                    const updateCustomFields = typeof updateData.customFields === 'string'
                        ? JSON.parse(updateData.customFields)
                        : updateData.customFields;

                    newCustomFields = { ...existingCustomFields, ...updateCustomFields };
                } catch (e) {
                    console.error("Error parsing custom fields:", e);
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

            // Process all other fields
            for (const [key, value] of Object.entries(updateData)) {
                if (key !== 'customFields' && fieldMapping[key] && value !== undefined) {
                    updateFields.push(`${fieldMapping[key]} = $${paramCount}`);
                    queryParams.push(value);
                    paramCount++;
                }
            }

            updateFields.push(`updated_at = NOW()`);

            if (updateFields.length === 1) { // Only updated_at
                await client.query('ROLLBACK');
                return hiringManager;
            }

            const updateQuery = `
                UPDATE hiring_managers 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            queryParams.push(id);

            const result = await client.query(updateQuery, queryParams);
            const updatedHiringManager = result.rows[0];

            // Add history entry
            const historyQuery = `
                INSERT INTO hiring_manager_history (
                    hiring_manager_id,
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
                    after: updatedHiringManager
                }),
                userId || hiringManager.created_by
            ];

            await client.query(historyQuery, historyValues);

            await client.query('COMMIT');

            console.log("Hiring manager updated successfully:", updatedHiringManager);
            return updatedHiringManager;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Error updating hiring manager:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Delete hiring manager by ID
    async delete(id, userId = null) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const getHiringManagerQuery = 'SELECT * FROM hiring_managers WHERE id = $1';
            const hiringManagerResult = await client.query(getHiringManagerQuery, [id]);

            if (hiringManagerResult.rows.length === 0) {
                throw new Error('Hiring manager not found');
            }

            const hiringManager = hiringManagerResult.rows[0];

            if (userId !== null && hiringManager.created_by !== userId) {
                throw new Error('You do not have permission to delete this hiring manager');
            }

            // Add an entry to history before deleting
            const historyQuery = `
                INSERT INTO hiring_manager_history (
                    hiring_manager_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                id,
                'DELETE',
                JSON.stringify(hiringManager),
                userId || hiringManager.created_by
            ];

            await client.query(historyQuery, historyValues);

            // Delete the hiring manager
            const deleteQuery = 'DELETE FROM hiring_managers WHERE id = $1 RETURNING *';
            const result = await client.query(deleteQuery, [id]);

            await client.query('COMMIT');

            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Add a note to a hiring manager
    async addNote(hiringManagerId, text, userId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const noteQuery = `
                INSERT INTO hiring_manager_notes (hiring_manager_id, text, created_by)
                VALUES ($1, $2, $3)
                RETURNING id, text, created_at
            `;

            const noteResult = await client.query(noteQuery, [hiringManagerId, text, userId]);

            const historyQuery = `
                INSERT INTO hiring_manager_history (
                    hiring_manager_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                hiringManagerId,
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

    // Get notes for a hiring manager
    async getNotes(hiringManagerId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT n.*, u.name as created_by_name
                FROM hiring_manager_notes n
                LEFT JOIN users u ON n.created_by = u.id
                WHERE n.hiring_manager_id = $1
                ORDER BY n.created_at DESC
            `;

            const result = await client.query(query, [hiringManagerId]);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get history for a hiring manager
    async getHistory(hiringManagerId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT h.*, u.name as performed_by_name
                FROM hiring_manager_history h
                LEFT JOIN users u ON h.performed_by = u.id
                WHERE h.hiring_manager_id = $1
                ORDER BY h.performed_at DESC
            `;

            const result = await client.query(query, [hiringManagerId]);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get hiring managers by organization ID
    async getByOrganization(organizationId, userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT hm.*, u.name as created_by_name,
                CONCAT(hm.last_name, ', ', hm.first_name) as full_name,
                o.name as organization_name_from_org
                FROM hiring_managers hm
                LEFT JOIN users u ON hm.created_by = u.id
                LEFT JOIN organizations o ON hm.organization_id = o.id
                WHERE hm.organization_id = $1
            `;

            const values = [organizationId];

            if (userId) {
                query += ` AND hm.created_by = $2`;
                values.push(userId);
            }

            query += ` ORDER BY hm.created_at DESC`;

            const result = await client.query(query, values);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = HiringManager;