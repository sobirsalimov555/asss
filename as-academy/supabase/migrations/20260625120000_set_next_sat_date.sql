-- Unify SAT date key and set next Digital SAT to September 12, 2026
UPDATE public.site_settings
SET value = '2026-09-12', updated_at = now()
WHERE key = 'next_sat_date';

INSERT INTO public.site_settings (key, value)
VALUES ('next_sat_date', '2026-09-12')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = now();

-- Migrate legacy admin key if it was used
UPDATE public.site_settings
SET value = '2026-09-12', updated_at = now()
WHERE key = 'sat_date' AND (value IS NULL OR value = '');

DELETE FROM public.site_settings WHERE key = 'sat_date';

-- Leaderboard is a public page; allow anonymous reads via SECURITY DEFINER RPC
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO anon, authenticated;
