const express = require('express');

function createHiringManagerRouter(hiringManagerController, authMiddleware) {
    const router = express.Router();
    const { verifyToken, checkRole } = authMiddleware;

    // All routes require authentication
    router.use(verifyToken);

    // Get all hiring managers 
    // (admins see all, regular users see only their own)
    router.get('/', hiringManagerController.getAll);

    // Get hiring managers by organization ID
    // Must be before /:id route to avoid matching "organization" as an ID
    router.get('/organization/:organizationId', hiringManagerController.getByOrganization);

    // Get hiring manager by ID 
    // (admins can see any, regular users only their own)
    router.get('/:id', hiringManagerController.getById);

    // Create new hiring manager
    router.post('/', hiringManagerController.create);

    // Update hiring manager by ID 
    // (admins can update any, regular users only their own)
    router.put('/:id', hiringManagerController.update);

    // Delete hiring manager by ID 
    // (admins can delete any, regular users only their own)
    router.delete('/:id', hiringManagerController.delete);

    // Routes for notes
    router.post('/:id/notes', hiringManagerController.addNote);
    router.get('/:id/notes', hiringManagerController.getNotes);

    // Route for history
    router.get('/:id/history', hiringManagerController.getHistory);

    return router;
}

module.exports = createHiringManagerRouter;