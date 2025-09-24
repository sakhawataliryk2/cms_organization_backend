// routes/jobRoutes.js
const express = require('express');

function createJobRouter(jobController, authMiddleware) {
    const router = express.Router();
    const { verifyToken, checkRole } = authMiddleware;

    // All routes require authentication
    router.use(verifyToken);

    // Get all jobs 
    // (admins see all, regular users see only their own)
    router.get('/', jobController.getAll);

    // Get job by ID 
    // (admins can see any, regular users only their own)
    router.get('/:id', jobController.getById);

    // Create new job
    router.post('/', jobController.create);

    // Update job by ID 
    // (admins can update any, regular users only their own)
    router.put('/:id', jobController.update);

    // Delete job by ID 
    // (admins can delete any, regular users only their own)
    router.delete('/:id', jobController.delete);

    // Routes for notes
    router.post('/:id/notes', jobController.addNote);
    router.get('/:id/notes', jobController.getNotes);

    // Route for history
    router.get('/:id/history', jobController.getHistory);

    return router;
}

module.exports = createJobRouter;