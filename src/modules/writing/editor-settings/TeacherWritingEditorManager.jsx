import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import {
    WritingSectionHeader,
    WritingWorkspace,
    WritingWorkspaceHeader,
    WritingWorkspacePath
} from '../../../components/writing/WritingWorkspace';
import { supabase } from '../../../lib/supabaseClient';
import {
    DEFAULT_WRITING_EDITOR_SETTINGS,
    SPELLING_LOOKUP_TOOL_ID,
    isWritingToolEnabled,
    normalizeWritingEditorSettings,
    setWritingToolEnabled
} from './settings';
import { getWritingToolManifests } from '../tools/registry';
import './teacherWritingEditorManager.css';
import { TEACHER_TOUR_ANCHORS, tourAnchor } from '../../../guides/teacherTour.js';

const PREVIEW_WIDTHS = Object.freeze({
    desktop: { label: 'PC', width: 1120 },
    tablet: { label: '태블릿', width: 820 },
    mobile: { label: '휴대폰', width: 390 }
});
const WRITING_TOOL_OPTIONS = Object.freeze(getWritingToolManifests().map((tool) => ({
    id: tool.id,
    label: tool.label,
    description: tool.teacherDescription || tool.description,
    // 켜기 전에 반드시 알아야 하는 사용 조건. 있는 도구만 눈에 띄게 따로 띄운다.
    limit: tool.teacherLimit || '',
    icon: tool.triggerEmoji || '🧰',
    // 'toolbar'는 글쓰기 창의 도구 줄, 'reference'는 글쓰기 참고함 안에서 열린다.
    surface: tool.surface ?? 'toolbar'
})));

// 관리 화면에서는 실제 학생 입력기·맞춤법 RPC를 실행하지 않는다. 설정의 모양만
// 확인할 수 있는 정적 샘플이라 탭 진입과 미리보기 전환이 가볍다.
// 미리보기는 정적 샘플이다(실제 RPC 없음). 도구를 누르면 학생이 보게 될 모양을 예시로 보여 준다.
const renderToolSample = (toolId) => {
    if (toolId === 'spelling-lookup') {
        return (
            <>
                <p>궁금한 낱말을 넣으면 기본 자료에서 바른 표기와 예문을 보여주고, 무작위 5문제로 연습해요.</p>
                <div className="writing-editor-preview-sample-row"><strong>마춤법</strong> → <strong>맞춤법</strong></div>
                <div className="writing-editor-preview-sample-row">예문) 받아쓰기에서 <em>맞춤법</em>을 틀리지 않았어요.</div>
            </>
        );
    }
    if (toolId === 'ai-spell-check') {
        return (
            <>
                <p>다 쓴 글을 AI가 한 번 훑어 맞춤법·띄어쓰기 오류만 짚어 줍니다(내용은 고치지 않아요).</p>
                <div className="writing-editor-preview-sample-row">〰️ ‘마춤법’ → ‘맞춤법’</div>
                <div className="writing-editor-preview-sample-row">〰️ 띄어쓰기 1곳: ‘재미있는이야기’ → ‘재미있는 이야기’</div>
            </>
        );
    }
    if (toolId === 'lab-results') {
        return (
            <>
                <p>글쓰기 연구소에서 만든 개요·질문·문장을 지금 글에 참고하거나 넣을 수 있어요.</p>
                <div className="writing-editor-preview-sample-row">📝 개요: 처음-가운데-끝</div>
                <div className="writing-editor-preview-sample-row">❓ 질문: 그때 어떤 마음이었나요?</div>
                <div className="writing-editor-preview-sample-row">✍️ 문장: 비가 와서 아쉬웠지만…</div>
            </>
        );
    }
    return null;
};

