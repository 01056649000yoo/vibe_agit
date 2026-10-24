import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import PostDetailModal from '../../../components/student/PostDetailModal';
import { getMissionReactionOptions } from '../../writing/mission-types/registry';

const POST_COLUMNS = 'id, title, content, student_id, mission_id, created_at, updated_at, published_at, char_count, is_confirmed, is_submitted, writing_context, self_writing_type, visibility, structured_content, show_original, original_title, original_content';

/** 친구의 공개 글 한 편을 불러온다(글쓴이 학생·학급이 맞고 공개일 때만). 책장의 글 열기와 같은 조건이다. */
export const loadPlazaPost = async ({ postId, friend, classId }) => {
    const { data, error } = await supabase.from('student_posts').select(POST_COLUMNS)
        .eq('class_id', classId).eq('id', postId).eq('student_id', friend.id)
        .eq('is_submitted', true).eq('visibility', 'class').maybeSingle();
    if (error || !data) return null;
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
        original_title: data.show_original ? data.original_title : null,
        original_content: data.show_original ? data.original_content : null
    };
};

/**
 * 교실 위에 뜨는 글 읽기 창. `post`(이미 불러온 글) 또는 `postId`+`friend`(새 글 단추)를 받는다.
 * 닫으면 교실(또는 친구 아지트 창)로 그대로 돌아온다.
 */
export default function PlazaPostModal({ post: givenPost, postId, friend, studentSession, classmates, isMobile, onClose }) {
    const [post, setPost] = useState(givenPost || null);
    const [failed, setFailed] = useState(false);
    const classId = studentSession?.class_id || studentSession?.classId;

    useEffect(() => {
        if (givenPost || !postId || !friend?.id) return undefined;
        let alive = true;
        void loadPlazaPost({ postId, friend, classId }).then((loaded) => {
            if (!alive) return;
            if (loaded) setPost(loaded); else setFailed(true);
        }, () => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [givenPost, postId, friend, classId]);

    if (failed) {
        return (
            <div role="alertdialog" aria-label="글을 열 수 없어요" className="plaza-postfail" onMouseDown={onClose}>
                <div onMouseDown={(event) => event.stopPropagation()}>
                    <p>이 글은 비공개로 바뀌었거나 더 이상 볼 수 없어요. 🔒</p>
                    <button type="button" onClick={onClose}>닫기</button>
                </div>
            </div>
        );
    }
    if (!post) return null;
    const mission = post.mission_id ? post.writing_missions : null;
    return (
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
        />
    );
}
