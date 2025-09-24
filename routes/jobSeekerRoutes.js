const express = require('express');

function createJobSeekerRouter(jobSeekerController, authMiddleware) {
    const router = express.Router();
    const { verifyToken, checkRole } = authMiddleware;

    // All routes require authentication
    router.use(verifyToken);

    // Get all job seekers 
    // (admins see all, regular users see only their own)
    router.get('/', jobSeekerController.getAll);

    // Get job seeker by ID 
    // (admins can see any, regular users only their own)
    router.get('/:id', jobSeekerController.getById);

    // Create new job seeker
    router.post('/', jobSeekerController.create);

    // Update job seeker by ID 
    // (admins can update any, regular users only their own)
    router.put('/:id', jobSeekerController.update);

    // Delete job seeker by ID 
    // (admins can delete any, regular users only their own)
    router.delete('/:id', jobSeekerController.delete);

    // Routes for notes
    router.post('/:id/notes', jobSeekerController.addNote);
    router.get('/:id/notes', jobSeekerController.getNotes);

    // Route for history
    router.get('/:id/history', jobSeekerController.getHistory);

    return router;
}

module.exports = createJobSeekerRouter;