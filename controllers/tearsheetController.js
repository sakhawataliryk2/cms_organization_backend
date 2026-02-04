// controllers/tearsheetController.js
const Tearsheet = require("../models/tearsheet");

class TearsheetController {
  constructor(pool) {
    this.tearsheetModel = new Tearsheet(pool);
    this.create = this.create.bind(this);
    this.getAll = this.getAll.bind(this);
    this.getRecords = this.getRecords.bind(this);
    this.getOrganizations = this.getOrganizations.bind(this);
    this.getPlacements = this.getPlacements.bind(this);
    this.delete = this.delete.bind(this);
    this.associate = this.associate.bind(this);
    this.getTearsheetsForOrganization = this.getTearsheetsForOrganization.bind(this);
  }

  async initTables() {
    await this.tearsheetModel.initTable();
  }

  async getAll(req, res) {
    try {
      const tearsheets = await this.tearsheetModel.getAll();
      console.log('Tearsheets:', tearsheets);
      return res.json({ success: true, tearsheets });
    } catch (error) {
      console.error("Error fetching tearsheets:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch tearsheets",
        error: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  async create(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const {
        name,
        visibility = "Existing",
        job_id,
        job_seeker_id,
        hiring_manager_id,
        lead_id,
      } = req.body || {};

      if (!name || (typeof name === "string" && !name.trim())) {
        return res.status(400).json({
          success: false,
          message: "Tearsheet name is required",
        });
      }

      const tearsheet = await this.tearsheetModel.create({
        name: String(name).trim(),
        visibility,
        job_id: job_id ?? null,
        job_seeker_id: job_seeker_id ?? null,
        hiring_manager_id: hiring_manager_id ?? null,
        lead_id: lead_id ?? null,
        created_by: userId,
      });

      return res.status(201).json({
        success: true,
        message: "Tearsheet created successfully",
        tearsheet,
      });
    } catch (error) {
      console.error("Error creating tearsheet:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create tearsheet",
        error: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  async getRecords(req, res) {
    try {
      const { id } = req.params;
      const { type } = req.query;

      if (!id || !type) {
        return res.status(400).json({
          success: false,
          message: "Tearsheet ID and type are required",
        });
      }

      const validTypes = ['job_seekers', 'hiring_managers', 'jobs', 'leads'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid type. Must be one of: job_seekers, hiring_managers, jobs, leads",
        });
      }

      const records = await this.tearsheetModel.getRecordsByType(parseInt(id), type);

      return res.json({
        success: true,
        records,
        count: records.length
      });
    } catch (error) {
      console.error("Error fetching tearsheet records:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch tearsheet records",
        error: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  async getOrganizations(req, res) {
    try {
      const { id } = req.params;
      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: "Invalid tearsheet ID",
        });
      }
      const organizations = await this.tearsheetModel.getOrganizations(parseInt(id));
      return res.json({
        success: true,
        organizations,
        count: organizations.length,
      });
    } catch (error) {
      console.error("Error fetching tearsheet organizations:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch organizations",
        error: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  async getPlacements(req, res) {
    try {
      const { id } = req.params;
      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: "Invalid tearsheet ID",
        });
      }
      const placements = await this.tearsheetModel.getPlacements(parseInt(id));
      return res.json({
        success: true,
        placements,
        count: placements.length,
      });
    } catch (error) {
      console.error("Error fetching tearsheet placements:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch placements",
        error: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  async delete(req, res) {
    try {
      const { id } = req.params;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: 'Invalid tearsheet ID',
        });
      }

      const tearsheet = await this.tearsheetModel.delete(parseInt(id));

      if (!tearsheet) {
        return res.status(404).json({
          success: false,
          message: 'Tearsheet not found',
        });
      }

      return res.json({
        success: true,
        message: 'Tearsheet deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting tearsheet:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete tearsheet',
        error: process.env.NODE_ENV === 'production' ? undefined : error.message,
      });
    }
  }

  async associate(req, res) {
    try {
      const { id } = req.params;
      const { job_seeker_id, hiring_manager_id, job_id, lead_id } = req.body;

      console.log('Associating record with tearsheet:', { id, job_seeker_id, hiring_manager_id, job_id, lead_id });

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: 'Invalid tearsheet ID',
        });
      }

      await this.tearsheetModel.associate(parseInt(id), {
        job_seeker_id: job_seeker_id ? parseInt(job_seeker_id) : null,
        hiring_manager_id: hiring_manager_id ? parseInt(hiring_manager_id) : null,
        job_id: job_id ? parseInt(job_id) : null,
        lead_id: lead_id ? parseInt(lead_id) : null,
      });

      return res.json({
        success: true,
        message: 'Record associated with tearsheet successfully',
      });
    } catch (error) {
      console.error('Error associating record with tearsheet:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to associate record with tearsheet',
        error: error.message,
      });
    }
  }

  async getTearsheetsForOrganization(req, res) {
    try {
      const { organizationId } = req.params;
      if (!organizationId || isNaN(parseInt(organizationId))) {
        return res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
      }
      const tearsheets = await this.tearsheetModel.getTearsheetsForOrganization(parseInt(organizationId));
      return res.json({
        success: true,
        tearsheets,
        count: tearsheets.length,
      });
    } catch (error) {
      console.error("Error fetching tearsheets for organization:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch tearsheets",
        error: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }
}

module.exports = TearsheetController;


