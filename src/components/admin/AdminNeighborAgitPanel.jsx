import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../common/Button';
import {
    NEIGHBOR_AGIT_ACCEPTANCE_ITEMS,
    neighborAgitAdminApi
} from '../../modules/community/neighbor-agit/adminApi';
import {
    NeighborAgitStudentPreview,
    NeighborAgitTeacherPreview
} from '../../modules/community/neighbor-agit/NeighborAgitPreviews';
import './AdminNeighborAgitPanel.css';

const getModeLabel = (mode) => {
    if (mode === 'internal') return '관리자 내부 확인';
    if (mode === 'public_beta') return '전체 교사 Beta';
    if (mode === 'paused') return '긴급 중지';
    return '확인 필요';
};

const SUMMARY_ITEMS = Object.freeze([
    { id: 'spaces', label: '운영 공간', unit: '개', read: (summary) => summary?.active_space_count },
    { id: 'classes', label: '참여 학급', unit: '개', read: (summary) => summary?.active_class_count },
    { id: 'posts', label: '공개 글', unit: '편', read: (summary) => summary?.published_post_count },
    { id: 'comments', label: '보이는 댓글', unit: '개', read: (summary) => summary?.visible_comment_count },
    { id: 'reactions', label: '공감', unit: '개', read: (summary) => summary?.reaction_count },
    { id: 'saves', label: '간직하기', unit: '개', read: (summary) => summary?.save_count }
]);

