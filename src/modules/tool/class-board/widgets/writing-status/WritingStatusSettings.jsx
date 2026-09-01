import React from 'react';
import { useWritingStatus } from './useWritingStatus';

export default function WritingStatusSettings({ config = {}, onChange, classId }) {
  const { status, loading, error } = useWritingStatus({ classId, missionId: null, poll: false });
  return (
    <div className="class-board-settings-grid">
      <label>
        <span>표시 범위</span>
        <select
          value={config.missionId || ''}
          disabled={loading}
          onChange={(event) => onChange({ ...config, missionId: event.target.value || null })}
        >
          <option value="">현재 진행 미션 (가장 최근)</option>
          {(status?.missionOptions || []).map((mission) => (
            <option key={mission.id} value={mission.id}>{mission.title}</option>
          ))}
        </select>
      </label>
      <p className="class-board-note">기본값은 가장 최근 미션입니다. 다른 미션을 고정해 둘 수도 있으며, 제출자·미제출자 이름과 오늘의 일기·독서록 현황이 함께 표시됩니다.</p>
      {error ? <p className="class-board-error">과제 목록을 불러오지 못했습니다.</p> : null}
    </div>
  );
}
