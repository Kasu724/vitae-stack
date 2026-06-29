-- Development-only bootstrap credentials. Production operators must provision
-- equivalent least-privilege roles with secret-managed passwords.
CREATE ROLE vitae_owner
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  PASSWORD 'vitae-owner-dev-only';

CREATE ROLE vitae_app
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  PASSWORD 'vitae-app-dev-only';

ALTER DATABASE vitae OWNER TO vitae_owner;
REVOKE ALL ON DATABASE vitae FROM PUBLIC;
GRANT CONNECT ON DATABASE vitae TO vitae_owner, vitae_app;
ALTER ROLE vitae_app SET statement_timeout = '30s';
ALTER ROLE vitae_app SET lock_timeout = '5s';

\connect vitae vitae_owner

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO vitae_owner;
GRANT USAGE ON SCHEMA public TO vitae_app;
