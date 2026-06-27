
-- Subject enum + column
CREATE TYPE public.question_subject AS ENUM ('math','reading','grammar');
ALTER TABLE public.questions ADD COLUMN subject public.question_subject;

UPDATE public.questions
SET subject = CASE
  WHEN module IN ('math1','math2') THEN 'math'::public.question_subject
  WHEN module IN ('rw1','rw2') THEN 'reading'::public.question_subject
  ELSE NULL
END
WHERE subject IS NULL;

-- SAT scaled score on attempts
ALTER TABLE public.attempts ADD COLUMN sat_score integer;

-- Admin-managed site settings (next SAT date, etc.)
CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read site settings"
  ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "Admins manage site settings"
  ON public.site_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.site_settings (key, value) VALUES ('next_sat_date', NULL)
  ON CONFLICT (key) DO NOTHING;
