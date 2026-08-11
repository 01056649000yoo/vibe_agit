import React from 'react';
import CenteredDialog from '../common/CenteredDialog';
import Button from '../common/Button';
import WritingEditorFields from '../writing/WritingEditorFields';
import {
    WritingSectionHeader,
    WritingWorkspace,
    WritingWorkspaceHeader,
    WritingWorkspacePath
} from '../writing/WritingWorkspace';
import WritingPolicyProgress from '../../modules/writing/policy/WritingPolicyProgress';
import { writingPolicyFromMission } from '../../modules/writing/policy/writingPolicy';
import { getGenreMissionType, getGenreMissionTypes } from '../../modules/writing/mission-types/registry';
import './MissionStudentPreview.css';

const EMPTY_METRICS = Object.freeze({ charCount: 0, paragraphCount: 0 });
const PREVIEW_EDITORS = new Map(
    getGenreMissionTypes()
        .filter((missionType) => missionType.studentEditorEntry)
        .map((missionType) => [missionType.id, React.lazy(missionType.studentEditorEntry)])
);

const MissionStudentPreview = ({ isOpen, onClose, mission }) => {
    const title = mission?.title?.trim() || '글쓰기 주제를 입력해주세요';
    const guide = mission?.guide?.trim() || '학생에게 보여줄 안내 내용을 입력해주세요.';
    const genre = mission?.genre || '글쓰기';
    const questions = Array.isArray(mission?.guide_questions)
        ? mission.guide_questions.filter((question) => question?.trim())
        : [];
    const hasQuestions = questions.length > 0;
    const policy = writingPolicyFromMission(mission);
    const genreMissionType = getGenreMissionType(mission?.mission_type || mission?.input_template);
    const studentLabels = genreMissionType?.studentLabels || {};
    const isMeeting = genreMissionType?.id === 'meeting';
    const previewGenreEditor = PREVIEW_EDITORS.get(genreMissionType?.id) || null;
    const displayGenre = genreMissionType
        ? `${genreMissionType.icon} ${genreMissionType.name}`
        : genre;

    return (
        <CenteredDialog
            isOpen={isOpen}
            onClose={onClose}
            eyebrow="저장하지 않는 안전한 미리보기"
            title="학생에게 이렇게 보여요"
            description="현재 입력한 과제 내용만 사용하며 학생 정보나 작성 글은 불러오지 않습니다."
            maxWidth="1180px"
            maxHeight="94dvh"
            bodyPadding="16px"
        >
            <div className="mission-student-preview">
                <section className="mission-student-preview__section" aria-labelledby="mission-card-preview-title">
                    <header>
                        <span>1</span>
                        <div>
                            <h3 id="mission-card-preview-title">과제 목록에서는</h3>
                            <p>학생이 아직 글을 쓰지 않은 상태의 카드입니다.</p>
                        </div>
                    </header>
                    <article className="mission-student-preview__card">
                        <span className="mission-student-preview__new">NEW</span>
                        <div className="mission-student-preview__card-meta">
                            <span className="mission-student-preview__genre">{displayGenre}</span>
                            <span className="mission-student-preview__status">작성 전</span>
                            <strong>⭐ {policy.base_reward}P</strong>
                        </div>
                        <h4>{title}</h4>
                        <p>{guide}</p>
                        <div className="mission-student-preview__card-actions">
                            <Button type="button" disabled>{isMeeting ? '안건 작성하기' : '글쓰기 시작'}</Button>
                            <Button type="button" variant="ghost" disabled>{isMeeting ? '친구 안건 보기 🏛️' : '친구 글 보기 👀'}</Button>
                        </div>
                    </article>
                </section>

                <section className="mission-student-preview__section" aria-labelledby="mission-open-preview-title">
                    <header>
                        <span>2</span>
                        <div>
                            <h3 id="mission-open-preview-title">과제를 열면</h3>
                            <p>안내·핵심 질문·분량과 보상 조건이 함께 보입니다.</p>
                        </div>
                    </header>
                    <div className="mission-student-preview__workspace-guard">
                        <WritingWorkspace tone="assignment" className="mission-student-preview__workspace">
                            <WritingWorkspaceHeader
                                onBack={() => {}}
                                disabled
                                eyebrow={`✍️ ${displayGenre}`}
                                title={title}
                                description="생각을 정리한 뒤 글을 쓰고, 마지막에 한 번 검토해 제출해요."
                            />
                            <WritingWorkspacePath
                                steps={hasQuestions
                                    ? ['생각 열기', '글쓰기', '검토·제출']
                                    : ['안내 읽기', '글쓰기', '검토·제출']}
                            />

                            <div className="writing-guide">
                                <span className="writing-guide__label">💡 선생님의 글쓰기 안내</span>
                                <p>{guide}</p>
                            </div>

                            {hasQuestions && (
                                <section className="writing-question-stage">
                                    <WritingSectionHeader
                                        icon="🎯"
                                        title="생각 일깨우기"
                                        description="질문에 답하며 글에 넣을 생각을 먼저 모아봐요."
                                        action={<Button type="button" size="sm" disabled>답변 전체 넣기</Button>}
                                    />
                                    <div className="writing-question-list">
                                        {questions.map((question, index) => (
                                            <div key={`${index}-${question}`} className="writing-question">
                                                <div className="writing-question__prompt">
                                                    <span className="writing-question__number">{index + 1}</span>
                                                    <span>{question}</span>
                                                </div>
                                                <textarea disabled placeholder="여기에 생각을 적어보세요..." />
                                                <div className="writing-question__action">
                                                    <Button type="button" variant="outline" size="sm" disabled>이 답변만 본문에 넣기</Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            <section className="writing-editor-surface">
                                <WritingSectionHeader
                                    icon="✍️"
                                    title={studentLabels.editorHeading || '본격 글쓰기'}
                                    description="제목과 내용을 차근차근 적어보세요."
                                />
                                {previewGenreEditor ? (
                                    <React.Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>장르 글쓰기 틀을 준비하는 중...</div>}>
                                        {React.createElement(previewGenreEditor, {
                                            title: '',
                                            setTitle: () => {},
                                            content: '',
                                            setContent: () => {},
                                            structuredContent: null,
                                            setStructuredContent: () => {},
                                            studentName: '아지트 학생',
                                            config: mission?.template_config || {},
                                            disabled: true,
                                            isMobile: false,
                                        })}
                                    </React.Suspense>
                                ) : (
                                    <WritingEditorFields
                                        title=""
                                        onTitleChange={() => {}}
                                        content=""
                                        onContentChange={() => {}}
                                        titlePlaceholder={studentLabels.titlePlaceholder}
                                        contentPlaceholder={studentLabels.contentPlaceholder}
                                        disabled
                                        contentMinLines={4}
                                    />
                                )}
                            </section>

                            <WritingPolicyProgress
                                policy={policy}
                                metrics={EMPTY_METRICS}
                                unitLabel={genreMissionType?.unitLabel || '문단'}
                                skipParagraphValidation={genreMissionType?.skipGenericParagraphValidation}
                            />
                        </WritingWorkspace>
                    </div>
                </section>
            </div>
        </CenteredDialog>
    );
};

export default MissionStudentPreview;
