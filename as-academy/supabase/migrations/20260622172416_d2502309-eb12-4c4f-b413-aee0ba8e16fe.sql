
-- Tighten get_leaderboard execute privileges (defensive)
REVOKE EXECUTE ON FUNCTION public.get_leaderboard() FROM PUBLIC, anon;

-- Defensive: ensure anon has no privileges on questions
REVOKE ALL ON public.questions FROM anon;

-- Add explicit RESTRICTIVE policy on user_roles to block self-escalation:
-- writes require admin, regardless of any future permissive policies.
CREATE POLICY "Only admins may write user_roles"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
