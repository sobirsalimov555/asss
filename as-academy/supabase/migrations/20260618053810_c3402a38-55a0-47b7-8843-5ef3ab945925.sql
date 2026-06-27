
-- Drop all policies that reference has_role / admin
DROP POLICY IF EXISTS "Admins manage site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins manage tests" ON public.mock_tests;
DROP POLICY IF EXISTS "Anyone reads published tests" ON public.mock_tests;
DROP POLICY IF EXISTS "Admins manage questions" ON public.questions;
DROP POLICY IF EXISTS "Anyone reads questions of published tests" ON public.questions;
DROP POLICY IF EXISTS "Authenticated view bank/published questions" ON public.questions;
DROP POLICY IF EXISTS "Admins manage resources" ON public.study_resources;
DROP POLICY IF EXISTS "Anyone reads published resources" ON public.study_resources;
DROP POLICY IF EXISTS "Admins manage attempts" ON public.attempts;
DROP POLICY IF EXISTS "Users view own attempts" ON public.attempts;
DROP POLICY IF EXISTS "Users view own answers" ON public.attempt_answers;
DROP POLICY IF EXISTS "Admins can manage mock questions" ON public.mock_questions;
DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins insert user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins update user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins delete user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins manage user_roles" ON public.user_roles;

-- Recreate simple public/owner policies (no admin)
CREATE POLICY "Anyone reads published tests" ON public.mock_tests
  FOR SELECT USING (published);

CREATE POLICY "Public reads bank or published-test questions" ON public.questions
  FOR SELECT USING (
    in_bank = true
    OR EXISTS (SELECT 1 FROM public.mock_tests t WHERE t.id = questions.test_id AND t.published)
  );

CREATE POLICY "Anyone reads published resources" ON public.study_resources
  FOR SELECT USING (published);

CREATE POLICY "Users view own attempts" ON public.attempts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users view own answers" ON public.attempt_answers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = attempt_answers.attempt_id AND a.user_id = auth.uid())
  );

-- Rewrite handle_new_user without role insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$;

-- Drop role-related objects
DROP TABLE IF EXISTS public.user_roles;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP TYPE IF EXISTS public.app_role;
