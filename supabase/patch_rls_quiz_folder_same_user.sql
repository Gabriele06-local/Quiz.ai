-- Patch sicurezza (SQL Editor): sostituisce insert/update su saved_quizzes
-- così folder_id non può puntare a cartelle di altri utenti.
-- Esegui se avevi già applicato schema.sql o migration_from_v1.sql senza questo vincolo.

drop policy if exists "saved_quizzes_insert_own" on public.saved_quizzes;
drop policy if exists "saved_quizzes_update_own" on public.saved_quizzes;

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
