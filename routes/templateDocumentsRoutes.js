const express = require("express");
const uploadTemplatePdf = require("../middleware/uploadTemplatePdf");

module.exports = (pool, authMiddleware) => {
  const router = express.Router();
  const { verifyToken } = authMiddleware;

  const TemplateDocumentController = require("../controllers/templateDocumentController");
  const controller = new TemplateDocumentController(pool);

  controller.initTables().catch(console.error);

  // CRUD
  router.get("/", controller.getAll);
  router.get("/:id", controller.getById);

  // create/update with pdf upload
  router.post("/", uploadTemplatePdf.single("file"), controller.create);
  router.put("/:id", uploadTemplatePdf.single("file"), controller.update);

  router.delete("/:id", controller.delete);
 router.use(verifyToken);
  return router;
};
