import { useEffect, useState } from 'react';
import { supabase } from '../../../../../lib/supabaseClient';

// 친구 창을 열 때마다 반 전체를 다시 읽지 않게, 같은 응답을 30초 동안 나눠 쓴다.
// 학생(viewerId)마다 따로 둔다 — 한 기기를 여러 학생이 번갈아 쓰거나 다른 학급 학생이 로그인해도 남의 응답을 보지 않게.
let cached = null;
const loadConquests = (viewerId) => {
    if (!cached || cached.viewerId !== viewerId || Date.now() - cached.at > 30000) {
        cached = { viewerId, at: Date.now(), promise: supabase.rpc('get_class_vocab_conquests_v1').then((result) => { if (result.error) cached = null; return result; }, (error) => { cached = null; throw error; }) };
    }
    return cached.promise;
};

/**
 * 친구가 정복한 어휘의 탑 덱(번호만). 정답률·점수·틀린 낱말은 서버가 돌려주지 않는다(`get_class_vocab_conquests_v1`).
 * 같은 반 친구만 보이고, 읽지 못하면(아직 적용 전·네트워크) 카드는 조용히 사라진다.
 */
export default function FriendTowerConquestCard({ friendId, friendName, viewerId }) {
    const [state, setState] = useState({ status: 'loading', decks: [], grade: null });
    useEffect(() => {
        let alive = true;
        void loadConquests(viewerId).then(({ data, error }) => {
            if (!alive) return;
            if (error) { setState({ status: 'hidden', decks: [], grade: null }); return; }
            const row = (data?.students || []).find((item) => item.student_id === friendId);
            setState({ status: 'ready', decks: row?.decks || [], grade: data?.grade || null });
        }, () => { if (alive) setState({ status: 'hidden', decks: [], grade: null }); });
        return () => { alive = false; };
    }, [friendId, viewerId]);

    if (state.status !== 'ready') return null;
    return (
        <section aria-label={`${friendName}의 어휘의 탑 정복`} style={{ marginBottom: '14px', padding: '14px 16px', borderRadius: '20px', background: '#FFFFFF', border: '1px solid #F0E2C8' }}>
            <h3 style={{ margin: '0 0 8px', color: '#3E2E23', fontSize: '1rem', fontWeight: 950 }}>🏰 어휘의 탑 정복</h3>
            {state.decks.length === 0
                ? <p style={{ margin: 0, color: '#8D7B6C', fontSize: '.85rem', fontWeight: 800 }}>아직 정복한 덱이 없어요. 곧 만나요!</p>
                : (
                    <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: 0, padding: 0, listStyle: 'none' }}>
                        {state.decks.map((deck) => (
                            <li key={deck} style={{ padding: '4px 10px', borderRadius: '999px', background: '#FFF3CD', color: '#6B4A00', fontSize: '.85rem', fontWeight: 900 }}>
                                {state.grade ? `${state.grade}학년 ` : ''}{deck}덱
                            </li>
                        ))}
                    </ul>
                )}
        </section>
    );
}
