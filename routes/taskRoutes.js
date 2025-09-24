const express = require('express');

function createTaskRouter(taskController, authMiddleware) {
    const router = express.Router();
    const { verifyToken, checkRole } = authMiddleware;

    // All routes require authentication
    router.use(verifyToken);

    // Get all tasks 
    // (admins see all, regular users see only their own or assigned to them)
    router.get('/', taskController.getAll);

    // Get task by ID 
    // (admins can see any, regular users only their own or assigned to them)
    router.get('/:id', taskController.getById);

    // Create new task
    router.post('/', taskController.create);

    // Update task by ID 
    // (admins can update any, regular users only their own or assigned to them)
    router.put('/:id', taskController.update);

    // Delete task by ID 
    // (admins can delete any, regular users only their own)
    router.delete('/:id', taskController.delete);

    // Routes for notes
    router.post('/:id/notes', taskController.addNote);
    router.get('/:id/notes', taskController.getNotes);

    // Route for history
    router.get('/:id/history', taskController.getHistory);

    // Task-specific routes
    router.get('/stats/overview', taskController.getStats);
    router.put('/:id/complete', taskController.markComplete);
    router.put('/:id/incomplete', taskController.markIncomplete);

    return router;
}

module.exports = createTaskRouter;