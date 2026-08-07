import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../../components/common/Button';
import FeatureAvailabilitySwitch from '../../../../components/common/FeatureAvailabilitySwitch';
import { supabase } from '../../../../lib/supabaseClient';
import ReadingMarathonCourse from './ReadingMarathonCourse';
import {
    DEFAULT_TARGET_DISTANCE_M,
    formatMarathonDistance,
    normalizeMarathonSnapshot
} from './readingMarathon';
import './readingMarathon.css';

const TARGET_PRESETS = [10000, 42195, 100000];
const MEDALS = ['🥇', '🥈', '🥉'];

const formatDate = (dateValue) => {
    if (!dateValue) return '정하지 않음';
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(new Date(`${dateValue}T00:00:00`));
};

const ReadingMarathonTeacherSettings = ({ classId, className }) => {
    const [snapshot, setSnapshot] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [pageSavingId, setPageSavingId] = useState(null);
    const [pageValues, setPageValues] = useState({});
    const [form, setForm] = useState({
        title: `${className || '우리 반'} 독서마라톤`,
        targetDistanceM: DEFAULT_TARGET_DISTANCE_M,
        endsOn: '',
        enabled: false
    });

    const applySnapshot = useCallback((data) => {
        const normalized = normalizeMarathonSnapshot(data);
        setSnapshot(normalized);
        if (normalized.campaign) {
            setForm({
                title: normalized.campaign.title,
                targetDistanceM: Number(normalized.campaign.target_distance_m) || DEFAULT_TARGET_DISTANCE_M,
                endsOn: normalized.campaign.ends_on || '',
                enabled: Boolean(normalized.campaign.is_enabled)
            });
        } else {
            setForm({
                title: `${className || '우리 반'} 독서마라톤`,
                targetDistanceM: DEFAULT_TARGET_DISTANCE_M,
                endsOn: '',
                enabled: false
            });
        }
    }, [className]);

    useEffect(() => {
        if (!classId) return undefined;
        let active = true;
        const load = async () => {
            setLoading(true);
            const { data, error } = await supabase.rpc('get_reading_marathon_snapshot', { p_class_id: classId });
            if (!active) return;
            setLoading(false);
            if (error) {
                console.error('교사 독서마라톤 설정 로드 실패:', error.message);
                return;
            }
            applySnapshot(data);
        };
        load();
        return () => { active = false; };
    }, [applySnapshot, classId]);

    const leaderboard = useMemo(
        () => (snapshot?.leaderboard || []).filter((row) => row.distance_m > 0),
        [snapshot?.leaderboard]
    );

    const saveCampaign = async ({ startNew = false } = {}) => {
        if (!form.title.trim()) {
            alert('독서마라톤 이름을 입력해주세요.');
            return;
        }
        setSaving(true);
        const { data, error } = await supabase.rpc('save_teacher_reading_marathon', {
            p_class_id: classId,
            p_title: form.title.trim(),
            p_target_distance_m: Math.round(Number(form.targetDistanceM)),
            p_ends_on: form.endsOn || null,
            p_enabled: form.enabled,
            p_start_new: startNew
        });
        setSaving(false);
        if (error) {
            console.error('독서마라톤 설정 저장 실패:', error.message);
            alert(error.message || '독서마라톤 설정을 저장하지 못했습니다.');
            return;
        }
        applySnapshot(data);
        alert(startNew ? '새 독서마라톤을 시작했습니다! 🏃' : '독서마라톤 설정을 저장했습니다.');
    };

    const savePageCount = async (book) => {
        const pageCount = Number(pageValues[book.post_id]);
        if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 10000) {
            alert('페이지 수를 1~10,000쪽 사이로 입력해주세요.');
            return;
        }
        setPageSavingId(book.post_id);
        const { data, error } = await supabase.rpc('set_teacher_reading_book_page_count', {
            p_class_id: classId,
            p_post_id: book.post_id,
            p_page_count: pageCount
        });
        setPageSavingId(null);
        if (error) {
            console.error('책 페이지 수 저장 실패:', error.message);
            alert('페이지 수를 저장하지 못했습니다.');
            return;
        }
        setPageValues((current) => {
            const next = { ...current };
            delete next[book.post_id];
            return next;
        });
        applySnapshot(data);
    };

    if (loading) return <div className="reading-marathon-settings__loading">독서마라톤 코스를 준비하는 중... 🏃</div>;

    const completed = snapshot?.campaign?.status === 'completed';
    const campaign = snapshot?.campaign;
    const summary = snapshot?.summary;
    const podium = leaderboard.slice(0, 3);
    const remainingDistanceM = Math.max(0, (summary?.targetDistanceM || 0) - (summary?.totalDistanceM || 0));

    return (
        <section className="reading-marathon-settings" aria-labelledby="reading-marathon-settings-title">
            <header>
                <div>
                    <span>독서 동기부여</span>
                    <h3 id="reading-marathon-settings-title">🏃 독서마라톤</h3>
                    <p>우리 반이 함께 목표 거리를 완주하고, 학생별 기여 거리와 순위도 확인합니다.</p>
                </div>
                <FeatureAvailabilitySwitch
                    checked={form.enabled}
                    onChange={(enabled) => setForm((current) => ({ ...current, enabled }))}
                    disabled={completed}
                    enabledLabel="학생 독서마라톤 사용 중"
                    disabledLabel="학생 독서마라톤 사용 안 함"
                    enabledDescription="설정 저장 후 학생 화면에 마라톤이 보입니다."
                    disabledDescription="설정 저장 후 학생 화면에서 마라톤을 숨깁니다."
                    ariaLabel="학생 독서마라톤 사용"
                />
            </header>

            {campaign ? (
                <>
                    <section className="reading-marathon-overview" aria-labelledby="reading-marathon-overview-title">
                        <div className="reading-marathon-section-heading">
                            <div>
                                <span>현재 운영 현황</span>
                                <h4 id="reading-marathon-overview-title">{campaign.title}</h4>
                            </div>
                            <strong className={`reading-marathon-status reading-marathon-status--${campaign.status}`}>
                                {completed ? '공동 목표 완주' : campaign.is_enabled ? '학생에게 표시 중' : '학생에게 숨김'}
                            </strong>
                        </div>
                        <dl className="reading-marathon-overview__stats">
                            <div><dt>공동 달성 거리</dt><dd>{formatMarathonDistance(summary.totalDistanceM)}</dd></div>
                            <div><dt>목표 달성률</dt><dd>{Math.round(summary.progressPercent)}%</dd></div>
                            <div><dt>남은 거리</dt><dd>{formatMarathonDistance(remainingDistanceM)}</dd></div>
                            <div><dt>참여 학생</dt><dd>{summary.contributors}명</dd></div>
                            <div><dt>종료일</dt><dd>{formatDate(campaign.ends_on)}</dd></div>
                        </dl>
                    </section>

                    <section className="reading-marathon-student-preview" aria-labelledby="reading-marathon-preview-title">
                        <div className="reading-marathon-section-heading">
                            <div>
                                <span>학생 화면 확인</span>
                                <h4 id="reading-marathon-preview-title">학생에게 이렇게 보여요</h4>
                                <p>학생 대시보드에 표시되는 실제 공동 코스와 순위 구성입니다.</p>
                            </div>
                            <strong>{campaign.is_enabled ? '현재 표시 중' : '기능을 켜면 표시'}</strong>
                        </div>

                        <ReadingMarathonCourse title={campaign.title} summary={summary} completed={completed} />

                        <div className="reading-marathon-card__tracks">
                            <article className="reading-marathon-track reading-marathon-track--individual">
                                <header><span>🏅</span><div><strong>우리 반 독서 기여 순위</strong><small>공동 목표에 보탠 독서 거리</small></div></header>
                                {podium.length > 0 ? (
                                    <ol className="reading-marathon-podium">
                                        {podium.map((row, index) => (
                                            <li key={row.student_id}>
                                                <span>{MEDALS.at(index)}</span>
                                                <strong>{row.name}</strong>
                                                <em>{formatMarathonDistance(row.distance_m)}</em>
                                            </li>
                                        ))}
                                    </ol>
                                ) : <p className="reading-marathon-track__empty">첫 번째 독서 기록을 기다리고 있어요.</p>}
                                <div className="reading-marathon-my-race reading-marathon-my-race--guide">
                                    <span>학생마다 자신의 현재 순위가 보여요</span>
                                    <small>내가 읽은 거리 · 책 수 · 페이지 수를 함께 확인합니다.</small>
                                </div>
                            </article>

                            <article className="reading-marathon-track reading-marathon-track--class">
                                <header><span>🤝</span><div><strong>공동 목표 현황</strong><small>모두의 거리를 합쳐 완주</small></div></header>
                                <dl>
                                    <div><dt>참여 학생</dt><dd>{summary.contributors}명</dd></div>
                                    <div><dt>함께 읽은 책</dt><dd>{summary.bookCount}권</dd></div>
                                    <div><dt>함께 읽은 쪽</dt><dd>{summary.totalPages.toLocaleString('ko-KR')}쪽</dd></div>
                                </dl>
                                {summary.pendingBookCount > 0 && (
                                    <p className="reading-marathon-pending">📖 페이지 정보 확인 중인 책 {summary.pendingBookCount}권</p>
                                )}
                            </article>
                        </div>
                    </section>

                    <div className="reading-marathon-settings__tracks">
                        <section>
                            <h4>🏅 우리 반 독서 기여 순위</h4>
                            <p>공동 목표에 보탠 개인별 독서 거리입니다. 학생 화면에는 상위 3명과 본인 순위가 표시됩니다.</p>
                            {leaderboard.length > 0 ? (
                                <ol className="reading-marathon-teacher-ranking">
                                    {leaderboard.map((row) => (
                                        <li key={row.student_id}><span>{row.rank}위</span><strong>{row.name}</strong><em>{row.book_count}권 · {formatMarathonDistance(row.distance_m)}</em></li>
                                    ))}
                                </ol>
                            ) : <p>아직 페이지가 반영된 학생이 없습니다.</p>}
                        </section>
                        <section>
                            <h4>📖 페이지 정보 확인이 필요한 책</h4>
                            <p>자동으로 페이지 수를 찾지 못한 책만 교사가 직접 입력할 수 있습니다.</p>
                            {snapshot.pendingBooks.length > 0 ? (
                                <div className="reading-marathon-pending-list">
                                    {snapshot.pendingBooks.map((book) => (
                                        <div key={book.post_id}>
                                            <span><strong>{book.book_title}</strong><small>{book.student_name} · {book.isbn13 || book.isbn10 || 'ISBN 없음'}</small></span>
                                            <label><input type="number" min="1" max="10000" aria-label={`${book.book_title} 페이지 수`} placeholder="쪽수" value={pageValues[book.post_id] || ''} onChange={(event) => setPageValues((current) => ({ ...current, [book.post_id]: event.target.value }))} /><em>쪽</em></label>
                                            <Button type="button" size="sm" variant="outline" onClick={() => savePageCount(book)} disabled={pageSavingId === book.post_id}>{pageSavingId === book.post_id ? '저장 중' : '반영'}</Button>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="reading-marathon-settings__done">페이지 정보가 필요한 새 책이 없습니다. ✅</p>}
                        </section>
                    </div>
                </>
            ) : (
                <div className="reading-marathon-settings__empty">
                    <span>🏁</span>
                    <strong>아직 만든 독서마라톤이 없습니다.</strong>
                    <p>아래에서 이름과 공동 목표 거리를 정하면 학생 화면에 표시할 수 있습니다.</p>
                </div>
            )}

            <section className="reading-marathon-config" aria-labelledby="reading-marathon-config-title">
                <div className="reading-marathon-section-heading">
                    <div>
                        <span>운영 설정</span>
                        <h4 id="reading-marathon-config-title">마라톤 설정 바꾸기</h4>
                    </div>
                </div>
                <form onSubmit={(event) => { event.preventDefault(); saveCampaign(); }} className="reading-marathon-settings__form">
                <label>
                    <span>마라톤 이름</span>
                    <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} maxLength={60} />
                </label>
                <fieldset>
                    <legend>학급 공동 목표 거리</legend>
                    <div className="reading-marathon-presets">
                        {TARGET_PRESETS.map((meters) => (
                            <button key={meters} type="button" className={form.targetDistanceM === meters ? 'active' : ''} onClick={() => setForm((current) => ({ ...current, targetDistanceM: meters }))}>
                                {meters === 42195 ? '정식 마라톤 42.195km' : formatMarathonDistance(meters)}
                            </button>
                        ))}
                    </div>
                    <label className="reading-marathon-custom-target">
                        <span>직접 입력</span>
                        <input type="number" min="1" max="10000" step="0.001" value={form.targetDistanceM / 1000} onChange={(event) => setForm((current) => ({ ...current, targetDistanceM: Number(event.target.value) * 1000 }))} />
                        <em>km</em>
                    </label>
                </fieldset>
                <label>
                    <span>종료일(선택)</span>
                    <input type="date" value={form.endsOn} onChange={(event) => setForm((current) => ({ ...current, endsOn: event.target.value }))} />
                </label>
                <p className="reading-marathon-settings__rule">한 페이지는 10m로 계산합니다. 한 학생의 같은 책은 한 번만 인정됩니다.</p>
                {completed ? (
                    <Button type="button" onClick={() => saveCampaign({ startNew: true })} disabled={saving}>새 마라톤 시작하기 🏁</Button>
                ) : (
                    <Button type="submit" disabled={saving}>{saving ? '저장 중...' : snapshot?.campaign ? '설정 저장하기' : '독서마라톤 만들기'}</Button>
                )}
                </form>
            </section>
        </section>
    );
};

export default ReadingMarathonTeacherSettings;
