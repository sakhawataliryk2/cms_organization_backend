const bcrypt = require('bcrypt');

class Task {
    constructor(pool) {
        this.pool = pool;
    }

    // Initialize the tasks table if it doesn't exist
    async initTable() {
        let client;
        try {
            console.log('Initializing tasks table if needed...');
            client = await this.pool.connect();

            await client.query(`
                CREATE TABLE IF NOT EXISTS tasks (
                    id SERIAL PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    is_completed BOOLEAN DEFAULT false,
                    due_date DATE,
                    due_time TIME,
                    organization_id INTEGER REFERENCES organizations(id),
                    job_seeker_id INTEGER REFERENCES job_seekers(id),
                    hiring_manager_id INTEGER REFERENCES hiring_managers(id),
                    job_id INTEGER REFERENCES jobs(id),
                    lead_id INTEGER REFERENCES leads(id),
                    placement_id INTEGER,
                    owner VARCHAR(255),
                    priority VARCHAR(20) DEFAULT 'Medium',
                    status VARCHAR(50) DEFAULT 'Pending',
                    created_by INTEGER REFERENCES users(id),
                    assigned_to INTEGER REFERENCES users(id),
                    completed_at TIMESTAMP,
                    completed_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    custom_fields JSONB
                )
            `);

            // Add organization_id column if it doesn't exist (for existing tables)
            await client.query(`
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='tasks' AND column_name='organization_id'
                    ) THEN
                        ALTER TABLE tasks ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
                        CREATE INDEX IF NOT EXISTS idx_tasks_organization_id ON tasks(organization_id);
                    END IF;
                END $$;
            `);

            // Reminder: minutes before due to send email to owner and assigned_to
            await client.query(`
                DO $$ 
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='reminder_minutes_before_due') THEN
                        ALTER TABLE tasks ADD COLUMN reminder_minutes_before_due INTEGER;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='reminder_sent_at') THEN
                        ALTER TABLE tasks ADD COLUMN reminder_sent_at TIMESTAMP;
                    END IF;
                END $$;
            `);

            // Create task notes table
            await client.query(`
                CREATE TABLE IF NOT EXISTS task_notes (
                    id SERIAL PRIMARY KEY,
                    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                    text TEXT NOT NULL,
                    created_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create task history table
            await client.query(`
                CREATE TABLE IF NOT EXISTS task_history (
                    id SERIAL PRIMARY KEY,
                    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                    action VARCHAR(50) NOT NULL,
                    details JSONB,
                    performed_by INTEGER REFERENCES users(id),
                    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('✅ Tasks tables initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Error initializing tasks tables:', error.message);
            throw error;
        } finally {
            if (client) {
                client.release();
            }
        }
    }

    // Create a new task
    async create(taskData) {
        const {
            title,
            description,
            isCompleted,
            dueDate,
            dueTime,
            organizationId,
            organization_id, // Support both formats
            jobSeekerId,
            job_seeker_id, // Support both formats
            hiringManagerId,
            hiring_manager_id, // Support both formats
            jobId,
            job_id, // Support both formats
            leadId,
            lead_id, // Support both formats
            placementId,
            placement_id, // Support both formats
            owner,
            priority,
            status,
            assignedTo,
            assigned_to, // Support both formats
            reminderMinutesBeforeDue,
            reminder_minutes_before_due,
            userId,
            customFields,
            custom_fields // Support both formats
        } = taskData;
        const finalReminderMinutes = reminderMinutesBeforeDue ?? reminder_minutes_before_due;

        // Use organizationId or organization_id (prefer organizationId)
        const finalOrganizationId = organizationId || organization_id;
        const finalJobSeekerId = jobSeekerId || job_seeker_id;
        const finalHiringManagerId = hiringManagerId || hiring_manager_id;
        const finalJobId = jobId || job_id;
        const finalLeadId = leadId || lead_id;
        const finalPlacementId = placementId || placement_id;
        const finalAssignedTo = assignedTo || assigned_to;
        const finalCustomFields = customFields || custom_fields || {};

        console.log("Task model - create function input:", JSON.stringify(taskData, null, 2));
        console.log("Mapped organizationId:", finalOrganizationId);
        console.log("Mapped customFields:", finalCustomFields);

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Handle custom fields - accept both customFields and custom_fields
            let customFieldsJson = '{}';
            if (finalCustomFields) {
                if (typeof finalCustomFields === 'string') {
                    try {
                        // Validate it's valid JSON
                        JSON.parse(finalCustomFields);
                        customFieldsJson = finalCustomFields;
                    } catch (e) {
                        console.log("Invalid JSON string in customFields, using empty object");
                        customFieldsJson = '{}';
                    }
                } else if (typeof finalCustomFields === 'object') {
                    // Convert object to JSON string for JSONB storage
                    customFieldsJson = JSON.stringify(finalCustomFields);
                }
            }
            
            console.log("Custom fields JSON to insert:", customFieldsJson);

            const insertTaskQuery = `
                INSERT INTO tasks (
                    title,
                    description,
                    is_completed,
                    due_date,
                    due_time,
                    organization_id,
                    job_seeker_id,
                    hiring_manager_id,
                    job_id,
                    lead_id,
                    placement_id,
                    owner,
                    priority,
                    status,
                    assigned_to,
                    created_by,
                    custom_fields,
                    reminder_minutes_before_due
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                RETURNING *
            `;

            const values = [
                title,
                description,
                isCompleted || false,
                dueDate || null,
                dueTime || null,
                finalOrganizationId ? parseInt(finalOrganizationId) : null,
                finalJobSeekerId ? parseInt(finalJobSeekerId) : null,
                finalHiringManagerId ? parseInt(finalHiringManagerId) : null,
                finalJobId ? parseInt(finalJobId) : null,
                finalLeadId ? parseInt(finalLeadId) : null,
                finalPlacementId ? parseInt(finalPlacementId) : null,
                owner,
                priority || 'Medium',
                status || 'Pending',
                finalAssignedTo && finalAssignedTo !== '' ? parseInt(finalAssignedTo) : null,
                userId,
                customFieldsJson,
                finalReminderMinutes != null ? parseInt(finalReminderMinutes) : null
            ];
            
            console.log("Insert values:", values);

            console.log("SQL Query:", insertTaskQuery);
            console.log("Query values:", values);

            const result = await client.query(insertTaskQuery, values);

            // Add history entry
            const historyQuery = `
                INSERT INTO task_history (
                    task_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                result.rows[0].id,
                'CREATE',
                JSON.stringify(taskData),
                userId
            ];

            await client.query(historyQuery, historyValues);

            await client.query('COMMIT');

            console.log("Created task:", result.rows[0]);
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Error in create task:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get all tasks (with optional filtering by created_by user)
    async getAll(userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT t.*, 
                       u.name as created_by_name,
                       u2.name as assigned_to_name,
                       js.first_name || ' ' || js.last_name as job_seeker_name,
                       hm.first_name || ' ' || hm.last_name as hiring_manager_name,
                       j.job_title as job_title,
                       l.first_name || ' ' || l.last_name as lead_name,
                       uc.name as completed_by_name
                FROM tasks t
                LEFT JOIN users u ON t.created_by = u.id
                LEFT JOIN users u2 ON t.assigned_to = u2.id
                LEFT JOIN users uc ON t.completed_by = uc.id
                LEFT JOIN job_seekers js ON t.job_seeker_id = js.id
                LEFT JOIN hiring_managers hm ON t.hiring_manager_id = hm.id
                LEFT JOIN jobs j ON t.job_id = j.id
                LEFT JOIN leads l ON t.lead_id = l.id
            `;

            const values = [];

            if (userId) {
                query += ` WHERE (t.created_by = $1 OR t.assigned_to = $1)`;
                values.push(userId);
            }

            query += ` ORDER BY t.due_date ASC, t.created_at DESC`;

            const result = await client.query(query, values);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get task by ID
    async getById(id, userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT t.*, 
                       u.name as created_by_name,
                       u2.name as assigned_to_name,
                       js.first_name || ' ' || js.last_name as job_seeker_name,
                       hm.first_name || ' ' || hm.last_name as hiring_manager_name,
                       j.job_title as job_title,
                       l.first_name || ' ' || l.last_name as lead_name,
                       o.name as organization_name,
                       uc.name as completed_by_name
                FROM tasks t
                LEFT JOIN users u ON t.created_by = u.id
                LEFT JOIN users u2 ON t.assigned_to = u2.id
                LEFT JOIN users uc ON t.completed_by = uc.id
                LEFT JOIN job_seekers js ON t.job_seeker_id = js.id
                LEFT JOIN hiring_managers hm ON t.hiring_manager_id = hm.id
                LEFT JOIN jobs j ON t.job_id = j.id
                LEFT JOIN leads l ON t.lead_id = l.id
                LEFT JOIN organizations o ON t.organization_id = o.id
                WHERE t.id = $1
            `;

            const values = [id];

            if (userId) {
                query += ` AND (t.created_by = $2 OR t.assigned_to = $2)`;
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

    // Update task
    async update(id, updateData, userId = null) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Get the current task
            const getTaskQuery = 'SELECT * FROM tasks WHERE id = $1';
            const taskResult = await client.query(getTaskQuery, [id]);

            if (taskResult.rows.length === 0) {
                throw new Error('Task not found');
            }

            const task = taskResult.rows[0];

            // Check permissions
            if (userId !== null && task.created_by !== userId && task.assigned_to !== userId) {
                throw new Error('You do not have permission to update this task');
            }

            const oldState = { ...task };

            // Build update query
            const updateFields = [];
            const queryParams = [];
            let paramCount = 1;

            const fieldMapping = {
                title: 'title',
                description: 'description',
                isCompleted: 'is_completed',
                dueDate: 'due_date',
                dueTime: 'due_time',
                organizationId: 'organization_id',
                jobSeekerId: 'job_seeker_id',
                hiringManagerId: 'hiring_manager_id',
                jobId: 'job_id',
                leadId: 'lead_id',
                placementId: 'placement_id',
                owner: 'owner',
                priority: 'priority',
                status: 'status',
                assignedTo: 'assigned_to',
                reminderMinutesBeforeDue: 'reminder_minutes_before_due',
                customFields: 'custom_fields'
            };

            // Handle completion logic
            if (updateData.isCompleted !== undefined) {
                if (updateData.isCompleted && !task.is_completed) {
                    // Task being completed
                    updateFields.push(`completed_at = NOW()`);
                    updateFields.push(`completed_by = $${paramCount}`);
                    queryParams.push(userId || task.created_by);
                    paramCount++;
                } else if (!updateData.isCompleted && task.is_completed) {
                    // Task being uncompleted
                    updateFields.push(`completed_at = NULL`);
                    updateFields.push(`completed_by = NULL`);
                }
            }

            // Handle custom fields merging - accept both customFields and custom_fields
            const updateCustomFieldsData = updateData.customFields || updateData.custom_fields;
            if (updateCustomFieldsData) {
                let newCustomFields = {};
                try {
                    const existingCustomFields = typeof task.custom_fields === 'string'
                        ? JSON.parse(task.custom_fields || '{}')
                        : (task.custom_fields || {});

                    const updateCustomFields = typeof updateCustomFieldsData === 'string'
                        ? JSON.parse(updateCustomFieldsData)
                        : updateCustomFieldsData;

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

            // Process other fields
            for (const [key, value] of Object.entries(updateData)) {
                if (key !== 'customFields' && key !== 'custom_fields' && fieldMapping[key] && value !== undefined) {
                    updateFields.push(`${fieldMapping[key]} = $${paramCount}`);

                    // Handle numeric conversions
                    if (['organizationId', 'jobSeekerId', 'hiringManagerId', 'jobId', 'leadId', 'placementId', 'assignedTo'].includes(key)) {
                        queryParams.push(value ? parseInt(value) : null);
                    } else if (key === 'reminderMinutesBeforeDue') {
                        queryParams.push(value != null && value !== '' ? parseInt(value) : null);
                    } else if (key === 'isCompleted') {
                        queryParams.push(Boolean(value));
                    } else {
                        queryParams.push(value);
                    }
                    paramCount++;
                }
            }

            updateFields.push(`updated_at = NOW()`);

            if (updateFields.length === 1) {
                await client.query('ROLLBACK');
                return task;
            }

            const updateQuery = `
                UPDATE tasks 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            queryParams.push(id);

            const result = await client.query(updateQuery, queryParams);
            const updatedTask = result.rows[0];

            // Add history entry
            const historyQuery = `
                INSERT INTO task_history (
                    task_id,
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
                    after: updatedTask
                }),
                userId || task.created_by
            ];

            await client.query(historyQuery, historyValues);

            await client.query('COMMIT');

            console.log("Task updated successfully:", updatedTask);
            return updatedTask;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Error updating task:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Delete task
    async delete(id, userId = null) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const getTaskQuery = 'SELECT * FROM tasks WHERE id = $1';
            const taskResult = await client.query(getTaskQuery, [id]);

            if (taskResult.rows.length === 0) {
                throw new Error('Task not found');
            }

            const task = taskResult.rows[0];

            if (userId !== null && task.created_by !== userId) {
                throw new Error('You do not have permission to delete this task');
            }

            // Add history entry before deletion
            const historyQuery = `
                INSERT INTO task_history (
                    task_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                id,
                'DELETE',
                JSON.stringify(task),
                userId || task.created_by
            ];

            await client.query(historyQuery, historyValues);

            // Delete the task
            const deleteQuery = 'DELETE FROM tasks WHERE id = $1 RETURNING *';
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

    // Get tasks that are due for reminder (within their reminder window, not yet sent)
    // Supports both reminder_minutes_before_due column and custom_fields->>'Reminder'
    async getTasksDueForReminder() {
        const client = await this.pool.connect();
        try {
            // Simplified query: fetch all tasks with reminders set, then filter in JavaScript
            // This is more reliable than complex SQL regex parsing
            const query = `
                SELECT t.id, t.title, t.description, t.due_date, t.due_time, t.owner, 
                       t.reminder_minutes_before_due,
                       t.custom_fields,
                       t.created_by, t.assigned_to,
                       t.organization_id, t.job_seeker_id, t.hiring_manager_id, t.job_id, t.lead_id,
                       u.email as created_by_email, u.name as created_by_name,
                       u2.email as assigned_to_email, u2.name as assigned_to_name,
                       o.name as organization_name,
                       hm.name as hiring_manager_name
                FROM tasks t
                LEFT JOIN users u ON t.created_by = u.id
                LEFT JOIN users u2 ON t.assigned_to = u2.id
                LEFT JOIN organizations o ON t.organization_id = o.id
                LEFT JOIN hiring_managers hm ON t.hiring_manager_id = hm.id
                WHERE t.reminder_sent_at IS NULL
                  AND (t.is_completed IS NULL OR t.is_completed = false)
                  AND t.due_date IS NOT NULL
                  AND (
                    -- Has reminder_minutes_before_due set (legacy)
                    t.reminder_minutes_before_due IS NOT NULL
                    OR
                    -- Has Reminder custom field set (new)
                    (t.custom_fields->>'Reminder' IS NOT NULL 
                     AND t.custom_fields->>'Reminder' != ''
                     AND t.custom_fields->>'Reminder' != 'None')
                  )
            `;
            const result = await client.query(query);
            
            // Helper function to parse reminder string to minutes
            const parseReminderToMinutes = (reminderValue) => {
                if (!reminderValue) return null;
                if (typeof reminderValue === 'number') return reminderValue;
                const str = String(reminderValue).toLowerCase().trim();
                if (str === '' || str === 'none' || str === 'null') return null;
                
                // Match patterns like "5 minutes", "1 hour", "1 day", "5", etc.
                const match = str.match(/(\d+)\s*(minute|minutes|min|hour|hours|hr|day|days|d|h|m)?/i);
                if (!match) return null;
                
                const num = parseInt(match[1], 10);
                const unit = match[2]?.toLowerCase() || 'minute';
                
                if (unit.startsWith('d') || unit === 'day') return num * 1440; // days to minutes
                if (unit.startsWith('h') || unit === 'hour' || unit === 'hr') return num * 60; // hours to minutes
                return num; // minutes
            };
            
            // Filter tasks where reminder time has passed
            const now = new Date();
            const processedRows = result.rows.filter(row => {
                let reminderMinutes = row.reminder_minutes_before_due;
                
                // Parse custom_fields Reminder if reminder_minutes_before_due is not set
                if (!reminderMinutes && row.custom_fields) {
                    const reminderValue = row.custom_fields.Reminder || row.custom_fields['Reminder'];
                    reminderMinutes = parseReminderToMinutes(reminderValue);
                }
                
                if (!reminderMinutes || reminderMinutes <= 0) return false;
                
                // Calculate reminder time
                if (!row.due_date) return false;
                
                const dueDate = new Date(row.due_date);
                if (row.due_time) {
                    const [hours, minutes, seconds] = row.due_time.split(':');
                    dueDate.setHours(parseInt(hours || 0, 10), parseInt(minutes || 0, 10), parseInt(seconds || 0, 10));
                }
                
                const reminderTime = new Date(dueDate.getTime() - (reminderMinutes * 60 * 1000));
                
                // Check if reminder time has passed
                const shouldRemind = reminderTime <= now;
                
                if (shouldRemind) {
                    // Set reminder_minutes_before_due for consistency
                    row.reminder_minutes_before_due = reminderMinutes;
                }
                
                return shouldRemind;
            });
            
            return processedRows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    async markReminderSent(taskId) {
        const client = await this.pool.connect();
        try {
            await client.query(
                'UPDATE tasks SET reminder_sent_at = NOW() WHERE id = $1',
                [taskId]
            );
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Add a note to a task
    async addNote(taskId, text, userId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const noteQuery = `
                INSERT INTO task_notes (task_id, text, created_by)
                VALUES ($1, $2, $3)
                RETURNING id, text, created_at
            `;

            const noteResult = await client.query(noteQuery, [taskId, text, userId]);

            // Add history entry
            const historyQuery = `
                INSERT INTO task_history (
                    task_id,
                    action,
                    details,
                    performed_by
                )
                VALUES ($1, $2, $3, $4)
            `;

            const historyValues = [
                taskId,
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

    // Get notes for a task
    async getNotes(taskId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT n.*, u.name as created_by_name
                FROM task_notes n
                LEFT JOIN users u ON n.created_by = u.id
                WHERE n.task_id = $1
                ORDER BY n.created_at DESC
            `;

            const result = await client.query(query, [taskId]);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get history for a task
    async getHistory(taskId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT h.*, u.name as performed_by_name
                FROM task_history h
                LEFT JOIN users u ON h.performed_by = u.id
                WHERE h.task_id = $1
                ORDER BY h.performed_at DESC
            `;

            const result = await client.query(query, [taskId]);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get task statistics
    async getStats(userId = null) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT 
                    COUNT(*) as total_tasks,
                    COUNT(CASE WHEN is_completed = true THEN 1 END) as completed_tasks,
                    COUNT(CASE WHEN is_completed = false THEN 1 END) as pending_tasks,
                    COUNT(CASE WHEN due_date < CURRENT_DATE AND is_completed = false THEN 1 END) as overdue_tasks,
                    COUNT(CASE WHEN due_date = CURRENT_DATE AND is_completed = false THEN 1 END) as due_today
                FROM tasks
            `;

            const values = [];

            if (userId) {
                query += ` WHERE (created_by = $1 OR assigned_to = $1)`;
                values.push(userId);
            }

            const result = await client.query(query, values);
            return result.rows[0];
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = Task;