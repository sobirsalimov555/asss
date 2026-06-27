ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS image_url TEXT;

GRANT INSERT (image_url), UPDATE (image_url) ON public.questions TO authenticated;
