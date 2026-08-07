import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
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

const PREVIEW_WIDTHS = Object.freeze({
    desktop: { label: 'PC', width: 1120 },
    tablet: { label: '태블릿', width: 820 },
    mobile: { label: '휴대폰', width: 390 }
});

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
                        <h3>학생 글쓰기 창 미리보기</h3>
                        <p>학생 개인정보와 실제 글은 불러오지 않는 안전한 샘플 화면입니다.</p>
                    </div>
                    <div className="writing-editor-manager__preview-controls">
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
                            <StudentWritingPreview settings={draftSettings} compact={previewSize === 'mobile'} />
                        </div>
                    </div>
                </div>
                <p className="writing-editor-manager__preview-note">미리보기에서는 입력 모양만 확인할 수 있으며 저장·제출·사전 서버 검색 버튼은 작동하지 않습니다.</p>
            </section>
        </div>
    );
};

export default TeacherWritingEditorManager;
