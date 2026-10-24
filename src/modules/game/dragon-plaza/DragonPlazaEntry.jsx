import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import PlazaDesk from './PlazaDesk';
import { CLASSROOM_BACKGROUND, useDeskArt } from './deskArt';
import { describeVisitors } from './plazaModel';
import { plazaApi } from './plazaApi';
import useDragonPlaza from './useDragonPlaza';
import './plaza.css';

const PlazaPostModal = lazy(() => import('./PlazaPostModal'));
const FriendProfileShell = lazy(() => import('../../community/friends-hideout/profile/FriendProfileShell'));

/** 칠판: 우리 반 이름 줄과 "이번 주 내 아지트에 놀러 온 친구" 명단(누군가 보고 있다는 신호, 횟수·순위 없음). */
const MAX_VISITOR_NAMES = 8;
function Chalkboard({ seatCount, visitors }) {
    const info = describeVisitors(visitors);
    const shown = info.empty ? [] : info.names.slice(0, MAX_VISITOR_NAMES);
    const more = info.empty ? 0 : info.names.length - shown.length;
    return (
        <section className="plaza-board" aria-label="칠판">
            <h2>우리반 수호룡 아지트 <small>{seatCount}명이 앉아 있어요</small></h2>
            <div className="plaza-board__visitors">
                <strong>{info.title}</strong>
                {info.empty
                    ? <p>{info.text}</p>
                    : <ul>{shown.map((visitorName) => <li key={visitorName}>{visitorName}</li>)}{more > 0 && <li>외 {more}명</li>}</ul>}
            </div>
        </section>
    );
}

/**
 * 학생 놀이터 모듈 입구: 우리 반 수호룡이 모인 교실. 자리를 누르면 그 친구의 아지트가 창으로 열리고,
 * 닫으면 교실로 돌아온다. `새 글`을 누르면 그 친구의 새 글 하나만 창으로 열린다. `api` 로 데이터 길을 갈아 끼울 수 있다(개발실).
 */
export default function DragonPlazaEntry({ studentSession, isMobile, onBack, backTarget = 'playground', api = plazaApi }) {
    const studentId = studentSession?.id;
    const classId = studentSession?.classId || studentSession?.class_id;
    const { status, message, seats, visitors, conquestCounts, newPosts, markSeen, reload } = useDragonPlaza(api, studentId);
    const [openedSeat, setOpenedSeat] = useState(null);
    const { classroomReady } = useDeskArt();

    // 친구 아지트·글 읽기는 모두 교실 위의 창으로 열고 닫는다(화면이 바뀌지 않는다).
    const [reading, setReading] = useState(null); // { post } 또는 { postId, friend }
    // 같은 함수를 넘겨야 글 창이 "공개 글인지 확인" 요청을 다시 보내지 않는다(창의 확인 효과가 onClose 에 걸려 있다).
    const closeReading = useCallback(() => setReading(null), []);
    // 키보드로 연 사람이 닫은 뒤 그 자리로 돌아오게, 열기 직전의 포커스를 기억한다(창이 뜨면 뒤 교실이 inert 라 포커스를 잃는다).
    const openerRef = useRef(null);
    const openFriend = useCallback((seat) => { openerRef.current = document.activeElement; setOpenedSeat(seat); }, []);
    const closeFriend = useCallback(() => {
        setOpenedSeat(null);
        window.setTimeout(() => { const opener = openerRef.current; if (opener && document.contains(opener)) opener.focus?.(); }, 0);
    }, []);
    const classmates = seats.map((seat) => ({ id: seat.id, name: seat.name }));
    const openLoadedPost = (post) => {
        if (post?.id) markSeen(post.id);
        setReading({ post });
    };
    const openNewPost = (seat, post) => {
        // 글이 실제로 열린 뒤(onOpened)에 그 친구의 안 본 새 글을 모두 읽은 것으로 친다 — 열지 못했다면 표시가 남아 다시 누를 수 있다.
        const ids = post?.ids?.length ? post.ids : [post?.id];
        setReading({ postId: post?.id, friend: seat.row, onOpened: () => markSeen(ids) });
    };
    const modalOpen = Boolean(openedSeat?.row || reading);

    return (
        <div className={`plaza${classroomReady ? ' has-photo' : ''}`} style={classroomReady ? { '--classroom': `url(${CLASSROOM_BACKGROUND})` } : undefined}>
            <header className="plaza__bar" inert={modalOpen || undefined}>
                <button type="button" onClick={onBack}>{backTarget === 'home' ? '← 처음 화면' : '← 놀이터'}</button>
                <strong>🏫 우리반 수호룡 아지트</strong>
                <button type="button" onClick={reload} aria-label="교실 새로고침">↻</button>
            </header>

            {status === 'error' && (
                <p className="plaza__error" role="alert">{message} <button type="button" onClick={reload}>다시 불러오기</button></p>
            )}
            {status === 'loading' && seats.length === 0 && <p className="plaza__loading" role="status">교실 문을 여는 중… 🏫</p>}

            {seats.length > 0 && (
                <>
                    <div className="plaza__hero" inert={modalOpen || undefined}><Chalkboard seatCount={seats.length} visitors={visitors} /></div>
                    <div className="plaza__grid" role="list" inert={modalOpen || undefined} aria-label="교실 자리">
                        {seats.map((seat) => (
                            <div role="listitem" key={seat.id}>
                                <PlazaDesk
                                    seat={seat}
                                    newPost={newPosts.get(seat.id)}
                                    conquered={conquestCounts.get(seat.id) || 0}
                                    onOpen={openFriend}
                                    onOpenNewPost={openNewPost}
                                />
                            </div>
                        ))}
                    </div>
                    <p className="plaza__hint">친구 자리를 누르면 그 친구의 아지트를 구경할 수 있어요. 내 아지트에 놀러 온 친구는 칠판에 나와요.</p>
                </>
            )}

            {openedSeat?.row && (
                <Suspense fallback={<div className="plaza__opening" role="status">친구 아지트를 여는 중… 🏠</div>}>
                    <FriendProfileShell
                        friend={openedSeat.row}
                        viewerId={studentId}
                        classId={classId}
                        onClose={closeFriend}
                        onOpenPost={openLoadedPost}
                        presentation="modal"
                        closeOnEscape={!reading}
                    />
                </Suspense>
            )}

            {reading && (
                <Suspense fallback={null}>
                    <PlazaPostModal
                        {...reading}
                        studentSession={studentSession}
                        classId={classId}
                        classmates={classmates}
                        isMobile={isMobile}
                        onClose={closeReading}
                    />
                </Suspense>
            )}
        </div>
    );
}
