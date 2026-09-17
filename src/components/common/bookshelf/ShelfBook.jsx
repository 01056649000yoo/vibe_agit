import React, { Fragment } from 'react';
import { motion } from 'framer-motion';
import { FREE_WRITING_TYPE, SELF_WRITING_TYPES, getSelfWritingType } from '../../../modules/writing/selfWritingTypes';
import {
    SHELF_BOOK_ELLIPSIS,
    SHELF_BOOK_LABEL_HEIGHT,
    SHELF_BOOK_LABEL_TOP,
    SHELF_BOOK_NOTE_GAP,
    SHELF_BOOK_NOTE_HEIGHT,
    SHELF_BOOK_TITLE_FONT,
    shelfBookColumns,
    shelfBookHeight,
    shelfBookPalette,
    shelfBookTitle,
    shelfBookTitleCapacity,
    shelfBookWidth,
    stableBookVariant,
} from './shelfBookLayout';

/*
 * 책장 갈래와 책등 한 권. **세 화면이 같이 쓴다** — 학생의 내 서재(MyAgitPanel),
 * 선생님의 학생 아지트 보기(TeacherStudentAgitViewer), 친구 아지트의 공개 서재(FriendWritingShelf).
 * 책 모양을 고치려면 여기 한 곳만 고친다. 각 화면이 따로 그리면 하나만 새 모양이 된다.
 *
 * MyAgitPanel 에서 꺼냈다(2026-09-15). 책등 모양을 다듬으려면 진짜 부품으로 띄워 봐야 하는데,
 * 패널 안에 있으면 학생 세션·DB 없이는 그릴 수 없었다. 여기 두면 `?dev-lab=my-shelf` 로 바로 본다.
 *
 * 2026-09-15 다듬음: 실제 책등처럼 **종이 라벨에 제목을 한 줄**로 쓰고, 길면 말줄임으로 줄인다.
 * 전에는 긴 제목이 세로로 두세 줄로 쪼개져 읽는 순서가 뒤엉켰다. 위아래에 얇은 띠를 둘러
 * 책다워 보이게 했고, 글자는 태블릿 바닥(0.8rem) 아래로 내리지 않는다.
 * 크기·제목 규칙은 `shelfBookLayout.js` 에 있어 검사가 직접 부른다.
 */

// 새 글쓰기 유형은 이 배열에 탭 정보와 match만 추가한다.
// `free`는 아직 분류되지 않은 자율 글을 받는 마지막 폴백이므로 항상 맨 아래에 둔다.
export const SHELF_SECTIONS = [
    {
        id: 'assignment', tabLabel: '과제 책장', emptyMessage: '완성한 과제가 아직 없어요.', alwaysVisible: true,
        match: (post) => post.writing_context !== 'self',
        label: '과제', icon: '📝',
        colors: [
            ['#477DB6', '#28527D', '#193B60'],
            ['#6589B1', '#365F8C', '#23466B'],
            ['#426A9B', '#25476F', '#173552']
        ]
    },
    {
        id: 'reading', tabLabel: SELF_WRITING_TYPES.reading_log.shelfTabLabel,
        emptyMessage: SELF_WRITING_TYPES.reading_log.emptyMessage, alwaysVisible: true,
        match: (post) => getSelfWritingType(post)?.id === 'reading_log',
        label: SELF_WRITING_TYPES.reading_log.label, icon: SELF_WRITING_TYPES.reading_log.icon,
        colors: [
            ['#6B9A70', '#3F704A', '#295237'],
            ['#5E958B', '#356A64', '#28514D'],
            ['#77955C', '#4E6F37', '#384F29']
        ]
    },
    {
        id: 'diary', tabLabel: SELF_WRITING_TYPES.diary.shelfTabLabel,
        emptyMessage: SELF_WRITING_TYPES.diary.emptyMessage, alwaysVisible: true,
        match: (post) => getSelfWritingType(post)?.id === 'diary',
        label: SELF_WRITING_TYPES.diary.label, icon: SELF_WRITING_TYPES.diary.icon,
        colors: [
            ['#7C86D6', '#4F5AA8', '#343C7A'],
            ['#8E86C9', '#5C509C', '#3E356F'],
            ['#6E8FCB', '#42639C', '#2D466F']
        ]
    },
    {
        id: 'free', tabLabel: FREE_WRITING_TYPE.shelfTabLabel,
        emptyMessage: FREE_WRITING_TYPE.emptyMessage, alwaysVisible: false,
        match: (post) => getSelfWritingType(post)?.id === 'free',
        label: FREE_WRITING_TYPE.label, icon: FREE_WRITING_TYPE.icon,
        colors: [
            ['#D17A67', '#A24E48', '#793538'],
            ['#C88658', '#9D5B32', '#743F23'],
            ['#9C76A8', '#714E7E', '#54395F']
        ]
    }
];

