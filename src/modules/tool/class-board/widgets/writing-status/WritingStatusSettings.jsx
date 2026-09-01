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
          <option value="">진행 중인 과제 전체</option>
          {(status?.missionOptions || []).map((mission) => (
            <option key={mission.id} value={mission.id}>{mission.title}</option>
          ))}
        </select>
      </label>
      <p className="class-board-note">전체는 현재 활성 과제의 제출 글 편수를, 과제 하나는 제출 학생 수를 보여 줍니다.</p>
      {error ? <p className="class-board-error">과제 목록을 불러오지 못했습니다.</p> : null}
    </div>
  );
}

