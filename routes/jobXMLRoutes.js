// controllers/jobXMLController.js
const { create } = require("xmlbuilder2");
const Job = require("../models/job");
const Organization = require("../models/Organization");

function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}


class JobXMLController {
    constructor(pool) {
        this.jobModel = new Job(pool);
        this.organizationModel = new Organization(pool);

        // Bind methods
        this.getXMLFeed = this.getXMLFeed.bind(this);
        this.generateJobXML = this.generateJobXML.bind(this);
        this.escapeXML = this.escapeXML.bind(this);
    }

    /**
     * GET /api/jobs/xml
     * Returns all active jobs as XML feed for job boards
     */
    async getXMLFeed(req, res) {
        try {
            // Fetch active jobs

            const jobs = await this.jobModel.getAll(null); // fetch all jobs

            const activeJobs = jobs.filter(job => {
                const customStatus = job.custom_fields?.["Status"]?.toLowerCase();
                const mainStatus = job.status?.toLowerCase();

                // Check both fields
                return customStatus === "active" || mainStatus === "open";
            });

            // const jobs = await this.jobModel.getAll(null); // fetch all jobs

            // const activeJobs = jobs.filter(job => {
            //     const customStatus = job.custom_fields?.["Status"]?.toLowerCase();
            //     const mainStatus = job.status?.toLowerCase();

            //     // Job must be active/open AND post_to_jobs_board === "true"
            //     const isActive = customStatus === "active" || mainStatus === "open";
            //     const shouldPost = job.post_to_jobs_board === "true";

            //     return isActive && shouldPost;
            // });

            // Build XML feed
            const feedObj = {
                source: {
                    publisher: "ABC Corp", // you can leave this as default
                    lastBuildDate: new Date().toISOString(),
                    jobs: await Promise.all(activeJobs.map(async (job) => {
                        // Fetch organization name for this job
                        let companyName = "ABC Corp"; // fallback
                        if (job.organization_id) {
                            try {
                                const org = await this.organizationModel.getById(job.organization_id);
                                companyName = org?.name || companyName;
                            } catch (err) {
                                console.error(`Error fetching org for job ${job.id}:`, err);
                            }
                        }

                        return {
                            job: {
                                id: job.id,
                                title: job.custom_fields?.["Published Job Title"] || job.job_title || "",
                                description: job.custom_fields?.["Job Description Going to Job Board"] || job.job_description || "",
                                location: [
                                    job.custom_fields?.["Address"],
                                    job.custom_fields?.["City"],
                                    job.custom_fields?.["State"],
                                    job.custom_fields?.["Zip"]
                                ].filter(Boolean).join(', ') || job.address || "",
                                date_posted: job.created_at
                                    ? new Date(job.created_at).toISOString().split("T")[0]
                                    : "",
                                url: `https://yourcrm.com/jobs/${job.id}`,
                                company: companyName,
                                job_type: capitalize(job.job_type),
                                salary: job.custom_fields?.["Salary"] || job.salary || "",
                            },
                        };
                    })),
                },
            };


            const xml = create(feedObj).end({ prettyPrint: true });

            res.setHeader("Content-Type", "application/xml");
            res.status(200).send(xml);
        } catch (err) {
            console.error("Error generating XML feed:", err);
            res.status(500).send("Failed to generate XML feed");
        }
    }

    /**
     * Optional helper for manual XML generation (if needed)
     */
    // generateJobXML(jobs) {
    //     let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<jobs>\n';
    //     jobs.forEach((job) => {
    //         xml += '  <job>\n';
    //         xml += `    <id>${this.escapeXML(job.id)}</id>\n`;
    //         xml += `    <title>${this.escapeXML(job.title)}</title>\n`;
    //         xml += `    <description>${this.escapeXML(job.description)}</description>\n`;
    //         xml += `    <location>${this.escapeXML(job.location)}</location>\n`;
    //         xml += `    <date_posted>${this.escapeXML(job.date_posted)}</date_posted>\n`;
    //         xml += `    <url>${this.escapeXML(`https://yourcrm.com/jobs/${job.id}`)}</url>\n`;
    //         xml += `    <company>${this.escapeXML("ABC Corp")}</company>\n`;
    //         xml += `    <job_type>${this.escapeXML(job.job_type)}</job_type>\n`;
    //         xml += `    <salary>${this.escapeXML(job.salary)}</salary>\n`;
    //         xml += '  </job>\n';
    //     });
    //     xml += '</jobs>';
    //     return xml;
    // }

    // escapeXML(str) {
    //     if (str === null || str === undefined) return '';
    //     return String(str)
    //         .replace(/&/g, '&amp;')
    //         .replace(/</g, '&lt;')
    //         .replace(/>/g, '&gt;')
    //         .replace(/"/g, '&quot;')
    //         .replace(/'/g, '&apos;');
    // }
}

// Router factory
const express = require("express");
function createJobXMLRouter(pool) {
    const router = express.Router();
    const controller = new JobXMLController(pool);

    router.get("/", controller.getXMLFeed);

    return router;
}

module.exports = createJobXMLRouter;