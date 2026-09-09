# 안 쓰이는 DB 인덱스·함수 관찰 장부

> `npm run db:usage` 가 이 문서를 다시 쓴다. **손으로 고치지 않는다.**
> 원본 기록은 `ops/db-usage-ledger.json` 이고, 이 문서는 사람이 읽는 요약이다.

## 왜 한 번에 지우지 않나

포스트그레스의 사용 통계는 **DB 를 다시 켜면 0 으로 돌아간다.** "내년에 다시 재서 0이면 지운다"만
믿으면, 그 사이 컨테이너가 한 번이라도 재시작됐을 때 **멀쩡한 인덱스까지 0 으로 보인다.**
그래서 이 장부는 잰 값을 **누적**한다 — 한 번이라도 쓰인 적이 있으면 계속 기억한다.

학기말·방학에만 쓰는 기능도 있다. **최소 한 학년도(12개월)** 를 관찰하고 지운다.

제약(PK·UNIQUE)이 받치는 인덱스는 애초에 목록에 넣지 않는다. 그것은 속도가 아니라 **올바름**을
지킨다 — 안 쓰인다고 지우면 중복 데이터가 들어온다.

## 지금 상태

| | |
|---|---|
| 관찰 횟수 | 2회 |
| 관찰 기간 | 2026-09-09 ~ 2026-09-09 (0일) |
| 한 번도 안 쓰인 인덱스 | **61개** (6.8MB) |
| 한 번도 안 불린 함수 | 세지 않음 (`track_functions=none`) |

> ⚠️ 아직 0일치다. **365일 더** 관찰한 뒤 판단한다.

## 한 번도 쓰이지 않은 인덱스

