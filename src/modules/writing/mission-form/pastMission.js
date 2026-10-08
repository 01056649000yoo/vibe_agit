/*
 * 내가 낸 과제 다시 내기(2026-10-07, 선생님 결정 A안 — 새 표 없이 이미 있는 과제에서 불러온다).
 *
 * 불러오면 **폼만 채운다.** 저장을 눌러야 지금 학급에 새 과제가 생긴다.
 * 학생 글·포인트·공개 날짜·보관 상태·학급은 따라오지 않는다.
 * 회의(아이디어 시장) 과제는 회의방과 묶여 있어 목록에서 뺀다.
 */
import { getGenreMissionType, resolveGenreMissionTypeId } from '../mission-types/registry.js';

// 불러올 때 필요한 칸만(수정 화면 재조회와 같은 칸 + 목록 표시용 학급·날짜)
export const PAST_MISSION_FIELDS = 'id, title, guide, genre, mission_type, input_template, template_config, min_chars, min_paragraphs, guide_questions, base_reward, bonus_threshold, bonus_reward, repeat_bonus_enabled, repeat_bonus_threshold, repeat_bonus_reward, repeat_bonus_max_count, allow_comments, peer_reading_enabled, tags, evaluation_rubric, created_at, is_archived, class_id, classes!writing_missions_class_id_fkey(name)';

export const PAST_MISSION_PAGE_SIZE = 20;
export const PAST_MISSION_EXCLUDED_TYPES = Object.freeze(['meeting']);

/*
 * 모두의 아지트 활동이 만든 과제에 서버가 붙이는 표시 태그(20261237~20261344 의 jsonb_build_array — 운영 DB 에 실제로 남은 값만, 2026-10-07 확인).
 * 화면은 `이웃 아지트` 태그로 "지우면 그 활동에서 우리 반이 빠진다" 경고를 띄운다(MissionList·ArchiveConfirmModal) —
 * 우리 반 과제로 다시 낼 때 따라오면 그 경고가 엉뚱하게 붙으므로 뗀다.
 */
export const NEIGHBOR_ACTIVITY_TAGS = Object.freeze(['이웃 아지트', '같이 쓰기 광장', '같이 쓰는 주제', '글짝 교환']);

/** 다시 낼 수 있는 과제인지 — 옛 회의 과제 중 input_template 이 freeform 으로 남은 것도 거른다. */
export const isReusablePastMission = (mission) => !PAST_MISSION_EXCLUDED_TYPES.includes(resolveGenreMissionTypeId(mission));

/** 전용 틀(시·편지·보고서)이면 그 id, 기본 글쓰기면 'freeform'. */
export function pastMissionKind(mission) {
    const typeId = resolveGenreMissionTypeId(mission);
    if (typeId && getGenreMissionType(typeId)?.teacherEntry && !PAST_MISSION_EXCLUDED_TYPES.includes(typeId)) return typeId;
    return 'freeform';
}

/** 새 과제의 바탕으로 쓸 값만 남긴다 — id·학급·공개/보관 상태를 떼어 내야 저장이 `수정`이 아니라 `새로 만들기`가 된다. */
export function toReusableMission(mission) {
    if (!mission) return null;
    const {
        id: _id, class_id: _classId, classes: _classes, created_at: _createdAt,
        is_archived: _isArchived, archived_at: _archivedAt, open_at: _openAt, teacher_id: _teacherId,
        ...rest
    } = mission;
    return {
        ...rest,
        guide_questions: Array.isArray(rest.guide_questions) ? [...rest.guide_questions] : [],
        tags: Array.isArray(rest.tags) ? rest.tags.filter((tag) => !NEIGHBOR_ACTIVITY_TAGS.includes(tag)) : []
    };
}

/** 검색어를 PostgREST `or=(…)` 안에 안전하게 넣는다 — 쉼표·괄호·와일드카드는 지운다. */
export function pastMissionSearchTerm(value) {
    return String(value || '').replace(/[,()*%\\"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
}
