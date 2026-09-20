import React, { useCallback, useEffect, useMemo, useState, Suspense, lazy } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { resolveEnabledModuleIds, getEnabledModules } from '../../modules/registry';
import DashboardMenu from '../student/DashboardMenu';
import './StudentDashboardPreview.css';

// 설정에 있던 "글쓰기 창 관리"를 이 화면으로 합쳤다(2026-09-20). 같은 성격(학생 화면 미리보기·설정).
const TeacherWritingEditorManager = lazy(() => import('../../modules/writing/editor-settings/TeacherWritingEditorManager'));

/*
 * 학생 대시보드 미리보기(교사용, 읽기 전용).
 *
 * 학생 앱은 익명 인증(auth.uid=학생)이라 교사가 라이브로 못 부른다. 그래서 학급 단위 콘텐츠를
 * 교사 권한으로 모아 주는 get_teacher_student_home_preview_v1 로 학생 홈을 재현한다.
 * 화면은 실제 학생 홈 컴포넌트(DashboardMenu)를 그대로 렌더해 디자인을 100% 맞춘다.
 * 상태 훅은 합성 부트스트랩(비어 있지 않음)을 넘겨 조회 없이 초기값만 쓰게 한다.
 */

const StudentDashboardPreview = ({ activeClass, isMobile }) => {
    const [view, setView] = useState('home'); // 'home' | 'writing-editor'
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [panel, setPanel] = useState({ id: 'mission_list', title: '과제 글쓰기' });

    const load = useCallback(async () => {
        if (!activeClass?.id) return;
        setLoading(true);
        setError('');
        try {
            const { data, error: rpcError } = await supabase.rpc('get_teacher_student_home_preview_v1', { p_class_id: activeClass.id });
            if (rpcError) throw rpcError;
            if (!data?.class_config) throw new Error('미리보기 응답을 확인할 수 없습니다.');
            setPreview(data);
        } catch (err) {
            setError(err?.message || '학생 대시보드 미리보기를 불러오지 못했습니다.');
            setPreview(null);
        } finally {
            setLoading(false);
        }
    }, [activeClass?.id]);

    useEffect(() => { void load(); }, [load]);

    const enabledModules = useMemo(() => {
        const config = preview?.class_config;
        if (!config) return [];
        const ids = resolveEnabledModuleIds(config.enabled_modules, config);
        return getEnabledModules(ids, 'student');
    }, [preview?.class_config]);

    const missions = preview?.missions || [];
    const feed = preview?.friends_feed || [];
    const exhibitions = preview?.exhibitions || [];
    const diaryToday = preview?.diary_today || { submitted_count: 0, students: [] };
    // 놀이터·나의 아지트 "설정" = 그 자리에 켜진 모듈.
    const myAgitModules = useMemo(() => enabledModules.filter((m) => m.myAgit), [enabledModules]);
    const playgroundModules = useMemo(() => enabledModules.filter((m) => m.playground), [enabledModules]);

    // 실제 DashboardMenu 가 쓰는 부트스트랩을 흉내 낸다(조회 없이 초기값만).
    const syntheticBootstrap = useMemo(() => {
        if (!preview) return null;
        const home = { has_new_mission: missions.length > 0 };
        for (const module of enabledModules) {
            const key = module.studentDashboard?.visibilityKey;
            if (key) home[key] = true; // 켜진 모듈은 학생 홈에 보인다.
        }
        return {
            home,
            reading_daily: { daily_limit: preview.reading_policy?.daily_limit ?? 1, completed_today: 0 },
            diary_daily: {
                is_enabled: Boolean(preview.diary_enabled),
                daily_limit: preview.diary_policy?.daily_limit ?? 1,
                completed_today: 0,
                has_today_diary: false
            }
        };
    }, [preview, enabledModules, missions.length]);

    const openPanel = useCallback((route) => {
        if (route === 'mission_list') return setPanel({ id: 'mission_list', title: '과제 글쓰기' });
        if (route === 'reading_logs') return setPanel({ id: 'reading_logs', title: '독서록' });
        if (route === 'diaries') return setPanel({ id: 'diaries', title: '일기' });
        if (route === 'friends_hideout') return setPanel({ id: 'friends_hideout', title: '친구 아지트' });
        const module = enabledModules.find((m) => m.studentRoute === route);
        if (module?.id === 'class-agit') return setPanel({ id: 'exhibitions', title: '우리반 아지트 전시' });
        return setPanel({
            id: route,
            title: module ? (module.studentDashboard?.title || module.name) : route,
            description: module ? `${module.name} 모듈이 학생에게 켜져 있습니다.` : null
        });
    }, [enabledModules]);

    const renderModuleList = (list, emptyText) => (
        list.length === 0
            ? <p className="student-preview__empty">{emptyText}</p>
            : <ul className="student-preview__list">{list.map((module) => (
                <li key={module.id}>
                    <div className="student-preview__list-head">
                        <strong>{module.icon} {module.name}</strong>
                    </div>
                    {module.description && <small>{module.description}</small>}
                </li>
            ))}</ul>
    );

    const renderPanel = () => {
        if (!preview) return null;
        if (panel.id === 'mission_list') {
            return (
                <>
                    <h3>과제 글쓰기 <span>{missions.length}개</span></h3>
                    <p className="student-preview__panel-note">학생이 과제 메뉴에서 보는 목록입니다.</p>
                    {missions.length === 0
                        ? <p className="student-preview__empty">지금 낸 과제가 없어 학생 과제 목록은 비어 보입니다.</p>
                        : <ul className="student-preview__list">{missions.map((mission) => (
                            <li key={mission.id}>
                                <div className="student-preview__list-head">
                                    <strong>{mission.title || '제목 없는 과제'}</strong>
                                    {mission.genre && <span className="student-preview__chip">{mission.genre}</span>}
                                </div>
                                {mission.guide && <p className="student-preview__list-guide">{mission.guide}</p>}
                                <small>제출 {mission.submitted_count || 0}명 · 기본 {mission.base_reward || 0}P · {new Date(mission.created_at).toLocaleDateString('ko-KR')}</small>
                            </li>
                        ))}</ul>}
                </>
            );
        }
        if (panel.id === 'friends_hideout') {
            return (
                <>
                    <h3>친구 아지트 <span>최근 {feed.length}편</span></h3>
                    <p className="student-preview__panel-note">반 친구들이 공개한 글이 학생에게 이렇게 보입니다.</p>
                    {feed.length === 0
                        ? <p className="student-preview__empty">아직 반에 공개된 글이 없습니다.</p>
                        : <ul className="student-preview__list">{feed.map((post) => (
                            <li key={post.post_id}>
                                <div className="student-preview__list-head">
                                    <strong>{post.title || '제목 없는 글'}</strong>
                                    <span className="student-preview__chip">{post.kind}</span>
                                </div>
                                <small>{post.author_name} · {new Date(post.created_at).toLocaleDateString('ko-KR')}</small>
                            </li>
                        ))}</ul>}
                </>
            );
        }
        if (panel.id === 'reading_logs') {
            const policy = preview.reading_policy;
            return (
                <>
                    <h3>독서록</h3>
                    <p className="student-preview__panel-note">독서록은 학생마다 쓰는 개인 화면이라 목록은 각 학생 화면에서 보입니다. 지금 설정은 이렇습니다.</p>
                    <ul className="student-preview__facts">
                        <li><span>메뉴 노출</span><strong>{policy?.enabled ? '켜짐' : '꺼짐'}</strong></li>
                        <li><span>하루 포인트 지급</span><strong>최대 {policy?.daily_limit ?? 1}회</strong></li>
                    </ul>
                </>
            );
        }
        if (panel.id === 'diaries') {
            const policy = preview.diary_policy;
            return (
                <>
                    <h3>일기 <span>오늘 {diaryToday.submitted_count}명 제출</span></h3>
                    <ul className="student-preview__facts">
                        <li><span>메뉴 노출</span><strong>{policy?.enabled ? '켜짐' : '꺼짐'}</strong></li>
                        <li><span>하루 포인트 지급</span><strong>최대 {policy?.daily_limit ?? 1}회</strong></li>
                    </ul>
                    <p className="student-preview__panel-note">오늘 일기를 낸 학생</p>
                    {diaryToday.students?.length > 0
                        ? <div className="student-preview__names">{diaryToday.students.map((name) => <span key={name}>{name}</span>)}</div>
                        : <p className="student-preview__empty">아직 오늘 일기를 낸 학생이 없습니다.</p>}
                </>
            );
        }
        if (panel.id === 'exhibitions') {
            return (
                <>
                    <h3>진행 중인 전시 <span>{exhibitions.length}개</span></h3>
                    <p className="student-preview__panel-note">우리반 아지트에서 지금 공개 중인 전시입니다.</p>
                    {exhibitions.length === 0
                        ? <p className="student-preview__empty">지금 공개 중인 전시가 없습니다.</p>
                        : <ul className="student-preview__list">{exhibitions.map((ex) => (
                            <li key={ex.id}>
                                <div className="student-preview__list-head"><strong>{ex.title || '제목 없는 전시'}</strong></div>
                                {ex.published_at && <small>공개 {new Date(ex.published_at).toLocaleDateString('ko-KR')}</small>}
                            </li>
                        ))}</ul>}
                </>
            );
        }
        if (panel.id === 'my_agit') {
            return (
                <>
                    <h3>나의 아지트 설정</h3>
                    <p className="student-preview__panel-note">나의 아지트에 켜져 있는 항목입니다(서재·칭호·드래곤 등). 개인 진행 상황은 각 학생 화면에서 보입니다.</p>
                    {renderModuleList(myAgitModules, '나의 아지트에 켜진 추가 항목이 없습니다(기본 서재·칭호만 보입니다).')}
                </>
            );
        }
        if (panel.id === 'playground') {
            return (
                <>
                    <h3>아지트 놀이터 설정</h3>
                    <p className="student-preview__panel-note">놀이터에 켜져 있는 놀거리입니다. 포인트·개인 진행 상황은 각 학생 화면에서 보입니다.</p>
                    {renderModuleList(playgroundModules, '놀이터에 켜진 놀거리가 없습니다.')}
                </>
            );
        }
        if (panel.id === 'lab') {
            return (
                <>
                    <h3>글쓰기 연구소</h3>
                    <p className="student-preview__panel-note">글쓰기 연구소 세션은 학생 개인이 외부 연구소에서 진행하는 활동이라, 학급 단위 진행 목록을 미리보기에서 불러올 수 없습니다. 연구소 활동은 학생 로그인 화면 또는 연구소 관리에서 확인해 주세요.</p>
                </>
            );
        }
        return (
            <>
                <h3>{panel.title}</h3>
                <p className="student-preview__panel-note">이 메뉴는 학생 개인 화면(포인트·서재·진행 상황 등)이라 미리보기에서는 <strong>열림 여부와 위치</strong>만 확인할 수 있어요. 실제 내용은 학생 로그인 화면에서 보입니다.</p>
                {panel.description && <p className="student-preview__empty">{panel.description}</p>}
            </>
        );
    };

    return (
        <div className="student-preview">
            <div className="student-preview__intro">
                <div>
                    <h2>학생 대시보드 미리보기</h2>
                    <p>지금 <strong>{activeClass?.name}</strong> 학생 화면에 열려 있는 메뉴 구성입니다. 카드를 누르면 오른쪽에서 그 메뉴의 실제 내용을 확인할 수 있어요(개인 화면은 구성만).</p>
                </div>
                {view === 'home' && <button type="button" className="student-preview__refresh" onClick={load} disabled={loading}>새로고침</button>}
            </div>

            <div className="student-preview__viewtabs" role="tablist" aria-label="미리보기 화면 전환">
                <button type="button" role="tab" aria-selected={view === 'home'} className={view === 'home' ? 'is-active' : ''} onClick={() => setView('home')}>🏠 학생 홈 미리보기</button>
                <button type="button" role="tab" aria-selected={view === 'writing-editor'} className={view === 'writing-editor' ? 'is-active' : ''} onClick={() => setView('writing-editor')}>✍️ 글쓰기 창 관리</button>
            </div>

            {view === 'writing-editor' && (
                <Suspense fallback={<p className="student-preview__empty">글쓰기 창 관리를 불러오는 중…</p>}>
                    <TeacherWritingEditorManager activeClass={activeClass} isMobile={isMobile} />
                </Suspense>
            )}

            {view === 'home' && preview && (
                <div className="student-preview__summary" role="group" aria-label="학급 현황 모아보기">
                    <span className="student-preview__summary-label">모아 보기</span>
                    <button type="button" className={panel.id === 'exhibitions' ? 'is-active' : ''} onClick={() => setPanel({ id: 'exhibitions', title: '전시' })}>🖼️ 진행 중 전시 {exhibitions.length}</button>
                    <button type="button" className={panel.id === 'diaries' ? 'is-active' : ''} onClick={() => setPanel({ id: 'diaries', title: '일기' })}>📔 오늘 일기 {diaryToday.submitted_count}명</button>
                    <button type="button" className={panel.id === 'my_agit' ? 'is-active' : ''} onClick={() => setPanel({ id: 'my_agit', title: '나의 아지트' })}>🏡 나의 아지트 설정</button>
                    <button type="button" className={panel.id === 'playground' ? 'is-active' : ''} onClick={() => setPanel({ id: 'playground', title: '놀이터' })}>🎡 놀이터 설정</button>
                    <button type="button" className={panel.id === 'lab' ? 'is-active' : ''} onClick={() => setPanel({ id: 'lab', title: '글쓰기 연구소' })}>🔬 글쓰기 연구소</button>
                </div>
            )}

            {view === 'home' && error && <p className="student-preview__error" role="status">{error}</p>}
            {view === 'home' && loading && !preview && <p className="student-preview__empty">학생 화면 구성을 불러오는 중…</p>}

            {view === 'home' && preview && (
                <div className="student-preview__frame">
                    <div className="student-preview__phone">
                        <div className="student-preview__phone-bar"><span>학생 홈 화면</span></div>
                        <div className="student-preview__phone-body">
                            <DashboardMenu
                                onNavigate={openPanel}
                                onOpenMyAgit={() => setPanel({ id: 'my_agit', title: '나의 아지트' })}
                                onOpenPlayground={() => setPanel({ id: 'playground', title: '아지트 놀이터' })}
                                playgroundCount={0}
                                studentSession={null}
                                homeBootstrap={syntheticBootstrap}
                                enabledModules={enabledModules}
                            />
                        </div>
                    </div>

                    <section className="student-preview__panel">{renderPanel()}</section>
                </div>
            )}
        </div>
    );
};

export default StudentDashboardPreview;
