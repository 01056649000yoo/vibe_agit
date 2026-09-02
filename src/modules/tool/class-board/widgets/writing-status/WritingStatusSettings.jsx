import React, { useMemo } from 'react';
import {
  normalizeStatusSections,
  normalizeStatusTone,
  STATUS_SECTIONS,
  STATUS_SECTION_IDS,
  STATUS_TONES,
} from './statusSections';
import { useWritingStatus } from './useWritingStatus';

export default function WritingStatusSettings({ config = {}, onChange, classId }) {
  // 설정창은 과제 목록만 필요하므로 현황 항목은 켜지 않고 한 번만 읽는다.
  const { status, loading, error } = useWritingStatus({
    classId,
    missionId: null,
    sections: [],
    poll: false,
  });
  const sections = useMemo(() => normalizeStatusSections(config.sections), [config.sections]);
  const tone = normalizeStatusTone(config.tone);

  const toggleSection = (id) => {
    const next = sections.includes(id)
      ? sections.filter((item) => item !== id)
      : STATUS_SECTION_IDS.filter((item) => item === id || sections.includes(item));
    onChange({ ...config, sections: next });
  };

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

      <label>
        <span>배경색</span>
        <select value={tone} onChange={(event) => onChange({ ...config, tone: event.target.value })}>
          {STATUS_TONES.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>

      <div className="class-board-status-sections" role="group" aria-label="현황에 보여 줄 항목">
        <span>보여 줄 항목</span>
        {STATUS_SECTIONS.map((section) => (
          <label key={section.id} className="class-board-checkbox-field">
            <input
              type="checkbox"
              checked={sections.includes(section.id)}
              onChange={() => toggleSection(section.id)}
            />
            <span>
              <strong>{section.label}</strong>
              <small>{section.hint}</small>
            </span>
          </label>
        ))}
      </div>

      <p className="class-board-note">
        기본값은 가장 최근 미션입니다. 켠 항목만 서버가 계산하므로 필요 없는 항목을 끄면 화면이 더 가볍습니다.
        이름은 제출·작성 여부만 보여 주고 글 내용은 교실 화면에 나오지 않습니다.
      </p>
      {error ? <p className="class-board-error">과제 목록을 불러오지 못했습니다.</p> : null}
    </div>
  );
}