const StudentWritingPreview = ({ settings, compact }) => {
    const [openTool, setOpenTool] = useState(null);
    const [refOpen, setRefOpen] = useState(true); // 글쓰기 참고함: 기본은 펼친 상태(안의 도구가 바로 보이게)
    const searchEnabled = isWritingToolEnabled(settings, SPELLING_LOOKUP_TOOL_ID);
    const enabledTools = WRITING_TOOL_OPTIONS.filter((tool) => isWritingToolEnabled(settings, tool.id));
    // 도구 줄에는 surface 'toolbar' 만 뜬다. 나머지(reference·editor, 예: AI 맞춤법 검사)는
    // 실제 학생 화면과 같게 '글쓰기 참고함' 안에서 열린다(WritingToolHost 규칙과 일치).
    const toolbarTools = enabledTools.filter((tool) => tool.surface === 'toolbar');
    const referenceTools = enabledTools.filter((tool) => tool.surface !== 'toolbar');
    const activeTool = openTool && enabledTools.some((tool) => tool.id === openTool) ? openTool : null;
    const activeMeta = activeTool ? enabledTools.find((tool) => tool.id === activeTool) : null;
    const ToolChip = ({ tool }) => (
        <button type="button"
            className={`writing-editor-preview-tool is-clickable${activeTool === tool.id ? ' is-open' : ''}`}
            onClick={() => setOpenTool((current) => (current === tool.id ? null : tool.id))}>
            {tool.icon} {tool.label}
        </button>
    );
    return (
        <div className="writing-editor-preview-interaction-guard">
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
                        {toolbarTools.length > 0 && (
                            <div className="writing-editor-preview-toolrow">
                                {toolbarTools.map((tool) => <ToolChip key={tool.id} tool={tool} />)}
                            </div>
                        )}
                        <div className="writing-editor-preview-reference">
                            <button type="button"
                                className={`writing-editor-preview-tool is-clickable writing-editor-preview-reference__toggle${refOpen ? ' is-open' : ''}`}
                                aria-expanded={refOpen}
                                onClick={() => { if (refOpen) setOpenTool(null); setRefOpen((open) => !open); }}>
                                📚 글쓰기 참고함 {referenceTools.length > 0 ? `(${referenceTools.length})` : ''} <span aria-hidden="true">{refOpen ? '▾' : '▸'}</span>
                            </button>
                            {refOpen && (
                                <div className="writing-editor-preview-reference__body">
                                    {referenceTools.length === 0
                                        ? <p className="writing-editor-preview-reference__empty">지금 참고함에 켠 도구가 없어요.</p>
                                        : referenceTools.map((tool) => <ToolChip key={tool.id} tool={tool} />)}
                                </div>
                            )}
                        </div>
                        {activeMeta && (
                            <div className="writing-editor-preview-sample">
                                <div className="writing-editor-preview-sample__head">
                                    <strong>{activeMeta.icon} {activeMeta.label}</strong>
                                    <button type="button" onClick={() => setOpenTool(null)} aria-label="닫기">✕</button>
                                </div>
                                <div className="writing-editor-preview-sample__body">{renderToolSample(activeMeta.id)}</div>
                            </div>
                        )}
                        <div className={`writing-editor-preview-fields ${compact ? 'is-compact' : ''}`}>
                            <div>
                                <small>글 제목</small>
                                <strong>비 오는 날의 운동장</strong>
                            </div>
                            <div>
                                <small>글 내용</small>
                                <p>비가 와서 운동장에 나가지 못했지만, 친구와 재미있는 이야기를 했습니다. {searchEnabled ? <span className="writing-editor-preview-typo">마춤법</span> : '마춤법'}이 궁금한 표현은 직접 찾아볼 수 있어요.</p>
                            </div>
                        </div>
                        {searchEnabled && (
                            <div className="writing-editor-preview-notice">〰️ 맞춤법 수첩에서 확인해 볼 표현 1개　 <strong>마춤법 → 맞춤법</strong></div>
                        )}
                    </section>
                    <div className="writing-editor-preview-actions">
                        <Button type="button" variant="outline" disabled>저장</Button>
                        <Button type="button" disabled>검토하고 제출하기</Button>
                    </div>
                </WritingWorkspace>
        </div>
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
    const [showPreview, setShowPreview] = useState(false);

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
                        <span>학급마다 따로 설정</span>
                        <h3>학급별 글쓰기 지원 기능</h3>
                        <p>기능을 켜고 끈 뒤 아래 미리보기에서 학생에게 보일 모습을 바로 확인하세요.</p>
                    </div>
                    <span className="writing-editor-manager__class-name">{activeClass.name}</span>
                </div>

                <div className="writing-editor-manager__feature-list" {...tourAnchor(TEACHER_TOUR_ANCHORS.WRITING_EDITOR_SETTINGS)}>
                    {WRITING_TOOL_OPTIONS.map((tool) => {
                        const enabled = isWritingToolEnabled(draftSettings, tool.id);
                        return (
                            <article key={tool.id}>
                                <div className="writing-editor-manager__feature-copy">
                                    <span aria-hidden="true">{tool.icon}</span>
                                    <div>
                                        <strong>{tool.label}</strong>
                                        {tool.limit ? <em className="writing-editor-manager__feature-limit">{tool.limit}</em> : null}
                                        <small>{tool.description}</small>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={enabled}
                                    disabled={loading}
                                    className={`writing-editor-manager__switch ${enabled ? 'is-on' : ''}`}
                                    onClick={() => setDraftSettings((current) => (
                                        setWritingToolEnabled(current, tool.id, !isWritingToolEnabled(current, tool.id))
                                    ))}
                                >
                                    <span />
                                    {enabled ? 'ON' : 'OFF'}
                                </button>
                            </article>
                        );
                    })}
                </div>

                <div className="writing-editor-manager__save-row">
                    <p>{loading ? '글쓰기 창 설정을 불러오는 중입니다...' : hasChanges ? '아래 미리보기에는 변경 내용이 반영됐지만 학생에게는 아직 저장되지 않았습니다.' : '저장된 설정과 미리보기가 같습니다.'}</p>
                    <div>
                        <Button type="button" variant="outline" disabled={loading || !hasChanges || saving} onClick={() => setDraftSettings(savedSettings)}>되돌리기</Button>
                        <Button type="button" disabled={loading || !hasChanges} loading={saving} loadingText="저장 중..." onClick={handleSave}>학생 화면에 적용</Button>
                    </div>
                </div>
            </section>

            <section className="writing-editor-manager__preview-section">
                <div className="writing-editor-manager__preview-heading">
                    <div>
                        <span>학생 계정 없이 확인</span>
                        <h3>학생 글쓰기 창 미리보기</h3>
                        <p>학생 개인정보·학급 맞춤법 데이터·실제 글을 불러오지 않는 가벼운 샘플 화면입니다.</p>
                    </div>
                    <div className="writing-editor-manager__preview-controls">
                        {showPreview && (
                            <div aria-label="미리보기 화면 폭">
                                {Object.entries(PREVIEW_WIDTHS).map(([id, item]) => (
                                    <button key={id} type="button" className={previewSize === id ? 'is-active' : ''} onClick={() => setPreviewSize(id)}>{item.label}</button>
                                ))}
                            </div>
                        )}
                        <Button type="button" variant="outline" onClick={() => setShowPreview(current => !current)}>
                            {showPreview ? '미리보기 접기' : '미리보기 열기'}
                        </Button>
                    </div>
                </div>

                {showPreview ? (
                    <>
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
                    </>
                ) : (
                    <button type="button" className="writing-editor-manager__preview-placeholder" onClick={() => setShowPreview(true)}>
                        <span>🖥️</span>
                        <strong>전체 미리보기는 접혀 있습니다.</strong>
                        <small>필요할 때만 열어 학생 화면의 모양을 확인하세요.</small>
                    </button>
                )}
            </section>
        </div>
    );
};

export default TeacherWritingEditorManager;
