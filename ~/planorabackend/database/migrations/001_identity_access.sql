BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_status AS ENUM (
  'INVITED',
  'ACTIVE',
  'SUSPENDED',
  'DISABLED'
);

CREATE TYPE permission_effect AS ENUM (
  'ALLOW',
  'DENY'
);

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(150) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  module VARCHAR(80) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  auth_user_id UUID UNIQUE,

  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,

  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(40),

  avatar_url TEXT,
  job_title VARCHAR(120),

  role_id UUID NOT NULL REFERENCES roles(id),
  department_id UUID REFERENCES departments(id),

  status user_status NOT NULL DEFAULT 'INVITED',

  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,

  password_changed_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,

  created_by_id UUID REFERENCES users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(120) NOT NULL,
  description TEXT,

  department_id UUID NOT NULL REFERENCES departments(id),

  manager_id UUID REFERENCES users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (department_id, name)
);

CREATE TABLE team_members (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,

  effect permission_effect NOT NULL,

  reason TEXT,

  granted_by_id UUID REFERENCES users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, permission_id)
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  action VARCHAR(140) NOT NULL,
  module VARCHAR(100) NOT NULL,

  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,

  old_values JSONB,
  new_values JSONB,

  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role
ON users(role_id);

CREATE INDEX idx_users_department
ON users(department_id);

CREATE INDEX idx_users_status
ON users(status);

CREATE INDEX idx_users_auth_user
ON users(auth_user_id);

CREATE INDEX idx_permissions_module
ON permissions(module);

CREATE INDEX idx_teams_department
ON teams(department_id);

CREATE INDEX idx_teams_manager
ON teams(manager_id);

CREATE INDEX idx_team_members_user
ON team_members(user_id);

CREATE INDEX idx_permission_overrides_user
ON user_permission_overrides(user_id);

CREATE INDEX idx_audit_actor
ON audit_logs(actor_user_id);

CREATE INDEX idx_audit_module
ON audit_logs(module);

CREATE INDEX idx_audit_entity
ON audit_logs(entity_type, entity_id);

CREATE INDEX idx_audit_created_at
ON audit_logs(created_at DESC);

COMMIT;
