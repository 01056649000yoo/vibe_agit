import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import StudentHeader from '../../../components/student/StudentHeader';
import StudentHomeGrowthPanel from '../../../components/student/StudentHomeGrowthPanel';
import WritingEditorFields from '../../../components/writing/WritingEditorFields';
import {
    WritingSectionHeader,
    WritingWorkspace,
    WritingWorkspaceHeader,
    WritingWorkspacePath
} from '../../../components/writing/WritingWorkspace';
import { supabase } from '../../../lib/supabaseClient';
import WritingToolHost from '../tools/WritingToolHost';
import { WritingEditorSettingsProvider } from './WritingEditorSettingsContext';
import {
    DEFAULT_WRITING_EDITOR_SETTINGS,
    SPELLING_LOOKUP_TOOL_ID,
    isWritingToolEnabled,
    normalizeWritingEditorSettings,
    setWritingToolEnabled
} from './settings';
import './teacherWritingEditorManager.css';
import '../../../components/student/DashboardMenu.css';
import '../../../components/student/StudentDashboard.css';
import '../../../components/student/StudentTodoCard.css';

const PREVIEW_WIDTHS = Object.freeze({
    desktop: { label: 'PC', width: 1120 },
    tablet: { label: '태블릿', width: 820 },
    mobile: { label: '휴대폰', width: 390 }
});

const HOME_PREVIEW_MENUS = [
    { icon: '📝', title: '과제 글쓰기', description: '선생님이 낸 글 확인하기', tone: 'amber' },
    { icon: '📚', title: '독서록', description: '오늘 0/1편 완료', tone: 'green', badge: '새 독서록 1편 가능' },
    { icon: '📔', title: '일기', description: '오늘 있었던 일 남기기', tone: 'blue', badge: '오늘 아직 안 썼어요' },
    { icon: '👀', title: '친구 아지트', description: '친구들의 최신 글과 책장 보기', tone: 'blue' },
    { icon: '🏡', title: '나의 아지트', description: '내 서재·칭호·드래곤 모아보기', tone: 'brown' },
    { icon: '🎡', title: '아지트 놀이터', description: '포인트로 즐기는 놀거리', tone: 'orange' }
];

