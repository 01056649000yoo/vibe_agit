import React, { useMemo } from 'react';
import { getTitleTrack } from '../../../../writing/title-status/titleTracks';
import { normalizeStatusSections, normalizeStatusTone } from './statusSections';
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

/** 칭호 이름은 학생 화면과 같은 원본에서 가져와 두 곳이 어긋나지 않게 한다. */
const titleLabel = (track, level) => {
  const definition = getTitleTrack(track);
  const step = definition.levels?.find((item) => item.level === Number(level));
  return `${definition.icon} ${step?.name || `${definition.shortLabel} ${level}단계`}`;
};

export default function WritingStatusWidget({ config = {}, classId, presentation = false }) {
  const sections = useMemo(() => normalizeStatusSections(config.sections), [config.sections]);
  const tone = normalizeStatusTone(config.tone);
  const { status, loading, error } = useWritingStatus({
    classId,
    missionId: config.missionId,
    sections,
    poll: true,
  });
  if (loading && !status) return <div className="class-board-widget-loading">글쓰기 현황을 불러오는 중…</div>;
  if (error && !status) return <div className="class-board-widget-error">현황을 잠시 불러오지 못했습니다.</div>;

  const shows = (id) => sections.includes(id);
  const hasMission = status?.scope === 'mission';
  const totalAssignments = status?.totalStudents || 0;
  const submitted = status?.submittedCount || 0;
  const progress = totalAssignments > 0 ? Math.round((submitted / totalAssignments) * 100) : 0;
  const daily = status?.dailyWriting || {};
  const dailyNames = status?.dailyNames || {};
  const todayTitles = status?.todayTitles || [];
  const todayReading = status?.todayReading || {};

  return (
    <section className={`class-board-status class-board-status--${tone}${presentation ? ' is-presentation' : ''}`}>
      <div className="class-board-status__header">
        <div className="class-board-status__eyebrow">끄적끄적 아지트 · 오늘의 현황</div>
        {shows('mission') ? (
          <>
            <h2>{hasMission ? status.selectedMissionTitle : '진행 중인 글쓰기 미션 없음'}</h2>
            <div className="class-board-status__mission-summary">
              <strong>{submitted}<small>/{totalAssignments}명 제출</small></strong>
              <span>{progress}%</span>
            </div>
            <div className="class-board-status__progress"><span style={{ width: `${Math.min(100, progress)}%` }} /></div>
          </>
        ) : null}
      </div>

      {shows('mission') ? (hasMission ? (
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
      ) : <p className="class-board-status__empty">새 미션을 만들면 가장 최근 미션의 제출 현황이 여기에 표시됩니다.</p>) : null}

      {shows('daily') ? (
        <div className="class-board-status__daily">
          <div className="class-board-status__section-title"><strong>오늘의 자율 글</strong><span>{daily.date || ''}</span></div>
          <DailyCard icon="📔" label="일기" value={daily.diary} />
          <DailyCard icon="📚" label="독서록" value={daily.readingLog} />
        </div>
      ) : null}

      {shows('dailyNames') ? (
        <div className="class-board-status__daily">
          <div className="class-board-status__section-title"><strong>오늘 자율 글 쓴 친구</strong><span>{dailyNames.date || ''}</span></div>
          <div className="class-board-status__roster">
            <NameList
              title="오늘 쓴 친구"
              names={dailyNames.writerNames}
              emptyText="아직 오늘 자율 글을 쓴 친구가 없어요."
              tone="submitted"
            />
            <NameList
              title="아직 안 쓴 친구"
              names={dailyNames.restingNames}
              emptyText="모두 오늘 자율 글을 썼어요!"
              tone="missing"
            />
          </div>
        </div>
      ) : null}

      {shows('titles') ? (
        <div className="class-board-status__daily">
          <div className="class-board-status__section-title"><strong>오늘 새 칭호</strong><span>{todayTitles.length}명</span></div>
          {todayTitles.length > 0 ? (
            <div className="class-board-status__titles">
              {todayTitles.map((item, index) => (
                <span key={`${item.name}-${item.track}-${item.level}-${index}`}>
                  {item.name}<em>{titleLabel(item.track, item.level)}</em>
                </span>
              ))}
            </div>
          ) : <p className="class-board-status__empty">오늘은 아직 새 칭호를 받은 친구가 없어요.</p>}
        </div>
      ) : null}

      {shows('reactions') ? (
        <div className="class-board-status__daily">
          <div className="class-board-status__section-title"><strong>서로 읽어 준 정도</strong><span>{todayReading.date || ''}</span></div>
          <div className="class-board-status__reading">
            <div><strong>{todayReading.commentCount || 0}</strong><span>오늘 남긴 댓글</span></div>
            <div><strong>{todayReading.reactionCount || 0}</strong><span>오늘 누른 공감</span></div>
          </div>
        </div>
      ) : null}

      {sections.length === 0
        ? <p className="class-board-status__empty">보여 줄 항목을 아직 고르지 않았습니다. 위젯 설정에서 골라 주세요.</p>
        : null}
      <p className="class-board-status__privacy">제출 여부만 표시하며 글 내용은 공개하지 않습니다.</p>
      {error ? <p className="class-board-status__stale">새로고침이 늦어지고 있어 마지막 현황을 표시합니다.</p> : null}
    </section>
  );
}
