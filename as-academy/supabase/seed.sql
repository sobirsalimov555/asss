-- AS Academy — Seed script
-- Run this in Supabase Dashboard → SQL Editor after all migrations are applied.
-- 1. Fixes anon SELECT grant to include image_url
-- 2. Creates the question_images storage bucket with RLS
-- 3. Generates 2 full mocks from existing bank questions
-- 4. Seeds the admin role

-- ── 1. Fix anon SELECT grant to include image_url ──────────────────────
REVOKE SELECT ON public.questions FROM anon;
GRANT SELECT (id, test_id, position, prompt, choices, points, created_at, module, difficulty, topic, in_bank, subject, image_url)
  ON public.questions TO anon;

-- ── 2. Create question_images storage bucket ──────────────────────────
INSERT INTO storage.buckets (id, name, public, avif_autodetection)
VALUES ('question_images', 'question_images', true, false)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to question_images
CREATE POLICY "Public Read question_images" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'question_images');

-- Allow authenticated users (admins) to upload
CREATE POLICY "Authenticated Upload question_images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'question_images');

CREATE POLICY "Authenticated Update question_images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'question_images');

CREATE POLICY "Authenticated Delete question_images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'question_images');

-- ── 3. Admin setup (idempotent) ─────────────────────────────────────────
INSERT INTO public.user_roles (user_id, role)
VALUES ('1b81c8b4-5420-4da5-96f8-b5f85c4ba602', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- ── 4. Generate full mocks ─────────────────────────────────────────────
do $$
declare
  mock_id_1 uuid;
  mock_id_2 uuid;
  rw1_count int;
  rw2_count int;
  math1_count int;
  math2_count int;
begin
  -- Check available questions per module
  select count(*) into rw1_count from questions where module = 'rw1' and in_bank = true;
  select count(*) into rw2_count from questions where module = 'rw2' and in_bank = true;
  select count(*) into math1_count from questions where module = 'math1' and in_bank = true;
  select count(*) into math2_count from questions where module = 'math2' and in_bank = true;

  raise notice 'Available questions: rw1=%, rw2=%, math1=%, math2=%', rw1_count, rw2_count, math1_count, math2_count;

  -- Mock 1
  insert into mock_tests (id, title, description, kind, duration_minutes, published)
  values (gen_random_uuid(), 'Full Mock 1',
    'Auto-generated full mock with 27 RW + 22 Math questions from the practice bank.',
    'full_mock', 134, true)
  returning id into mock_id_1;

  insert into mock_questions (mock_id, question_id, module, position)
  select mock_id_1, id, 'rw1', row_number() over (order by random())::int
  from questions where module = 'rw1' and in_bank = true order by random() limit 27;

  insert into mock_questions (mock_id, question_id, module, position)
  select mock_id_1, id, 'rw2', row_number() over (order by random())::int
  from questions where module = 'rw2' and in_bank = true order by random() limit least(27, rw2_count);

  insert into mock_questions (mock_id, question_id, module, position)
  select mock_id_1, id, 'math1', row_number() over (order by random())::int
  from questions where module = 'math1' and in_bank = true order by random() limit 22;

  insert into mock_questions (mock_id, question_id, module, position)
  select mock_id_1, id, 'math2', row_number() over (order by random())::int
  from questions where module = 'math2' and in_bank = true order by random() limit 22;

  raise notice 'Full Mock 1 created: %', mock_id_1;

  -- Mock 2 (if enough questions remain — reuse is fine, questions aren't consumed)
  if rw1_count >= 27 and rw2_count >= 27 and math1_count >= 22 and math2_count >= 22 then
    insert into mock_tests (id, title, description, kind, duration_minutes, published)
    values (gen_random_uuid(), 'Full Mock 2',
      'Auto-generated full mock with 27 RW + 22 Math questions from the practice bank.',
      'full_mock', 134, true)
    returning id into mock_id_2;

    insert into mock_questions (mock_id, question_id, module, position)
    select mock_id_2, id, 'rw1', row_number() over (order by random())::int
    from questions where module = 'rw1' and in_bank = true order by random() limit 27;

    insert into mock_questions (mock_id, question_id, module, position)
    select mock_id_2, id, 'rw2', row_number() over (order by random())::int
    from questions where module = 'rw2' and in_bank = true order by random() limit 27;

    insert into mock_questions (mock_id, question_id, module, position)
    select mock_id_2, id, 'math1', row_number() over (order by random())::int
    from questions where module = 'math1' and in_bank = true order by random() limit 22;

    insert into mock_questions (mock_id, question_id, module, position)
    select mock_id_2, id, 'math2', row_number() over (order by random())::int
    from questions where module = 'math2' and in_bank = true order by random() limit 22;

    raise notice 'Full Mock 2 created: %', mock_id_2;
  end if;
end $$;
