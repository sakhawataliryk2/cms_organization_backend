const bcrypt = require('bcrypt');

class Lead {
    constructor(pool) {
        this.pool = pool;
    }

    // Initialize the leads table if it doesn't exist
    async initTable() {
        let client;
        try {
            console.log('Initializing leads table if needed...');
            client = await this.pool.connect();

            await client.query(`
                CREATE TABLE IF NOT EXISTS leads (
                    id SERIAL PRIMARY KEY,
                    first_name VARCHAR(255) NOT NULL,
                    last_name VARCHAR(255) NOT NULL,
                    status VARCHAR(50) DEFAULT 'New Lead',
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
                    last_contact_date DATE,
                    created_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    custom_fields JSONB
                )
            `);

            // Create a table for lead notes
            await client.query(`
                CREATE TABLE IF NOT EXISTS lead_notes (
                    id SERIAL PRIMARY KEY,
                    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
                    text TEXT NOT NULL,
                    created_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create a table for lead history
            await client.query(`
                CREATE TABLE IF NOT EXISTS lead_history (
                    id SERIAL PRIMARY KEY,
                    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
                    action VARCHAR(50) NOT NULL,
                    details JSONB,
                    performed_by INTEGER REFERENCES users(id),
                    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('✅ Leads tables initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Error initializing leads tables:', error.message);
            throw error;
        } finally {
            if (client) {
                client.release();
            }
        }
    }

    // Create a new lead
    async create(leadData) {
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
        } = leadData;

        console.log("Lead model - create function input:", JSON.stringify(leadData, null, 2));

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
            const insertLeadQuery = `
                INSERT INTO leads (
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
                status || 'New Lead',
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

            console.log("SQL Query:", insertLeadQuery);
            console.log("Query values:", values);

            const result = await client.query(insertLeadQuery, values);

            // Add an entry to history
            const historyQuery = `
                INSERT INTO lead_history (
                    lead_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                result.rows[0].id,
                'CREATE',
                JSON.stringify(leadData),
                userId
            ];

            await client.query(historyQuery, historyValues);

            // Commit transaction
            await client.query('COMMIT');

            console.log("Created lead:", result.rows[0]);
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Error in create lead:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get all leads (with optional filtering by created_by user)
    async getAll(userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT l.*, u.name as created_by_name,
                CONCAT(l.last_name, ', ', l.first_name) as full_name,
                o.name as organization_name_from_org
                FROM leads l
                LEFT JOIN users u ON l.created_by = u.id
                LEFT JOIN organizations o ON l.organization_id = o.id
            `;

            const values = [];

            if (userId) {
                query += ` WHERE l.created_by = $1`;
                values.push(userId);
            }

            query += ` ORDER BY l.created_at DESC`;

            const result = await client.query(query, values);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get lead by ID
    async getById(id, userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT l.*, u.name as created_by_name,
                CONCAT(l.last_name, ', ', l.first_name) as full_name,
                o.name as organization_name_from_org
                FROM leads l
                LEFT JOIN users u ON l.created_by = u.id
                LEFT JOIN organizations o ON l.organization_id = o.id
                WHERE l.id = $1
            `;

            const values = [id];

            if (userId) {
                query += ` AND l.created_by = $2`;
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

    // Update lead by ID
    async update(id, updateData, userId = null) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // First, get the lead to ensure it exists and check permissions
            const getLeadQuery = 'SELECT * FROM leads WHERE id = $1';
            const leadResult = await client.query(getLeadQuery, [id]);

            if (leadResult.rows.length === 0) {
                throw new Error('Lead not found');
            }

            const lead = leadResult.rows[0];

            if (userId !== null && lead.created_by !== userId) {
                throw new Error('You do not have permission to update this lead');
            }

            const oldState = { ...lead };

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
                lastContactDate: 'last_contact_date',
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
                    const existingCustomFields = typeof lead.custom_fields === 'string'
                        ? JSON.parse(lead.custom_fields || '{}')
                        : (lead.custom_fields || {});

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
                return lead;
            }

            const updateQuery = `
                UPDATE leads 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            queryParams.push(id);

            const result = await client.query(updateQuery, queryParams);
            const updatedLead = result.rows[0];

            // Add history entry
            const historyQuery = `
                INSERT INTO lead_history (
                    lead_id,
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
                    after: updatedLead
                }),
                userId || lead.created_by
            ];

            await client.query(historyQuery, historyValues);

            await client.query('COMMIT');

            console.log("Lead updated successfully:", updatedLead);
            return updatedLead;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Error updating lead:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Delete lead by ID
    async delete(id, userId = null) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const getLeadQuery = 'SELECT * FROM leads WHERE id = $1';
            const leadResult = await client.query(getLeadQuery, [id]);

            if (leadResult.rows.length === 0) {
                throw new Error('Lead not found');
            }

            const lead = leadResult.rows[0];

            if (userId !== null && lead.created_by !== userId) {
                throw new Error('You do not have permission to delete this lead');
            }

            // Add an entry to history before deleting
            const historyQuery = `
                INSERT INTO lead_history (
                    lead_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                id,
                'DELETE',
                JSON.stringify(lead),
                userId || lead.created_by
            ];

            await client.query(historyQuery, historyValues);

            // Delete the lead
            const deleteQuery = 'DELETE FROM leads WHERE id = $1 RETURNING *';
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

    // Add a note to a lead and update last contact date
    async addNoteAndUpdateContact(leadId, text, userId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Add the note
            const noteQuery = `
                INSERT INTO lead_notes (lead_id, text, created_by)
                VALUES ($1, $2, $3)
                RETURNING id, text, created_at
            `;

            const noteResult = await client.query(noteQuery, [leadId, text, userId]);

            // Update last contact date
            const updateContactQuery = `
                UPDATE leads 
                SET last_contact_date = CURRENT_DATE, updated_at = NOW()
                WHERE id = $1
            `;

            await client.query(updateContactQuery, [leadId]);

            // Add history entry
            const historyQuery = `
                INSERT INTO lead_history (
                    lead_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                leadId,
                'ADD_NOTE',
                JSON.stringify({
                    noteId: noteResult.rows[0].id,
                    text,
                    lastContactUpdated: true
                }),
                userId
            ];

            await client.query(historyQuery, historyValues);

            await client.query('COMMIT');

            return {
                ...noteResult.rows[0],
                lastContactUpdated: true
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Legacy method for backward compatibility
    async addNote(leadId, text, userId) {
        return this.addNoteAndUpdateContact(leadId, text, userId);
    }

    // Get notes for a lead
    async getNotes(leadId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT n.*, u.name as created_by_name
                FROM lead_notes n
                LEFT JOIN users u ON n.created_by = u.id
                WHERE n.lead_id = $1
                ORDER BY n.created_at DESC
            `;

            const result = await client.query(query, [leadId]);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get history for a lead
    async getHistory(leadId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT h.*, u.name as performed_by_name
                FROM lead_history h
                LEFT JOIN users u ON h.performed_by = u.id
                WHERE h.lead_id = $1
                ORDER BY h.performed_at DESC
            `;

            const result = await client.query(query, [leadId]);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get leads by organization
    async getByOrganization(organizationId, userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT l.*, u.name as created_by_name,
                CONCAT(l.last_name, ', ', l.first_name) as full_name
                FROM leads l
                LEFT JOIN users u ON l.created_by = u.id
                WHERE l.organization_id = $1
            `;

            const values = [organizationId];

            if (userId) {
                query += ` AND l.created_by = $2`;
                values.push(userId);
            }

            query += ` ORDER BY l.created_at DESC`;

            const result = await client.query(query, values);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Search leads
    async search(searchQuery, userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT l.*, u.name as created_by_name,
                CONCAT(l.last_name, ', ', l.first_name) as full_name,
                o.name as organization_name_from_org
                FROM leads l
                LEFT JOIN users u ON l.created_by = u.id
                LEFT JOIN organizations o ON l.organization_id = o.id
                WHERE (
                    l.first_name ILIKE $1 OR 
                    l.last_name ILIKE $1 OR 
                    l.email ILIKE $1 OR 
                    l.title ILIKE $1 OR 
                    l.organization_name ILIKE $1
                )
            `;

            const values = [`%${searchQuery}%`];

            if (userId) {
                query += ` AND l.created_by = $2`;
                values.push(userId);
            }

            query += ` ORDER BY l.created_at DESC`;

            const result = await client.query(query, values);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get lead statistics
    async getStats(userId = null) {
        const client = await this.pool.connect();
        try {
            let baseQuery = `
                SELECT 
                    COUNT(*) as total_leads,
                    COUNT(CASE WHEN status = 'New Lead' THEN 1 END) as new_leads,
                    COUNT(CASE WHEN status = 'Qualified' THEN 1 END) as qualified_leads,
                    COUNT(CASE WHEN status = 'Contacted' THEN 1 END) as contacted_leads,
                    COUNT(CASE WHEN status = 'Converted' THEN 1 END) as converted_leads,
                    COUNT(CASE WHEN last_contact_date >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as recent_contacts
                FROM leads
            `;

            const values = [];

            if (userId) {
                baseQuery += ` WHERE created_by = $1`;
                values.push(userId);
            }

            const result = await client.query(baseQuery, values);
            return result.rows[0];
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = Lead;