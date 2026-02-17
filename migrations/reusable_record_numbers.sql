-- =============================================================================
-- Reusable Business Record Number System
-- Rules: id remains Primary Key; record_number is display-only and reusable
--        after HARD delete. All operations use id.
-- =============================================================================

-- 1) Reusable numbers pool (per module)
CREATE TABLE IF NOT EXISTS reusable_numbers (
    module_type VARCHAR(50) NOT NULL,
    number INTEGER NOT NULL,
    PRIMARY KEY (module_type, number)
);

-- 2) Module configuration (prefix for display: prefix || '-' || record_number)
CREATE TABLE IF NOT EXISTS modules (
    name VARCHAR(50) PRIMARY KEY,
    prefix VARCHAR(10) NOT NULL UNIQUE
);

INSERT INTO modules (name, prefix) VALUES
    ('task', 'T'),
    ('job', 'J'),
    ('organization', 'O')
ON CONFLICT (name) DO NOTHING;

-- 3) Sequences for new numbers when pool is empty (one per module)
CREATE SEQUENCE IF NOT EXISTS task_record_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS job_record_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS organization_record_number_seq START 1;

-- 4) Allocation function: reuse smallest from pool or nextval(sequence)
--    Caller must run this inside a transaction; FOR UPDATE ensures concurrency safety.
CREATE OR REPLACE FUNCTION allocate_record_number(p_module_type TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_number INTEGER;
    v_seq_name TEXT;
BEGIN
    -- Try reusable pool first (lock row for update)
    SELECT number INTO v_number
    FROM reusable_numbers
    WHERE module_type = p_module_type
    ORDER BY number ASC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        DELETE FROM reusable_numbers
        WHERE module_type = p_module_type AND number = v_number;
        RETURN v_number;
    END IF;

    -- Otherwise take next from sequence
    v_seq_name := p_module_type || '_record_number_seq';
    EXECUTE format('SELECT nextval(%L)', v_seq_name) INTO v_number;
    RETURN v_number;
END;
$$;

-- 5) Add record_number to module tables (additive; safe for existing DBs)
--    Steps: add column (nullable first), backfill, set NOT NULL, add UNIQUE, set sequence start.

-- ----- tasks (only if table exists) -----
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'record_number')
    THEN
        ALTER TABLE tasks ADD COLUMN record_number INTEGER;
        -- Backfill existing rows with unique integers
        WITH ordered AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
            FROM tasks
        )
        UPDATE tasks t
        SET record_number = ordered.rn
        FROM ordered
        WHERE t.id = ordered.id;
        ALTER TABLE tasks ALTER COLUMN record_number SET NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_record_number ON tasks (record_number);
        -- Set sequence to max+1 so new allocations don't clash
        PERFORM setval('task_record_number_seq', (SELECT COALESCE(MAX(record_number), 0) + 1 FROM tasks));
    END IF;
END $$;

-- ----- jobs (only if table exists) -----
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'record_number')
    THEN
        ALTER TABLE jobs ADD COLUMN record_number INTEGER;
        WITH ordered AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
            FROM jobs
        )
        UPDATE jobs j
        SET record_number = ordered.rn
        FROM ordered
        WHERE j.id = ordered.id;
        ALTER TABLE jobs ALTER COLUMN record_number SET NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_record_number ON jobs (record_number);
        PERFORM setval('job_record_number_seq', (SELECT COALESCE(MAX(record_number), 0) + 1 FROM jobs));
    END IF;
END $$;

-- ----- organizations (only if table exists) -----
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organizations')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'record_number')
    THEN
        ALTER TABLE organizations ADD COLUMN record_number INTEGER;
        WITH ordered AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
            FROM organizations
        )
        UPDATE organizations o
        SET record_number = ordered.rn
        FROM ordered
        WHERE o.id = ordered.id;
        ALTER TABLE organizations ALTER COLUMN record_number SET NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_record_number ON organizations (record_number);
        PERFORM setval('organization_record_number_seq', (SELECT COALESCE(MAX(record_number), 0) + 1 FROM organizations));
    END IF;
END $$;

-- Done. Use allocate_record_number(module_type) inside a transaction when creating
-- a record; insert the returned value into record_number. On HARD delete, insert
-- (module_type, record_number) into reusable_numbers before deleting the row.
