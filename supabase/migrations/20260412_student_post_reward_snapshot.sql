ALTER TABLE public.student_posts
ADD COLUMN IF NOT EXISTS awarded_base_reward INTEGER,
ADD COLUMN IF NOT EXISTS awarded_bonus_reward INTEGER,
ADD COLUMN IF NOT EXISTS awarded_bonus_threshold INTEGER;

UPDATE public.student_posts sp
SET
    awarded_base_reward = COALESCE(sp.awarded_base_reward, wm.base_reward),
    awarded_bonus_reward = COALESCE(sp.awarded_bonus_reward, wm.bonus_reward),
    awarded_bonus_threshold = COALESCE(sp.awarded_bonus_threshold, wm.bonus_threshold)
FROM public.writing_missions wm
WHERE wm.id = sp.mission_id;
