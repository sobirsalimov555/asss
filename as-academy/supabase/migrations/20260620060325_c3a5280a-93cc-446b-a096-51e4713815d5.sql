
-- Drop duplicate overlapping policy on questions
DROP POLICY IF EXISTS "Public reads bank or published-test questions" ON public.questions;

-- Revoke unused table-level write privileges from anon (column-level SELECT remains)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.questions FROM anon;

-- Restrict leaderboard SECURITY DEFINER function to signed-in users
REVOKE EXECUTE ON FUNCTION public.get_leaderboard() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO authenticated;
