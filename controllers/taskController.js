const Task = require('../models/task');
const { sendMail } = require('../services/emailService');
const EmailTemplateModel = require('../models/emailTemplateModel');
const { renderTemplate } = require('../utils/templateRenderer');

class TaskController {
    constructor(pool) {
        this.taskModel = new Task(pool);
        this.emailTemplateModel = new EmailTemplateModel(pool);
        this.create = this.create.bind(this);
        this.getAll = this.getAll.bind(this);
        this.getById = this.getById.bind(this);
        this.update = this.update.bind(this);
        this.bulkUpdate = this.bulkUpdate.bind(this);
        this.delete = this.delete.bind(this);
        this.addNote = this.addNote.bind(this);
        this.getNotes = this.getNotes.bind(this);
        this.getHistory = this.getHistory.bind(this);
        this.getStats = this.getStats.bind(this);
        this.markComplete = this.markComplete.bind(this);
        this.markIncomplete = this.markIncomplete.bind(this);
        this.processReminders = this.processReminders.bind(this);
        this.diagnoseReminders = this.diagnoseReminders.bind(this);
    }

    // Initialize database tables
    async initTables() {
        try {
            await this.taskModel.initTable();
            console.log('✅ Task tables initialized successfully');
        } catch (error) {
            console.error('❌ Error initializing task tables:', error);
            throw error;
        }
    }

