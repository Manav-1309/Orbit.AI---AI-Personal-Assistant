CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  email text UNIQUE,
  full_name text,
  phone text UNIQUE,
  name text  NOT NULL DEFAULT '',
  avatar_url text,
  auth_provider text NOT NULL DEFAULT 'phone',
  last_login_at timestamptz,
  integrations jsonb NOT NULL DEFAULT '{}',
  dashboard_brief jsonb
);

CREATE INDEX IF NOT EXISTS users_phone_idx ON public.users (phone);
CREATE INDEX IF NOT EXISTS users_email_idx ON public.users (email);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO anon, authenticated;

CREATE POLICY IF NOT EXISTS "users_select" ON public.users FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "users_insert" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "users_update" ON public.users FOR UPDATE USING (true);

CREATE TABLE IF NOT EXISTS public.briefing_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  apps jsonb NOT NULL DEFAULT '[]',
  categories jsonb NOT NULL DEFAULT '[]',
  scheduled_time text NOT NULL,
  frequency text NOT NULL DEFAULT 'daily',
  priority_level text NOT NULL DEFAULT 'normal',
  next_run_at timestamptz
);

CREATE INDEX IF NOT EXISTS briefing_schedules_user_idx
  ON public.briefing_schedules (user_id);
CREATE INDEX IF NOT EXISTS briefing_schedules_next_run_idx
  ON public.briefing_schedules (next_run_at);

ALTER TABLE public.briefing_schedules ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.briefing_schedules TO anon, authenticated;

CREATE POLICY IF NOT EXISTS "schedules_select" ON public.briefing_schedules FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "schedules_insert" ON public.briefing_schedules FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "schedules_update" ON public.briefing_schedules FOR UPDATE USING (true);
CREATE POLICY IF NOT EXISTS "schedules_delete" ON public.briefing_schedules FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS public.generated_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES public.briefing_schedules(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  stats jsonb NOT NULL DEFAULT '{}',
  data jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS generated_briefings_user_created_idx
  ON public.generated_briefings (user_id, created_at DESC);

ALTER TABLE public.generated_briefings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_briefings TO anon, authenticated;

CREATE POLICY IF NOT EXISTS "briefings_select" ON public.generated_briefings FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "briefings_insert" ON public.generated_briefings FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "briefings_update" ON public.generated_briefings FOR UPDATE USING (true);
CREATE POLICY IF NOT EXISTS "briefings_delete" ON public.generated_briefings FOR DELETE USING (true);

create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  apps text[] not null default '{}',
  condition text not null,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  notification_method text not null default 'in_app',
  frequency text not null default 'real_time',
  action text not null default 'notify',
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  next_check_at timestamptz not null default now(),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  rule_id uuid references public.alert_rules(id) on delete set null,
  dedupe_key text,
  title text not null,
  description text not null default '',
  full_details text not null default '',
  source_app text not null,
  app_logo text,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'triggered' check (status in ('active', 'triggered', 'resolved', 'snoozed')),
  condition text not null default '',
  requires_response boolean not null default false,
  suggested_action text not null default '',
  last_action text,
  snoozed_until timestamptz,
  triggered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists alerts_dedupe_key_idx
  on public.alerts (dedupe_key)
  where dedupe_key is not null;

create index if not exists alert_rules_user_status_next_check_idx
  on public.alert_rules (user_id, status, next_check_at);

create index if not exists alerts_user_created_idx
  on public.alerts (user_id, created_at desc);

alter table public.alert_rules enable row level security;
alter table public.alerts enable row level security;

grant select, insert, update, delete on public.alert_rules to authenticated;
grant select, insert, update on public.alerts to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'alert_rules' and policyname = 'Users can read own alert rules'
  ) then
    create policy "Users can read own al  ert rules"
      on public.alert_rules for select to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'alert_rules' and policyname = 'Users can insert own alert rules'
  ) then
    create policy "Users can insert own alert rules"
      on public.alert_rules for insert to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'alert_rules' and policyname = 'Users can update own alert rules'
  ) then
    create policy "Users can update own alert rules"
      on public.alert_rules for update to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'alerts' and policyname = 'Users can read own alerts'
  ) then
    create policy "Users can read own alerts"
      on public.alerts for select to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'alerts' and policyname = 'Users can insert own alerts'
  ) then
    create policy "Users can insert own alerts"
      on public.alerts for insert to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'alerts' and policyname = 'Users can update own alerts'
  ) then
    create policy "Users can update own alerts"
      on public.alerts for update to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
