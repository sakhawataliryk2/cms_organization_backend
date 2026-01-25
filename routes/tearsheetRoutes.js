// routes/tearsheetRoutes.js
const express = require("express");

function createTearsheetRouter(tearsheetController, authMiddleware) {
  const router = express.Router();
  const { verifyToken } = authMiddleware;

  // All routes require authentication
  router.use(verifyToken);

  router.get("/", tearsheetController.getAll);
  router.get("/:id/records", tearsheetController.getRecords);
  router.post("/", tearsheetController.create);
  router.post("/:id/associate", tearsheetController.associate);
  router.delete("/:id", tearsheetController.delete);

  return router;
}

module.exports = createTearsheetRouter;


