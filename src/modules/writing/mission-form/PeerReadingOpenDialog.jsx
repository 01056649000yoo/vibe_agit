import { useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import CenteredDialog from '../../../components/common/CenteredDialog';
import { supabase } from '../../../lib/supabaseClient';

/**
 * "선생님만 읽기" 과제를 친구들에게 일제히 여는 확인 창(2026-10-09, 선생님 결정).
 * 열면 다시 닫을 수 없고(서버가 막는다), 승인한 글만 친구에게 보이며, 그 반 학생에게 알림이 한 번 간다.
 */
export default function PeerReadingOpenDialog({ mission, onClose, onOpened }) {
    const [counts, setCounts] = useState(null);
    const [allowComments, setAllowComments] = useState(true);
    const [opening, setOpening] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        supabase.rpc('open_mission_peer_reading_v1', { p_mission_id: mission.id, p_allow_comments: true, p_preview: true })
            .then(({ data, error: rpcError }) => {
                if (!active) return;
                if (rpcError) setError('글 수를 세지 못했어요. 잠시 뒤 다시 열어 주세요.');
                else setCounts(data);
            });
        return () => { active = false; };
    }, [mission.id]);

    const open = async () => {
        setOpening(true);
        setError('');
        const { data, error: rpcError } = await supabase.rpc('open_mission_peer_reading_v1', {
            p_mission_id: mission.id, p_allow_comments: allowComments, p_preview: false
        });
        setOpening(false);
        if (rpcError) {
            setError('열지 못했어요. 잠시 뒤 다시 시도해 주세요.');
            return;
        }
        onOpened?.(data);
    };

    const waiting = counts ? Math.max(0, Number(counts.submitted) - Number(counts.approved)) : 0;
    const notSubmitted = counts ? Math.max(0, Number(counts.students) - Number(counts.submitted)) : 0;

    return (
        <CenteredDialog
            onClose={onClose}
            eyebrow="🔓 친구들에게 글 열기"
            title={`‘${mission.title}’ 글을 반 친구들에게 열까요?`}
            titleLines={2}
            maxWidth="520px"
        >
            <div style={{ display: 'grid', gap: 'var(--ui-space-3)' }}>
                {counts ? (
                    <ul style={{ margin: 0, paddingLeft: '1.2em', display: 'grid', gap: 6, lineHeight: 1.6 }}>
                        <li><strong>승인한 글 {counts.approved}편</strong>이 지금 바로 친구들에게 보여요.</li>
                        {waiting > 0 && <li>승인을 기다리는 글 {waiting}편은 선생님이 승인하는 순간 보여요.</li>}
                        {notSubmitted > 0 && <li>아직 안 낸 {notSubmitted}명의 글은 내고 승인을 받으면 보여요.</li>}
                        <li>반 학생들에게 <strong>‘👀 친구들의 글이 열렸어요’</strong> 알림이 한 번 가요.</li>
                    </ul>
                ) : !error ? <p style={{ margin: 0, color: 'var(--ui-ink-muted)' }}>글 수를 세고 있어요…</p> : null}

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontWeight: 800 }}>
                    <input type="checkbox" checked={allowComments} onChange={(event) => setAllowComments(event.target.checked)} />
                    💬 친구 댓글도 함께 열기
                </label>

                <p style={{ margin: 0, padding: '10px 12px', borderRadius: 'var(--ui-radius-md)', background: 'var(--ui-warning-soft)', color: 'var(--ui-ink)', fontSize: 'var(--ui-text-sm)', lineHeight: 1.6 }}>
                    ⚠️ <strong>한 번 열면 다시 닫을 수 없어요.</strong> 열고 닫기를 오가면 전시관·문집·이웃 공유에서 글이 빠지는 일이 생겨 막아 두었어요.
                </p>

                {error && <p role="alert" style={{ margin: 0, color: 'var(--ui-danger)', fontWeight: 800 }}>{error}</p>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--ui-space-2)', flexWrap: 'wrap' }}>
                    <Button type="button" variant="ghost" onClick={onClose}>그만두기</Button>
                    <Button type="button" onClick={open} disabled={!counts || opening} loading={opening} loadingText="여는 중...">
                        🔓 친구들에게 열기
                    </Button>
                </div>
            </div>
        </CenteredDialog>
    );
}
