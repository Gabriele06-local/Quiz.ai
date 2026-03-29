-- Quiz.ai — quiz salvati + cartelle (SQL Editor Supabase; idempotente dove possibile)

-- ---------------------------------------------------------------------------
-- Tabelle
-- ---------------------------------------------------------------------------
create table if not exists public.saved_quiz_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_quiz_folders_user_idx
  on public.saved_quiz_folders (user_id, name);

comment on table public.saved_quiz_folders is 'Cartelle utente per organizzare i quiz salvati (cloud).';

create table if not exists public.saved_quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  folder_id uuid references public.saved_quiz_folders (id) on delete set null,
  title text not null,
  raw_text text not null,
  question_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_quizzes_user_created_idx
  on public.saved_quizzes (user_id, created_at desc);

create index if not exists saved_quizzes_folder_idx
  on public.saved_quizzes (user_id, folder_id);

comment on table public.saved_quizzes is 'Quiz salvati volontariamente (testo + metadati); opzionalmente in una cartella.';

-- Se la tabella esisteva già senza folder_id:
alter table public.saved_quizzes
  add column if not exists folder_id uuid references public.saved_quiz_folders (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Trigger updated_at (search_path fisso → linter Supabase “mutable search_path” ok)
-- ---------------------------------------------------------------------------
create or replace function public.saved_quizzes_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists saved_quizzes_set_updated_at on public.saved_quizzes;
create trigger saved_quizzes_set_updated_at
  before update on public.saved_quizzes
  for each row
  execute function public.saved_quizzes_touch_updated_at();

create or replace function public.saved_quiz_folders_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists saved_quiz_folders_set_updated_at on public.saved_quiz_folders;
create trigger saved_quiz_folders_set_updated_at
  before update on public.saved_quiz_folders
  for each row
  execute function public.saved_quiz_folders_touch_updated_at();

-- Se compare errore di sintassi su “execute function”, prova:
-- execute procedure public.saved_quizzes_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS cartelle
-- ---------------------------------------------------------------------------
alter table public.saved_quiz_folders enable row level security;

drop policy if exists "saved_quiz_folders_select_own" on public.saved_quiz_folders;
drop policy if exists "saved_quiz_folders_insert_own" on public.saved_quiz_folders;
drop policy if exists "saved_quiz_folders_update_own" on public.saved_quiz_folders;
drop policy if exists "saved_quiz_folders_delete_own" on public.saved_quiz_folders;

create policy "saved_quiz_folders_select_own"
  on public.saved_quiz_folders
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "saved_quiz_folders_insert_own"
  on public.saved_quiz_folders
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "saved_quiz_folders_update_own"
  on public.saved_quiz_folders
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "saved_quiz_folders_delete_own"
  on public.saved_quiz_folders
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RLS quiz
-- ---------------------------------------------------------------------------
alter table public.saved_quizzes enable row level security;

drop policy if exists "saved_quizzes_select_own" on public.saved_quizzes;
drop policy if exists "saved_quizzes_insert_own" on public.saved_quizzes;
drop policy if exists "saved_quizzes_update_own" on public.saved_quizzes;
drop policy if exists "saved_quizzes_delete_own" on public.saved_quizzes;

create policy "saved_quizzes_select_own"
  on public.saved_quizzes
  for select
  to authenticated
  using (auth.uid() = user_id);

-- folder_id deve essere nulla o una cartella di proprietà dello stesso utente (no riferimenti incrociati)
create policy "saved_quizzes_insert_own"
  on public.saved_quizzes
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      folder_id is null
      or exists (
        select 1
        from public.saved_quiz_folders f
        where f.id = folder_id
          and f.user_id = auth.uid()
      )
    )
  );

create policy "saved_quizzes_update_own"
  on public.saved_quizzes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      folder_id is null
      or exists (
        select 1
        from public.saved_quiz_folders f
        where f.id = folder_id
          and f.user_id = auth.uid()
      )
    )
  );

create policy "saved_quizzes_delete_own"
  on public.saved_quizzes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Tentativi quiz (statistiche per cartella)
-- ---------------------------------------------------------------------------
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  folder_id uuid references public.saved_quiz_folders (id) on delete set null,
  saved_quiz_id uuid references public.saved_quizzes (id) on delete set null,
  correct_count integer not null,
  total_count integer not null check (total_count > 0),
  review_mode boolean not null default false,
  exam_mode boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists quiz_attempts_user_created_idx
  on public.quiz_attempts (user_id, created_at desc);

create index if not exists quiz_attempts_user_folder_idx
  on public.quiz_attempts (user_id, folder_id);

comment on table public.quiz_attempts is 'Storico tentativi per statistiche; collegamento opzionale a cartella e quiz salvato.';

alter table public.quiz_attempts enable row level security;

drop policy if exists "quiz_attempts_select_own" on public.quiz_attempts;
drop policy if exists "quiz_attempts_insert_own" on public.quiz_attempts;

create policy "quiz_attempts_select_own"
  on public.quiz_attempts
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "quiz_attempts_insert_own"
  on public.quiz_attempts
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      folder_id is null
      or exists (
        select 1
        from public.saved_quiz_folders f
        where f.id = folder_id
          and f.user_id = auth.uid()
      )
    )
    and (
      saved_quiz_id is null
      or exists (
        select 1
        from public.saved_quizzes s
        where s.id = saved_quiz_id
          and s.user_id = auth.uid()
      )
    )
  );
