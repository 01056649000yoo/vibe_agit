DROP POLICY IF EXISTS "Feedback_Reports_Update_V18" ON public.feedback_reports;

CREATE POLICY "Feedback_Reports_Update_V19"
ON public.feedback_reports
FOR UPDATE
TO authenticated
USING (
  (public.auth_user_role() = 'ADMIN')
  OR (teacher_id = auth.uid())
)
WITH CHECK (
  (public.auth_user_role() = 'ADMIN')
  OR (teacher_id = auth.uid())
);
