-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.quiz_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  folder_id uuid,
  saved_quiz_id uuid,
  correct_count integer NOT NULL,
  total_count integer NOT NULL CHECK (total_count > 0),
  review_mode boolean NOT NULL DEFAULT false,
  exam_mode boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT quiz_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT quiz_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT quiz_attempts_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.saved_quiz_folders(id),
  CONSTRAINT quiz_attempts_saved_quiz_id_fkey FOREIGN KEY (saved_quiz_id) REFERENCES public.saved_quizzes(id)
);
CREATE TABLE public.saved_quiz_folders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT saved_quiz_folders_pkey PRIMARY KEY (id),
  CONSTRAINT saved_quiz_folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.saved_quizzes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  raw_text text NOT NULL,
  question_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  folder_id uuid,
  CONSTRAINT saved_quizzes_pkey PRIMARY KEY (id),
  CONSTRAINT saved_quizzes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT saved_quizzes_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.saved_quiz_folders(id)
);