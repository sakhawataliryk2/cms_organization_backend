// jobs/archiveCleanup.js
// This job runs daily to clean up archived organizations and hiring managers after 7 days

const Organization = require("../models/organization");
const Transfer = require("../models/transfer");

async function runArchiveCleanup(pool) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ---------- Organizations ----------
    const archivedOrgsResult = await client.query(
      `
      SELECT DISTINCT o.id, o.name
      FROM organizations o
      WHERE o.status = 'Archived'
        AND o.archived_at IS NOT NULL
        AND o.archived_at <= CURRENT_TIMESTAMP - INTERVAL '7 days'
        AND o.id NOT IN (
          SELECT (task_data->>'organization_id')::integer FROM scheduled_tasks 
          WHERE task_type = 'archive_cleanup' 
          AND status = 'completed'
          AND task_data->>'organization_id' IS NOT NULL
        )
    `
    );

    const archivedOrgs = archivedOrgsResult.rows;

    for (const org of archivedOrgs) {
      console.log(`Cleaning up archived organization: ${org.name} (ID: ${org.id})`);

      await client.query(
        "DELETE FROM hiring_managers WHERE organization_id = $1",
        [org.id]
      );
      await client.query("DELETE FROM jobs WHERE organization_id = $1", [org.id]);
      await client.query("DELETE FROM leads WHERE organization_id = $1", [org.id]);
      await client.query(
        "DELETE FROM organization_notes WHERE organization_id = $1",
        [org.id]
      );
      await client.query(
        "DELETE FROM organization_history WHERE organization_id = $1",
        [org.id]
      );
      await client.query(
        "DELETE FROM organization_documents WHERE organization_id = $1",
        [org.id]
      );
      await client.query("DELETE FROM organizations WHERE id = $1", [org.id]);

      await client.query(
        `
        UPDATE scheduled_tasks
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE task_type = 'archive_cleanup' 
          AND task_data->>'organization_id' = $1
      `,
        [org.id.toString()]
      );

      console.log(`Successfully cleaned up organization ${org.id}`);
    }

    // ---------- Hiring Managers ----------
    const archivedHmResult = await client.query(
      `
      SELECT hm.id, hm.first_name, hm.last_name
      FROM hiring_managers hm
      WHERE hm.status = 'Archived'
        AND hm.archived_at IS NOT NULL
        AND hm.archived_at <= CURRENT_TIMESTAMP - INTERVAL '7 days'
      `
    );

    const archivedHms = archivedHmResult.rows;

    for (const hm of archivedHms) {
      const hmName = `${hm.last_name || ""}, ${hm.first_name || ""}`.trim() || `ID ${hm.id}`;
      console.log(`Cleaning up archived hiring manager: ${hmName} (ID: ${hm.id})`);

      await client.query(
        "DELETE FROM hiring_manager_notes WHERE hiring_manager_id = $1",
        [hm.id]
      );
      await client.query(
        "DELETE FROM hiring_manager_history WHERE hiring_manager_id = $1",
        [hm.id]
      );
      await client.query(
        "DELETE FROM documents WHERE entity_type = 'hiring_manager' AND entity_id = $1",
        [hm.id]
      );
      await client.query("DELETE FROM hiring_managers WHERE id = $1", [hm.id]);

      await client.query(
        `
        UPDATE scheduled_tasks
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE task_type = 'archive_cleanup' 
          AND task_data->>'hiring_manager_id' = $1
      `,
        [hm.id.toString()]
      );

      console.log(`Successfully cleaned up hiring manager ${hm.id}`);
    }

    await client.query("COMMIT");
    console.log(
      `Archive cleanup completed. Processed ${archivedOrgs.length} organizations, ${archivedHms.length} hiring managers.`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error running archive cleanup:", error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { runArchiveCleanup };