/**
 * 탭은 아니지만 책 색은 따로인 갈래. 모두의 아지트의 안건 의견 글은 과제 책장에 꽂히되 보라색이다.
 * 과제 탭의 match 가 먼저 잡으므로 여기서 먼저 본다.
 */
const normalizeRelation = (value) => (Array.isArray(value) ? (value[0] || null) : (value || null));
export const isMeetingPost = (post) => {
    const mission = normalizeRelation(post?.writing_missions);
    return mission?.mission_type === 'meeting' || mission?.input_template === 'meeting';
};
export const MEETING_SHELF_KIND = {
    id: 'meeting', label: '안건 의견', icon: '🏛️',
    colors: [
        ['#9C76A8', '#714E7E', '#54395F'],
        ['#8B72B5', '#604B8D', '#403467'],
        ['#AF7FAE', '#80517F', '#5D385C']
    ]
};

export const shelfSectionFor = (post) => {
    if (isMeetingPost(post)) return MEETING_SHELF_KIND;
    return SHELF_SECTIONS.find((section) => section.match(post)) || SHELF_SECTIONS[0];
};

export { stableBookVariant };

/**
 * @param post     제목·visibility(·writing_missions) 가 있는 글 한 편
 * @param section  책장 탭을 넘기면 그 색으로, 안 넘기면 글을 보고 고른다
 * @param note     라벨 아래 쪽지 한 줄(`♡ 3`). 없어도 자리는 비워 둔다
 * @param opening  여는 중이면 책을 어둡게 덮는다
 */
