import { useEffect, useMemo, useRef, useState } from 'react';
import { getWritingCompareInfo } from './writingDiff.js';
import './writingVersionSwitch.css';

/**
 * 처음 글·고친 글을 오가는 공통 선택(2026-09-26).
 *
 * 전에는 화면마다 `📜 최초글과 비교하기`·`📜 처음글과 비교하기`·`📜 나의 처음 글과 비교하기` 같은 작은 단추가
 * 따로 있었다. 회색이라 꺼진 단추처럼 보였고, 고친 곳이 없어도 떠서 눌러도 같은 글이 나왔으며, 누를 때마다
 * 글자가 바뀌어 지금 어느 글을 보는지 헷갈렸다. 이제는
 *   ① 승인된 글에서 고친 곳이 있으면 형광펜색 띠로 **"처음 글에서 N군데 고쳤어요"** 를 먼저 알리고
 *   ② `최종 글 · 🖍️ 바뀐 곳 · 처음 글` 세 칸 가운데 지금 보는 칸을 채워 보여 준다.
 * 처음 글이 없거나 최종 글과 같으면 아무것도 그리지 않는다.
 */
export const WRITING_VIEW = Object.freeze({ FINAL: 'final', CHANGES: 'changes', ORIGINAL: 'original' });

const seenKey = (postId) => `writing-change-seen-v1:${postId}`;


/**
 * 글 보기 상태. `autoOpenChanges` 면 승인된 글을 **이 기기에서 처음 열 때 한 번** `바뀐 곳` 으로 연다
 * (학생 본인 글에만 쓴다 — "선생님이 승인했어요, 이렇게 좋아졌어요" 를 보여 주는 순간). 한 번 열었는지는
 * 이 브라우저에만 남긴다. 저장소가 막혀 있으면 늘 최종 글로 연다.
 */
export const useWritingVersion = ({ postId, before, after, beforeTitle, afterTitle, approved, teacherText = null, autoOpenChanges = false }) => {
    const info = useMemo(
        () => getWritingCompareInfo({ before, after, beforeTitle, afterTitle, approved, teacherText }),
        [before, after, beforeTitle, afterTitle, approved, teacherText]
    );
    const [view, setView] = useState(WRITING_VIEW.FINAL);
    // 글은 화면보다 늦게 도착한다(불러오는 중에는 처음 글이 비어 있다). 그래서 처음 그릴 때가 아니라
    // **바뀐 곳을 보여 줄 수 있게 된 순간 한 번** 판단한다. 같은 글에서 두 번 열지 않는다.
    const autoOpenedFor = useRef(null);
    useEffect(() => {
        if (!autoOpenChanges || !info.canShowChanges || !postId || autoOpenedFor.current === postId) return;
        autoOpenedFor.current = postId;
        let seen = true;
        try {
            seen = Boolean(window.localStorage.getItem(seenKey(postId)));
        } catch {
            // 저장소가 막혀 있으면 늘 최종 글로 연다.
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 도착한 글에 맞춰 한 번만 여는 것이라 효과 안에서 고른다.
        if (!seen) setView(WRITING_VIEW.CHANGES);
    }, [autoOpenChanges, info.canShowChanges, postId]);
    useEffect(() => {
        if (view !== WRITING_VIEW.CHANGES || !postId) return;
        try {
            window.localStorage.setItem(seenKey(postId), '1');
        } catch {
            // 저장소가 막혀 있으면 다음에도 한 번 더 바뀐 곳으로 열릴 뿐이다.
        }
    }, [view, postId]);
    // 고른 칸이 사라졌으면(글이 바뀌었거나 승인이 풀림) 최종 글로 돌아간다.
    const safeView = (view === WRITING_VIEW.CHANGES && !info.canShowChanges) || (view !== WRITING_VIEW.FINAL && !info.hasOriginal)
        ? WRITING_VIEW.FINAL
        : view;
    return { ...info, view: safeView, setView };
};

/**
 * @param {'three'|'sideBySide'} layout `sideBySide` 는 교사의 글 자세히 보기처럼 두 번째 칸이 처음·최종을 나란히
 *   놓는 화면이다. 그 칸은 승인된 글이면 `🖍️ 바뀐 곳`, 승인 전이면 `처음 글과 나란히` 가 된다.
 */
const WritingVersionSwitch = ({ view, onChange, hasOriginal, changeCount, teacherChangeCount = 0, canShowChanges, layout = 'three' }) => {
    if (!hasOriginal) return null;
    const sideBySide = layout === 'sideBySide';
    const options = [
        { id: WRITING_VIEW.FINAL, label: '최종 글' },
        ...(canShowChanges || sideBySide
            ? [{ id: WRITING_VIEW.CHANGES, label: canShowChanges ? '🖍️ 바뀐 곳' : '처음 글과 나란히' }]
            : []),
        ...(sideBySide ? [] : [{ id: WRITING_VIEW.ORIGINAL, label: '처음 글' }])
    ];
    return (
        <div className="writing-version">
            {canShowChanges ? (
                <div className="writing-version__banner">
                    <span>
                        ✍️ 처음 글에서 <strong>{changeCount}군데</strong> 고쳤어요
                        {teacherChangeCount > 0 ? <span className="writing-version__teacher"> (선생님이 고쳐 준 곳 {teacherChangeCount}군데)</span> : null}
                    </span>
                    {view === WRITING_VIEW.CHANGES ? (
                        <span className="writing-version__legend">
                            형광펜: 새로 쓰거나 고친 곳{teacherChangeCount > 0 ? ' · 하늘색: 선생님이 고쳐 준 곳' : ''} · 가운데 줄: 지운 곳
                        </span>
                    ) : (
                        <button type="button" className="writing-version__open" onClick={() => onChange(WRITING_VIEW.CHANGES)}>
                            바뀐 곳 보기
                        </button>
                    )}
                </div>
            ) : null}
            <div className="writing-version__tabs" role="radiogroup" aria-label="글 보기">
                {options.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={view === option.id}
                        className={`writing-version__tab${view === option.id ? ' is-active' : ''}`}
                        onClick={() => onChange(option.id)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default WritingVersionSwitch;
