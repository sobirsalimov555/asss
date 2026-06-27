-- AS Academy — full schema for a fresh Supabase project
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- After running, make yourself admin (replace YOUR-USER-UUID):
--   INSERT INTO public.user_roles (user_id, role) VALUES ('YOUR-USER-UUID', 'admin');

-- ── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.test_kind AS ENUM ('full_mock', 'topic_practice', 'quiz');
CREATE TYPE public.sat_module AS ENUM ('rw1', 'rw2', 'math1', 'math2');
CREATE TYPE public.question_subject AS ENUM ('math', 'reading', 'grammar');

-- ── Helpers ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ── Profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── User roles ───────────────────────────────────────────────────────────────
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admins may write user_roles" ON public.user_roles
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── Mock tests ───────────────────────────────────────────────────────────────
CREATE TABLE public.mock_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  kind public.test_kind NOT NULL DEFAULT 'quiz',
  topic TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mock_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads published tests" ON public.mock_tests FOR SELECT USING (published);
CREATE POLICY "Admins manage mock_tests" ON public.mock_tests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER mock_tests_touch BEFORE UPDATE ON public.mock_tests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Questions (bank + topic tests) ─────────────────────────────────────────
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES public.mock_tests ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  prompt TEXT NOT NULL,
  choices JSONB NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation TEXT,
  points INTEGER NOT NULL DEFAULT 1,
  module public.sat_module,
  subject public.question_subject,
  topic TEXT,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  in_bank BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX questions_bank_idx ON public.questions (in_bank, module) WHERE in_bank = true;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads bank or published-test questions" ON public.questions
  FOR SELECT USING (
    in_bank = true
    OR EXISTS (SELECT 1 FROM public.mock_tests t WHERE t.id = questions.test_id AND t.published)
  );
CREATE POLICY "Admins manage questions" ON public.questions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── Mock ↔ question junction (full mocks) ────────────────────────────────────
CREATE TABLE public.mock_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_id UUID NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  module public.sat_module NOT NULL,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mock_id, module, position)
);
ALTER TABLE public.mock_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view mock questions of published mocks" ON public.mock_questions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.mock_tests t WHERE t.id = mock_questions.mock_id AND t.published)
  );
CREATE POLICY "Admins manage mock_questions" ON public.mock_questions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── Study resources ──────────────────────────────────────────────────────────
CREATE TABLE public.study_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  category TEXT,
  published BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.study_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads published resources" ON public.study_resources FOR SELECT USING (published);
CREATE POLICY "Admins manage study_resources" ON public.study_resources
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── Attempts & answers ───────────────────────────────────────────────────────
CREATE TABLE public.attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES public.mock_tests ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  max_score INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  sat_score INTEGER,
  time_taken_seconds INTEGER,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own attempts" ON public.attempts
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own attempts" ON public.attempts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.attempt_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.attempts ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions ON DELETE CASCADE,
  selected_index INTEGER,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.attempt_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own answers" ON public.attempt_answers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = attempt_answers.attempt_id AND a.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Users insert own answers" ON public.attempt_answers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = attempt_answers.attempt_id AND a.user_id = auth.uid())
  );

-- ── Practice bank progress ───────────────────────────────────────────────────
CREATE TABLE public.bank_practice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_index INTEGER NOT NULL,
  is_correct BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bank_practice_user_idx ON public.bank_practice (user_id, created_at DESC);
ALTER TABLE public.bank_practice ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bank practice" ON public.bank_practice
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Site settings (SAT countdown) ────────────────────────────────────────────
CREATE TABLE public.site_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read site settings" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "Admins manage site_settings" ON public.site_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.site_settings (key, value)
VALUES ('next_sat_date', '2026-09-12')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ── Leaderboard RPC ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE(user_id uuid, display_name text, avg_sat integer, attempts integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.user_id,
         COALESCE(p.display_name, 'Anonymous') AS display_name,
         ROUND(AVG(a.sat_score))::int AS avg_sat,
         COUNT(*)::int AS attempts
  FROM public.attempts a
  JOIN public.mock_tests t ON t.id = a.test_id
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE a.sat_score IS NOT NULL AND t.kind = 'full_mock'
  GROUP BY a.user_id, p.display_name
  ORDER BY avg_sat DESC, attempts DESC
  LIMIT 100;
$$;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO anon, authenticated;

-- ── Auto-create profile on signup ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Grants ───────────────────────────────────────────────────────────────────
GRANT SELECT ON public.profiles TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

GRANT SELECT ON public.mock_tests TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.mock_tests TO authenticated;
GRANT ALL ON public.mock_tests TO service_role;

GRANT SELECT ON public.questions TO authenticated;
GRANT SELECT (id, test_id, position, prompt, choices, points, created_at, module, difficulty, topic, in_bank, subject)
  ON public.questions TO anon;
GRANT INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT ALL ON public.questions TO service_role;

GRANT SELECT ON public.mock_questions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.mock_questions TO authenticated;
GRANT ALL ON public.mock_questions TO service_role;

GRANT SELECT ON public.study_resources TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.study_resources TO authenticated;
GRANT ALL ON public.study_resources TO service_role;

GRANT SELECT, INSERT ON public.attempts TO authenticated;
GRANT ALL ON public.attempts TO service_role;

GRANT SELECT, INSERT ON public.attempt_answers TO authenticated;
GRANT ALL ON public.attempt_answers TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_practice TO authenticated;
GRANT ALL ON public.bank_practice TO service_role;

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