const AdminNeighborAgitPanel = ({ api = neighborAgitAdminApi, initialDashboard = null }) => {
    const [dashboard, setDashboard] = useState(initialDashboard);
    const [selectedSpaceId, setSelectedSpaceId] = useState('');
    const [selectedClassIds, setSelectedClassIds] = useState([]);
    const [trialName, setTrialName] = useState('관리자 내부 시험 공간');
    const [loading, setLoading] = useState(!initialDashboard);
    const [action, setAction] = useState('');
    const [message, setMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const loadDashboard = useCallback(async (spaceId = null) => {
        setLoading(true);
        setErrorMessage('');
        try {
            const next = await api.getDashboard(spaceId);
            setDashboard(next);
            const nextSpaceId = spaceId || next.preview_space_id || next.spaces[0]?.space_id || '';
            setSelectedSpaceId(nextSpaceId);
        } catch (error) {
            setErrorMessage(error.message || '이웃 아지트 운영 현황을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [api]);

    useEffect(() => {
        if (!initialDashboard) void loadDashboard();
    }, [initialDashboard, loadDashboard]);

    const selectedSpace = useMemo(
        () => dashboard?.spaces?.find((space) => space.space_id === selectedSpaceId) || null,
        [dashboard?.spaces, selectedSpaceId]
    );
    const acceptanceChecks = dashboard?.rollout?.acceptance_checks || {};
    const acceptanceReady = dashboard?.rollout?.ready_for_public_beta === true;
    const availableClasses = dashboard?.eligible_classes?.filter((item) => item.available) || [];

    const selectSpace = async (spaceId) => {
        if (spaceId === selectedSpaceId || action) return;
        setSelectedSpaceId(spaceId);
        setAction('space');
        try {
            const next = await api.getDashboard(spaceId);
            setDashboard(next);
        } catch (error) {
            setErrorMessage(error.message || '선택한 공간의 미리보기를 불러오지 못했습니다.');
        } finally {
            setAction('');
        }
    };

    const toggleClass = (classId) => {
        setSelectedClassIds((current) => (
            current.includes(classId)
                ? current.filter((id) => id !== classId)
                : current.length < 4 ? [...current, classId] : current
        ));
    };

    const createTrial = async (event) => {
        event.preventDefault();
        if (selectedClassIds.length < 2 || selectedClassIds.length > 4 || action) return;
        setAction('trial');
        setErrorMessage('');
        setMessage('');
        try {
            const result = await api.createTrial({
                name: trialName.trim(), classIds: selectedClassIds
            });
            setSelectedClassIds([]);
            setMessage('학생 공개가 모두 OFF인 내부 시험 공간을 만들었습니다.');
            await loadDashboard(result.space_id);
        } catch (error) {
            setErrorMessage(error.message || '내부 시험 공간을 만들지 못했습니다.');
        } finally {
            setAction('');
        }
    };

    const saveAcceptanceCheck = async (key, checked) => {
        if (action) return;
        setAction(`check-${key}`);
        setErrorMessage('');
        try {
            const result = await api.setAcceptanceCheck(key, checked);
            setDashboard((current) => ({
                ...current,
                rollout: {
                    ...current.rollout,
                    acceptance_checks: result.acceptance_checks,
                    ready_for_public_beta: result.ready_for_public_beta
                }
            }));
        } catch (error) {
            setErrorMessage(error.message || '인수 점검 결과를 저장하지 못했습니다.');
        } finally {
            setAction('');
        }
    };

    const changeRollout = async (mode) => {
        if (action || mode === dashboard?.rollout?.mode) return;
        let confirmation = '';
        if (mode === 'public_beta') {
            if (!acceptanceReady) return;
            if (!window.confirm('모든 승인 교사에게 실제 이웃 아지트 화면을 공개합니다. 계속할까요?')) return;
            confirmation = window.prompt('확인을 위해 “전체 교사 Beta 공개”를 그대로 입력하세요.') || '';
            if (confirmation !== '전체 교사 Beta 공개') {
                setErrorMessage('확인 문구가 일치하지 않아 공개하지 않았습니다.');
                return;
            }
        } else if (!window.confirm(`${getModeLabel(mode)} 단계로 변경할까요?`)) {
            return;
        }

        setAction('rollout');
        setErrorMessage('');
        try {
            await api.changeRollout(mode, confirmation);
            setMessage(`${getModeLabel(mode)} 단계로 변경했습니다.`);
            await loadDashboard(selectedSpaceId || null);
        } catch (error) {
            setErrorMessage(error.message || '공개 단계를 변경하지 못했습니다.');
        } finally {
            setAction('');
        }
    };

    if (loading && !dashboard) {
        return <div className="neighbor-admin-state">이웃 아지트 운영 현황을 불러오는 중입니다…</div>;
    }

    return (
        <section className="neighbor-admin" aria-labelledby="neighbor-admin-title">
            <header className="neighbor-admin__header">
                <div>
                    <span className={`neighbor-admin__mode neighbor-admin__mode--${dashboard?.rollout?.mode || 'internal'}`}>
                        {getModeLabel(dashboard?.rollout?.mode)}
                    </span>
                    <h2 id="neighbor-admin-title">🤝 이웃 아지트 기능 공개</h2>
                    <p>관리자가 먼저 시험하고 점검표를 모두 확인한 뒤에만 전체 교사 Beta를 열 수 있습니다.</p>
                </div>
                <Button type="button" variant="outline" loading={loading} onClick={() => loadDashboard(selectedSpaceId || null)}>
                    새로고침
                </Button>
            </header>

            <div className="neighbor-admin__notice" role="status" aria-live="polite">
                <strong>현재 일반 교사·학생 공개 상태</strong>
                <span>{dashboard?.rollout?.mode === 'public_beta'
                    ? '승인 교사에게 실제 화면이 보이며, 학생은 학급별 스위치가 ON일 때만 들어갑니다.'
                    : '일반 교사는 준비 화면만 보고 학생 진입은 서버에서 차단됩니다.'}</span>
            </div>

            {errorMessage && <p className="neighbor-admin__message neighbor-admin__message--error" role="alert">{errorMessage}</p>}
            {message && <p className="neighbor-admin__message" role="status">{message}</p>}

            <div className="neighbor-admin__summary">
                {SUMMARY_ITEMS.map((item) => (
                    <article key={item.id}><span>{item.label}</span><strong>{Number(item.read(dashboard?.summary)) || 0}{item.unit}</strong></article>
                ))}
            </div>

            <div className="neighbor-admin__workspace">
                <section className="neighbor-admin-card">
                    <div className="neighbor-admin-card__heading">
                        <div><span>내부 시험</span><h3>시험 공간 만들기</h3></div>
                        <small>2~4개 학급 · 학생 공개 기본 OFF</small>
                    </div>
                    <form onSubmit={createTrial}>
                        <label htmlFor="neighbor-trial-name">공간 이름</label>
                        <input id="neighbor-trial-name" value={trialName} maxLength={60} required onChange={(event) => setTrialName(event.target.value)} />
                        <fieldset>
                            <legend>시험 학급 선택 ({selectedClassIds.length}/4)</legend>
                            <div className="neighbor-admin__class-list">
                                {availableClasses.map((item) => (
                                    <label key={item.class_id}>
                                        <input
                                            type="checkbox"
                                            checked={selectedClassIds.includes(item.class_id)}
                                            disabled={!selectedClassIds.includes(item.class_id) && selectedClassIds.length >= 4}
                                            onChange={() => toggleClass(item.class_id)}
                                        />
                                        <span><strong>{item.class_name}</strong><small>{item.teacher_name}</small></span>
                                    </label>
                                ))}
                                {availableClasses.length === 0 && <p>새 시험 공간에 사용할 수 있는 학급이 없습니다.</p>}
                            </div>
                        </fieldset>
                        <Button
                            type="submit"
                            loading={action === 'trial'}
                            disabled={Boolean(action) || selectedClassIds.length < 2 || !trialName.trim()}
                        >
                            선택한 학급으로 내부 시험 공간 만들기
                        </Button>
                    </form>
                </section>

                <section className="neighbor-admin-card">
                    <div className="neighbor-admin-card__heading">
                        <div><span>공간 현황</span><h3>최근 공간</h3></div>
                        <small>최근 20개</small>
                    </div>
                    <div className="neighbor-admin__space-list">
                        {(dashboard?.spaces || []).map((space) => (
                            <button
                                type="button"
                                key={space.space_id}
                                className={space.space_id === selectedSpaceId ? 'is-selected' : ''}
                                aria-pressed={space.space_id === selectedSpaceId}
                                onClick={() => selectSpace(space.space_id)}
                            >
                                <span><strong>{space.name}</strong><small>{space.status} · {space.memberships?.length || 0}학급</small></span>
                                <span>글 {Number(space.published_post_count) || 0} · 댓글 {Number(space.visible_comment_count) || 0}</span>
                            </button>
                        ))}
                        {!dashboard?.spaces?.length && <p>아직 만든 이웃 아지트 공간이 없습니다.</p>}
                    </div>
                </section>
            </div>

            <div className="neighbor-admin__previews">
                <NeighborAgitTeacherPreview space={selectedSpace} />
                <NeighborAgitStudentPreview space={selectedSpace} items={dashboard?.preview_feed || []} />
            </div>

            <section className="neighbor-admin-card neighbor-admin-card--acceptance">
                <div className="neighbor-admin-card__heading">
                    <div><span>공개 전 확인</span><h3>관리자 인수 점검표</h3></div>
                    <strong>{Object.values(acceptanceChecks).filter(Boolean).length}/6 확인</strong>
                </div>
                <div className="neighbor-admin__acceptance-list">
                    {NEIGHBOR_AGIT_ACCEPTANCE_ITEMS.map((item) => (
                        <div key={item.key}>
                            <input
                                id={`neighbor-acceptance-${item.key}`}
                                type="checkbox"
                                checked={acceptanceChecks[item.key] === true}
                                disabled={Boolean(action)}
                                onChange={(event) => saveAcceptanceCheck(item.key, event.target.checked)}
                            />
                            <label htmlFor={`neighbor-acceptance-${item.key}`}>
                                <strong>{item.label}</strong><span>{item.description}</span>
                            </label>
                        </div>
                    ))}
                </div>
                <div className="neighbor-admin__rollout-actions">
                    <Button type="button" variant="outline" disabled={Boolean(action) || dashboard?.rollout?.mode === 'internal'} onClick={() => changeRollout('internal')}>
                        관리자 내부로 되돌리기
                    </Button>
                    <Button type="button" variant="outline" disabled={Boolean(action) || dashboard?.rollout?.mode === 'paused'} onClick={() => changeRollout('paused')}>
                        긴급 중지
                    </Button>
                    <Button
                        type="button"
                        loading={action === 'rollout'}
                        disabled={Boolean(action) || !acceptanceReady || dashboard?.rollout?.mode === 'public_beta'}
                        onClick={() => changeRollout('public_beta')}
                    >
                        전체 교사 Beta 공개
                    </Button>
                </div>
                {!acceptanceReady && <p className="neighbor-admin__acceptance-help">여섯 항목을 모두 확인해야 공개 버튼이 활성화됩니다.</p>}
            </section>
        </section>
    );
};

export default AdminNeighborAgitPanel;
