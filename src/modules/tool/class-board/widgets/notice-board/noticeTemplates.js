/*
 * 알림장 서식 보관함 — 되풀이해 쓰는 알림 틀을 서식 1·2·3 으로 저장해 두고 불러 쓴다.
 *
 * 왜 만들었나:
 *   알림장은 날마다 새로 쓰지만 뼈대는 거의 같다("오늘 배운 것 / 준비물 / 알림").
 *   매일 처음부터 치는 대신 틀을 불러와 **고쳐 쓰게** 한다. 불러오기는 입력칸을 채울 뿐
 *   저장하지 않는다 — 교사가 고친 뒤 `알림 저장`을 눌러야 교실 화면에 나간다.
 *
 * 어디에 저장하나:
 *   `profiles.notice_templates` (JSONB). 새 표를 만들지 않았다 — `profiles.feedback_phrases`
 *   (자주 쓰는 피드백 문장)와 소유자·수명·크기가 같다. 교사 한 명의 짧은 목록일 뿐이고
 *   다른 곳에서 join 하지 않으며, profiles 는 이미 본인만 읽고 쓰도록 잠겨 있다.
 *
 *   **학급이 아니라 교사에 붙인다.** 서식은 학급 자료가 아니라 그 선생님의 글 습관이라,
 *   학급을 옮기거나 여러 학급을 맡아도 그대로 따라간다.
 *
 * ⚠️ 아래 한도는 DB CHECK 제약과 **같은 값**이어야 한다. 원본은 이 파일이고 SQL 은
 *    `supabase/migrations/20261274_class_board_notice_templates.sql` 이다.
 *    두 곳이 어긋나면 `tests/classBoardNoticeTemplates.test.mjs` 가 잡는다.
 */

/** 서식 칸 수. 화면의 `서식 1·2·3` 과 같은 값이다. */
export const NOTICE_TEMPLATE_SLOTS = 3;

/** 서식 이름 길이. 버튼에 들어가야 하므로 짧게 둔다. */
export const MAX_NOTICE_TEMPLATE_NAME = 20;

/**
 * 서식 본문 길이. 알림 본문과 같은 한도를 쓴다 — 서식을 불러오면 그대로 본문이 되므로
 * 여기서 더 길게 허용하면 불러온 순간 저장할 수 없는 글이 된다.
 */
export const MAX_NOTICE_TEMPLATE_BODY = 2000;

/**
 * 처음 여는 교사에게 보여 줄 기본 서식.
 *
 * 백지로 두면 아무도 채우지 않는다 — 이 저장소에 이미 그 기록이 있다(제보 창이 백지라
 * 교사 203명 중 제보가 0건이었다). 그래서 `비어 있음` 칸에 `기본 서식 담기` 를 함께 둔다.
 * 담은 뒤에는 교사 것이므로 자유롭게 고치고 지운다.
 */
export const DEFAULT_NOTICE_TEMPLATES = Object.freeze([
    Object.freeze({ name: '오늘 알림', body: '[오늘 배운 것]\n\n\n[준비물]\n\n\n[알림]\n' }),
    Object.freeze({ name: '준비물만', body: '내일 준비물\n- \n- \n' }),
    Object.freeze({ name: '현장학습', body: '[언제]\n\n[어디]\n\n[준비물]\n\n[돌아오는 시각]\n' }),
]);

const trimmedString = (value, limit) => String(value ?? '').replace(/\r\n/gu, '\n').slice(0, limit);

/** 저장된 값이 무엇이든 화면이 믿고 쓸 수 있는 모양(칸 3개)으로 맞춘다. */
export function normalizeNoticeTemplates(raw) {
    const list = Array.isArray(raw) ? raw : [];
    return Array.from({ length: NOTICE_TEMPLATE_SLOTS }, (_, index) => {
        const item = list[index];
        if (!item || typeof item !== 'object' || Array.isArray(item)) return { name: '', body: '' };
        return {
            name: trimmedString(item.name, MAX_NOTICE_TEMPLATE_NAME).trim(),
            body: trimmedString(item.body, MAX_NOTICE_TEMPLATE_BODY),
        };
    });
}

/** 빈 칸은 이름도 본문도 없는 칸이다. 이름만 적어 둔 칸은 불러올 것이 없다. */
export const isNoticeTemplateEmpty = (template) => !String(template?.body ?? '').trim();

/** 버튼에 쓸 이름. 이름을 안 적었으면 칸 번호로 부른다. */
export const noticeTemplateLabel = (template, index) =>
    String(template?.name ?? '').trim() || `서식 ${index + 1}`;

/** 저장 전 검사. 문제가 있으면 사람이 읽을 문장을, 없으면 빈 문자열을 돌려준다. */
export function validateNoticeTemplate(template) {
    const name = String(template?.name ?? '').trim();
    const body = String(template?.body ?? '');
    if (!body.trim()) return '서식으로 저장할 내용이 없습니다.';
    if (name.length > MAX_NOTICE_TEMPLATE_NAME) return `서식 이름은 ${MAX_NOTICE_TEMPLATE_NAME}자까지 넣을 수 있습니다.`;
    if (body.length > MAX_NOTICE_TEMPLATE_BODY) return `서식은 ${MAX_NOTICE_TEMPLATE_BODY}자까지 저장할 수 있습니다.`;
    return '';
}

/** 한 칸만 바꾼 새 목록을 만든다. 칸 수는 언제나 그대로다. */
export function withNoticeTemplateAt(templates, index, template) {
    const list = normalizeNoticeTemplates(templates);
    if (index < 0 || index >= NOTICE_TEMPLATE_SLOTS) return list;
    return list.map((item, position) => (position === index
        ? {
            name: trimmedString(template?.name, MAX_NOTICE_TEMPLATE_NAME).trim(),
            body: trimmedString(template?.body, MAX_NOTICE_TEMPLATE_BODY),
        }
        : item));
}
