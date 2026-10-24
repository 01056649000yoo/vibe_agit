import { Component, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import PostDetailModal from '../../../components/student/PostDetailModal';
import { getMissionReactionOptions } from '../../writing/mission-types/registry';

// 게임 화면(StudentDashboard 의 module 래퍼 zIndex 20000)보다 높아야 글 창이 보인다. 개발실 확인으로는 못 잡는 문제였다.
const PLAZA_POST_Z_INDEX = 20500;
const POST_COLUMNS = 'id, title, content, student_id, mission_id, created_at, updated_at, published_at, char_count, is_confirmed, is_submitted, writing_context, self_writing_type, visibility, structured_content, show_original';

/** 친구의 공개 글 한 편을 불러온다(글쓴이 학생·학급이 맞고 공개일 때만). 책장의 글 열기와 같은 조건이다. */
export const loadPlazaPost = async ({ postId, friend, classId }) => {
    if (!classId) throw new Error('학급 번호를 찾지 못했어요(no-class)');
    const { data, error } = await supabase.from('student_posts').select(POST_COLUMNS)
        .eq('class_id', classId).eq('id', postId).eq('student_id', friend.id)
        .eq('is_submitted', true).eq('visibility', 'class').maybeSingle();
    if (error) throw new Error(`글을 읽지 못했어요(${error.code || 'query'}: ${error.message || ''})`);
    if (!data) return null;
    // 처음 글(원문)은 글쓴이가 공개를 허락한 경우에만 따로 가져온다 — 공개하지 않았다면 브라우저 응답에도 담기지 않는다.
    let original = { original_title: null, original_content: null };
    if (data.show_original) {
        const { data: originalRow } = await supabase.from('student_posts').select('original_title, original_content')
            .eq('class_id', classId).eq('id', postId).eq('student_id', friend.id)
            .eq('is_submitted', true).eq('visibility', 'class').eq('show_original', true).maybeSingle();
        original = { original_title: originalRow?.original_title ?? null, original_content: originalRow?.original_content ?? null };
    }
    const [mission, reactions] = await Promise.all([
        data.mission_id
            ? supabase.from('writing_missions').select('id, title, allow_comments, mission_type, input_template').eq('class_id', classId).eq('id', data.mission_id).maybeSingle()
            : Promise.resolve({ data: null }),
        supabase.from('post_reactions').select('id, reaction_type, student_id').eq('class_id', classId).eq('post_id', data.id).limit(50)
    ]);
    return {
        ...data,
        student_name: friend.name,
        students: { name: friend.name, pet_data: friend.pet_data || null },
        writing_missions: mission.data || null,
        post_reactions: reactions.data || [],
        ...original
    };
};

/**
 * 교실 위에 뜨는 글 읽기 창. `post`(이미 불러온 글) 또는 `postId`+`friend`(새 글 단추)를 받는다.
 * 닫으면 교실(또는 친구 아지트 창)로 그대로 돌아온다.
 */
export default function PlazaPostModal({ post: givenPost, postId, friend, studentSession, classId: givenClassId, classmates, isMobile, onClose, onOpened }) {
    const [post, setPost] = useState(givenPost || null);
    const [failed, setFailed] = useState(null); // 실패 이유(null 이면 정상)
    const classId = givenClassId || studentSession?.classId || studentSession?.class_id;

    // 글 창이 맨 위에 있을 때 Esc 로 닫는다(친구 창의 Esc 는 이때 꺼져 있다). 불러오는 중·실패 화면도 같다.
    useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    useEffect(() => {
        if (givenPost || !postId || !friend?.id) return undefined;
        let alive = true;
        void loadPlazaPost({ postId, friend, classId }).then((loaded) => {
            if (!alive) return;
            if (loaded) { setPost(loaded); onOpened?.(); } else setFailed('이 글은 비공개로 바뀌었거나 더 이상 볼 수 없어요. 🔒');
        }, (error) => {
            console.warn('[dragon-plaza] 새 글 열기 실패', error);
            if (alive) setFailed(error?.message || '알 수 없는 이유로 글을 열지 못했어요.');
        });
        return () => { alive = false; };
    }, [givenPost, postId, friend, classId, onOpened]);

    if (failed) {
        return (
            <div role="alertdialog" aria-label="글을 열 수 없어요" className="plaza-postfail" onMouseDown={onClose}>
                <div onMouseDown={(event) => event.stopPropagation()}>
                    <p>{failed}</p>
                    <button type="button" onClick={onClose}>닫기</button>
                </div>
            </div>
        );
    }
    if (!post) {
        // 글을 불러오는 동안 눌린 것이 보이도록 알려 준다(조용하면 안 눌린 것처럼 느껴진다).
        return <div className="plaza__opening" role="status" onMouseDown={onClose}>친구 글을 여는 중… 📖</div>;
    }
    const mission = post.mission_id ? post.writing_missions : null;
    return (
        <PostBoundary onClose={onClose}>
        <PostDetailModal
            key={post.id}
            post={post}
            mission={mission}
            studentSession={studentSession}
            onClose={onClose}
            reactionIcons={getMissionReactionOptions(mission)}
            isMobile={isMobile}
            ACCESSORIES={[]}
            classmates={classmates}
            enforcePublicAccess
            zIndex={PLAZA_POST_Z_INDEX}
        />
        </PostBoundary>
    );
}

class PostBoundary extends Component {
    state = { message: '' };
    static getDerivedStateFromError(error) { return { message: error?.message || '글 화면에서 오류가 났어요.' }; }
    componentDidCatch(error) { console.warn('[dragon-plaza] 글 화면 오류', error); }
    render() {
        if (!this.state.message) return this.props.children;
        return (
            <div role="alertdialog" aria-label="글 화면 오류" className="plaza-postfail" onMouseDown={this.props.onClose}>
                <div onMouseDown={(event) => event.stopPropagation()}>
                    <p>글 화면을 여는 중 오류가 났어요. ({this.state.message})</p>
                    <button type="button" onClick={this.props.onClose}>닫기</button>
                </div>
            </div>
        );
    }
}
