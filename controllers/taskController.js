const Task = require('../models/task');

class TaskController {
    constructor(pool) {
        this.taskModel = new Task(pool);
        this.create = this.create.bind(this);
        this.getAll = this.getAll.bind(this);
        this.getById = this.getById.bind(this);
        this.update = this.update.bind(this);
        this.delete = this.delete.bind(this);
        this.addNote = this.addNote.bind(this);
        this.getNotes = this.getNotes.bind(this);
        this.getHistory = this.getHistory.bind(this);
        this.getStats = this.getStats.bind(this);
        this.markComplete = this.markComplete.bind(this);
        this.markIncomplete = this.markIncomplete.bind(this);
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

            console.log("Attempting to create task with data:", taskData);

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

            // Only admin/owner can see all tasks, other users only see their own or assigned to them
            const tasks = await this.taskModel.getAll(
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

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

            // Only admin/owner can see any task, other users only see their own or assigned to them
            const task = await this.taskModel.getById(
                id,
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

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

            // For admin/owner roles, allow updating any task
            // For other roles, they can only update their own tasks or assigned to them
            const taskOwner = ['admin', 'owner'].includes(userRole) ? null : userId;

            // Try to update the task
            const task = await this.taskModel.update(
                id,
                updateData,
                taskOwner
            );

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

            // Only admin/owner can delete any task, others only their own
            const taskOwner = ['admin', 'owner'].includes(userRole) ? null : userId;

            // Delete the task
            const task = await this.taskModel.delete(
                id,
                taskOwner
            );

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
            const { text } = req.body;

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

            // Add the note
            const note = await this.taskModel.addNote(id, text, userId);

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

            // Get statistics
            const stats = await this.taskModel.getStats(
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

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
                ['admin', 'owner'].includes(userRole) ? null : userId
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
                ['admin', 'owner'].includes(userRole) ? null : userId
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