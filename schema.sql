-- Enable Postgres Extensions
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- Create Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'channel_enum') THEN
    CREATE TYPE channel_enum AS ENUM ('whatsapp', 'telegram', 'email', 'web');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'category_enum') THEN
    CREATE TYPE category_enum AS ENUM ('reminder', 'task', 'insight', 'document', 'uncategorized');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_enum') THEN
    CREATE TYPE status_enum AS ENUM ('pending', 'processing', 'sent', 'failed', 'cancelled');
  END IF;
END $$;

-- 'processing' is used by the reminder engine's atomic claim step (see checkAndSendReminders)
-- to prevent double-sending if two runs overlap. Add it for databases created before this value existed.
ALTER TYPE status_enum ADD VALUE IF NOT EXISTS 'processing';

-- Create Users Table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number VARCHAR UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Memories Table
CREATE TABLE IF NOT EXISTS public.memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  raw_content TEXT NOT NULL,
  category category_enum DEFAULT 'uncategorized',
  source_channel channel_enum DEFAULT 'web',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ✅ FIX: if memories already exists but lacks standard columns from our project, ensure they are added:
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS raw_content TEXT;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS category category_enum DEFAULT 'uncategorized';
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS source_channel channel_enum DEFAULT 'web';
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ✅ FIX: Handle pre-existing user_id column constraint and type mismatch issues
DO $$
DECLARE
    r RECORD;
BEGIN
    -- 1. Find and drop any existing foreign key constraint on memories(user_id)
    FOR r IN (
        SELECT tc.constraint_name 
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = 'memories'
          AND kcu.column_name = 'user_id'
    ) LOOP
        EXECUTE 'ALTER TABLE public.memories DROP CONSTRAINT ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

-- 2. Make sure user_id is of type UUID
ALTER TABLE public.memories ALTER COLUMN user_id TYPE UUID USING user_id::uuid;

-- 3. Update any orphan user_id values in memories to NULL so the foreign key constraint can be created
UPDATE public.memories SET user_id = NULL WHERE user_id NOT IN (SELECT id FROM public.users);

-- 4. Re-create the foreign key constraint pointing to our public.users table
ALTER TABLE public.memories ADD CONSTRAINT memories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- ✅ FIX: If memories pre-existed with a 'title' column that is NOT NULL, make it nullable
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'memories' AND column_name = 'title') THEN
    ALTER TABLE public.memories ALTER COLUMN title DROP NOT NULL;
  END IF;
END $$;

-- ✅ FIX: Ensure users table has all required columns if it pre-existed
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Create Memory Embeddings Table
CREATE TABLE IF NOT EXISTS public.memory_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID UNIQUE REFERENCES public.memories(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL
);

-- Create Reminders Table
CREATE TABLE IF NOT EXISTS public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  memory_id UUID REFERENCES public.memories(id) ON DELETE CASCADE,
  reminder_text TEXT NOT NULL,
  target_time TIMESTAMPTZ NOT NULL,
  status status_enum DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- No Supabase Auth session exists in this app (users are resolved by phone number, not
-- auth.uid()), so there is no safe per-row condition to grant anon/authenticated. All app
-- access goes through the Express server using the service_role key, which bypasses RLS
-- entirely. Deliberately no GRANTs and no policies for anon/authenticated here: RLS enabled
-- with zero policies denies those roles by default, so a leaked publishable/anon key gets
-- nothing. Do not add "USING (true)" policies for anon/authenticated back in.
REVOKE ALL ON TABLE public.users FROM anon, authenticated;
REVOKE ALL ON TABLE public.memories FROM anon, authenticated;
REVOKE ALL ON TABLE public.memory_embeddings FROM anon, authenticated;
REVOKE ALL ON TABLE public.reminders FROM anon, authenticated;

DROP POLICY IF EXISTS "Allow all actions for anon on users" ON public.users;
DROP POLICY IF EXISTS "Allow all actions for authenticated on users" ON public.users;
DROP POLICY IF EXISTS "Allow all actions for anon on memories" ON public.memories;
DROP POLICY IF EXISTS "Allow all actions for authenticated on memories" ON public.memories;
DROP POLICY IF EXISTS "Allow all actions for anon on memory_embeddings" ON public.memory_embeddings;
DROP POLICY IF EXISTS "Allow all actions for authenticated on memory_embeddings" ON public.memory_embeddings;
DROP POLICY IF EXISTS "Allow all actions for anon on reminders" ON public.reminders;
DROP POLICY IF EXISTS "Allow all actions for authenticated on reminders" ON public.reminders;

-- Create Indexes
CREATE INDEX IF NOT EXISTS memories_user_id_idx ON public.memories(user_id);

-- ✅ Safe now because metadata column is ensured above
CREATE INDEX IF NOT EXISTS memories_metadata_gin_idx ON public.memories USING gin(metadata);

CREATE INDEX IF NOT EXISTS reminders_target_time_status_idx ON public.reminders(target_time, status);

CREATE INDEX IF NOT EXISTS memory_embeddings_hnsw_idx
ON public.memory_embeddings USING hnsw(embedding vector_cosine_ops);

-- Create match_memories RPC function
CREATE OR REPLACE FUNCTION public.match_memories (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  raw_content text,
  category public.category_enum,
  source_channel public.channel_enum,
  metadata jsonb,
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.raw_content,
    m.category,
    m.source_channel,
    m.metadata,
    m.created_at,
    1 - (me.embedding <=> query_embedding) AS similarity
  FROM public.memories m
  JOIN public.memory_embeddings me ON m.id = me.memory_id
  WHERE m.user_id = p_user_id
    AND 1 - (me.embedding <=> query_embedding) > match_threshold
  ORDER BY me.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
-- Add columns for clarification flow
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'complete';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pending_memory_id UUID REFERENCES public.memories(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Memory lifecycle: Archive + Safe-Keep
-- ---------------------------------------------------------------------------

-- 'completed' is set by the WhatsApp "done" reply (handleMarkDone) but was
-- missing from the enum, so that update silently failed (error unchecked) and
-- the bot falsely confirmed the reminder was marked done. Needed for the
-- "fulfilled" detection below to work at all.
ALTER TYPE status_enum ADD VALUE IF NOT EXISTS 'completed';

-- Stamped whenever a reminder reaches a terminal status (sent/completed/failed).
-- Using this instead of target_time avoids a zero-review-window race: a user
-- can reply "done" days after target_time, and target_time alone would put
-- the memory instantly past its 7-day archive window the moment it's marked
-- complete. The archive sweep uses COALESCE(fulfilled_at, target_time) so
-- pre-migration rows still work.
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS archive_retention_days INTEGER NOT NULL DEFAULT 3;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'users' AND constraint_name = 'users_archive_retention_days_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_archive_retention_days_check CHECK (archive_retention_days >= 1);
  END IF;
END $$;

ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS is_safe_keep BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS safe_keep_days INTEGER;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS safe_keep_expires_at TIMESTAMPTZ;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
-- Set on Restore so the very next archive sweep doesn't immediately re-archive
-- an item whose linked reminder is still terminal.
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS archive_snoozed_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS reminders_status_fulfilled_idx ON public.reminders(status, fulfilled_at);
CREATE INDEX IF NOT EXISTS reminders_memory_id_idx ON public.reminders(memory_id);
CREATE INDEX IF NOT EXISTS memories_archived_at_idx ON public.memories(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS memories_safe_keep_expiry_idx ON public.memories(safe_keep_expires_at) WHERE is_safe_keep;
