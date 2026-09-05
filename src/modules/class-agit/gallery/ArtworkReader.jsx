import { useEffect, useId, useRef, useState } from 'react';
import ModalPortal from '../../../components/common/ModalPortal.jsx';
import ModalCloseButton from '../../../components/common/ModalCloseButton.jsx';

export default function ArtworkReader({ work, onClose, onPrevious, onNext, footer, roomTitle, loading = false, error = null }) {
    const dialog = useRef(null);
    const text = useRef(null);
    const titleId = useId();
    const [fontSize, setFontSize] = useState(18);
    useEffect(() => {
        const element = dialog.current;
        const opener = document.activeElement;
        element.showModal();
        return () => {
            element.close();
            if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
        };
    }, []);
    useEffect(() => { text.current?.scrollTo({ top: 0 }); }, [work?.id]);

    const keepFocusInside = (event) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]'));
        const first = controls.at(0);
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };

    return <ModalPortal><dialog className="class-agit-reader" ref={dialog} aria-labelledby={titleId} onKeyDown={keepFocusInside} onCancel={(event) => { event.preventDefault(); onClose(); }}>
        <header className="class-agit-reader__toolbar">
            <span>{roomTitle || '작품 읽기'}</span>
            <div aria-label="본문 글자 크기" role="group">
                <button type="button" onClick={() => setFontSize((size) => Math.max(16, size - 2))} disabled={fontSize <= 16} aria-label="글자 작게">가−</button>
                <output aria-live="polite">{fontSize}</output>
                <button type="button" onClick={() => setFontSize((size) => Math.min(26, size + 2))} disabled={fontSize >= 26} aria-label="글자 크게">가+</button>
            </div>
            <ModalCloseButton onClick={onClose} label="작품 닫기" />
        </header>
        <article ref={text} className="class-agit-reader__page" data-format={work?.format} style={{ '--reading-size': `${fontSize}px` }}>
            <span className="class-agit-eyebrow">{work?.kindLabel || '작품 읽기'}</span>
            <h2 id={titleId}>{work?.title || '작품 읽기'}</h2>
            {loading ? <p role="status">작품을 불러오고 있어요…</p> : error ? <p role="alert">{error}</p> : work && <><p className="class-agit-reader__author">{work.author}</p>
            <div className="class-agit-reader__text">{work.blocks.map((block, index) => <p key={index}>{block}</p>)}</div></>}
        </article>
        <footer className="class-agit-reader__footer">
            {footer || <nav aria-label="작품 넘기기"><button type="button" onClick={onPrevious} disabled={!onPrevious}>← 이전 작품</button><button type="button" onClick={onClose}>전시실로</button><button type="button" onClick={onNext} disabled={!onNext}>다음 작품 →</button></nav>}
        </footer>
    </dialog></ModalPortal>;
}
