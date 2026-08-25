import React, { useEffect, useId, useRef, useState } from 'react';
import ModalCloseButton from '../../../components/common/ModalCloseButton';
import ModalPortal from '../../../components/common/ModalPortal';
import './writingPresentationModal.css';

export const WRITING_PRESENTATION_FONT_SIZES = Object.freeze([20, 24, 28, 34, 40, 48]);
const DEFAULT_FONT_SIZE_INDEX = 2;

const WritingPresentationModal = ({
    isOpen,
    onClose,
    title,
    studentName,
    versionLabel,
    children
}) => {
    const titleId = useId();
    const dialogRef = useRef(null);
    const previousFocusRef = useRef(null);
    const onCloseRef = useRef(onClose);
    const [fontSizeIndex, setFontSizeIndex] = useState(DEFAULT_FONT_SIZE_INDEX);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;

        previousFocusRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const focusFrame = window.requestAnimationFrame(() => {
            dialogRef.current?.querySelector('[aria-label="작품 전체 화면 닫기"]')?.focus();
        });
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current?.();
                return;
            }

            if (event.key !== 'Tab') return;
            const focusable = dialogRef.current?.querySelectorAll(
                'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (!focusable?.length) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown);
            previousFocusRef.current?.focus?.();
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const fontSize = WRITING_PRESENTATION_FONT_SIZES.find((_, index) => index === fontSizeIndex)
        || WRITING_PRESENTATION_FONT_SIZES.find((_, index) => index === DEFAULT_FONT_SIZE_INDEX);
    const decreaseFontSize = () => setFontSizeIndex((index) => Math.max(0, index - 1));
    const increaseFontSize = () => setFontSizeIndex((index) => (
        Math.min(WRITING_PRESENTATION_FONT_SIZES.length - 1, index + 1)
    ));

    return (
        <ModalPortal>
            <div className="writing-presentation-modal__backdrop" role="presentation">
                <section
                    ref={dialogRef}
                    className="writing-presentation-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    style={{ '--writing-presentation-font-size': `${fontSize}px` }}
                >
                    <header className="writing-presentation-modal__header">
                        <div className="writing-presentation-modal__identity">
                            <span>{versionLabel || '학생 작품'}</span>
                            <strong>{studentName ? `${studentName} 학생의 글` : '학생의 글'}</strong>
                        </div>

                        <div className="writing-presentation-modal__controls" aria-label="본문 글자 크기 조절">
                            <span>글자 크기</span>
                            <button
                                type="button"
                                onClick={decreaseFontSize}
                                disabled={fontSizeIndex === 0}
                                aria-label="글자 작게"
                            >
                                가−
                            </button>
                            <output aria-live="polite">{fontSize}px</output>
                            <button
                                type="button"
                                onClick={increaseFontSize}
                                disabled={fontSizeIndex === WRITING_PRESENTATION_FONT_SIZES.length - 1}
                                aria-label="글자 크게"
                            >
                                가+
                            </button>
                            <ModalCloseButton
                                onClick={onClose}
                                label="작품 전체 화면 닫기"
                            />
                        </div>
                    </header>

                    <main className="writing-presentation-modal__scroll">
                        <article className="writing-presentation-modal__paper">
                            <h1 id={titleId}>{title || '제목 없는 글'}</h1>
                            <div className="writing-presentation-modal__rule" aria-hidden="true" />
                            <div className="writing-presentation-modal__content">
                                {children || '내용이 없습니다.'}
                            </div>
                        </article>
                    </main>
                </section>
            </div>
        </ModalPortal>
    );
};

export default WritingPresentationModal;
