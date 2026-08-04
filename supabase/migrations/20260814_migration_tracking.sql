-- ==========================================================================
-- 마이그레이션 적용 기록
--
-- 왜 필요한가:
--   이 저장소는 마이그레이션을 손으로 적용하고, Claude·GPT 등 여러 모델이 번갈아 작업한다.
--   지금까지는 "적용했는지"를 알려면 레포의 함수·인덱스 정의를 실물과 전수 대조해야 했다
--   (2026-07-30 WORKLOG 참고). 인수인계마다 반복되는 일이고, "했다고 생각했는데 안 한" 실수가
--   나기 쉬운 구조다. 예방접종 수첩처럼 무엇을 언제 적용했는지 여기에 적는다.
--
-- 쓰는 법:
--   npm run migrate:status  — 아직 적용 안 된 파일 보기
--   npm run migrate         — 안 된 것만 순서대로 적용하고 기록
--
-- checksum:
--   적용 당시 파일 내용의 sha256. 이미 적용된 파일이 나중에 수정되면 스크립트가 알려 준다.
--   (수정된 내용은 자동으로 다시 적용되지 않는다 — 사람이 판단할 일이다.)
-- ==========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.applied_migrations (
    filename TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- 누가/무엇이 적용했는지. 여러 모델이 번갈아 작업하므로 남겨 둔다.
    applied_by TEXT NOT NULL DEFAULT 'unknown'
);

COMMENT ON TABLE public.applied_migrations IS
    '적용된 마이그레이션 파일 기록. scripts/migrate.mjs 가 읽고 쓴다.';

