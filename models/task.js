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
            jobSeekerId,
            hiringManagerId,
            jobId,
            leadId,
            placementId,
            owner,
            priority,
            status,
            assignedTo,
            userId,
            customFields = {}
        } = taskData;

        console.log("Task model - create function input:", JSON.stringify(taskData, null, 2));

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Handle custom fields
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

            const insertTaskQuery = `
                INSERT INTO tasks (
                    title,
                    description,
                    is_completed,
                    due_date,
                    due_time,
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
                    custom_fields
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                RETURNING *
            `;

            const values = [
                title,
                description,
                isCompleted || false,
                dueDate || null,
                dueTime || null,
                jobSeekerId ? parseInt(jobSeekerId) : null,
                hiringManagerId ? parseInt(hiringManagerId) : null,
                jobId ? parseInt(jobId) : null,
                leadId ? parseInt(leadId) : null,
                placementId ? parseInt(placementId) : null,
                owner,
                priority || 'Medium',
                status || 'Pending',
                assignedTo && assignedTo !== '' ? parseInt(assignedTo) : null,
                userId,
                customFieldsJson
            ];

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
                       uc.name as completed_by_name
                FROM tasks t
                LEFT JOIN users u ON t.created_by = u.id
                LEFT JOIN users u2 ON t.assigned_to = u2.id
                LEFT JOIN users uc ON t.completed_by = uc.id
                LEFT JOIN job_seekers js ON t.job_seeker_id = js.id
                LEFT JOIN hiring_managers hm ON t.hiring_manager_id = hm.id
                LEFT JOIN jobs j ON t.job_id = j.id
                LEFT JOIN leads l ON t.lead_id = l.id
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
                jobSeekerId: 'job_seeker_id',
                hiringManagerId: 'hiring_manager_id',
                jobId: 'job_id',
                leadId: 'lead_id',
                placementId: 'placement_id',
                owner: 'owner',
                priority: 'priority',
                status: 'status',
                assignedTo: 'assigned_to',
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

            // Handle custom fields merging
            if (updateData.customFields) {
                let newCustomFields = {};
                try {
                    const existingCustomFields = typeof task.custom_fields === 'string'
                        ? JSON.parse(task.custom_fields || '{}')
                        : (task.custom_fields || {});

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

            // Process other fields
            for (const [key, value] of Object.entries(updateData)) {
                if (key !== 'customFields' && fieldMapping[key] && value !== undefined) {
                    updateFields.push(`${fieldMapping[key]} = $${paramCount}`);

                    // Handle numeric conversions
                    if (['jobSeekerId', 'hiringManagerId', 'jobId', 'leadId', 'placementId', 'assignedTo'].includes(key)) {
                        queryParams.push(value ? parseInt(value) : null);
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