export const ShelfBook = ({ post, section, onOpen, note, opening = false, disabled = false }) => {
    const type = section || shelfSectionFor(post);
    const variant = stableBookVariant(post);
    const palette = shelfBookPalette(type.colors, variant);
    const fullTitle = post.title || '제목 없는 글';
    const width = shelfBookWidth(fullTitle);
    const height = shelfBookHeight(variant);
    const isPrivate = post.visibility !== 'class';
    // 한 줄에 들어가면 한 줄, 아니면 두 줄. 그래도 넘치면 앞 9자 ⋯ 뒤 6자.
    const columns = shelfBookColumns(fullTitle);
    const spineTitle = shelfBookTitle(fullTitle, shelfBookTitleCapacity(columns));

    return (
        <motion.button
            type="button"
            role="listitem"
            onClick={onOpen}
            disabled={disabled}
            aria-label={`${type.label} ‘${fullTitle}’ 펼쳐보기${isPrivate ? ', 나만 보는 글' : ''}${note ? `, ${note}` : ''}`}
            title={`${type.icon} ${type.label} · ${fullTitle}`}
            whileHover={{ y: -6, rotate: -1.2 }}
            whileTap={{ y: 1, scale: 0.97 }}
            style={{
                position: 'relative', flex: `0 0 ${width}px`, width: `${width}px`, height: `${height}px`,
                padding: 0, overflow: 'hidden', border: `1px solid ${palette.dark}`,
                borderRadius: '4px 4px 2px 2px', cursor: disabled ? 'wait' : 'pointer',
                /* 등의 둥근 느낌: 왼쪽 어둡게 → 가운데 밝게 → 오른쪽 다시 어둡게 */
                background: `linear-gradient(90deg, ${palette.dark} 0%, ${palette.middle} 18%, ${palette.light} 46%, ${palette.middle} 80%, ${palette.dark} 100%)`,
                boxShadow: 'inset 3px 0 2px -1px rgba(255,255,255,.22), inset -3px 0 3px -1px rgba(0,0,0,.28), 3px 4px 7px rgba(55,31,17,.3)',
                fontFamily: 'inherit', scrollSnapAlign: 'start'
            }}
        >
            {/* 머리띠·꼬리띠: 실제 양장본의 위아래 장식 띠. 이것만으로도 색 막대가 책이 된다. */}
            <span aria-hidden="true" style={{
                position: 'absolute', top: '5px', left: '4px', right: '4px', height: '3px',
                borderRadius: '2px', background: palette.band, boxShadow: '0 1px 0 rgba(0,0,0,.25)'
            }} />
            <span aria-hidden="true" style={{
                position: 'absolute', bottom: '6px', left: '4px', right: '4px', height: '3px',
                borderRadius: '2px', background: palette.band, boxShadow: '0 1px 0 rgba(0,0,0,.25)'
            }} />

            {/*
              * 갈래 배지. 나만 보는 글이면 배지 모서리에 자물쇠를 얹는다 — 라벨 아래에 두면
              * 라벨 자리를 뺏어 "몇 자부터 줄어드는지" 가 잠금 여부에 따라 달라진다.
              */}
            <span aria-hidden="true" style={{
                position: 'absolute', top: '13px', left: '50%', transform: 'translateX(-50%)',
                display: 'grid', placeItems: 'center', width: '22px', height: '22px', borderRadius: '50%',
                background: 'rgba(255,250,236,.92)', boxShadow: '0 1px 2px rgba(0,0,0,.3)',
                fontSize: '.78rem', lineHeight: 1
            }}>
                {type.icon}
                {isPrivate && (
                    <span style={{
                        position: 'absolute', right: '-6px', bottom: '-5px',
                        display: 'grid', placeItems: 'center', width: '15px', height: '15px',
                        borderRadius: '50%', background: 'rgba(35,25,20,.85)', fontSize: '.52rem',
                        boxShadow: '0 0 0 2px rgba(255,250,236,.92)'
                    }}>🔒</span>
                )}
            </span>

            {/* 종이 라벨: 높이가 모든 책에서 같다. 남는 키는 라벨 아래 여백이 된다. */}
            <span aria-hidden="true" style={{
                position: 'absolute', top: `${SHELF_BOOK_LABEL_TOP}px`, height: `${SHELF_BOOK_LABEL_HEIGHT}px`,
                left: '7px', right: '7px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '3px', background: palette.label,
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08), 0 1px 1px rgba(0,0,0,.2)', overflow: 'hidden'
            }}>
                {/*
                  * vertical-lr: 줄이 **왼쪽부터** 시작한다. 옛 세로쓰기(vertical-rl)는 오른쪽부터라
                  * 두 줄이 되면 아이들이 뒷줄부터 읽어 제목이 뒤엉켰다.
                  */}
                <span style={{
                    display: 'block', maxHeight: '100%', overflow: 'hidden',
                    writingMode: 'vertical-lr', textOrientation: 'upright', color: '#3A2A1E',
                    whiteSpace: columns > 1 ? 'normal' : 'nowrap',
                    // 영어 제목은 띄어쓰기를 뺀 뒤 한 단어가 되어 줄이 안 바뀐다. 글자 사이에서 끊게 한다.
                    wordBreak: 'break-all',
                    fontSize: SHELF_BOOK_TITLE_FONT, fontWeight: 900,
                    // 두 줄이 되면 둘째 줄도 위에서 시작한다. 가운데 맞춤이면 "…의 일 / 기" 의 "기" 가 허공에 뜬다.
                    lineHeight: 1.15, letterSpacing: '.04em', textAlign: 'start'
                }}>
                    {spineTitle.split(SHELF_BOOK_ELLIPSIS).map((part, index) => (
                        <Fragment key={index}>
                            {index > 0 && (
                                /* 글꼴이 세로쓰기용 글자로 바꿔 ⋯ 를 세로 점(⁝)으로 그린다. 세로 대체를 끈다. */
                                <span style={{ fontFeatureSettings: '"vert" 0, "vrt2" 0' }}>{SHELF_BOOK_ELLIPSIS}</span>
                            )}
                            {part}
                        </Fragment>
                    ))}
                </span>
            </span>

            {/* 쪽지: 라벨 아래 한 줄. 친구 서재는 반응 수를 적는다. */}
            {note && (
                <span aria-hidden="true" style={{
                    position: 'absolute', top: `${SHELF_BOOK_LABEL_TOP + SHELF_BOOK_LABEL_HEIGHT + SHELF_BOOK_NOTE_GAP}px`,
                    left: '4px', right: '4px', height: `${SHELF_BOOK_NOTE_HEIGHT}px`, overflow: 'hidden',
                    color: 'rgba(255,250,236,.92)', fontSize: SHELF_BOOK_TITLE_FONT, fontWeight: 850,
                    lineHeight: `${SHELF_BOOK_NOTE_HEIGHT}px`, textAlign: 'center', whiteSpace: 'nowrap',
                    textShadow: '0 1px 1px rgba(0,0,0,.4)'
                }}>
                    {note}
                </span>
            )}

            {opening && (
                <span aria-hidden="true" style={{
                    position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                    background: 'rgba(35,25,20,.7)', color: '#FFFFFF', fontSize: SHELF_BOOK_TITLE_FONT, fontWeight: 950
                }}>여는 중</span>
            )}
        </motion.button>
    );
};

export default ShelfBook;
