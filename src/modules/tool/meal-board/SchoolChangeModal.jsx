import React, { useEffect, useState } from 'react';
import ModalPortal from '../../../components/common/ModalPortal';
import SchoolSearchField from '../../../components/common/SchoolSearchField';
import { schoolSelectionFromWorkspace } from './mealBoardEngine';

export default function SchoolChangeModal({ currentSchool, initialSchoolName = '', onClose, onSave, onUseDefault, saving }) {
  const initialSchool = schoolSelectionFromWorkspace(currentSchool);
  const [schoolName, setSchoolName] = useState(initialSchool?.schoolName || initialSchoolName);
  const [selectedSchool, setSelectedSchool] = useState(initialSchool);
  const [scope, setScope] = useState('class');

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => { if (event.key === 'Escape' && !saving) onClose(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose, saving]);

  const handleNameChange = (value) => {
    setSchoolName(value);
    if (selectedSchool?.schoolName !== value) setSelectedSchool(null);
  };

  return <ModalPortal>
    <div className="meal-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="meal-modal meal-school-modal" role="dialog" aria-modal="true" aria-labelledby="meal-school-title">
        <header>
          <div>
            <span className="meal-kicker">급식 학교 설정</span>
            <h3 id="meal-school-title">학교를 바꿀 수 있어요</h3>
            <p>가입할 때 선택한 학교가 자동으로 연결되어 있습니다.</p>
          </div>
          <button type="button" className="meal-icon-button" aria-label="닫기" disabled={saving} onClick={onClose}>×</button>
        </header>

        <SchoolSearchField
          value={schoolName}
          onValueChange={handleNameChange}
          selectedSchool={selectedSchool}
          onSelect={(school) => {
            setSelectedSchool(school);
            setSchoolName(school.schoolName);
          }}
          placeholder="예: 서울미래초등학교"
        />

        <div className="meal-school-scope" role="radiogroup" aria-label="학교 적용 범위">
          <label className={scope === 'class' ? 'is-selected' : ''}>
            <input type="radio" name="meal-school-scope" value="class" checked={scope === 'class'} onChange={() => setScope('class')} />
            <span><strong>현재 학급만</strong><small>다른 학급의 급식 학교는 바꾸지 않아요.</small></span>
          </label>
          <label className={scope === 'default' ? 'is-selected' : ''}>
            <input type="radio" name="meal-school-scope" value="default" checked={scope === 'default'} onChange={() => setScope('default')} />
            <span><strong>내 기본 학교로 저장</strong><small>교사 프로필과 현재 학급에 함께 적용해요.</small></span>
          </label>
        </div>

        <footer className="meal-modal-actions">
          {currentSchool?.source === 'class_override' ? <button type="button" className="meal-button is-ghost" disabled={saving} onClick={onUseDefault}>가입 학교 사용</button> : <span />}
          <button type="button" className="meal-button is-primary" disabled={saving || !selectedSchool} onClick={() => onSave(scope, selectedSchool)}>
            {saving ? '저장 중…' : '이 학교 사용하기'}
          </button>
        </footer>
      </section>
    </div>
  </ModalPortal>;
}
