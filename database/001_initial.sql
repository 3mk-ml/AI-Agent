BEGIN;
CREATE SCHEMA IF NOT EXISTS agentflow;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS btree_gist;
SET LOCAL search_path = agentflow, public, extensions;
CREATE TABLE IF NOT EXISTS migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel text NOT NULL CHECK(channel IN ('website','telegram','slack','whatsapp')),
 external_key text NOT NULL, account text NOT NULL DEFAULT 'local', display_name text NOT NULL DEFAULT 'Visitor', target jsonb NOT NULL DEFAULT '{}',
 mode text NOT NULL DEFAULT 'ai' CHECK(mode IN ('ai','human','resolved')), version integer NOT NULL DEFAULT 0, assigned_to text,
 last_message text NOT NULL DEFAULT '', last_inbound_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(channel,external_key)
);
CREATE TABLE IF NOT EXISTS leads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid UNIQUE REFERENCES conversations(id), name text NOT NULL, email text, phone text,
 company text NOT NULL DEFAULT '', interest text NOT NULL DEFAULT '', budget text NOT NULL DEFAULT '', timeline text NOT NULL DEFAULT '',
 source text NOT NULL DEFAULT 'website', score integer NOT NULL DEFAULT 0 CHECK(score BETWEEN 0 AND 100), score_factors jsonb NOT NULL DEFAULT '{}',
 stage text NOT NULL DEFAULT 'new' CHECK(stage IN ('new','qualified','contacted','won','lost')), consent boolean NOT NULL DEFAULT false,
 last_activity timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_email ON leads(lower(email));
CREATE TABLE IF NOT EXISTS messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 direction text NOT NULL CHECK(direction IN ('in','out')), author text NOT NULL CHECK(author IN ('customer','agent','operator','system')),
 text text NOT NULL, provider_id text, status text NOT NULL DEFAULT 'received', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(conversation_id,provider_id)
);
CREATE INDEX IF NOT EXISTS message_history ON messages(conversation_id,created_at);
CREATE TABLE IF NOT EXISTS appointments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES leads(id), conversation_id uuid REFERENCES conversations(id),
 resource text NOT NULL DEFAULT 'consultant-1', starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, title text NOT NULL DEFAULT 'Discovery call',
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled','completed')), idempotency_key text UNIQUE NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at>starts_at),
 EXCLUDE USING gist (resource WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE(status='confirmed')
);
CREATE TABLE IF NOT EXISTS knowledge_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, content text NOT NULL, model text NOT NULL, status text NOT NULL DEFAULT 'indexing', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS knowledge_chunks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE, ordinal integer NOT NULL, content text NOT NULL, embedding vector(768) NOT NULL, UNIQUE(document_id,ordinal));
CREATE INDEX IF NOT EXISTS knowledge_embedding ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
CREATE TABLE IF NOT EXISTS jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, payload jsonb NOT NULL, dedup_key text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','done','failed','unknown')), attempts integer NOT NULL DEFAULT 0,
 run_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(status,run_at);
CREATE TABLE IF NOT EXISTS handoffs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES conversations(id), reason text NOT NULL, status text NOT NULL DEFAULT 'open', created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS open_handoff ON handoffs(conversation_id) WHERE(status='open');
CREATE TABLE IF NOT EXISTS activity (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES conversations(id), kind text NOT NULL, detail text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS workflow_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES conversations(id), workflow text NOT NULL, n8n_execution_id text, status text NOT NULL, duration_ms integer, error text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS automation_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('triage','document','followup')), title text NOT NULL, data jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'draft', dedup_key text UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS channel_status (channel text PRIMARY KEY, last_inbound timestamptz, last_outbound timestamptz, last_error text);
CREATE TABLE IF NOT EXISTS runtime_state (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rate_limits (key text NOT NULL, bucket bigint NOT NULL, count integer NOT NULL DEFAULT 0, PRIMARY KEY(key,bucket));
-- n8n Postgres Chat Memory uses a dedicated, schema-qualified table.
CREATE TABLE IF NOT EXISTS chat_memory (id serial PRIMARY KEY, session_id varchar(255) NOT NULL, message jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS chat_memory_session ON chat_memory(session_id);
-- No direct browser/PostgREST access. The server uses a privileged, dedicated DB connection.
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='agentflow' LOOP
  EXECUTE format('ALTER TABLE agentflow.%I ENABLE ROW LEVEL SECURITY',t.tablename);
 END LOOP;
END $$;
REVOKE ALL ON SCHEMA agentflow FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA agentflow FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA agentflow FROM PUBLIC;
INSERT INTO migrations(id) VALUES('001_initial') ON CONFLICT DO NOTHING;
COMMIT;
