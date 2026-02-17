const OrganizationDefaultDocument = require("../models/organizationDefaultDocument");
const Document = require("../models/document");
const TemplateDocument = require("../models/templateDocument");

class OrganizationDefaultDocumentController {
  constructor(pool) {
    this.pool = pool;
    this.model = new OrganizationDefaultDocument(pool);
    this.documentModel = new Document(pool);
    this.templateModel = new TemplateDocument(pool);

    this.getAll = this.getAll.bind(this);
    this.getBySlot = this.getBySlot.bind(this);
    this.setWelcome = this.setWelcome.bind(this);
    this.pushToAllOrganizations = this.pushToAllOrganizations.bind(this);
  }

  async initTable() {
    await this.model.initTable();
  }

  async getAll(req, res) {
    try {
      const rows = await this.model.getAll();
      return res.json({ success: true, defaults: rows });
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch organization default documents",
        error: process.env.NODE_ENV === "production" ? undefined : e.message,
      });
    }
  }

  async getBySlot(req, res) {
    try {
      const { slot } = req.params;
      const row = await this.model.getBySlot(slot);
      if (!row)
        return res.status(404).json({
          success: false,
          message: `No default document for slot: ${slot}`,
        });
      return res.json({ success: true, default: row });
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch organization default document",
        error: process.env.NODE_ENV === "production" ? undefined : e.message,
      });
    }
  }

  // Set the Welcome document template (template_document_id)
  async setWelcome(req, res) {
    try {
      const { template_document_id } = req.body || {};
      if (!template_document_id) {
        return res.status(400).json({
          success: false,
          message: "template_document_id is required",
        });
      }

      const template = await this.templateModel.getById(template_document_id);
      if (!template) {
        return res.status(404).json({
          success: false,
          message: "Template document not found",
        });
      }

      const updated = await this.model.setSlot("welcome", template_document_id);
      return res.json({
        success: true,
        message: "Welcome document set",
        default: updated,
      });
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: "Failed to set Welcome document",
        error: process.env.NODE_ENV === "production" ? undefined : e.message,
      });
    }
  }

  // Push the current Welcome template to all organizations
  async pushToAllOrganizations(req, res) {
    try {
      const slotRow = await this.model.getBySlot("welcome");
      if (!slotRow || !slotRow.template_document_id) {
        return res.status(400).json({
          success: false,
          message: "No Welcome document template is configured",
        });
      }

      const template = await this.templateModel.getById(slotRow.template_document_id);
      if (!template || !template.file_url) {
        return res.status(400).json({
          success: false,
          message: "Template document has no file",
        });
      }

      const orgDocs = await this.documentModel.getBySourceTemplateId(
        slotRow.template_document_id
      );

      let updated = 0;
      for (const doc of orgDocs) {
        await this.documentModel.update(doc.id, {
          file_path: template.file_url,
          file_size: template.file_size || null,
          mime_type: template.mime_type || "application/pdf",
          document_name: template.document_name || "Welcome Document",
        });
        updated++;
      }

      return res.json({
        success: true,
        message: `Pushed new version to ${updated} organization(s)`,
        updated,
      });
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: "Failed to push to organizations",
        error: process.env.NODE_ENV === "production" ? undefined : e.message,
      });
    }
  }
}

module.exports = OrganizationDefaultDocumentController;
