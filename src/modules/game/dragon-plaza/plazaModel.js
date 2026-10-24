/**
 * 우리반 수호룡 아지트의 순수 계산(화면과 따로 시험한다, 2026-10-24).
 * 자리·단계·책상 장식·새 글 표시를 한 곳에서 정한다.
 */
import { getReaderLevel, getWriterLevel } from '../../../constants/writerLevels.js';
import { getDragonDecorItem, normalizeDragonDecor } from '../dragon/decorCatalog.js';
import { getDragonStage, getHideoutBackground } from '../dragon/presentation.js';

/** 새 글로 보는 기간(일). 이보다 오래된 글은 읽지 않았어도 표시하지 않는다. */
export const NEW_POST_DAYS = 7;
const SEEN_LIMIT = 300;

const koreanCompare = (a, b) => String(a || '').localeCompare(String(b || ''), 'ko-KR');

/** 학생 한 명의 자리 정보. `row` 는 친구 목록 한 줄(또는 내 정보), 단계는 작가 단계와 같다. */
export const buildSeat = (row, { isMe = false } = {}) => {
    const petData = row?.pet_data || {};
    const writerLevel = getWriterLevel(row?.writer_total_chars, row?.writer_completed_posts, petData._testWriterLevel).level;
    // 그림은 작가 성장 단계, 후광은 소통(독서) 칭호 단계(1~7)를 따른다.
    const readerLevel = getReaderLevel(row?.reader_score, petData._testReaderLevel).level;
    const stage = getDragonStage(writerLevel, petData.species);
    const decor = normalizeDragonDecor(petData);
    const frame = getHideoutBackground(decor.equipped.wallpaper);
    const nameplate = getDragonDecorItem(decor.equipped.nameplate);
    return {
        id: row?.id,
        name: row?.name || '친구',
        isMe,
        row,
        level: writerLevel,
        readerLevel,
        speciesId: stage.speciesId,
        stage,
        frame: { border: frame.border, glow: frame.glow || frame.border },
        nameplate: nameplate && nameplate.image ? { image: nameplate.image, preview: nameplate.preview || nameplate.id } : null
    };
};

/** 교실 자리 순서: 이름 가나다순으로 고정(누가 어디 있는지 외울 수 있게). 내 자리도 그 순서 안에 들어간다. */
export const buildSeats = (classmates, me) => {
    const unique = new Map();
    for (const row of classmates || []) if (row?.id && row.id !== me?.id && !unique.has(row.id)) unique.set(row.id, row); // 같은 학생이 두 번 와도 자리는 하나
    const seats = [...unique.values()].map((row) => buildSeat(row));
    if (me?.id) seats.push(buildSeat(me, { isMe: true }));
    return seats.sort((a, b) => koreanCompare(a.name, b.name) || String(a.id).localeCompare(String(b.id)));
};

/** 화면 폭에 맞는 한 줄 책상 수(모바일 3, 태블릿 4~5, 큰 화면 6). */
export const deskColumns = (width) => (width <= 520 ? 3 : width <= 820 ? 4 : width <= 1100 ? 5 : 6);

/* ---------------- 새 글 표시 ---------------- */

/** `localStorage` 를 읽는 것 자체가 막힌 환경(사생활 보호·쿠키 차단)에서는 getter 가 예외를 던진다 — 그때는 저장소가 없는 것으로 본다. */
const defaultStorage = () => {
    try { return globalThis.localStorage; } catch { return null; }
};

/** 이 기기에서 읽은 글 기록(없으면 빈 기록). 저장소를 못 쓰는 환경에서도 화면은 그대로 돈다. */
export const readSeenPosts = (studentId, storage = defaultStorage()) => {
    try {
        const parsed = JSON.parse(storage?.getItem(`dragon-plaza:seen:${studentId}`) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

export const markPostSeen = (studentId, postIds, storage = defaultStorage(), now = Date.now()) => {
    const ids = [...new Set([postIds].flat().filter(Boolean))]; // 글 하나 또는 여러 편(중복 제거)
    if (!studentId || ids.length === 0) return {};
    const seen = { ...readSeenPosts(studentId, storage), ...Object.fromEntries(ids.map((id) => [id, now])) };
    // 시각이 같으면 방금 읽은 글이 먼저 남도록 앞에 둔다(정렬은 안정적이다).
    const entries = [...ids.map((id) => [id, now]), ...Object.entries(seen).filter(([id]) => !ids.includes(id))];
    const trimmed = Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, SEEN_LIMIT));
    try { storage?.setItem(`dragon-plaza:seen:${studentId}`, JSON.stringify(trimmed)); } catch { /* 저장 못 해도 화면은 그대로 */ }
    return trimmed;
};

/**
 * 친구별로 "아직 열어 보지 않은 가장 최근 공개 글" 하나를 고른다(안 본 글이 더 있으면 `ids` 에 모두 담는다).
 * 공개 글 목록(최신순)과 이 기기의 읽은 기록만 쓴다 — 서버에 읽음 표를 늘리지 않는다.
 */
export const pickNewPosts = (feedItems, seen, myId, now = Date.now()) => {
    const oldest = now - NEW_POST_DAYS * 86400000;
    const result = new Map();
    for (const post of feedItems || []) {
        const studentId = post?.student_id;
        if (!studentId || studentId === myId || !post.id || Reflect.get(seen || {}, post.id)) continue;
        const publishedAt = Date.parse(post.feed_published_at || post.published_at || post.created_at || '');
        if (!Number.isFinite(publishedAt) || publishedAt < oldest) continue;
        const current = result.get(studentId);
        // `ids` 는 그 친구의 아직 안 본 새 글 전부 — 새 글 단추를 누르면 한꺼번에 읽은 것으로 쳐서 표시가 사라진다.
        const ids = [...new Set([...(current?.ids || []), post.id])];
        if (!current || publishedAt > current.publishedAt) {
            result.set(studentId, { id: post.id, title: post.title || '새 글', publishedAt, ids });
        } else {
            current.ids = ids;
        }
    }
    return result;
};

/** 칠판 문구: 이번 주 내 아지트에 온 친구 이름 목록. */
export const describeVisitors = (visitors) => {
    const names = (visitors || []).map((visitor) => visitor?.name).filter(Boolean);
    if (names.length === 0) return { empty: true, title: '이번 주 내 아지트에 놀러 온 친구', text: '아직 없어요. 친구 아지트를 구경하면 친구 칠판에 내 이름이 남아요!' };
    return { empty: false, title: `이번 주 내 아지트에 놀러 온 친구 ${names.length}명`, names };
};
