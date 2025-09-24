// COMPLETE FIXED models/organization.js file
const bcrypt = require('bcrypt');

class Organization {
    constructor(pool) {
        this.pool = pool;
    }

    // Helper function to safely parse integer fields
    parseIntegerField(value) {
        if (value === null || value === undefined || value === '') {
            return null;
        }
        const parsed = parseInt(value);
        return isNaN(parsed) ? null : parsed;
    }

    // Initialize the organizations table if it doesn't exist
    async initTable() {
        let client;
        try {
            console.log('Initializing organizations table if needed...');
            client = await this.pool.connect();

            await client.query(`
                CREATE TABLE IF NOT EXISTS organizations (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    nicknames VARCHAR(255),
                    parent_organization VARCHAR(255),
                    website VARCHAR(255),
                    status VARCHAR(50) DEFAULT 'Active',
                    contract_on_file VARCHAR(10) DEFAULT 'No',
                    contract_signed_by VARCHAR(255),
                    date_contract_signed DATE,
                    year_founded VARCHAR(4),
                    overview TEXT,
                    perm_fee VARCHAR(50),
                    num_employees INTEGER,
                    num_offices INTEGER,
                    created_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    contact_phone VARCHAR(50),
                    address TEXT,
                    address2 VARCHAR(255),
                    city VARCHAR(255),
                    state VARCHAR(255),
                    zip_code VARCHAR(20),
                    custom_fields JSONB
                )
            `);

            // Also create a table for organization notes if it doesn't exist
            await client.query(`
                CREATE TABLE IF NOT EXISTS organization_notes (
                    id SERIAL PRIMARY KEY,
                    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                    text TEXT NOT NULL,
                    created_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create a table for organization history
            await client.query(`
                CREATE TABLE IF NOT EXISTS organization_history (
                    id SERIAL PRIMARY KEY,
                    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                    action VARCHAR(50) NOT NULL,
                    details JSONB,
                    performed_by INTEGER REFERENCES users(id),
                    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('✅ Organizations tables initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Error initializing organizations tables:', error.message);
            throw error;
        } finally {
            if (client) {
                client.release();
            }
        }
    }

    // Create a new organization
    async create(organizationData) {
        const {
            name,
            nicknames,
            parent_organization,
            website,
            status,
            contract_on_file,
            contract_signed_by,
            date_contract_signed,
            year_founded,
            overview,
            perm_fee,
            num_employees,
            num_offices,
            contact_phone,
            address,
            address2,
            city,
            state,
            zip_code,
            userId,
            customFields = {}
        } = organizationData;

        console.log("Organization model - create function input:", JSON.stringify(organizationData, null, 2));

        const client = await this.pool.connect();

        try {
            // Begin transaction
            await client.query('BEGIN');

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

            // Set up insert statement with exact column names matching the database
            const insertOrgQuery = `
                INSERT INTO organizations (
                    name, 
                    nicknames, 
                    parent_organization, 
                    website, 
                    status, 
                    contract_on_file, 
                    contract_signed_by, 
                    date_contract_signed, 
                    year_founded, 
                    overview, 
                    perm_fee, 
                    num_employees, 
                    num_offices, 
                    created_by,
                    contact_phone,
                    address,
                    address2,
                    city,
                    state,
                    zip_code,
                    custom_fields
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                RETURNING *
            `;

            // FIXED: Use helper function to safely parse integer fields
            const values = [
                name,
                nicknames,
                parent_organization,
                website,
                status,
                contract_on_file,
                contract_signed_by,
                date_contract_signed || null,
                year_founded,
                overview,
                perm_fee,
                this.parseIntegerField(num_employees),  // FIXED
                this.parseIntegerField(num_offices),    // FIXED
                userId,
                contact_phone,
                address,
                address2,
                city,
                state,
                zip_code,
                customFieldsJson
            ];

            // Debug log the SQL and values
            console.log("SQL Query:", insertOrgQuery);
            console.log("Query values:", JSON.stringify(values, null, 2));

            const result = await client.query(insertOrgQuery, values);

            // Add an entry to history
            const historyQuery = `
                INSERT INTO organization_history (
                    organization_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                result.rows[0].id,
                'CREATE',
                JSON.stringify(organizationData),
                userId
            ];

            await client.query(historyQuery, historyValues);

            // Commit transaction
            await client.query('COMMIT');

            console.log("Created organization:", result.rows[0]);
            return result.rows[0];
        } catch (error) {
            // Rollback transaction in case of error
            await client.query('ROLLBACK');
            console.error("Error in create organization:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get all organizations (with optional filtering by created_by user)
    async getAll(userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT o.*, u.name as created_by_name 
                FROM organizations o
                LEFT JOIN users u ON o.created_by = u.id
            `;

            const values = [];

            // If userId is provided, filter organizations by the user that created them
            if (userId) {
                query += ` WHERE o.created_by = $1`;
                values.push(userId);
            }

            query += ` ORDER BY o.created_at DESC`;

            const result = await client.query(query, values);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get organization by ID, optionally checking created_by user
    async getById(id, userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT o.*, u.name as created_by_name
                FROM organizations o
                LEFT JOIN users u ON o.created_by = u.id
                WHERE o.id = $1
            `;

            const values = [id];

            // If userId is provided, ensure the organization was created by this user
            if (userId) {
                query += ` AND o.created_by = $2`;
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

    // Update organization by ID
    async update(id, updateData, userId = null) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // First, get the organization to ensure it exists and check permissions
            const getOrgQuery = 'SELECT * FROM organizations WHERE id = $1';
            const orgResult = await client.query(getOrgQuery, [id]);

            if (orgResult.rows.length === 0) {
                throw new Error('Organization not found');
            }

            const organization = orgResult.rows[0];

            if (userId !== null && organization.created_by !== userId) {
                throw new Error('You do not have permission to update this organization');
            }

            const oldState = { ...organization };

            // Build update query dynamically
            const updateFields = [];
            const queryParams = [];
            let paramCount = 1;

            const fieldMapping = {
                parentOrganization: 'parent_organization',
                contractOnFile: 'contract_on_file',
                contractSignedBy: 'contract_signed_by',
                dateContractSigned: 'date_contract_signed',
                yearFounded: 'year_founded',
                permFee: 'perm_fee',
                numEmployees: 'num_employees',
                numOffices: 'num_offices',
                contactPhone: 'contact_phone',
                address2: 'address2',
                city: 'city',
                state: 'state',
                zipCode: 'zip_code',
                customFields: 'custom_fields'
            };

            // Handle custom fields merging
            if (updateData.customFields || updateData.custom_fields) {
                const customFieldsData = updateData.customFields || updateData.custom_fields;
                let newCustomFields = {};

                try {
                    const existingCustomFields = typeof organization.custom_fields === 'string'
                        ? JSON.parse(organization.custom_fields || '{}')
                        : (organization.custom_fields || {});

                    const updateCustomFields = typeof customFieldsData === 'string'
                        ? JSON.parse(customFieldsData)
                        : customFieldsData;

                    newCustomFields = { ...existingCustomFields, ...updateCustomFields };
                } catch (e) {
                    console.error("Error parsing custom fields:", e);
                    newCustomFields = typeof customFieldsData === 'string'
                        ? customFieldsData
                        : JSON.stringify(customFieldsData);
                }

                updateFields.push(`custom_fields = ${paramCount}`);
                queryParams.push(typeof newCustomFields === 'string'
                    ? newCustomFields
                    : JSON.stringify(newCustomFields));
                paramCount++;

                // Remove from further processing
                delete updateData.customFields;
                delete updateData.custom_fields;
            }

            // Process all other fields
            for (const [key, value] of Object.entries(updateData)) {
                if (fieldMapping[key]) {
                    updateFields.push(`${fieldMapping[key]} = ${paramCount}`);
                } else {
                    updateFields.push(`${key} = ${paramCount}`);
                }

                // Handle numeric conversions - FIXED
                if (key === 'numEmployees' || key === 'num_employees') {
                    queryParams.push(this.parseIntegerField(value));
                } else if (key === 'numOffices' || key === 'num_offices') {
                    queryParams.push(this.parseIntegerField(value));
                } else {
                    queryParams.push(value);
                }
                paramCount++;
            }

            updateFields.push(`updated_at = NOW()`);

            if (updateFields.length === 1) { // Only updated_at
                await client.query('ROLLBACK');
                return organization;
            }

            const updateQuery = `
                UPDATE organizations 
                SET ${updateFields.join(', ')}
                WHERE id = ${paramCount}
                RETURNING *
            `;

            queryParams.push(id);

            const result = await client.query(updateQuery, queryParams);
            const updatedOrganization = result.rows[0];

            // Add history entry
            const historyQuery = `
                INSERT INTO organization_history (
                    organization_id,
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
                    after: updatedOrganization
                }),
                userId || organization.created_by
            ];

            await client.query(historyQuery, historyValues);

            await client.query('COMMIT');

            console.log("Organization updated successfully:", updatedOrganization);
            return updatedOrganization;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Error updating organization:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Add a note to an organization
    async addNote(organizationId, text, userId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Insert the note
            const noteQuery = `
                INSERT INTO organization_notes (organization_id, text, created_by)
                VALUES ($1, $2, $3)
                RETURNING id, text, created_at
            `;

            const noteResult = await client.query(noteQuery, [organizationId, text, userId]);

            // Add history entry for the note
            const historyQuery = `
                INSERT INTO organization_history (
                    organization_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                organizationId,
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

    async getNotes(organizationId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT n.*, u.name as created_by_name
                FROM organization_notes n
                LEFT JOIN users u ON n.created_by = u.id
                WHERE n.organization_id = $1
                ORDER BY n.created_at DESC
            `;

            const result = await client.query(query, [organizationId]);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    async getHistory(organizationId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT h.*, u.name as performed_by_name
                FROM organization_history h
                LEFT JOIN users u ON h.performed_by = u.id
                WHERE h.organization_id = $1
                ORDER BY h.performed_at DESC
            `;

            const result = await client.query(query, [organizationId]);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    async delete(id, userId = null) {
        const client = await this.pool.connect();
        try {
            // Begin transaction
            await client.query('BEGIN');

            // First, get the organization to ensure it exists and for audit
            const getOrgQuery = 'SELECT * FROM organizations WHERE id = $1';
            const orgResult = await client.query(getOrgQuery, [id]);

            if (orgResult.rows.length === 0) {
                throw new Error('Organization not found');
            }

            const organization = orgResult.rows[0];

            // If userId is provided (not admin/owner), check permission
            if (userId !== null && organization.created_by !== userId) {
                throw new Error('You do not have permission to delete this organization');
            }

            // Add an entry to history before deleting
            const historyQuery = `
                INSERT INTO organization_history (
                    organization_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                id,
                'DELETE',
                JSON.stringify(organization),
                userId || organization.created_by // Use original creator if no specific user
            ];

            await client.query(historyQuery, historyValues);

            // Delete the organization
            const deleteQuery = 'DELETE FROM organizations WHERE id = $1 RETURNING *';
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
}

module.exports = Organization;