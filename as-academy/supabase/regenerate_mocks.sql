-- Regenerate all full mocks with no repeated questions across mocks
-- Run in Supabase Dashboard → SQL Editor
--
-- Distribution: rw1=108, rw2=108, math1=78, math2=78
-- Mocks possible: 3 (98 q each = 294 total, 78 remaining)

-- ── 1. Clear existing mock_questions for full mocks ────────────────────
delete from mock_questions
where mock_id in (
  select id from mock_tests where kind = 'full_mock'
);

-- ── 2. Keep existing mock_tests records; create a 3rd mock ─────────────
insert into mock_tests (id, title, description, kind, duration_minutes, published)
select gen_random_uuid(), 'Full Mock 3',
  'Auto-generated full mock from the practice bank.',
  'full_mock', 134, true
where not exists (select 1 from mock_tests where title = 'Full Mock 3');

-- ── 3. Assign shuffled non-overlapping questions to mocks ──────────────
do $$
declare
  mock_rec record;
  mod_name text;
  per_mock int;
  question_ids uuid[];
  idx int;
begin
  for mock_rec in
    select id, row_number() over (order by title) as mock_num
    from mock_tests where kind = 'full_mock' order by title
  loop
    foreach mod_name in array array['rw1', 'rw2', 'math1', 'math2']
    loop
      per_mock := case mod_name
        when 'rw1' then 27 when 'rw2' then 27
        when 'math1' then 22 when 'math2' then 22
      end;

      -- Shuffle remaining (unused) questions for this module
      select array_agg(id order by random())
        into question_ids
        from questions
        where module = mod_name
          and in_bank = true
          and id not in (
            select question_id from mock_questions
          );

      raise notice 'Mock % %: % available, need %',
        mock_rec.mock_num, mod_name,
        coalesce(array_length(question_ids, 1), 0), per_mock;

      idx := 1;
      for i in 1 .. per_mock loop
        exit when idx > array_length(question_ids, 1);
        insert into mock_questions (mock_id, question_id, module, position)
        values (mock_rec.id, question_ids[idx], mod_name, i);
        idx := idx + 1;
      end loop;
    end loop;
  end loop;
end $$;

-- ── 4. Verify ──────────────────────────────────────────────────────────
select m.title,
  (select count(*) from mock_questions mq where mq.mock_id = m.id) as total_qs,
  (select count(*) from mock_questions mq where mq.mock_id = m.id and mq.module = 'rw1') as rw1,
  (select count(*) from mock_questions mq where mq.mock_id = m.id and mq.module = 'rw2') as rw2,
  (select count(*) from mock_questions mq where mq.mock_id = m.id and mq.module = 'math1') as math1,
  (select count(*) from mock_questions mq where mq.mock_id = m.id and mq.module = 'math2') as math2
from mock_tests m where kind = 'full_mock'
order by m.title;

-- Check for question reuse across mocks
select 'Question reuse across mocks: ' ||
  case when count(*) > 0 then count(*)::text || ' questions are used in multiple mocks!'
  else 'NONE — all questions are unique per mock.'
  end as verification
from (
  select question_id, count(distinct mock_id) as mock_count
  from mock_questions
  group by question_id
  having count(distinct mock_id) > 1
) dupes;

-- Remaining questions per module
select module, count(*) as remaining
from questions
where in_bank = true
  and id not in (select question_id from mock_questions)
group by module
order by module;
