import { useEffect, useRef, useState } from 'react';
import ModalPortal from '../../../components/common/ModalPortal.jsx';
import ModalCloseButton from '../../../components/common/ModalCloseButton.jsx';
import { assertBookEdition } from './contract.js';
import './bookPreviewFrame.css';

/*
 * 학생이 문집을 "책으로" 넘겨 보는 창(2026-09-23). 교사 미리보기와 **같은 렌더러**(print.js 의 buildAnthologyHtml +
 * paginateAnthology)를 새 창 대신 앱 안 틀(iframe)에 그린다 — 태블릿에서 새 창이 막히지 않고, 표지·여는 글·차례·본문
 * 쪽이 교사 화면과 똑같다. 틀은 같은 출처의 빈 문서라 바깥 주소를 부르지 않는다.
 *
 * load: 확정판 전체(get_class_agit_book_edition_v1 과 같은 모양)를 돌려주는 함수. 학생 판은 원글 id 가 빠져 온다.
 */
export default function BookPreviewFrame({ load, title = '문집', onClose, embedded = false }) {
    const frame = useRef(null);
    const [state, setState] = useState('loading');
    const [pages, setPages] = useState(0);

    useEffect(() => {
        let alive = true;
        let resize;
        (async () => {
            try {
                const [edition, { renderAnthologyWindow }] = await Promise.all([load(), import('./print.js')]);
                assertBookEdition(edition);
                const target = frame.current?.contentWindow;
                if (!alive || !target) return;
                const count = await renderAnthologyWindow(target, edition);
                // 종이 실제 크기로 그려지므로, 좁은 화면에서는 틀 폭에 맞춰 줄인다(가로 스크롤 없이 한 쪽씩 넘겨 보게).
                const page = target.document.querySelector('.anthology-page');
                const pageWidth = page?.getBoundingClientRect().width || 0;
                const fit = () => {
                    const available = (frame.current?.clientWidth || 0) - 24;
                    if (pageWidth > 0 && available > 0) {
                        target.document.documentElement.style.zoom = String(Math.min(1, available / pageWidth));
                    }
                };
                fit();
                resize = new ResizeObserver(fit);
                if (frame.current) resize.observe(frame.current);
                if (alive) { setPages(count); setState('ready'); }
            } catch {
                if (alive) setState('error');
            }
        })();
        return () => { alive = false; resize?.disconnect(); };
    }, [load]);

    const content = (
            <div className={`book-preview-frame${embedded ? ' book-preview-frame--embedded' : ''}`} role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : true} aria-label={`${title} 책으로 보기`}>
                <header className="book-preview-frame__bar">
                    <strong>📖 {title}</strong>
                    <span role="status">{state === 'loading' ? '책을 펼치는 중…' : state === 'error' ? '책을 펼치지 못했어요. 닫고 다시 눌러 주세요.' : `${pages}쪽 · 아래로 넘겨 읽어요`}</span>
                    {!embedded && <ModalCloseButton onClick={onClose} label="책 닫기" />}
                </header>
                <iframe ref={frame} title={`${title} 책`} className="book-preview-frame__page" />
            </div>
    );
    return embedded ? content : <ModalPortal>{content}</ModalPortal>;
}
