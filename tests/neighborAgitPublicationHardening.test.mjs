import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// 2026-09-06: 글짝 교환 활동을 제품에서 뺐다(SQL 61254). 인원 적격 검사와 매칭 계약 검사는 함께 사라졌다.
test('글짝 교환 활동의 흔적은 화면과 모듈에 남지 않는다', () => {
    for (const source of [readFileSync('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8'),
        readFileSync('src/modules/community/neighbor-agit/StudentEntry.jsx', 'utf8'),
        readFileSync('src/modules/community/neighbor-agit/teacherApi.js', 'utf8')]) {
        assert.doesNotMatch(source, /exchange|글짝/);
    }
    const types = readFileSync('src/modules/community/neighbor-agit/activityTypes.js', 'utf8');
    assert.match(types, /id: 'gallery'/);
    assert.match(types, /id: 'topic'/);
    assert.doesNotMatch(types, /id: 'exchange'/);
    assert.ok(!existsSync('src/modules/community/neighbor-agit/exchangeEligibility.js'), '적격 검사 모듈이 남아 있습니다.');
});
test('모든 현재 공개 조회와 공유 진입점이 같은 원글 공개 조건을 사용한다', () => {
    const sql = readFileSync('supabase/migrations/20261240_neighbor_publication_matching_hardening.sql', 'utf8');
    for (const name of ['get_neighbor_teacher_share_candidates_v1', 'get_neighbor_my_share_candidates_v1', 'publish_neighbor_class_post_v1', 'request_neighbor_post_share_v1', 'get_neighbor_space_feed_v1', 'get_neighbor_activity_feed_v1', 'get_neighbor_shared_post_v1', 'assert_neighbor_student_post_access_v1', 'get_neighbor_teacher_source_post_v1', 'get_neighbor_teacher_post_detail_v1']) {
        const definition = sql.split(`CREATE OR REPLACE FUNCTION public.${name}(`)[1]?.split('\n$$;')[0];
        assert.ok(definition?.includes('neighbor_source_is_shareable_v1(post)'), `${name} 공개 조건 누락`);
    }
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.review_neighbor_shared_post_v1\(UUID, UUID, TEXT, TEXT\)\s+FROM PUBLIC, anon, authenticated, service_role/);
});
