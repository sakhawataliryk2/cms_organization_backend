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

    // Additional skills suggestions (must be before /:id route)
    router.get('/skills-suggestions', jobController.getAdditionalSkillSuggestions);

    // Export jobs to XML (must be before /:id route)
    router.get('/export/xml', jobController.exportToXML);

    // Create new job
    router.post('/', jobController.create);

    // Bulk update jobs (must be before /:id route)
    router.post('/bulk-update', jobController.bulkUpdate);

    // Get job by ID 
    // (admins can see any, regular users only their own)
    router.get('/:id', jobController.getById);

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

    // Publish / distribute job (LinkedIn, Job Board) — works without credentials; completes when credentials are added
    router.post('/:id/publish', jobController.publish);

    // Document routes
    router.get('/:id/documents', jobController.getDocuments);
    router.post('/:id/documents/upload', jobController.uploadDocument);
    router.post('/:id/documents', jobController.addDocument);
    router.get('/:id/documents/:documentId', jobController.getDocument);
    router.put('/:id/documents/:documentId', jobController.updateDocument);
    router.delete('/:id/documents/:documentId', jobController.deleteDocument);

    return router;
}

// Delete request routes for jobs - separate router
function createJobDeleteRequestRouter(deleteRequestController, authMiddleware) {
    const router = express.Router();
    const { verifyToken } = authMiddleware;

    // All routes require authentication
    router.use(verifyToken);

    // Get delete request by ID (for approval/deny pages)
    router.get('/delete/:id', deleteRequestController.getById);

    // Get delete request for a job
    router.get('/:id/delete-request', deleteRequestController.getByRecord);

    // Create delete request
    router.post('/:id/delete-request', deleteRequestController.create);

    // Approve delete request (must come before /:id routes)
    router.post('/delete/:id/approve', deleteRequestController.approve);

    // Deny delete request (must come before /:id routes)
    router.post('/delete/:id/deny', deleteRequestController.deny);

    return router;
}

module.exports = { createJobRouter, createJobDeleteRequestRouter };