    // Create a new task
    async create(req, res) {
        const taskData = req.body;

        console.log("Create task request body:", req.body);

        // Basic validation
        if (!taskData.title) {
            return res.status(400).json({
                success: false,
                message: 'Task title is required'
            });
        }

        try {
            // Get the current user's ID from the auth middleware
            const userId = req.user.id;

            // Add userId to the task data
            taskData.userId = userId;

            // Ensure customFields is properly set (accept both camelCase and snake_case)
            if (!taskData.customFields && taskData.custom_fields) {
                taskData.customFields = taskData.custom_fields;
            }

            // Ensure organizationId is properly set (accept both camelCase and snake_case)
            if (!taskData.organizationId && taskData.organization_id) {
                taskData.organizationId = taskData.organization_id;
            }

            console.log("Attempting to create task with data:", JSON.stringify(taskData, null, 2));
            console.log("OrganizationId:", taskData.organizationId);
            console.log("CustomFields:", taskData.customFields);

            // Create task in database
            const task = await this.taskModel.create(taskData);

            console.log("Task created successfully:", task);

            // Send success response
            res.status(201).json({
                success: true,
                message: 'Task created successfully',
                task
            });
        } catch (error) {
            console.error('Detailed error creating task:', error);
            console.error('Error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

            // Handle specific database errors
            if (error.code === '23503') { // Foreign key constraint violation
                return res.status(400).json({
                    success: false,
                    message: 'Referenced record does not exist'
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while creating the task',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get all tasks
    async getAll(req, res) {
        try {
            console.log('Getting all tasks...');

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log(`User ID: ${userId}, User Role: ${userRole}`);

            // All users can see all tasks
            const tasks = await this.taskModel.getAll(null);

            console.log(`Found ${tasks.length} tasks`);

            res.status(200).json({
                success: true,
                count: tasks.length,
                tasks
            });
        } catch (error) {
            console.error('Error getting tasks:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving tasks',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get task by ID
    async getById(req, res) {
        try {
            const { id } = req.params;
            console.log(`Getting task by ID: ${id}`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid task ID'
                });
            }

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log(`User ID: ${userId}, User Role: ${userRole}`);

            // All users can see any task
            const task = await this.taskModel.getById(id, null);

            if (!task) {
                return res.status(404).json({
                    success: false,
                    message: 'Task not found or you do not have permission to view it'
                });
            }

            console.log(`Successfully retrieved task: ${task.id}`);

            res.status(200).json({
                success: true,
                task
            });
        } catch (error) {
            console.error('Error getting task:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving the task',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Update task by ID
    async update(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            console.log(`Update request for task ${id} received`);
            console.log("Request user:", req.user);
            console.log("Update data:", JSON.stringify(updateData, null, 2));

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid task ID'
                });
            }

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log(`User role: ${userRole}, User ID: ${userId}`);

            // All users can update any task
            const task = await this.taskModel.update(id, updateData, null);

            if (!task) {
                console.log("Update failed - task not found or no permission");
                return res.status(404).json({
                    success: false,
                    message: 'Task not found or you do not have permission to update it'
                });
            }

            console.log("Task updated successfully:", task);
            res.status(200).json({
                success: true,
                message: 'Task updated successfully',
                task
            });
        } catch (error) {
            console.error('Error updating task:', error);

            // Handle specific database errors
            if (error.code === '23503') { // Foreign key constraint violation
                return res.status(400).json({
                    success: false,
                    message: 'Referenced record does not exist'
                });
            }

            // Check for specific error types
            if (error.message && (error.message.includes('permission') || error.message.includes('not found'))) {
                return res.status(403).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while updating the task',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Bulk update tasks
    async bulkUpdate(req, res) {
        try {
            console.log('=== BULK UPDATE REQUEST START ===');
            console.log('Request body:', JSON.stringify(req.body, null, 2));
            console.log('User ID:', req.user?.id);
            
            const { ids, updates } = req.body;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'IDs array is required and must not be empty'
                });
            }

            if (!updates || typeof updates !== 'object') {
                return res.status(400).json({
                    success: false,
                    message: 'Updates object is required'
                });
            }

            const userId = req.user.id;
            const userRole = req.user.role;
            console.log('Processing bulk update for user:', userId, 'role:', userRole);

            const results = {
                successful: [],
                failed: [],
                errors: []
            };

            for (const id of ids) {
                try {
                    const updateData = JSON.parse(JSON.stringify(updates));
                    const task = await this.taskModel.update(id, updateData, null);
                    
                    if (task) {
                        results.successful.push(id);
                    } else {
                        results.failed.push(id);
                        results.errors.push({ id, error: 'Task not found or permission denied' });
                    }
                } catch (error) {
                    results.failed.push(id);
                    results.errors.push({ id, error: error.message || 'Unknown error' });
                }
            }

            res.status(200).json({
                success: true,
                message: `Updated ${results.successful.length} of ${ids.length} tasks`,
                results
            });
        } catch (error) {
            console.error('=== BULK UPDATE FATAL ERROR ===', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while bulk updating tasks',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Process task reminders: send email to owner (created_by) and assigned_to at designated time
    async processReminders(req, res) {
        try {
            console.log(`[processReminders] Starting reminder check at ${new Date().toISOString()}`);
            const tasks = await this.taskModel.getTasksDueForReminder();
            console.log(`[processReminders] Found ${tasks.length} task(s) due for reminder`);
            
            if (tasks.length > 0) {
                console.log(`[processReminders] Task details:`, tasks.map(t => ({
                    id: t.id,
                    title: t.title,
                    due_date: t.due_date,
                    due_time: t.due_time,
                    reminder_minutes_before_due: t.reminder_minutes_before_due,
                    custom_fields_reminder: t.custom_fields?.Reminder || t.custom_fields?.['Reminder']
                })));
            }
            
            const results = { sent: 0, errors: [] };
            
            // Get email template for task reminders
            const template = await this.emailTemplateModel.getTemplateByType('TASK_REMINDER');
            console.log(`[processReminders] Email template ${template ? 'found' : 'not found, using default'}`);
            
            for (const task of tasks) {
                console.log(`[processReminders] Processing task ${task.id}: "${task.title}"`);
                
                // Prevent duplicate processing: double-check reminder_sent_at before sending
                // This provides an additional safety check beyond the query filter
                const taskCheck = await this.taskModel.getById(task.id, null);
                if (taskCheck && taskCheck.reminder_sent_at) {
                    console.log(`[processReminders] Task ${task.id} already has reminder_sent_at (${taskCheck.reminder_sent_at}), skipping`);
                    continue;
                }
                
                console.log(`[processReminders] Task ${task.id} passed duplicate check, proceeding with email`);
                
                const emails = [];
                if (task.created_by_email) emails.push(task.created_by_email);
                if (task.assigned_to_email && task.assigned_to_email !== task.created_by_email) emails.push(task.assigned_to_email);
                if (emails.length === 0) {
                    results.errors.push({ taskId: task.id, error: 'No email for owner or assigned to' });
                    await this.taskModel.markReminderSent(task.id);
                    continue;
                }
                
                // Format due date/time
                const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString() : 'Not set';
                const dueTime = task.due_time || '';
                const dueStr = task.due_date && task.due_time
                    ? `${dueDate} ${dueTime}`
                    : task.due_date ? dueDate : 'Not set';
                
                // Build task link
                const baseUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                const taskLink = `${baseUrl}/dashboard/tasks/view?id=${task.id}`;
                const taskLinkHtml = `<a href="${taskLink}" style="display:inline-block;background-color:#4CAF50;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">View Task</a>`;
                
                // Prepare template variables
                const vars = {
                    taskTitle: task.title || 'Task',
                    taskDescription: task.description || '',
                    dueDate: dueDate,
                    dueTime: dueTime,
                    dueDateAndTime: dueStr,
                    assignedTo: task.assigned_to_name || 'Not assigned',
                    createdBy: task.created_by_name || 'Unknown',
                    organizationName: task.organization_name || '',
                    hiringManagerName: task.hiring_manager_name || '',
                    taskLink: taskLink,
                };
                
                const bodyVars = {
                    ...vars,
                    taskLink: taskLinkHtml, // HTML version for email body
                };
                
                const safeKeys = ['taskLink'];
                
                try {
                    let subject, html, text;
                    
                    if (template) {
                        // Use custom template
                        subject = renderTemplate(template.subject, vars, safeKeys);
                        html = renderTemplate(template.body, bodyVars, safeKeys);
                        html = html.replace(/\r\n/g, "\n").replace(/\n/g, "<br/>");
                        text = renderTemplate(template.body, vars, safeKeys);
                    } else {
                        // Fallback to default template
                        subject = `Task reminder: ${task.title || 'Task'}`;
                        html = `<p>This is a reminder for the following task:</p><p><strong>${task.title || 'Task'}</strong></p><p>Due: ${dueStr}</p><p>You are receiving this as the task owner or assignee.</p><p>${taskLinkHtml}</p>`;
                        text = `Task reminder: ${task.title || 'Task'}. Due: ${dueStr}. View task: ${taskLink}`;
                    }
                    
                    console.log(`[processReminders] Sending email to: ${emails.join(', ')}`);
                    await sendMail({
                        to: emails,
                        subject,
                        html,
                        text,
                    });
                    
                    // Mark reminder as sent AFTER successful email send
                    await this.taskModel.markReminderSent(task.id);
                    console.log(`[processReminders] Successfully sent reminder for task ${task.id} and marked as sent`);
                    results.sent++;
                } catch (err) {
                    console.error(`[processReminders] Error sending reminder for task ${task.id}:`, err);
                    results.errors.push({ taskId: task.id, error: err.message });
                }
            }
            
            const response = {
                success: true,
                message: `Processed ${tasks.length} task(s), sent ${results.sent} reminder(s)`,
                ...results,
            };
            
            console.log(`[processReminders] Completed: ${response.message}`);
            if (results.errors.length > 0) {
                console.log(`[processReminders] Errors:`, results.errors);
            }
            
            if (res && res.status) {
                res.status(200).json(response);
            } else {
                // Called from cron, just log
                console.log(`[processReminders] ${response.message}`);
            }
            
            return response;
        } catch (error) {
            console.error('Error processing task reminders:', error);
            const errorResponse = {
                success: false,
                message: 'Failed to process reminders',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message,
            };
            if (res && res.status) {
                res.status(500).json(errorResponse);
            }
            throw error;
        }
    }

    // Diagnostic endpoint to check why tasks aren't matching reminder criteria
    async diagnoseReminders(req, res) {
        try {
            const { dueDate, searchDate } = req.query; // Optional: filter by due date (e.g., "2026-02-10")
            console.log(`[diagnoseReminders] Checking reminder diagnostics${dueDate ? ` for date: ${dueDate}` : ''}`);
            
            let diagnostics = await this.taskModel.diagnoseReminderIssues(dueDate);
            
            // If searchDate is provided, also search for tasks with that exact date/time
            let searchResults = [];
            if (searchDate) {
                console.log(`[diagnoseReminders] Searching for tasks with date/time: ${searchDate}`);
                searchResults = await this.taskModel.findTasksByDueDateTime(searchDate);
                console.log(`[diagnoseReminders] Found ${searchResults.length} task(s) matching search date`);
            }
            
            console.log(`[diagnoseReminders] Found ${diagnostics.length} task(s) to analyze`);
            
            return res.status(200).json({
                success: true,
                message: `Analyzed ${diagnostics.length} task(s)`,
                current_time: new Date().toISOString(),
                diagnostics: diagnostics,
                search_results: searchResults.length > 0 ? searchResults : undefined
            });
        } catch (error) {
            console.error('Error diagnosing reminders:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to diagnose reminders',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Delete task by ID
    async delete(req, res) {
        try {
            const { id } = req.params;
            console.log(`Delete request for task ${id} received`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid task ID'
                });
            }

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log(`User role: ${userRole}, User ID: ${userId}`);

            // All users can delete any task
            const task = await this.taskModel.delete(id, null);

            if (!task) {
                console.log("Delete failed - task not found or no permission");
                return res.status(404).json({
                    success: false,
                    message: 'Task not found or you do not have permission to delete it'
                });
            }

            console.log("Task deleted successfully:", task.id);
            res.status(200).json({
                success: true,
                message: 'Task deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting task:', error);

            // Check for specific error types
            if (error.message && (error.message.includes('permission') || error.message.includes('not found'))) {
                return res.status(403).json({
                    success: false,
                    message: error.message
                });
            }

            // Handle foreign key constraint errors
            if (error.code === '23503') {
                return res.status(409).json({
                    success: false,
                    message: 'Cannot delete task as it is referenced by other records'
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while deleting the task',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Add a note to a task
    async addNote(req, res) {
        try {
            const { id } = req.params;
            const { text, action, about_references, aboutReferences } = req.body;

            console.log(`Adding note to task ${id}`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid task ID'
                });
            }

            if (!text || !text.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Note text is required'
                });
            }

            // Get the current user's ID
            const userId = req.user.id;

            // Use about_references or aboutReferences (handle both naming conventions)
            const finalAboutReferences = about_references || aboutReferences;

            // Add the note
            const note = await this.taskModel.addNote(id, text, userId, action, finalAboutReferences);

            console.log("Note added successfully:", note);

            return res.status(201).json({
                success: true,
                message: 'Note added successfully',
                note
            });
        } catch (error) {
            console.error('Error adding note:', error);

            // Handle case where task doesn't exist
            if (error.code === '23503') {
                return res.status(404).json({
                    success: false,
                    message: 'Task not found'
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while adding the note',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get notes for a task
    async getNotes(req, res) {
        try {
            const { id } = req.params;

            console.log(`Getting notes for task ${id}`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid task ID'
                });
            }

            // Get all notes for this task
            const notes = await this.taskModel.getNotes(id);

            console.log(`Found ${notes.length} notes for task ${id}`);

            return res.status(200).json({
                success: true,
                count: notes.length,
                notes
            });
        } catch (error) {
            console.error('Error getting notes:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while getting notes',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get history for a task
    async getHistory(req, res) {
        try {
            const { id } = req.params;

            console.log(`Getting history for task ${id}`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid task ID'
                });
            }

            // Get all history entries for this task
            const history = await this.taskModel.getHistory(id);

            console.log(`Found ${history.length} history entries for task ${id}`);

            return res.status(200).json({
                success: true,
                count: history.length,
                history
            });
        } catch (error) {
            console.error('Error getting history:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while getting history',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get task statistics
    async getStats(req, res) {
        try {
            console.log('Getting task statistics...');

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            // All users see all task statistics
            const stats = await this.taskModel.getStats(null);

            console.log('Successfully retrieved task statistics');

            res.status(200).json({
                success: true,
                stats
            });
        } catch (error) {
            console.error('Error getting task statistics:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving statistics',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Mark task as complete
    async markComplete(req, res) {
        try {
            const { id } = req.params;
            console.log(`Marking task ${id} as complete`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid task ID'
                });
            }

            const userId = req.user.id;
            const userRole = req.user.role;

            // Update task as completed
            const task = await this.taskModel.update(
                id,
                { isCompleted: true, status: 'Completed' },
                null
            );

            if (!task) {
                return res.status(404).json({
                    success: false,
                    message: 'Task not found or you do not have permission to update it'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Task marked as complete',
                task
            });
        } catch (error) {
            console.error('Error marking task as complete:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while updating the task',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Mark task as incomplete
    async markIncomplete(req, res) {
        try {
            const { id } = req.params;
            console.log(`Marking task ${id} as incomplete`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid task ID'
                });
            }

            const userId = req.user.id;
            const userRole = req.user.role;

            // Update task as incomplete
            const task = await this.taskModel.update(
                id,
                { isCompleted: false, status: 'Pending' },
                null
            );

            if (!task) {
                return res.status(404).json({
                    success: false,
                    message: 'Task not found or you do not have permission to update it'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Task marked as incomplete',
                task
            });
        } catch (error) {
            console.error('Error marking task as incomplete:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while updating the task',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }
}

module.exports = TaskController;