const StudentHomePreview = () => (
    <div className="student-home-shell writing-editor-home-preview">
        <div className="student-home-content">
            <StudentHeader
                hasActivity
                openFeedback={() => {}}
                setIsGuideOpen={() => {}}
                onLogout={() => {}}
                onOpenFootprint={() => {}}
            />
            <StudentHomeGrowthPanel
                studentSession={{ name: '아지트 학생' }}
                points={1250}
                writerLevel={{ level: 2, name: '새싹 작가' }}
                readerLevel={{ level: 1, name: '책싹 독자' }}
                titleLoading={false}
                dragonEnabled={false}
                petData={{}}
                dragonInfo={{}}
                onOpenMyAgit={() => {}}
                onOpenDragon={() => {}}
                onOpenFootprint={() => {}}
            />
            <section className="student-todo-card" aria-label="오늘 할 일 미리보기">
                <header className="student-todo-card__header"><h2>오늘 할 일</h2><strong>1개 남음</strong></header>
                <div className="student-todo-card__rows">
                    <button
                        type="button"
                        className="student-todo-row"
                        style={{ '--todo-border': '#FFCC80', '--todo-bg': '#FFF8E1', '--todo-text': '#E65100', '--todo-chip': '#FB8C00' }}
                    >
                        <span className="student-todo-row__icon" aria-hidden="true">✏️</span>
                        <span className="student-todo-row__label">아직 안 쓴 과제 <strong>1개</strong></span>
                        <span className="student-todo-row__action">쓰러 가기</span>
                    </button>
                </div>
            </section>
            <section className="student-home-menu" aria-labelledby="student-home-preview-menu-title">
                <header className="student-home-menu__header">
                    <h2 id="student-home-preview-menu-title">주요 메뉴</h2>
                    <p>글을 쓰고, 친구의 글을 읽고, 포인트로 놀아 보세요.</p>
                </header>
                <div className="student-home-menu-grid">
                    {HOME_PREVIEW_MENUS.map((menu) => (
                        <button key={menu.title} type="button" className={`student-home-menu-card tone-${menu.tone}`}>
                            <span className="student-home-menu-card__icon" aria-hidden="true">{menu.icon}</span>
                            <span className="student-home-menu-card__copy">
                                <strong>{menu.title}</strong><small>{menu.description}</small>
                                {menu.badge && <em>{menu.badge}</em>}
                            </span>
                            <span className="student-home-menu-card__arrow" aria-hidden="true">›</span>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    </div>
);

const StudentWritingPreview = ({ settings, compact }) => {
    const [title, setTitle] = useState('비 오는 날의 운동장');
    const [content, setContent] = useState('비가 와서 운동장에 나가지 못했지만, 친구와 재미있는 이야기를 했습니다. 마춤법이 궁금한 표현은 직접 찾아볼 수 있어요.');

    return (
        <WritingEditorSettingsProvider overrideSettings={settings}>
            <div
                className="writing-editor-preview-interaction-guard"
                onClickCapture={(event) => {
                    if (event.target?.closest?.('button')) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }}
            >
                <WritingWorkspace tone="assignment" className="writing-editor-preview-workspace">
                    <WritingWorkspaceHeader
                        onBack={() => {}}
                        disabled
                        eyebrow="✍️ 글쓰기 과제"
                        title="우리 반의 특별한 하루"
                        description="생각을 정리한 뒤 글을 쓰고, 마지막에 한 번 검토해 제출해요."
                    />
                    <WritingWorkspacePath steps={['안내 읽기', '글쓰기', '검토·제출']} />
                    <div className="writing-guide">
                        <span className="writing-guide__label">💡 선생님의 글쓰기 안내</span>
                        <p>오늘 기억에 남은 일을 장면과 마음이 드러나게 써보세요.</p>
                    </div>
                    <section className="writing-editor-surface">
                        <WritingSectionHeader
                            icon="✍️"
                            title="본격 글쓰기"
                            description="제목과 내용을 차근차근 적어보세요."
                        />
                        <WritingToolHost disabled />
                        <WritingEditorFields
                            title={title}
                            onTitleChange={setTitle}
                            content={content}
                            onContentChange={setContent}
                            isMobile={compact}
                        />
                    </section>
                    <div className="writing-editor-preview-actions">
                        <Button type="button" variant="outline" disabled>저장</Button>
                        <Button type="button" disabled>검토하고 제출하기</Button>
                    </div>
                </WritingWorkspace>
            </div>
        </WritingEditorSettingsProvider>
    );
};

const TeacherWritingEditorManager = ({ activeClass, isMobile }) => {
    const classId = activeClass?.id;
    const [savedSettings, setSavedSettings] = useState(DEFAULT_WRITING_EDITOR_SETTINGS);
    const [draftSettings, setDraftSettings] = useState(DEFAULT_WRITING_EDITOR_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [previewScreen, setPreviewScreen] = useState('writing');
    const [previewSize, setPreviewSize] = useState(isMobile ? 'mobile' : 'desktop');

    const loadSettings = useCallback(async () => {
        if (!classId) return;
        setLoading(true);
        setErrorMessage('');
        const { data, error } = await supabase
            .from('classes')
            .select('writing_editor_settings')
            .eq('id', classId)
            .maybeSingle();

        if (error || !data) {
            console.error('글쓰기 창 설정 조회 실패:', error?.message);
            setErrorMessage('글쓰기 창 설정을 불러오지 못했습니다.');
        } else {
            const nextSettings = normalizeWritingEditorSettings(data.writing_editor_settings);
            setSavedSettings(nextSettings);
            setDraftSettings(nextSettings);
        }
        setLoading(false);
    }, [classId]);

    useEffect(() => {
        const timerId = window.setTimeout(() => void loadSettings(), 0);
        return () => window.clearTimeout(timerId);
    }, [loadSettings]);

    const searchEnabled = isWritingToolEnabled(draftSettings, SPELLING_LOOKUP_TOOL_ID);
    const hasChanges = useMemo(
        () => JSON.stringify(savedSettings) !== JSON.stringify(draftSettings),
        [draftSettings, savedSettings]
    );
    const preview = Reflect.get(PREVIEW_WIDTHS, previewSize) || PREVIEW_WIDTHS.desktop;

    const handleSave = async () => {
        if (!classId || saving || !hasChanges) return;
        setSaving(true);
        const normalized = normalizeWritingEditorSettings(draftSettings);
        const { data, error } = await supabase
            .from('classes')
            .update({ writing_editor_settings: normalized })
            .eq('id', classId)
            .select('writing_editor_settings')
            .maybeSingle();
        setSaving(false);

        if (error || !data) {
            console.error('글쓰기 창 설정 저장 실패:', error?.message);
            window.alert('글쓰기 창 설정을 저장하지 못했습니다.');
            return;
        }
        const nextSettings = normalizeWritingEditorSettings(data.writing_editor_settings);
        setSavedSettings(nextSettings);
        setDraftSettings(nextSettings);
        window.alert('학생 글쓰기 창 설정을 저장했습니다. 열린 학생 화면은 늦어도 30초 안에 반영됩니다.');
    };

    if (!activeClass) return <div className="writing-editor-manager__empty">학급을 먼저 선택해주세요.</div>;
    if (loading) return <div className="writing-editor-manager__empty">글쓰기 창 설정을 불러오는 중입니다...</div>;
    if (errorMessage) {
        return (
            <div className="writing-editor-manager__empty is-error">
                <p>{errorMessage}</p>
                <Button type="button" onClick={loadSettings}>다시 시도</Button>
            </div>
        );
    }

    return (
        <div className="writing-editor-manager">
            <section className="writing-editor-manager__settings">
                <div className="writing-editor-manager__heading">
                    <div>
                        <span>학급별 글쓰기 지원 기능</span>
                        <h3>학생 글쓰기 창 관리</h3>
                        <p>기능을 켜고 끈 뒤 아래 미리보기에서 학생에게 보일 모습을 바로 확인하세요.</p>
                    </div>
                    <span className="writing-editor-manager__class-name">{activeClass.name}</span>
                </div>

                <div className="writing-editor-manager__feature-list">
                    <article>
                        <div className="writing-editor-manager__feature-copy">
                            <span aria-hidden="true">🔎</span>
                            <div>
                                <strong>맞춤법 찾아보기</strong>
                                <small>학생이 궁금한 표현을 직접 찾고, 확인할 표현의 밑줄과 도움말을 봅니다.</small>
                            </div>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={searchEnabled}
                            className={`writing-editor-manager__switch ${searchEnabled ? 'is-on' : ''}`}
                            onClick={() => setDraftSettings((current) => (
                                setWritingToolEnabled(
                                    current,
                                    SPELLING_LOOKUP_TOOL_ID,
                                    !isWritingToolEnabled(current, SPELLING_LOOKUP_TOOL_ID)
                                )
                            ))}
                        >
                            <span />
                            {searchEnabled ? 'ON' : 'OFF'}
                        </button>
                    </article>
                </div>

                <div className="writing-editor-manager__save-row">
                    <p>{hasChanges ? '아래 미리보기에는 변경 내용이 반영됐지만 학생에게는 아직 저장되지 않았습니다.' : '저장된 설정과 미리보기가 같습니다.'}</p>
                    <div>
                        <Button type="button" variant="outline" disabled={!hasChanges || saving} onClick={() => setDraftSettings(savedSettings)}>되돌리기</Button>
                        <Button type="button" disabled={!hasChanges} loading={saving} loadingText="저장 중..." onClick={handleSave}>학생 화면에 적용</Button>
                    </div>
                </div>
            </section>

            <section className="writing-editor-manager__preview-section">
                <div className="writing-editor-manager__preview-heading">
                    <div>
                        <span>학생 계정 없이 확인</span>
                        <h3>학생 화면 미리보기</h3>
                        <p>학생 개인정보와 실제 글은 불러오지 않는 안전한 샘플 화면입니다.</p>
                    </div>
                    <div className="writing-editor-manager__preview-controls">
                        <div aria-label="미리볼 학생 화면">
                            <button type="button" className={previewScreen === 'writing' ? 'is-active' : ''} onClick={() => setPreviewScreen('writing')}>글쓰기 창</button>
                            <button type="button" className={previewScreen === 'home' ? 'is-active' : ''} onClick={() => setPreviewScreen('home')}>학생 홈</button>
                        </div>
                        <div aria-label="미리보기 화면 폭">
                            {Object.entries(PREVIEW_WIDTHS).map(([id, item]) => (
                                <button key={id} type="button" className={previewSize === id ? 'is-active' : ''} onClick={() => setPreviewSize(id)}>{item.label}</button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="writing-editor-manager__device-stage">
                    <div className={`writing-editor-manager__device is-${previewSize}`} style={{ maxWidth: `${preview.width}px` }}>
                        <div className="writing-editor-manager__device-bar">
                            <span /><span /><span />
                            <strong>{preview.label} 미리보기</strong>
                        </div>
                        <div className="writing-editor-manager__device-screen">
                            {previewScreen === 'writing'
                                ? <StudentWritingPreview settings={draftSettings} compact={previewSize === 'mobile'} />
                                : <StudentHomePreview />}
                        </div>
                    </div>
                </div>
                <p className="writing-editor-manager__preview-note">미리보기에서는 입력 모양만 확인할 수 있으며 저장·제출·사전 서버 검색 버튼은 작동하지 않습니다.</p>
            </section>
        </div>
    );
};

export default TeacherWritingEditorManager;
