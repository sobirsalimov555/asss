-- Add image_url to anon SELECT grant on questions
REVOKE SELECT ON public.questions FROM anon;
GRANT SELECT (
  id, test_id, position, prompt, choices, points, created_at,
  module, difficulty, topic, in_bank, subject, image_url
) ON public.questions TO anon;

-- Add image_url to the setup.sql grant as well (already done there)
