import { Fragment, useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import './vocabStudentStatus.css';

/*
 * 어휘의 탑 교사 `👥 학생 현황`(2026-10-02 선생님 요청). 학생마다 열린 층·완전히 익힌 낱말·다시 볼 낱말·
 * 최근 7일 연습·정상 관문·받은 포인트를 한 표로 보고, 줄을 누르면 층 10개의 진도를 펼친다.
 * 열 때와 `새로 고침` 을 누를 때만 RPC 1회(get_teacher_vocab_tower_student_status_v1, 최대 100명). 폴링 없음.
 * 상태 이름(완전히 익힘·다시 볼 낱말)은 학생 지도(V2DeckMap)·교사 설정 화면과 같은 말을 쓴다.
 */
const SORTS = [
    { id: 'name', label: '이름순' },
    { id: 'mastered', label: '익힌 낱말 많은 순' },
    { id: 'review', label: '다시 볼 낱말 많은 순' },
    { id: 'quiet', label: '최근 7일 연습 적은 순' }
];

const sumDecks = (decks, key) => (decks || []).reduce((sum, deck) => sum + (Number(Reflect.get(deck, key)) || 0), 0);
const lastPracticed = (decks) => (decks || []).map((deck) => deck.last_practiced_at).filter(Boolean).sort().at(-1) || null;
const dayText = (iso) => {
    if (!iso) return '아직 없음';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return '오늘';
    if (days === 1) return '어제';
    return `${days}일 전`;
};

const toRow = (raw) => {
    const mastered = sumDecks(raw.decks, 'mastered_count');
    const items = sumDecks(raw.decks, 'item_count');
    return {
        ...raw,
        mastered,
        items,
        review: sumDecks(raw.decks, 'needs_review_count'),
        seen: sumDecks(raw.decks, 'seen_count'),
        masterPassed: (raw.decks || []).filter((deck) => deck.master_passed).length,
        last: lastPracticed(raw.decks),
        percent: items ? Math.round((mastered / items) * 100) : 0
    };
};

const sortRows = (rows, sort) => {
    const copy = [...rows];
    if (sort === 'mastered') return copy.sort((a, b) => b.mastered - a.mastered);
    if (sort === 'review') return copy.sort((a, b) => b.review - a.review);
    if (sort === 'quiet') return copy.sort((a, b) => a.runs_7d - b.runs_7d || (a.last || '').localeCompare(b.last || ''));
    return copy;
};

export default function VocabTeacherStudentStatus({ classId }) {
    const [state, setState] = useState({ loading: true, error: '', grade: null, rows: [], at: null });
    const [sort, setSort] = useState('name');
    const [openId, setOpenId] = useState('');

    const load = useCallback(async () => {
        if (!classId) return;
        setState((current) => ({ ...current, loading: true, error: '' }));
        const { data, error } = await supabase.rpc('get_teacher_vocab_tower_student_status_v1', { p_class_id: classId });
        if (error) {
            setState((current) => ({ ...current, loading: false, error: '학생 현황을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.' }));
            return;
        }
        setState({ loading: false, error: '', grade: data?.grade, rows: (data?.students || []).map(toRow), at: data?.generated_at || null });
    }, [classId]);

    useEffect(() => {
        const timer = setTimeout(load, 0);
        return () => clearTimeout(timer);
    }, [load]);

    const rows = sortRows(state.rows, sort);
    const practicedThisWeek = state.rows.filter((row) => row.runs_7d > 0).length;
    const averageMastered = state.rows.length ? Math.round(state.rows.reduce((sum, row) => sum + row.mastered, 0) / state.rows.length) : 0;
    const summitReached = state.rows.filter((row) => row.summit_level > 0).length;

    return <section className="vocab-status" aria-label="어휘의 탑 학생 현황">
        <header className="vocab-status__head">
            <div>
                <h3>학생 현황{state.grade ? ` · ${state.grade}학년 덱` : ''}</h3>
                <p>학생마다 몇 층까지 열었는지, 낱말을 얼마나 익혔는지 봐요. 줄을 누르면 층별 진도가 펼쳐져요.</p>
            </div>
            <button type="button" onClick={load} disabled={state.loading}>{state.loading ? '불러오는 중…' : '새로 고침'}</button>
        </header>

        <div className="vocab-status__summary">
            <div><small>학생</small><strong>{state.rows.length}명</strong></div>
            <div><small>최근 7일 연습한 학생</small><strong>{practicedThisWeek}명</strong></div>
            <div><small>평균 완전히 익힌 낱말</small><strong>{averageMastered}개</strong></div>
            <div><small>정상 관문에 오른 학생</small><strong>{summitReached}명</strong></div>
        </div>

        <div className="vocab-status__tools">
            <label>정렬 <select value={sort} onChange={(event) => setSort(event.target.value)}>
                {SORTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select></label>
            {state.at && <small>{new Date(state.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준</small>}
        </div>

        {state.error && <p className="vocab-status__error" role="alert">{state.error}</p>}
        {!state.loading && !state.error && rows.length === 0 && <p className="vocab-status__empty">아직 우리 반 학생이 없어요.</p>}

        {rows.length > 0 && <div className="vocab-status__table-wrap">
            <table className="vocab-status__table">
                <thead><tr>
                    <th scope="col">학생</th><th scope="col">열린 층</th><th scope="col">완전히 익힘</th>
                    <th scope="col">다시 볼 낱말</th><th scope="col">최근 7일</th><th scope="col">마지막 연습</th>
                    <th scope="col">정상 관문</th><th scope="col">층 익힘 포인트</th>
                </tr></thead>
                <tbody>
                    {rows.map((row) => {
                        const open = openId === row.student_id;
                        return <Fragment key={row.student_id}>
                            <tr className={`vocab-status__row${open ? ' is-open' : ''}${row.runs_7d === 0 ? ' is-quiet' : ''}`}>
                                <th scope="row">
                                    <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? '' : row.student_id)}>
                                        <span aria-hidden="true">{open ? '▾' : '▸'}</span>{row.name}
                                    </button>
                                </th>
                                <td><b>{row.unlocked_deck}층</b><small> · 덱마스터 {row.masterPassed}개</small></td>
                                <td>
                                    <div className="vocab-status__bar" aria-hidden="true"><i style={{ width: `${row.percent}%` }} /></div>
                                    <b>{row.mastered}</b><small>/{row.items} ({row.percent}%)</small>
                                </td>
                                <td className={row.review ? 'is-review' : ''}>{row.review}개</td>
                                <td>{row.runs_7d}판</td>
                                <td>{dayText(row.last)}</td>
                                <td>{row.summit_level > 0 ? `${'⭐'.repeat(Math.min(3, row.summit_level))} ${row.summit_level}단계` : '—'}</td>
                                <td>{row.vocab_points.toLocaleString('ko-KR')}P
                                    {row.legacy_vocab_points > 0 && <small className="vocab-status__legacy"> 예전 탑 {row.legacy_vocab_points.toLocaleString('ko-KR')}P</small>}</td>
                            </tr>
                            {open && <tr className="vocab-status__detail"><td colSpan={8}>
                                <ol className="vocab-status__decks" aria-label={`${row.name} 층별 진도`}>
                                    {row.decks.map((deck) => {
                                        const percent = deck.item_count ? Math.round((deck.mastered_count / deck.item_count) * 100) : 0;
                                        const locked = deck.deck_number > row.unlocked_deck;
                                        return <li key={deck.deck_number} className={locked ? 'is-locked' : deck.master_passed ? 'is-passed' : ''}>
                                            <strong>{deck.deck_number}층{deck.master_passed ? ' 🏆' : locked ? ' 🔒' : ''}</strong>
                                            <div className="vocab-status__bar" aria-hidden="true"><i style={{ width: `${percent}%` }} /></div>
                                            <span>익힘 {deck.mastered_count}/{deck.item_count}</span>
                                            {deck.needs_review_count > 0 && <span className="is-review">다시 볼 {deck.needs_review_count}</span>}
                                            <small>연습 {deck.practice_runs}판 · 최고 {deck.best_accuracy}%</small>
                                        </li>;
                                    })}
                                </ol>
                            </td></tr>}
                        </Fragment>;
                    })}
                </tbody>
            </table>
        </div>}
        <p className="vocab-status__note">🏆 덱마스터 통과 · 🔒 아직 안 열린 층. 최근 7일에 한 판도 하지 않은 학생은 줄이 옅게 보여요.
            `층 익힘 포인트`는 지금 탑에서 낱말을 익혀 받은 포인트만이에요(2026년 8월 개편 전 `일일 미션 보상`은 `예전 탑`으로 따로 적어요).</p>
    </section>;
}
