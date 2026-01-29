-- Add status column to post_comments
ALTER TABLE public.post_comments 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';

-- Optional: Add status to student_posts if likely needed later, but focusing on comments for now as requested.
