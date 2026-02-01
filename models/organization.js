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
                    name VARCHAR(255),
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
                    archived_at TIMESTAMP,
                    contact_phone VARCHAR(50),
                    address TEXT,
                    address2 VARCHAR(255),
                    city VARCHAR(255),
                    state VARCHAR(255),
                    zip_code VARCHAR(20),
                    custom_fields JSONB
                )
            `);

            // Add archived_at column if it doesn't exist (for existing tables)
            await client.query(`
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='organizations' AND column_name='archived_at'
                    ) THEN
                        ALTER TABLE organizations ADD COLUMN archived_at TIMESTAMP;
                    END IF;
                END $$;
            `);

            // Also create a table for organization notes if it doesn't exist
            await client.query(`
                CREATE TABLE IF NOT EXISTS organization_notes (
                    id SERIAL PRIMARY KEY,
                    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                    text TEXT NOT NULL,
                    action VARCHAR(255),
                    about_references JSONB,
                    created_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Add action and about_references columns if they don't exist (for existing tables)
            await client.query(`
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='organization_notes' AND column_name='action'
                    ) THEN
                        ALTER TABLE organization_notes ADD COLUMN action VARCHAR(255);
                    END IF;
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='organization_notes' AND column_name='about_references'
                    ) THEN
                        ALTER TABLE organization_notes ADD COLUMN about_references JSONB;
                    END IF;
                END $$;
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
            userId,
            custom_fields = {}   // <-- receive same name jo payload se aata hai
        } = organizationData;

        console.log("Organization model - create function input:", JSON.stringify(organizationData, null, 2));
        console.log("Custom fields received in model:", custom_fields);
        console.log("Custom fields type in model:", typeof custom_fields);

        const client = await this.pool.connect();

        try {
            // Begin transaction
            await client.query('BEGIN');

            // Properly handle custom fields
            // let customFieldsJson = '{}';
            // if (custom_fields) {
            //     if (typeof custom_fields === 'string') {
            //         try {
            //             JSON.parse(custom_fields);
            //             customFieldsJson = custom_fields;
            //         } catch (e) {
            //             console.log("Invalid JSON string in customFields, using empty object");
            //             customFieldsJson = '{}';
            //         }
            //     } else if (typeof custom_fields === 'object') {
            //         customFieldsJson = JSON.stringify(custom_fields);
            //     }
            // }
            // ✅ Convert custom fields for PostgreSQL JSONB
        // Use JSON.stringify like other models (lead.js, job.js, etc.)
        let customFieldsJson = '{}';
        
        if (custom_fields) {
            if (typeof custom_fields === 'string') {
                // It's already a string, validate it's valid JSON
                try {
                    JSON.parse(custom_fields);
                    customFieldsJson = custom_fields;
                } catch (e) {
                    console.error("Invalid JSON string in custom_fields:", e);
                    customFieldsJson = '{}';
                }
            } else if (typeof custom_fields === 'object' && !Array.isArray(custom_fields) && custom_fields !== null) {
                // It's a valid object, stringify it
                try {
                    customFieldsJson = JSON.stringify(custom_fields);
                } catch (e) {
                    console.error("Error stringifying custom_fields:", e);
                    customFieldsJson = '{}';
                }
            }
        }
        
        // Debug log
        console.log("Custom fields processing:");
        console.log("  - Received custom_fields:", custom_fields);
        console.log("  - Type:", typeof custom_fields);
        console.log("  - Is array:", Array.isArray(custom_fields));
        console.log("  - Final JSON string:", customFieldsJson);
        console.log("  - Final JSON string length:", customFieldsJson.length);
        console.log("  - Parsed keys count:", customFieldsJson !== '{}' ? Object.keys(JSON.parse(customFieldsJson)).length : 0);

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
                    custom_fields
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
                customFieldsJson  // Pass JSON string - consistent with other models
            ];

            // Debug log the SQL and values
            console.log("SQL Query:", insertOrgQuery);
            console.log("Query values (custom_fields JSON):", customFieldsJson);
            console.log("All query values count:", values.length);
            console.log("Custom fields being saved (type):", typeof customFieldsJson);
            console.log("Custom fields being saved (length):", customFieldsJson.length);

            const result = await client.query(insertOrgQuery, values);

            // Debug: Check what was returned from database
            console.log("=== DATABASE RETURN VALUE ===");
            console.log("Result rows[0]:", JSON.stringify(result.rows[0], null, 2));
            console.log("custom_fields in result:", result.rows[0].custom_fields);
            console.log("custom_fields type:", typeof result.rows[0].custom_fields);
            console.log("custom_fields keys:", result.rows[0].custom_fields ? Object.keys(result.rows[0].custom_fields).length : 'null/undefined');
            console.log("=== END DATABASE RETURN ===");

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

            // Final check before returning
            const returnedOrg = result.rows[0];
            console.log("=== FINAL RETURN VALUE ===");
            console.log("Returning organization with custom_fields:", returnedOrg.custom_fields);
            console.log("custom_fields type:", typeof returnedOrg.custom_fields);
            if (returnedOrg.custom_fields) {
                console.log("custom_fields keys:", Object.keys(returnedOrg.custom_fields).length);
                console.log("custom_fields sample:", JSON.stringify(returnedOrg.custom_fields).substring(0, 200));
            } else {
                console.log("custom_fields is null/undefined/empty");
            }
            console.log("=== END FINAL RETURN ===");
            
            return returnedOrg;
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

    // Get organizations by IDs (for TBI: orgs with approved placements)
    async getByIds(ids, userId = null) {
        if (!ids || ids.length === 0) return [];
        const client = await this.pool.connect();
        try {
            const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
            let query = `
                SELECT o.*, u.name as created_by_name
                FROM organizations o
                LEFT JOIN users u ON o.created_by = u.id
                WHERE o.id IN (${placeholders})
            `;
            const values = [...ids];
            if (userId) {
                query += ` AND o.created_by = $${ids.length + 1}`;
                values.push(userId);
            }
            query += ` ORDER BY o.name`;
            const result = await client.query(query, values);
            return result.rows;
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

                    // Ensure updateCustomFields is an object, not an integer or other type
                    if (typeof updateCustomFields === 'object' && updateCustomFields !== null && !Array.isArray(updateCustomFields)) {
                        newCustomFields = { ...existingCustomFields, ...updateCustomFields };
                    } else {
                        console.error("Warning: custom_fields data is not a valid object:", updateCustomFields);
                        newCustomFields = existingCustomFields; // Keep existing if new data is invalid
                    }
                } catch (e) {
                    console.error("Error parsing custom fields:", e);
                    // If parsing fails, ensure we still have a valid object
                    if (typeof customFieldsData === 'object' && customFieldsData !== null && !Array.isArray(customFieldsData)) {
                        newCustomFields = customFieldsData;
                    } else {
                        newCustomFields = {};
                    }
                }

                // Final validation: ensure newCustomFields is always an object
                if (typeof newCustomFields !== 'object' || newCustomFields === null || Array.isArray(newCustomFields)) {
                    console.error("CRITICAL: newCustomFields is not a valid object, using empty object");
                    newCustomFields = {};
                }

                updateFields.push(`custom_fields = $${paramCount}`);
                queryParams.push(newCustomFields); // DB JSONB me directly save ho jayega
                paramCount++;

                // Remove from further processing
                delete updateData.customFields;
                delete updateData.custom_fields;
            }

            // Process all other fields
            for (const [key, value] of Object.entries(updateData)) {
                // Skip customFields and custom_fields as they're already processed
                if (key === 'customFields' || key === 'custom_fields') {
                    continue;
                }

                // Skip undefined values - don't include them in the update
                if (value === undefined) {
                    continue;
                }

                // Get the database field name (snake_case)
                const dbFieldName = fieldMapping[key] || key;
                let paramValue = value;

                // Handle date fields - ensure null is properly handled
                if (dbFieldName === 'date_contract_signed') {
                    // If value is null, empty string, or invalid, set to null
                    if (value === null || value === '' || value === undefined) {
                        paramValue = null;
                    }
                    // paramValue is already set to value if it's valid
                }
                // Handle numeric conversions
                else if (dbFieldName === 'num_employees' || key === 'numEmployees' || key === 'num_employees') {
                    paramValue = this.parseIntegerField(value);
                } else if (dbFieldName === 'num_offices' || key === 'numOffices' || key === 'num_offices') {
                    paramValue = this.parseIntegerField(value);
                }

                // Ensure paramValue is not undefined before adding
                if (paramValue === undefined) {
                    console.warn(`Warning: paramValue is undefined for field ${key} (${dbFieldName}), skipping`);
                    continue;
                }

                // Add field and parameter - ensure we always add both together
                // Log each field being added for debugging
                console.log(`Adding field: ${dbFieldName} = $${paramCount}, value:`, paramValue, `type:`, typeof paramValue);
                updateFields.push(`${dbFieldName} = $${paramCount}`);
                queryParams.push(paramValue);
                paramCount++;
            }

            updateFields.push(`updated_at = NOW()`);

            if (updateFields.length === 1) { // Only updated_at
                await client.query('ROLLBACK');
                return organization;
            }

            // Validate that we have the same number of parameters as placeholders
            // Count placeholders in updateFields (excluding updated_at which has no param)
            const fieldPlaceholders = updateFields.filter(f => f.includes('$')).length;
            if (fieldPlaceholders !== queryParams.length) {
                console.error('Parameter mismatch detected!');
                console.error('Update fields:', updateFields);
                console.error('Query params count:', queryParams.length);
                console.error('Field placeholders count:', fieldPlaceholders);
                console.error('Query params:', queryParams);
                console.error('Update data received:', updateData);
                throw new Error(`Parameter count mismatch: ${fieldPlaceholders} placeholders but ${queryParams.length} parameters`);
            }
            
            // Validate that all parameters are defined (not undefined)
            queryParams.forEach((param, index) => {
                if (param === undefined) {
                    console.error(`Parameter at index ${index} is undefined!`);
                    console.error('Update fields:', updateFields);
                    console.error('Query params:', queryParams);
                    throw new Error(`Parameter at index ${index} is undefined`);
                }
            });

            const updateQuery = `
                UPDATE organizations 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            queryParams.push(id);
            
            // Log the query and params for debugging
            console.log('Update query:', updateQuery);
            console.log('Update fields:', updateFields);
            console.log('Query params count:', queryParams.length);
            console.log('Query params:', JSON.stringify(queryParams, null, 2));
            console.log('Update data received:', JSON.stringify(updateData, null, 2));

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
    async addNote(organizationId, text, userId, action = null, aboutReferences = null) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Handle about_references - convert to JSONB if it's an array/object
            let aboutReferencesJson = null;
            if (aboutReferences) {
                if (typeof aboutReferences === 'string') {
                    try {
                        // Try to parse if it's a JSON string
                        const parsed = JSON.parse(aboutReferences);
                        aboutReferencesJson = Array.isArray(parsed) ? parsed : [parsed];
                    } catch (e) {
                        // If parsing fails, treat as plain string
                        aboutReferencesJson = aboutReferences;
                    }
                } else if (Array.isArray(aboutReferences)) {
                    aboutReferencesJson = aboutReferences;
                } else if (typeof aboutReferences === 'object') {
                    aboutReferencesJson = [aboutReferences];
                }
            }

            // Insert the note
            const noteQuery = `
                INSERT INTO organization_notes (organization_id, text, action, about_references, created_by)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;

            const noteResult = await client.query(noteQuery, [
                organizationId,
                text,
                action,
                aboutReferencesJson ? JSON.stringify(aboutReferencesJson) : null,
                userId
            ]);

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
            // Parse about_references JSONB to object/array
            return result.rows.map((row) => {
                if (row.about_references && typeof row.about_references === 'string') {
                    try {
                        row.about_references = JSON.parse(row.about_references);
                    } catch (e) {
                        // If parsing fails, keep as is
                    }
                }
                return row;
            });
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

    // Get all hiring managers belonging to an organization
    async getHiringManagers(organizationId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT hm.*, CONCAT(hm.last_name, ', ', hm.first_name) AS full_name
                FROM hiring_managers hm
                WHERE hm.organization_id = $1
                ORDER BY hm.created_at DESC
            `;
            const result = await client.query(query, [organizationId]);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    async getJobs(organizationId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT j.*
                FROM jobs j
                WHERE j.organization_id = $1
                ORDER BY j.created_at DESC
            `;
            const result = await client.query(query, [organizationId]);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    /** Get placement IDs for this organization (placements whose job belongs to this org). */
    async getPlacementIdsByOrganizationId(organizationId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT p.id
                FROM placements p
                INNER JOIN jobs j ON p.job_id = j.id
                WHERE j.organization_id = $1
            `;
            const result = await client.query(query, [organizationId]);
            return result.rows.map((row) => row.id);
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