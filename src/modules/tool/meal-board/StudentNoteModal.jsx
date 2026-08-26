import React, { useEffect, useState } from 'react';
import ModalCloseButton from '../../../components/common/ModalCloseButton';
import ModalPortal from '../../../components/common/ModalPortal';

const NOTE_MAX_LENGTH = 300;

export default function StudentNoteModal({ student, onClose, onSave, saving }) {
  const [note, setNote] = useState(student?.note || '');
  const trimmedNote = note.trim();

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

  return <ModalPortal>
    <div className="meal-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="meal-modal meal-note-modal" role="dialog" aria-modal="true" aria-labelledby="meal-note-title" aria-describedby="meal-note-help">
        <header>
          <div>
            <span className="meal-kicker">학생 비고</span>
            <h3 id="meal-note-title">{student.name} 학생</h3>
            <p>필요한 경우에만 학급 운영에 필요한 짧은 메모를 남겨 주세요.</p>
          </div>
          <ModalCloseButton onClick={onClose} disabled={saving} label={`${student.name} 비고 입력 닫기`} />
        </header>

        <div className="meal-note-notice" id="meal-note-help">
          알레르기·질병 등 민감한 건강정보는 입력하지 마세요. 비고는 교사 화면에서만 보이며 전체화면 급식판에는 표시되지 않습니다.
        </div>
        <label className="meal-note-field">
          <span>비고</span>
          <textarea
            value={note}
            maxLength={NOTE_MAX_LENGTH}
            rows={3}
            placeholder="예: 오늘 도시락 지참"
            onChange={(event) => setNote(event.target.value)}
          />
          <small>{note.length}/{NOTE_MAX_LENGTH}자</small>
        </label>

        <footer className="meal-modal-actions">
          <button
            type="button"
            className="meal-button is-ghost"
            disabled={saving || !student.note}
            onClick={() => onSave('')}
          >
            비고 삭제
          </button>
          <button type="button" className="meal-button is-primary" disabled={saving} onClick={() => onSave(trimmedNote)}>
            {saving ? '저장 중…' : '비고 저장'}
          </button>
        </footer>
      </section>
    </div>
  </ModalPortal>;
}
