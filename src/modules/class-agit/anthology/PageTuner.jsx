import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '../../../components/common/Button';
import ModalPortal from '../../../components/common/ModalPortal';
import ModalCloseButton from '../../../components/common/ModalCloseButton';
import { buildAnthologyHtml } from './print.js';
import { paginateAnthology } from './pagination.js';

/*
 * 쪽 다듬기 — 초안을 보고 **작품이 어느 쪽에서 시작할지** 교사가 정하는 자리.
 *
 * 인쇄 창이 아니라 **앱 안**에서 한다. 인쇄 창은 보안상 앱과 연결이 끊겨 있어(`opener=null`)
 * 거기서 누른 선택을 돌려받을 수 없다. 앱 안에서 하면 선택이 문집에 저장되어 다음에
 * 열어도 남고, 확정판에도 그대로 간다.
 *
 * **당기기는 "강제를 푸는 것"** 이다. 앞 쪽에 자리가 없으면 풀어도 올라오지 않는다 —
 * 그 사실을 화면 문구로 분명히 적는다. 안 그러면 "눌렀는데 안 올라온다" 가 된다.
 */
/*
 * 초안 쪽(A4)은 창보다 넓어 **좌우가 잘려 보인다**(2026-09-13 지적). 창 너비에 맞춰 줄인다.
 *
 * `zoom` 을 쓴다 — `transform: scale` 은 자리(레이아웃 상자)는 그대로라 줄여도 옆으로
 * 넘치고 아래에 빈 공간이 남는다. 미리보기 전용이라 인쇄본에는 영향이 없다.
 */
const fitToWidth = (frame) => {
    const doc = frame.contentDocument;
    const first = doc.querySelector('.anthology-page');
    if (!first) return;
    doc.documentElement.style.setProperty('--tuner-zoom', '1');
    const available = frame.clientWidth - 24;
    const pageWidth = first.offsetWidth;
    if (!pageWidth || available <= 0) return;
    doc.documentElement.style.setProperty('--tuner-zoom', String(Math.min(1, available / pageWidth)));
};

const PageTuner = ({ edition, breaks, onToggle, onClose, saving }) => {
    const frameRef = useRef(null);
    const [placement, setPlacement] = useState(null);
    const [error, setError] = useState('');

    const render = useCallback(async (cancelled = () => false) => {
        const frame = frameRef.current;
        if (!frame) return;
        try {
            const html = await buildAnthologyHtml(edition);
            const doc = frame.contentDocument;
            doc.open(); doc.write(html); doc.close();
            // 쪽을 창 너비에 맞춰 줄이는 규칙. 인쇄본 스타일은 건드리지 않는다.
            const fitStyle = doc.createElement('style');
            fitStyle.textContent = ':root{--tuner-zoom:1}.anthology-page{zoom:var(--tuner-zoom);margin:4mm auto}body{background:#e9e7e2}';
            doc.head.append(fitStyle);
            await doc.fonts.ready;
            await new Promise((resolve) => frame.contentWindow.requestAnimationFrame(
                () => frame.contentWindow.requestAnimationFrame(resolve)));
            const count = paginateAnthology(doc);
            doc.querySelector('.anthology-toolbar')?.remove();
            fitToWidth(frame);
            // 작품이 실제로 어느 쪽에서 시작했는지 읽어 온다 — 목차와 같은 값이다.
            const pages = edition.book.works.map((work, index) => {
                const row = doc.querySelector(`[data-toc-row="${index}"] [data-page], [data-divider-row="${index}"] [data-page]`);
                return { ...work, index, page: row?.textContent || '' };
            });
            if (!cancelled()) { setPlacement({ count, pages }); setError(''); }
        } catch (renderError) {
            if (!cancelled()) setError(renderError.message || '초안을 그리지 못했습니다.');
        }
    }, [edition]);

    /*
     * 초안을 그리는 일은 브라우저에 글자 크기를 물어봐야 하는 **바깥일**이라 효과로 둔다.
     * 그린 결과(쪽수·작품이 앉은 쪽)는 그때 비로소 알 수 있어 여기서 상태로 받는다.
     */
    useEffect(() => {
        let cancelled = false;
        void render(() => cancelled);
        return () => { cancelled = true; };
    }, [render]);

    // 창 크기가 바뀌면 다시 맞춘다 — 다시 그리지 않고 줄이는 배율만 고친다.
    useEffect(() => {
        const onResize = () => { if (frameRef.current?.contentDocument) fitToWidth(frameRef.current); };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    return (
        <ModalPortal>
            <div className="anthology-tuner__backdrop" role="presentation">
                <section className="anthology-tuner" role="dialog" aria-modal="true" aria-label="문집 쪽 다듬기">
                    <header className="anthology-tuner__head">
                        <div className="anthology-tuner__intro">
                            <span className="class-agit-eyebrow">STEP 04 · 쪽 다듬기</span>
                            <h2>작품이 어느 쪽에서 시작할지 정해요</h2>
                            <p>
                                {placement ? `지금 모두 ${placement.count}쪽입니다. ` : '초안을 그리고 있습니다… '}
                                <strong>다음 쪽으로 넘기기</strong>는 언제나 되고,
                                <strong> 당기기</strong>는 앞 쪽에 자리가 남아 있을 때만 올라옵니다.
                                차례와 쪽번호는 <strong>고칠 때마다 저절로</strong> 다시 매겨집니다.
                            </p>
                        </div>
                        <ModalCloseButton onClick={onClose} label="쪽 다듬기 닫기" />
                    </header>

                    {error && <p className="anthology-tuner__error" role="alert">{error}</p>}

                    <div className="anthology-tuner__body">
                        <ol className="anthology-tuner__list">
                            {(placement?.pages || []).map((work) => {
                                const forced = breaks.includes(work.sourceId);
                                const first = work.index === 0;
                                return (
                                    <li key={work.sourceId || work.index}>
                                        <div className="anthology-tuner__work">
                                            <strong>{work.title}</strong>
                                            <small>{work.author}{work.group ? ` · ${work.group}` : ''}</small>
                                        </div>
                                        <span className="anthology-tuner__page">{work.page ? `${work.page}쪽` : '—'}</span>
                                        {first ? (
                                            <span className="anthology-tuner__fixed">첫 작품</span>
                                        ) : (
                                            <Button
                                                type="button"
                                                variant={forced ? 'primary' : 'outline'}
                                                size="sm"
                                                disabled={saving}
                                                onClick={() => onToggle(work.sourceId)}
                                            >
                                                {forced ? '⤒ 당기기' : '⤓ 다음 쪽으로'}
                                            </Button>
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                        <div className="anthology-tuner__preview">
                            <iframe ref={frameRef} title="문집 초안 미리보기" />
                        </div>
                    </div>
                </section>
            </div>
        </ModalPortal>
    );
};

export default PageTuner;
