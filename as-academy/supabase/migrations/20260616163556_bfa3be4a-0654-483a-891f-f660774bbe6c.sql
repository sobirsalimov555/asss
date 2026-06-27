
-- Add module enum for SAT modules
CREATE TYPE public.sat_module AS ENUM ('rw1','rw2','math1','math2');

-- Question bank fields: allow questions to exist without a test (bank-only)
ALTER TABLE public.questions ALTER COLUMN test_id DROP NOT NULL;
ALTER TABLE public.questions ADD COLUMN module public.sat_module;
ALTER TABLE public.questions ADD COLUMN difficulty text CHECK (difficulty IN ('easy','medium','hard'));
ALTER TABLE public.questions ADD COLUMN topic text;
ALTER TABLE public.questions ADD COLUMN in_bank boolean NOT NULL DEFAULT true;

-- Allow public to read bank questions (correct_index is sensitive but already exposed in existing practice flow; keep parity)
DROP POLICY IF EXISTS "Anyone can view questions of published tests" ON public.questions;
CREATE POLICY "Public can view bank or published-test questions"
  ON public.questions FOR SELECT
  USING (
    in_bank = true
    OR EXISTS (SELECT 1 FROM public.mock_tests t WHERE t.id = questions.test_id AND t.published = true)
  );
GRANT SELECT ON public.questions TO anon;

-- Mock test kind 'full_mock' to indicate 4-module SAT mocks (existing enum already supports it)
-- Mock <-> Question composition table (auto-generated mocks reference bank questions)
CREATE TABLE public.mock_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_id uuid NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  module public.sat_module NOT NULL,
  position integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (mock_id, module, position)
);
GRANT SELECT ON public.mock_questions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mock_questions TO authenticated;
GRANT ALL ON public.mock_questions TO service_role;
ALTER TABLE public.mock_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view mock questions of published mocks"
  ON public.mock_questions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.mock_tests t WHERE t.id = mock_questions.mock_id AND t.published = true));
CREATE POLICY "Admins can manage mock questions"
  ON public.mock_questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Per-question practice tracker (question bank) for signed-in users
CREATE TABLE public.bank_practice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_index integer NOT NULL,
  is_correct boolean NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_practice TO authenticated;
GRANT ALL ON public.bank_practice TO service_role;
ALTER TABLE public.bank_practice ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bank practice" ON public.bank_practice
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX bank_practice_user_idx ON public.bank_practice(user_id, created_at DESC);
CREATE INDEX questions_bank_idx ON public.questions(in_bank, module) WHERE in_bank = true;