-- 운영 데이터가 아니라 운영 도구용 표다. 학생·교사 클라이언트는 볼 이유가 없다.
ALTER TABLE public.applied_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.applied_migrations FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- 기존 기록 채우기
--
-- 이 표가 생기기 전에 이미 적용된 파일들이다. 2026-07-30 WORKLOG 에
-- "운영 DB 미적용 마이그레이션 0건"을 전수 대조로 확인한 기록이 있고,
-- 그 이후 추가된 것도 적용을 마쳤다. 그래서 이 시점의 파일 전부를 적용됨으로 기록한다.
-- 이미 있는 행은 건드리지 않는다(두 번 돌려도 안전).
-- --------------------------------------------------------------------------
INSERT INTO public.applied_migrations (filename, checksum, applied_by) VALUES
    ('20260328_add_max_chars_to_missions.sql', '55d226067ae24c836cde309e32a780622061537db433aab567173c29c3891d3f', 'backfill-2026-08-04'),
    ('20260328_api_policy_updates.sql', '79d42515ace4534b50c86cb9336969c5def3afb93332a6f2c2deecbe95965171', 'backfill-2026-08-04'),
    ('20260328_consolidated_rls_v18.sql', 'e42709b548f4852c0e863e31cef6d9cd04fa31b0fea672a979ec6d289d8b9e66', 'backfill-2026-08-04'),
    ('20260329_admin_teacher_api_mode_rpc.sql', '827985f47c6dd6c42dcf364ac9a490e8ce0b5e6a46b36717d4f2f0e09ed6cf65', 'backfill-2026-08-04'),
    ('20260329_admin_teacher_approval_rpc.sql', 'f4c17ee75f78b532d4357a38cc28de0b06727b7f3359151880b387dcc3cdee45', 'backfill-2026-08-04'),
    ('20260329_admin_teacher_force_withdrawal_rpc.sql', '590bedeb525b57f935f431d587bf777441e996f07af920ac7c6b132bb06fe0fd', 'backfill-2026-08-04'),
    ('20260330_student_login_final.sql', '5c31faf74693c0f02eb20fd10e2ec9a76dfd9b4a752179a4475e1a8e1c520a9e', 'backfill-2026-08-04'),
    ('20260330_student_login_takeover.sql', '82d2d38f192afea0715b4f58b3de0ebcbec62d28ae886c36081e06add82392cd', 'backfill-2026-08-04'),
    ('20260330_teacher_edit_student_post.sql', 'b5d6351f6bfcd18cf956f7b068926f050f0d58e12301a4355ccb44d8756b0876', 'backfill-2026-08-04'),
    ('20260401_student_dashboard_snapshot_rpc.sql', 'c019a557a8fda191bda691b05fa8ea8d1fefa5696b888aba49b7611b231a3513', 'backfill-2026-08-04'),
    ('20260401_student_hideout_classmates_rpc.sql', '57e70b669b2db50459f55b3074430022b4b42e926f5703e0497b383e8424a37e', 'backfill-2026-08-04'),
    ('20260412_student_post_reward_snapshot.sql', '719d75f3dd7acb4435c61241c43f046ac538e7f950456bd074b62e9e9aa7c085', 'backfill-2026-08-04'),
    ('20260416_admin_feedback_update_policy.sql', '36f5e79d7230f6393faa92c4ec8454bf6f6632b77b465dde3ac6298ef583804c', 'backfill-2026-08-04'),
    ('20260530_student_posts_updated_at.sql', 'be2be607bcaacb17c6c61da025ef65e1eb5a2f7ac3fefb50a87163b159c7cc6f', 'backfill-2026-08-04'),
    ('20260608_default_api_mode_system.sql', '3e325a44b5444fc81e885dbb06f84d8a8a63efc91b1e8abfd28f7010053f2230', 'backfill-2026-08-04'),
    ('20260726_add_enabled_modules.sql', 'a1f44d1340e81b894a169d5f7947704bff4aa41b7598fb8457e0157557b457c3', 'backfill-2026-08-04'),
    ('20260726_add_writing_input_templates.sql', '9dd7173eed26256dafa9529f466dee9649821d4bfa75ebfed157aec03c64ae37', 'backfill-2026-08-04'),
    ('20260726_fix_student_select_class_scope.sql', 'd1f7ac472c08c09cb6dc037ab7a9b1a1545356ce11697b05925bb19ea721f65d', 'backfill-2026-08-04'),
    ('20260727_admin_function_privilege_hardening.sql', '0438d10fc6a2ff9f3a4de3a3a67dbfd5615b18cc48c95e551949598b7c134ec8', 'backfill-2026-08-04'),
    ('20260727_admin_usage_dashboard_rpc.sql', '1bac2da30f2525ab8dad9737cb0afbde3d561525966de063f99a5b89063b7aa2', 'backfill-2026-08-04'),
    ('20260727_anon_readable_function_hardening.sql', '7d9a6049ef34ca9eb7a3713d31f2198d7c37e877e7eebc44cdd1eb224da82668', 'backfill-2026-08-04'),
    ('20260727_revoke_anon_execute_on_definer_rpc.sql', 'be643139b947b9ff5cc1a0903e6fa3c23989bc72d60bfce61ee2ae249ee29866', 'backfill-2026-08-04'),
    ('20260727_revoke_public_execute_on_definer_rpc.sql', '68f6217145471bb006cb3be4cc36ac1849970a7d0475a7df1e0428d6433664d0', 'backfill-2026-08-04'),
    ('20260727_teacher_recall_submission.sql', 'ad7398ff1fc361db892bd5a66ee58ede1443303b1fcfff232d63a03e778ccaf5', 'backfill-2026-08-04'),
    ('20260727_teacher_withdrawal_and_revoke_fix.sql', '803d885bb136ed2e2c6098d9f136d0e9ce301f16bfa555105b3f9ac79776c320', 'backfill-2026-08-04'),
    ('20260728_ai_prompt_presets.sql', '5de4a3291d4f005b0a5dcc6ecfce0d6cc0824af8550589356e13a4e3a6154612', 'backfill-2026-08-04'),
    ('20260728_class_student_summary.sql', 'c966dcada0fb2bc39c6b84522454088c7434b7c6a26bd4e6ceb9b69593f20bf0', 'backfill-2026-08-04'),
    ('20260728_drop_class_student_summary.sql', '8659bc371ce5d6c0043e3d1ced5aa2ebd7730a329609d74bcc69c7479eb6f1b6', 'backfill-2026-08-04'),
    ('20260728_reading_log_class_index.sql', '2d3ba568608effeeed35c173ac2ac6d600c839ff80867c70ec92e16e14c1f007', 'backfill-2026-08-04'),
    ('20260728_reading_log_scope_review_join.sql', '6e84bd2767b0b86f3e969f57f1360fd494dd3abdd1dd27687f07619eeefc056b', 'backfill-2026-08-04'),
    ('20260728_reading_log_student_summary.sql', '4184063dd491d3e6c0208734672e6038165e36648c60cda8306e12110125a9f0', 'backfill-2026-08-04'),
    ('20260728_scope_dashboard_review_join.sql', 'c64a2bdcb01d4e65c77adb2746daaacc60a425cc30f710c2d093cb1d3057d2b6', 'backfill-2026-08-04'),
    ('20260729_scope_reading_log_entries_join.sql', '3ebb0ca6fcc020332f3f5d4a5bd7f66b1b9e9b9bb3f993af4e2e82d6a4d00aed', 'backfill-2026-08-04'),
    ('20260729_self_directed_reading_logs.sql', 'cfb0b2b91c4af51665dfa4e1a2dd7f000a22443b42e4a86a48c0970abdff9892', 'backfill-2026-08-04'),
    ('20260729_writing_footprint_detail.sql', '4bfc2b52b0ed8085766fec54b7ff36cdd78795755bdc67f7766f4cf81c7d702f', 'backfill-2026-08-04'),
    ('20260730_align_writer_level_totals.sql', '3d83462bc814fdc8838c3cad4be5cee77c01c9a8db48cacb531ff8d13833ae19', 'backfill-2026-08-04'),
    ('20260730_friend_agit_social_directory.sql', 'c9762cc07f8b8e50cf6f1cc96ce70b5ceed09dd0607e7af2cc18aff5988d9ce9', 'backfill-2026-08-04'),
    ('20260730_friend_footprint_live.sql', '52a2e87caff78eece12bbbabf2b57d23bae7a91559674f7a2922a70223514da1', 'backfill-2026-08-04'),
    ('20260730_reading_library_catalog.sql', '79ac110c0db8d88b46a1fb6a7b5e23be8920866ed48589253e47bfb96290eb20', 'backfill-2026-08-04'),
    ('20260731_friend_bookshelf_comment_privacy.sql', '2aa30f1cf5508f25aef01b4f7bfb0a656d590dab27fed70285b7bd1e4f40a6d8', 'backfill-2026-08-04'),
    ('20260801_writing_footprints.sql', 'a81d9ed1f79fcbc820860c85e01518a7f56ca02ce8bc7e2c0b9a4c3cceb94c9b', 'backfill-2026-08-04'),
    ('20260802_friend_point_activity_summary.sql', 'deb62191782bcaef518705fb6f91703e68c774f7e7773a59490017862d99a6fa', 'backfill-2026-08-04'),
    ('20260803_teacher_reading_log_reviews.sql', '5acbf83630dec37a3e23d8f777b918599613ed55f034a3d25efb409e05fcbadd', 'backfill-2026-08-04'),
    ('20260804_system_ai_only.sql', '4fa73979a0d15d9c1b77fc93fabdddac486c30cd4addd7cac0c14f4b67f12524', 'backfill-2026-08-04'),
    ('20260805_class_operations_dashboard.sql', '2ce39edf2428ac6866ec603e2d0ca8d0723e587b4389c8ccc6c417e8ab94d001', 'backfill-2026-08-04'),
    ('20260806_class_recent_activity.sql', '5ce1cd4c660d90f55ab594bd84815aa93ece9f1cdac1b133c5a9aa68a8d91b80', 'backfill-2026-08-04'),
    ('20260807_class_recent_activity_period.sql', '567ae29b2b20d0db816ebf94697d4ba75d3050bddbd561c2738cb98832cce6a7', 'backfill-2026-08-04'),
    ('20260808_fix_pending_rewrite_states.sql', 'f82e114ee1b0fbaf29f4658c74f14f585ae7b8e1dbccae438ec6842c9cfb8006', 'backfill-2026-08-04'),
    ('20260809_reader_title_indexes.sql', '6ec20450f1c6b9bdf0d1c7292187b8873ae82030f18c32c0d8ab7e4673648a92', 'backfill-2026-08-04'),
    ('20260810_writing_footprint_spending_breakdown.sql', '932e24cbd0bb4b90956d27249225194f8961a0f7323d21edc057f9f0fd5f981d', 'backfill-2026-08-04'),
    ('20260811_my_title_status.sql', '505ead107687e8f4500053038b927f7d12d714e6626fbe860fb49b1ce3d8f720', 'backfill-2026-08-04'),
    ('20260812_class_writing_footprint_dashboard.sql', 'ea387f13bc0e2643dc740976c08d19181864932dd8f1684c7a21d484d446dec5', 'backfill-2026-08-04'),
    ('20260813_reading_log_drafts.sql', '50ab92002143b0828de7b314f04cdc1f7259dc5fae3ee652df15285dfab2ae2a', 'backfill-2026-08-04'),
    ('20260814_migration_tracking.sql', '(신규)', 'backfill-2026-08-04')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
