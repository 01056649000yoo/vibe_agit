import React from 'react';
import { useWritingStatus } from './useWritingStatus';

const NameList = ({ title, names = [], emptyText, tone, rewritingNames = [] }) => {
  const rewriting = new Set(rewritingNames);
  return (
    <div className={`class-board-status__names class-board-status__names--${tone}`}>
      <div className="class-board-status__names-heading">
        <strong>{title}</strong><span>{names.length}명</span>
      </div>
      <div className="class-board-status__name-tags">
        {names.length > 0 ? names.map((name, index) => (
          <span key={`${name}-${index}`} className={rewriting.has(name) ? 'is-rewriting' : ''}>
            {name}{rewriting.has(name) ? ' · 다시쓰기' : ''}
          </span>
        )) : <small>{emptyText}</small>}
      </div>
    </div>
  );
};

const DailyCard = ({ icon, label, value = {} }) => {
  const completed = value.completedStudentCount || 0;
  const total = value.totalStudents || 0;
  const progress = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  return (
    <div className="class-board-status__daily-card">
      <span className="class-board-status__daily-icon" aria-hidden="true">{icon}</span>
      <div>
        <div className="class-board-status__daily-heading"><strong>{label}</strong><span>{completed}/{total}명</span></div>
        <div className="class-board-status__daily-progress"><span style={{ width: `${progress}%` }} /></div>
        <small>오늘 {value.submissionCount || 0}편 제출</small>
      </div>
    </div>
  );
};

export default function WritingStatusWidget({ config = {}, classId, presentation = false }) {
  const { status, loading, error } = useWritingStatus({ classId, missionId: config.missionId, poll: true });
  if (loading && !status) return <div className="class-board-widget-loading">글쓰기 현황을 불러오는 중…</div>;
  if (error && !status) return <div className="class-board-widget-error">현황을 잠시 불러오지 못했습니다.</div>;

  const hasMission = status?.scope === 'mission';
  const totalAssignments = status?.totalStudents || 0;
  const submitted = status?.submittedCount || 0;
  const progress = totalAssignments > 0 ? Math.round((submitted / totalAssignments) * 100) : 0;
  const daily = status?.dailyWriting || {};

  return (
    <section className={`class-board-status${presentation ? ' is-presentation' : ''}`}>
      <div className="class-board-status__header">
        <div className="class-board-status__eyebrow">끄적끄적 아지트 · 오늘의 현황</div>
        <h2>{hasMission ? status.selectedMissionTitle : '진행 중인 글쓰기 미션 없음'}</h2>
        <div className="class-board-status__mission-summary">
          <strong>{submitted}<small>/{totalAssignments}명 제출</small></strong>
          <span>{progress}%</span>
        </div>
        <div className="class-board-status__progress"><span style={{ width: `${Math.min(100, progress)}%` }} /></div>
      </div>
      {hasMission ? (
        <div className="class-board-status__roster">
          <NameList
            title="제출자"
            names={status?.submitterNames}
            emptyText="아직 제출한 학생이 없어요."
            tone="submitted"
          />
          <NameList
            title="미제출자"
            names={status?.nonSubmitterNames}
            rewritingNames={status?.rewritingNames}
            emptyText="모두 제출했어요!"
            tone="missing"
          />
        </div>
      ) : <p className="class-board-status__empty">새 미션을 만들면 가장 최근 미션의 제출 현황이 여기에 표시됩니다.</p>}
      <div className="class-board-status__daily">
        <div className="class-board-status__section-title"><strong>오늘의 자율 글</strong><span>{daily.date || ''}</span></div>
        <DailyCard icon="📔" label="일기" value={daily.diary} />
        <DailyCard icon="📚" label="독서록" value={daily.readingLog} />
      </div>
      <p className="class-board-status__privacy">제출 여부만 표시하며 글 내용은 공개하지 않습니다.</p>
      {error ? <p className="class-board-status__stale">새로고침이 늦어지고 있어 마지막 현황을 표시합니다.</p> : null}
    </section>
  );
}
