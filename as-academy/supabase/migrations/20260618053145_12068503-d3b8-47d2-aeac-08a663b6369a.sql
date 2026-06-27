
-- 1. Profiles: restrict reads to the owner
DROP POLICY IF EXISTS "Profiles viewable by everyone" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- 2. Attempts: restrict to owner/admin; leaderboard goes via SECURITY DEFINER RPC
DROP POLICY IF EXISTS "Attempts visible to everyone for leaderboard" ON public.attempts;
CREATE POLICY "Users view own attempts" ON public.attempts
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE(user_id uuid, display_name text, avg_sat integer, attempts integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

-- 3. Questions: column-level grant — hide correct_index & explanation from anon
REVOKE SELECT ON public.questions FROM anon;
GRANT SELECT (id, test_id, position, prompt, choices, points, created_at, module, difficulty, topic, in_bank, subject)
  ON public.questions TO anon;
GRANT SELECT ON public.questions TO authenticated;

-- 4. user_roles: restrictive policies preventing non-admin writes (defense in depth)
CREATE POLICY "Only admins insert user_roles" ON public.user_roles
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Only admins update user_roles" ON public.user_roles
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Only admins delete user_roles" ON public.user_roles
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Permissive policy so admins can actually insert/update/delete
CREATE POLICY "Admins manage user_roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
