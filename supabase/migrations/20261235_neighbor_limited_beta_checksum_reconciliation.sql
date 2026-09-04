-- 20261201은 운영 적용 뒤 커밋 전 서식만 정리되어 적용 원장 checksum과 파일 checksum이 달라졌다.
-- 실제 운영 함수 13개의 비공백 정의와 권한·제약·인덱스를 대조한 뒤, 함수 본문을 다시 만들지 않고
-- 검증된 파일 checksum만 원장에 맞춘다. 예상하지 못한 원장값이나 함수 차이는 조용히 덮지 않고 중단한다.

BEGIN;

DO $$
DECLARE
    v_recorded_checksum TEXT;
    v_mismatch TEXT;
BEGIN
    SELECT migration.checksum
    INTO v_recorded_checksum
    FROM public.applied_migrations migration
    WHERE migration.filename = '20261201_neighbor_limited_beta.sql';

    IF v_recorded_checksum IS NULL THEN
        RAISE EXCEPTION '20261201 적용 기록이 없어 checksum을 보정할 수 없습니다.';
    END IF;
    IF v_recorded_checksum NOT IN (
        '3e46ce9365f24bb08ce34648f6bee17f896258b8ddd397eded57883085f043d9',
        '25e0c973cf30d02cc81bfd53b47b22b42067e5af1078ee34b102a480ab886914'
    ) THEN
        RAISE EXCEPTION '예상하지 못한 20261201 checksum입니다: %', v_recorded_checksum;
    END IF;

    SELECT expected.signature
    INTO v_mismatch
    FROM (VALUES
        ('assert_neighbor_participating_teacher_v1(uuid,uuid)', '5a8f00b5aa402555ee9369344dfe134b'),
        ('assert_neighbor_student_access_v1(uuid)', 'ced90dd622e53088553c53aa97b74e5a'),
        ('assert_neighbor_teacher_class_v1(uuid)', '280dad46ae02423efc7ccbb3c20e5dd4'),
        ('change_neighbor_rollout_v1(text,text)', '0a61f2f7045ec2f8f21cb6ef518aab22'),
        ('get_neighbor_admin_dashboard_v1(uuid)', 'fa1137e14907e272b921a3bc99a46d45'),
        ('get_neighbor_my_share_candidates_v1(uuid,integer)', 'f8b188b22290fd7ff1eebab4d189c600'),
        ('get_neighbor_teacher_post_detail_v1(uuid,uuid,uuid)', 'f18020b41f3f3768b36f4d7337027a9a'),
        ('get_neighbor_teacher_workspace_v1(uuid)', 'f12e268d35579fd3b1d8b0f0f12641b4'),
        ('get_student_home_bootstrap_v1()', 'f36c8f7d30daec7807f73b860350a8e6'),
        ('neighbor_class_is_released_v1(uuid)', '9dfe84236e0a3c1691ff0d8d57fa08c0'),
        ('run_neighbor_teacher_action_v1(uuid,text,jsonb)', '8d4e5feabddf12ffcc61e684bba25bb7'),
        ('set_neighbor_class_access_v1(uuid,uuid,boolean)', '4d93125f7ee462bf2282e002ae4bd566'),
        ('set_neighbor_limited_class_v1(uuid,boolean)', '8bc5381f874e26a8aea850a5072bcaff')
    ) AS expected(signature, compact_definition_hash)
    LEFT JOIN pg_proc function_row
      ON function_row.oid = to_regprocedure('public.' || expected.signature)
    WHERE function_row.oid IS NULL
       OR md5(regexp_replace(pg_get_functiondef(function_row.oid), '\s+', '', 'g'))
          <> expected.compact_definition_hash
    LIMIT 1;

    IF v_mismatch IS NOT NULL THEN
        RAISE EXCEPTION '20261201 함수 정의가 현재 저장소 계약과 다릅니다: %', v_mismatch;
    END IF;

    UPDATE public.applied_migrations
    SET checksum = '25e0c973cf30d02cc81bfd53b47b22b42067e5af1078ee34b102a480ab886914'
    WHERE filename = '20261201_neighbor_limited_beta.sql';
END;
$$;

COMMIT;
