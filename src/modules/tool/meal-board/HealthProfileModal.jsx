import React, { useEffect, useMemo, useState } from 'react';
import ModalPortal from '../../../components/common/ModalPortal';

export default function HealthProfileModal({ student, allergens, onClose, onSave, saving }) {
  const initialCodes = useMemo(
    () => new Set((student?.allergenCodes || []).map(Number)),
    [student]
  );
  const [selectedCodes, setSelectedCodes] = useState(initialCodes);

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

  const toggle = (code) => {
    setSelectedCodes((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const saveSelected = () => onSave(
    selectedCodes.size ? 'has_items' : 'confirmed_none',
    [...selectedCodes].sort((a, b) => a - b)
  );

  return <ModalPortal>
    <div className="meal-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="meal-modal meal-health-modal" role="dialog" aria-modal="true" aria-labelledby="meal-health-title">
        <header>
          <div>
            <span className="meal-kicker">개인 건강 항목</span>
            <h3 id="meal-health-title">{student.name} 학생</h3>
            <p>학교에서 확인한 급식 알레르기 항목만 선택해 주세요.</p>
          </div>
          <button type="button" className="meal-icon-button" aria-label="닫기" disabled={saving} onClick={onClose}>×</button>
        </header>

        <div className="meal-health-notice">
          이 정보는 급식 안전 확인 목적으로만 사용하고, 공개 화면이나 학생 화면에는 표시하지 않습니다.
        </div>
        <div className="meal-allergen-picker">
          {allergens.map((item) => {
            const selected = selectedCodes.has(Number(item.code));
            return <button
              type="button"
              key={item.code}
              className={selected ? 'is-selected' : ''}
              aria-pressed={selected}
              onClick={() => toggle(Number(item.code))}
            >
              <span>{item.code}</span>{item.label}
            </button>;
          })}
        </div>

        <footer className="meal-modal-actions">
          <button type="button" className="meal-button is-ghost" disabled={saving} onClick={() => onSave('unconfirmed', [])}>미확인으로 되돌리기</button>
          <button type="button" className="meal-button is-primary" disabled={saving} onClick={saveSelected}>
            {saving ? '저장 중…' : selectedCodes.size ? `${selectedCodes.size}개 항목 저장` : '해당 없음으로 확인'}
          </button>
        </footer>
      </section>
    </div>
  </ModalPortal>;
}
