#!/bin/sh
set -eu

: "${VITAE_OWNER_PASSWORD:?VITAE_OWNER_PASSWORD is required}"
: "${VITAE_APP_PASSWORD:?VITAE_APP_PASSWORD is required}"

psql --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<'SQL'
\getenv owner_password VITAE_OWNER_PASSWORD
\getenv app_password VITAE_APP_PASSWORD

SELECT format(
  'CREATE ROLE vitae_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
  :'owner_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vitae_owner')
\gexec

SELECT format('ALTER ROLE vitae_owner PASSWORD %L', :'owner_password')
\gexec

SELECT format(
  'CREATE ROLE vitae_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
  :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vitae_app')
\gexec

SELECT format('ALTER ROLE vitae_app PASSWORD %L', :'app_password')
\gexec

ALTER DATABASE vitae OWNER TO vitae_owner;
REVOKE ALL ON DATABASE vitae FROM PUBLIC;
GRANT CONNECT ON DATABASE vitae TO vitae_owner, vitae_app;
ALTER ROLE vitae_app SET statement_timeout = '30s';
ALTER ROLE vitae_app SET lock_timeout = '5s';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO vitae_owner;
GRANT USAGE ON SCHEMA public TO vitae_app;
SQL
