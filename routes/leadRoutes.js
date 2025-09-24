const express = require('express');

function createLeadRouter(leadController, authMiddleware) {
    const router = express.Router();
    const { verifyToken, checkRole } = authMiddleware;

    // All routes require authentication
    router.use(verifyToken);

    // Get all leads 
    // (admins see all, regular users see only their own)
    router.get('/', leadController.getAll);

    // Get lead by ID 
    // (admins can see any, regular users only their own)
    router.get('/:id', leadController.getById);

    // Create new lead
    router.post('/', leadController.create);

    // Update lead by ID 
    // (admins can update any, regular users only their own)
    router.put('/:id', leadController.update);

    // Delete lead by ID 
    // (admins can delete any, regular users only their own)
    router.delete('/:id', leadController.delete);

    // Routes for notes
    router.post('/:id/notes', leadController.addNote);
    router.get('/:id/notes', leadController.getNotes);

    // Route for history
    router.get('/:id/history', leadController.getHistory);

    // Additional lead-specific routes
    router.get('/organization/:organizationId', leadController.getByOrganization);
    router.get('/search/query', leadController.search);
    router.get('/stats/overview', leadController.getStats);

    return router;
}

module.exports = createLeadRouter;