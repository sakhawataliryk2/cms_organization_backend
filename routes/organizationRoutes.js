// Updated routes/organizationRoutes.js
const express = require('express');

function createOrganizationRouter(organizationController, authMiddleware) {
    const router = express.Router();
    const { verifyToken, checkRole } = authMiddleware;

    // All routes require authentication
    router.use(verifyToken);

    // Get all organizations 
    // (admins see all, regular users see only their own)
    router.get('/', organizationController.getAll);

    // Get organization by ID 
    // (admins can see any, regular users only their own)
    router.get('/:id', organizationController.getById);

    // Create new organization
    router.post('/', organizationController.create);

    // Update organization by ID 
    // (admins can update any, regular users only their own)
    router.put('/:id', organizationController.update);

    // Delete organization by ID 
    // (admins can delete any, regular users only their own)
    router.delete('/:id', organizationController.delete);

    // New routes for notes
    router.post('/:id/notes', organizationController.addNote);
    router.get('/:id/notes', organizationController.getNotes);

    // New route for history
    router.get('/:id/history', organizationController.getHistory);

    return router;
}

module.exports = createOrganizationRouter;