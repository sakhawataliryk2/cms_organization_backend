// controllers/jobXMLController.js
const { create } = require("xmlbuilder2");
const Job = require("../models/job");
const Organization = require("../models/organization");

function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

class JobXMLController {
    constructor(pool) {
        this.jobModel = new Job(pool);
        this.organizationModel = new Organization(pool);

        this.getXMLFeed = this.getXMLFeed.bind(this);
    }

    async getXMLFeed(req, res) {
        try {
            const jobs = await this.jobModel.getAll(null);

            const activeJobs = jobs.filter(job => {
                const customStatus = job.custom_fields?.["Status"]?.toLowerCase();
                const mainStatus = job.status?.toLowerCase();
                return customStatus === "active" || mainStatus === "open";
            });

            const feedObj = {
                source: {
                    publisher: "ABC Corp",
                    lastBuildDate: new Date().toISOString(),
                    jobs: await Promise.all(
                        activeJobs.map(async (job) => {
                            let companyName = "ABC Corp";

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
                                }
                            };
                        })
                    )
                }
            };

            const xml = create(feedObj).end({ prettyPrint: true });

            res.setHeader("Content-Type", "application/xml");
            return res.status(200).send(xml);

        } catch (err) {
            console.error("Error generating XML feed:", err);
            return res.status(500).send("Failed to generate XML feed");
        }
    }
}

module.exports = JobXMLController;
