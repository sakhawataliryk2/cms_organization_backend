// routes/placementRoutes.js
const express = require('express');
const uploadOrganizationDocument = require('../middleware/uploadOrganizationDocument');

function createPlacementRouter(placementController, authMiddleware) {
    const router = express.Router();
    const { verifyToken, checkRole } = authMiddleware;

    // All routes require authentication
    router.use(verifyToken);

    // Get all placements
    // (admins see all, regular users see only their own)
    router.get('/', placementController.getAll);

    // Get placements by job ID
    router.get('/job/:jobId', placementController.getByJobId);

    // Get placements by job seeker ID
    router.get('/job-seeker/:jobSeekerId', placementController.getByJobSeekerId);

    // Get placements by organization ID
    router.get('/organization/:organizationId', placementController.getByOrganizationId);

    // Get placement history (must be before /:id - more specific route first)
    router.get('/:id/history', placementController.getHistory);

    // Notes (must be before /:id)
    router.get('/:id/notes', placementController.getNotes);
    router.post('/:id/notes', placementController.addNote);

    // Get placement by ID
    // (admins can see any, regular users only their own)
    router.get('/:id', placementController.getById);

    // Create new placement
    router.post('/', placementController.create);

    // Update placement by ID
    // (admins can update any, regular users only their own)
    router.put('/:id', placementController.update);

    // Delete placement by ID
    // (admins can delete any, regular users only their own)
    router.delete('/:id', placementController.delete);

    // Document routes
    router.get('/:id/documents', placementController.getDocuments);
    router.post('/:id/documents/upload', uploadOrganizationDocument.single('file'), placementController.uploadDocument);
    router.post('/:id/documents', placementController.addDocument);
    router.get('/:id/documents/:documentId', placementController.getDocument);
    router.put('/:id/documents/:documentId', placementController.updateDocument);
    router.delete('/:id/documents/:documentId', placementController.deleteDocument);

    return router;
}

module.exports = createPlacementRouter;

