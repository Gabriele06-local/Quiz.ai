-- Esegui SOLO se avevi già applicato la vecchia schema.sql (solo saved_quizzes, senza cartelle).
-- In SQL Editor: incolla e Run.

-- 1) search_path sul trigger già esistente
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

-- 2) Cartelle + colonna folder_id
create table if not exists public.saved_quiz_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_quiz_folders_user_idx
  on public.saved_quiz_folders (user_id, name);

alter table public.saved_quizzes
  add column if not exists folder_id uuid references public.saved_quiz_folders (id) on delete set null;

create index if not exists saved_quizzes_folder_idx
  on public.saved_quizzes (user_id, folder_id);

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

alter table public.saved_quiz_folders enable row level security;

drop policy if exists "saved_quiz_folders_select_own" on public.saved_quiz_folders;
drop policy if exists "saved_quiz_folders_insert_own" on public.saved_quiz_folders;
drop policy if exists "saved_quiz_folders_update_own" on public.saved_quiz_folders;
drop policy if exists "saved_quiz_folders_delete_own" on public.saved_quiz_folders;

create policy "saved_quiz_folders_select_own"
  on public.saved_quiz_folders for select to authenticated
  using (auth.uid() = user_id);

create policy "saved_quiz_folders_insert_own"
  on public.saved_quiz_folders for insert to authenticated
  with check (auth.uid() = user_id);

create policy "saved_quiz_folders_update_own"
  on public.saved_quiz_folders for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "saved_quiz_folders_delete_own"
  on public.saved_quiz_folders for delete to authenticated
  using (auth.uid() = user_id);
