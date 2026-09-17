BEGIN;

CREATE TABLE IF NOT EXISTS role_departments (
  role_id UUID NOT NULL
    REFERENCES roles(id)
    ON DELETE CASCADE,

  department_id UUID NOT NULL
    REFERENCES departments(id)
    ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  PRIMARY KEY (
    role_id,
    department_id
  )
);

CREATE INDEX IF NOT EXISTS
  idx_role_departments_department
ON role_departments(department_id);

COMMIT;
