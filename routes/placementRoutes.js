// routes/placementRoutes.js
const express = require('express');

function createPlacementRouter(placementController, authMiddleware) {
    const router = express.Router();
    const { verifyToken, checkRole } = authMiddleware;

    // All routes require authentication
    router.use(verifyToken);

    // Get all placements
    // (admins see all, regular users see only their own)
    router.get('/', placementController.getAll);

    // Get placement by ID
    // (admins can see any, regular users only their own)
    router.get('/:id', placementController.getById);

    // Get placements by job ID
    router.get('/job/:jobId', placementController.getByJobId);

    // Get placements by job seeker ID
    router.get('/job-seeker/:jobSeekerId', placementController.getByJobSeekerId);

    // Create new placement
    router.post('/', placementController.create);

    // Update placement by ID
    // (admins can update any, regular users only their own)
    router.put('/:id', placementController.update);

    // Delete placement by ID
    // (admins can delete any, regular users only their own)
    router.delete('/:id', placementController.delete);

    return router;
}

module.exports = createPlacementRouter;

