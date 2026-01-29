// routes/jobRoutes.js
const express = require('express');
const uploadOrganizationDocument = require('../middleware/uploadOrganizationDocument');

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

    // Document routes
    router.get('/:id/documents', jobController.getDocuments);
    router.post('/:id/documents/upload', uploadOrganizationDocument.single('file'), jobController.uploadDocument);
    router.post('/:id/documents', jobController.addDocument);
    router.get('/:id/documents/:documentId', jobController.getDocument);
    router.put('/:id/documents/:documentId', jobController.updateDocument);
    router.delete('/:id/documents/:documentId', jobController.deleteDocument);

    return router;
}

module.exports = createJobRouter;