- `agit_season_history.idx_agit_season_history_class_id` — 16KB · 2회 관찰 · 2026-09-09부터
- `agit_season_history.idx_season_history_ended_at` — 16KB · 2회 관찰 · 2026-09-09부터
- `ai_prompt_presets.idx_ai_prompt_presets_unique_name` — 16KB · 2회 관찰 · 2026-09-09부터
- `book_catalog.idx_book_catalog_isbn13` — 40KB · 2회 관찰 · 2026-09-09부터
- `book_catalog.idx_book_catalog_title` — 56KB · 2회 관찰 · 2026-09-09부터
- `class_agit_consent_events.class_agit_consent_class_time_idx` — 16KB · 2회 관찰 · 2026-09-09부터
- `classes.idx_classes_invite_code` — 40KB · 2회 관찰 · 2026-09-09부터
- `dragon_decor_catalog.idx_dragon_decor_catalog_slot_active_sort` — 16KB · 2회 관찰 · 2026-09-09부터
- `feedback_reports.feedback_reports_created_idx` — 16KB · 2회 관찰 · 2026-09-09부터
- `feedback_reports.feedback_reports_teacher_idx` — 16KB · 2회 관찰 · 2026-09-09부터
- `game_point_grants.idx_game_point_grants_student_day` — 16KB · 2회 관찰 · 2026-09-09부터
- `learning_challenge_attempts.learning_challenge_attempts_one_open_idx` — 16KB · 2회 관찰 · 2026-09-09부터
- `learning_content_collection_items.learning_content_collection_items_lookup_idx` — 16KB · 2회 관찰 · 2026-09-09부터
- `learning_content_items.learning_content_items_curriculum_idx` — 16KB · 2회 관찰 · 2026-09-09부터
- `learning_content_items.learning_content_items_grade_bands_idx` — 24KB · 2회 관찰 · 2026-09-09부터
- `learning_content_items.learning_content_items_published_idx` — 16KB · 2회 관찰 · 2026-09-09부터
- `learning_content_items.learning_content_items_source_idx` — 16KB · 2회 관찰 · 2026-09-09부터
- `learning_content_questions.learning_content_questions_published_idx` — 16KB · 2회 관찰 · 2026-09-09부터
- `learning_item_progress.learning_item_progress_due_review_idx` — 1768KB · 2회 관찰 · 2026-09-09부터
- `neighbor_activities.idx_neighbor_activities_one_live_type` — 16KB · 2회 관찰 · 2026-09-09부터
- `neighbor_comments.neighbor_comments_review_queue_idx` — 16KB · 2회 관찰 · 2026-09-09부터
- `neighbor_invites.idx_neighbor_invites_space_created` — 16KB · 2회 관찰 · 2026-09-09부터
- `neighbor_rollout_events.idx_neighbor_rollout_events_recent` — 16KB · 2회 관찰 · 2026-09-09부터
- `neighbor_shared_posts.idx_neighbor_shared_posts_class_review` — 88KB · 2회 관찰 · 2026-09-09부터
- `neighbor_space_events.idx_neighbor_space_events_class_recent` — 16KB · 2회 관찰 · 2026-09-09부터
- `neighbor_space_events.idx_neighbor_space_events_space_recent` — 16KB · 2회 관찰 · 2026-09-09부터
- `neighbor_spaces.idx_neighbor_spaces_host_status` — 16KB · 2회 관찰 · 2026-09-09부터
- `neis_meal_cache.idx_neis_meal_cache_expires` — 16KB · 2회 관찰 · 2026-09-09부터
- `point_logs.idx_point_logs_class_activity_created` — 2680KB · 2회 관찰 · 2026-09-09부터
- `post_comments.idx_post_comments_post_created` — 680KB · 2회 관찰 · 2026-09-09부터
- `post_reactions.idx_post_reactions_composite` — 280KB · 2회 관찰 · 2026-09-09부터
- `profiles.idx_profiles_admin_teacher_accounts` — 200KB · 2회 관찰 · 2026-09-09부터
- `profiles.idx_profiles_is_approved` — 16KB · 2회 관찰 · 2026-09-09부터
- `reading_log_entries.idx_reading_log_library_item` — 56KB · 2회 관찰 · 2026-09-09부터
- `reading_marathon_campaigns.idx_reading_marathon_class_archived` — 16KB · 2회 관찰 · 2026-09-09부터
- `reading_marathon_campaigns.idx_reading_marathon_one_current` — 16KB · 2회 관찰 · 2026-09-09부터
- `reading_marathon_contributions.idx_reading_marathon_contribution_campaign` — 16KB · 2회 관찰 · 2026-09-09부터
- `reading_marathon_participants.idx_reading_marathon_participants_team` — 16KB · 2회 관찰 · 2026-09-09부터
- `self_writing_drafts.idx_self_writing_drafts_class_updated` — 16KB · 2회 관찰 · 2026-09-09부터
- `spelling_learning_entries.idx_spelling_class_approved_expression` — 16KB · 2회 관찰 · 2026-09-09부터
- `spelling_learning_entries.idx_spelling_common_approved_expression` — 16KB · 2회 관찰 · 2026-09-09부터
- `spelling_learning_entries.idx_spelling_entries_class_status_updated` — 16KB · 2회 관찰 · 2026-09-09부터
- `student_posts.idx_posts_is_submitted` — 104KB · 2회 관찰 · 2026-09-09부터
- `student_posts.idx_posts_status` — 104KB · 2회 관찰 · 2026-09-09부터
- `student_posts.idx_student_posts_public_bookshelf` — 72KB · 2회 관찰 · 2026-09-09부터
- `student_posts.idx_student_posts_recalled` — 16KB · 2회 관찰 · 2026-09-09부터
- `student_records.idx_student_records_class_id` — 16KB · 2회 관찰 · 2026-09-09부터
- `student_records.idx_student_records_created_at` — 16KB · 2회 관찰 · 2026-09-09부터
- `student_records.idx_student_records_teacher_id` — 16KB · 2회 관찰 · 2026-09-09부터
- `survival_legacy_archives.idx_survival_legacy_archives_teacher_imported` — 16KB · 2회 관찰 · 2026-09-09부터
- `system_alert_events.system_alert_events_open_key_idx` — 16KB · 2회 관찰 · 2026-09-09부터
- `system_backup_app_results.idx_system_backup_app_results_app_checked` — 16KB · 2회 관찰 · 2026-09-09부터
- `vocab_tower_history.idx_tower_history_class_id` — 16KB · 2회 관찰 · 2026-09-09부터
- `vocab_tower_history.idx_tower_history_ended_at` — 16KB · 2회 관찰 · 2026-09-09부터
- `vocab_tower_rankings.idx_tower_rankings_max_floor` — 16KB · 2회 관찰 · 2026-09-09부터
- `vocab_tower_rankings.idx_vocab_tower_rankings_class_id` — 16KB · 2회 관찰 · 2026-09-09부터
- `vocab_tower_rankings.idx_vocab_tower_rankings_class_max_floor` — 16KB · 2회 관찰 · 2026-09-09부터
- `vocab_tower_v2_item_progress.vocab_tower_v2_item_progress_class_updated_idx` — 16KB · 2회 관찰 · 2026-09-09부터
- `vocab_tower_v2_item_progress.vocab_tower_v2_item_progress_student_deck_state_idx` — 16KB · 2회 관찰 · 2026-09-09부터
- `vocab_tower_words.idx_vocab_tower_words_grade_level` — 72KB · 2회 관찰 · 2026-09-09부터
- `writing_assignment_outline_pins.writing_assignment_outline_pins_result_idx` — 16KB · 2회 관찰 · 2026-09-09부터

## 한 번도 불리지 않은 함수

- 호출 통계가 꺼져 있다(`track_functions = none`). 켜기 전에는 "안 불린다"를 알 수 없다.
- 켜려면: `ALTER SYSTEM SET track_functions = 'pl'; SELECT pg_reload_conf();` (재시작 불필요)
- 켜지 않아도 `npm run check:rpc-surface` 가 "클라이언트에 열려 있는데 아무 데서도 안 부르는 것"은 이미 막는다.

## 관찰 기록

| 잰 날 | DB 켜진 시각 | 함수 통계 |
|---|---|---|
| 2026-09-09 | 2026-08-30 03:11:10 | none |
| 2026-09-09 | 2026-08-30 03:11:10 | none |

*DB 켜진 시각이 바뀌었다면 그 사이 재시작이 있었다는 뜻이고, 그때 통계는 0부터 다시 쌓였다.*
