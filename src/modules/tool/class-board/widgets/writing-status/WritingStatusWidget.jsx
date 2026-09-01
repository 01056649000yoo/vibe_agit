import React from 'react';
import { useWritingStatus } from './useWritingStatus';

const Metric = ({ label, value, tone }) => (
  <div className={`class-board-status__metric class-board-status__metric--${tone}`}>
    <strong>{value}</strong>
    <span>{label}</span>
  </div>
);

export default function WritingStatusWidget({ config = {}, classId, presentation = false }) {
  const { status, loading, error } = useWritingStatus({ classId, missionId: config.missionId, poll: true });
  if (loading && !status) return <div className="class-board-widget-loading">글쓰기 현황을 불러오는 중…</div>;
  if (error && !status) return <div className="class-board-widget-error">현황을 잠시 불러오지 못했습니다.</div>;

  const allMissions = status?.scope === 'all';
  const totalAssignments = allMissions
    ? (status?.confirmedCount || 0) + (status?.pendingCount || 0) + (status?.rewritingCount || 0) + (status?.notSubmittedCount || 0)
    : status?.totalStudents || 0;
  const submitted = status?.submittedCount || 0;
  const progress = totalAssignments > 0 ? Math.round((submitted / totalAssignments) * 100) : 0;

  return (
    <section className={`class-board-status${presentation ? ' is-presentation' : ''}`}>
      <div className="class-board-status__eyebrow">끄적끄적 아지트</div>
      <h2>{allMissions ? '진행 중인 글쓰기' : (status?.selectedMissionTitle || '선택한 글쓰기')}</h2>
      <p className="class-board-status__scope">
        {allMissions ? `활성 과제 ${status?.activeMissionCount || 0}개 · 현재 제출 기준` : `학생 ${submitted}/${status?.totalStudents || 0}명 제출`}
      </p>
      <div className="class-board-status__progress"><span style={{ width: `${Math.min(100, progress)}%` }} /></div>
      <div className="class-board-status__metrics">
        <Metric label={allMissions ? '제출 글' : '제출'} value={submitted} tone="blue" />
        <Metric label="확인 완료" value={status?.confirmedCount || 0} tone="green" />
        <Metric label="확인 대기" value={status?.pendingCount || 0} tone="amber" />
        <Metric label="다시 쓰는 중" value={status?.rewritingCount || 0} tone="rose" />
      </div>
      <p className="class-board-status__privacy">학생 이름과 글 내용은 이 화면에 표시하지 않습니다.</p>
      {error ? <p className="class-board-status__stale">새로고침이 늦어지고 있어 마지막 현황을 표시합니다.</p> : null}
    </section>
  );
}

