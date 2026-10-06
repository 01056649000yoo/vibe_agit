import { useEffect, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import GuideInfoButton from '../../../components/common/GuideInfoButton.jsx';
import { BOOK_INNER_STYLES, COVER_SAFE_MARGIN_MM, COVER_SPECS, checkCoverImage, coverSource, coverSpec } from './coverImage.js';
import { readImageSize, uploadCoverImage } from '../api/coverImageApi.js';
import { useCoverImageUrl } from './CoverImageFill.jsx';
import './coverImagePanel.css';

/*
 * 글꽃 책방 2단계 — "내가 만든 표지 그림 쓰기"(2026-10-06, docs/CLASS_AGIT_COVER_UPLOAD_PLAN.md).
 * 규격에 맞는 그림만 표지가 된다. 그림이 곧 표지 전체이고, 목차·속지는 세 가지 속지 스타일 중 하나.
 * 저장하지 않은 편집이 있으면 막는다 — 서버가 저장된 판형으로 비율을 보고, 결과로 문집을 다시 받기 때문.
 */

/** 종이별 빈 틀 그림(권장 크기 PNG, 안전 영역 점선). */
function downloadTemplate(paperId) {
    const spec = coverSpec(paperId);
    const canvas = document.createElement('canvas');
    canvas.width = spec.recommended.width;
    canvas.height = spec.recommended.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const m = spec.safeMarginPx;
    ctx.setLineDash([36, 24]);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#94a3b8';
    ctx.strokeRect(m, m, canvas.width - m * 2, canvas.height - m * 2);
    ctx.setLineDash([]);
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.round(canvas.width / 18)}px sans-serif`;
    ctx.fillText(`${spec.label} 문집 표지`, canvas.width / 2, canvas.height / 2 - canvas.width / 14);
    ctx.font = `${Math.round(canvas.width / 34)}px sans-serif`;
    ctx.fillText(`${spec.recommended.width} × ${spec.recommended.height} px (${spec.widthMm}×${spec.heightMm}mm, 300dpi)`, canvas.width / 2, canvas.height / 2);
    ctx.fillText(`점선 안쪽(가장자리 ${COVER_SAFE_MARGIN_MM}mm 안)에 글자를 두세요`, canvas.width / 2, canvas.height / 2 + canvas.width / 22);
    ctx.fillText('JPG 또는 PNG · 5MB 이하로 내보내기', canvas.width / 2, canvas.height / 2 + canvas.width / 11);
    canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `문집표지_빈틀_${spec.label}_${spec.recommended.width}x${spec.recommended.height}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
}

/*
 * 캔바로 표지 만드는 법(2026-10-06 선생님 요청: "판형 디자인에서 바로 볼 수 있게").
 * 숫자는 지금 문집 판형의 규격(coverSpec)에서 꺼낸다 — 판형을 바꾸면 안내 숫자도 바뀐다.
 * mm 단위로 만들면 내려받은 그림의 픽셀 크기가 판형마다 달라질 수 있어 px 로 안내한다.
 */
function CanvaGuide({ spec }) {
    const { width, height } = spec.recommended;
    return <div className="cover-image-panel__guide" role="region" aria-label="캔바로 표지 만드는 법">
        <p className="cover-image-panel__guide-lead">이 문집은 <strong>{spec.label}</strong>이에요. 캔바에서 <strong>{width} × {height} px</strong>로 만들면 그대로 맞아요.</p>
        <ol>
            <li>캔바 첫 화면에서 <b>디자인 만들기</b> → <b>사용자 지정 크기</b>를 누릅니다.</li>
            <li>단위를 <b>px</b>로 바꾸고 너비 <b>{width}</b>, 높이 <b>{height}</b>를 넣은 뒤 <b>새 디자인 만들기</b>를 누릅니다. (세로가 더 긴 모양이에요. mm 로 만들면 내려받은 크기가 달라질 수 있어요.)</li>
            <li>(선택) 아래 표에서 <b>빈 틀</b>을 내려받아 캔바에 올리고 배경에 깐 다음, <b>점선 안쪽</b>에 제목 같은 글자를 놓습니다. 다 만들면 빈 틀 그림은 지웁니다.</li>
            <li><b>제목·학급·발행일</b>처럼 표지에 보일 글자는 그림 안에 직접 넣습니다. 아지트는 그림 위에 글자를 얹지 않아요.</li>
            <li><b>공유</b> → <b>다운로드</b> → 파일 형식 <b>PNG</b>(사진이 많으면 <b>JPG</b>)를 고르고, 크기는 바꾸지 않고 그대로 내려받습니다. <b>PDF</b>로는 받지 마세요.</li>
            <li>용량이 <b>5MB</b>를 넘으면 <b>JPG</b>로 다시 내려받아 보세요(품질을 조금 낮추면 더 작아져요).</li>
            <li>여기로 돌아와 <b>{spec.label} 표지 그림 고르기</b>로 올립니다. 맞지 않으면 무엇이 틀렸는지 알려 드려요.</li>
        </ol>
        <p className="cover-image-panel__guide-note">다른 판형: {COVER_SPECS.filter((item) => item.paper !== spec.paper).map((item) => `${item.label} ${item.recommended.width}×${item.recommended.height}px`).join(' · ')} — 판형을 바꾸면 표지 그림을 다시 만들어 올려야 해요.</p>
    </div>;
}

/** 속지 스타일 미리보기: 목차 한 장 모양. */
function InnerStylePreview({ style }) {
    return <span className="cover-inner-preview" aria-hidden="true" style={{ '--inner-heading': style.heading, '--inner-rule': style.rule, '--inner-rule-style': style.ruleStyle, '--inner-rule-width': `${Math.max(1, style.ruleWidth * 4)}px` }}>
        <b>차례</b><i /><i /><i /><em data-page-number={style.pageNumber}>{style.pageNumber === 'dashes' ? '— 3 —' : '3'}</em>
    </span>;
}

export default function CoverImagePanel({ classId, book, api, dirty, locked, run, receive, onCleared }) {
    const spec = coverSpec(book.paper_format);
    const active = coverSource(book);
    const [picked, setPicked] = useState(null); // { file, size, check, preview }
    const [style, setStyle] = useState(active.kind === 'image' ? active.innerStyle.id : 'plain');
    const blocked = locked || dirty;
    const [guideOpen, setGuideOpen] = useState(false);
    const currentUrl = useCoverImageUrl(book);

    useEffect(() => () => { if (picked?.preview) URL.revokeObjectURL(picked.preview); }, [picked]);

    const choose = async (file) => {
        if (!file) return;
        let size = null;
        try { size = await readImageSize(file); } catch { size = null; }
        const check = checkCoverImage(file, size, book.paper_format);
        setPicked({ file, size, check, preview: check.ok ? URL.createObjectURL(file) : '' });
    };

    const apply = () => run(async () => {
        const path = await uploadCoverImage(classId, book.id, picked.file);
        receive(await api.bookAction(classId, 'set_cover_image', { book_id: book.id, path, width: picked.size.width, height: picked.size.height, inner_style: style }));
        setPicked(null);
    });

    const changeStyle = (next) => {
        setStyle(next);
        if (active.kind !== 'image' || blocked) return;
        run(async () => receive(await api.bookAction(classId, 'set_cover_image', { book_id: book.id, path: active.path, width: active.width, height: active.height, inner_style: next })));
    };

    const clear = () => run(async () => {
        receive(await api.bookAction(classId, 'clear_cover_image', { book_id: book.id }));
        setPicked(null);
        onCleared?.();
    });

    return <section className="cover-image-panel" aria-labelledby="cover-image-panel-title">
        <div className="cover-image-panel__head">
            <h3 id="cover-image-panel-title">🖼️ 내가 만든 표지 그림 쓰기</h3>
            {active.kind === 'image' && <span className="cover-image-panel__badge">그림 표지 사용 중</span>}
            <GuideInfoButton variant="help" text={guideOpen ? '캔바 안내 닫기' : '캔바로 만드는 법'} label="캔바로 표지 만드는 법" onClick={() => setGuideOpen((open) => !open)} />
        </div>
        {guideOpen && <CanvaGuide spec={spec} />}
        <p className="cover-image-panel__lead">캔바 같은 곳에서 표지를 만들어 올리면 그 그림이 표지 전체가 돼요. 목차·여는 글·작품 쪽은 아래 속지 스타일로 나와요.</p>

        <table className="cover-image-panel__spec">
            <caption>표지 그림 규격 · JPG·PNG · 5MB 이하 · 비율 ±1%</caption>
            <thead><tr><th scope="col">종이</th><th scope="col">권장(선명한 인쇄)</th><th scope="col">최소</th><th scope="col">빈 틀</th></tr></thead>
            <tbody>{COVER_SPECS.map((item) => <tr key={item.paper} className={item.paper === spec.paper ? 'is-current' : ''}>
                <th scope="row">{item.label}{item.paper === spec.paper ? ' (이 문집)' : ''}</th>
                <td>{item.recommended.width}×{item.recommended.height}px</td>
                <td>{item.minimum.width}×{item.minimum.height}px</td>
                <td><button type="button" className="cover-image-panel__link" onClick={() => downloadTemplate(item.paper)}>내려받기</button></td>
            </tr>)}</tbody>
        </table>
        <p className="cover-image-panel__note">가장자리 {COVER_SAFE_MARGIN_MM}mm 안쪽에 글자를 두세요(인쇄할 때 잘릴 수 있어요). <strong>학생 얼굴이나 이름이 드러난 사진은 넣지 마세요</strong> — 이 표지는 문집이 보이는 곳(우리 반 서가·모두의 아지트 도서관)에 함께 보여요. 올린 그림은 이 문집이 남아 있는 동안 보관하고, 문집을 지우면 함께 지워져요.</p>

        {dirty && <p className="cover-image-panel__warn" role="status">먼저 위의 변경을 저장한 뒤 표지 그림을 올려 주세요(판형을 바꿨다면 저장한 판형 규격으로 확인해요).</p>}

        {/* 왼쪽: 그림 고르기, 오른쪽: 지금 표지(또는 방금 고른 그림과 적용 단추) — 2026-10-06 선생님 지적 "오른쪽이 텅 비어 있다" */}
        <div className="cover-image-panel__upload">
            <label className={`cover-image-panel__drop${blocked ? ' is-disabled' : ''}`}>
                <input type="file" accept="image/png,image/jpeg" disabled={blocked} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ''; }} />
                <span className="cover-image-panel__drop-icon" aria-hidden="true">🖼️</span>
                <strong>{spec.label} 표지 그림 고르기</strong>
                <small>JPG·PNG · 권장 {spec.recommended.width}×{spec.recommended.height}px · 5MB 이하</small>
                <span className="cover-image-panel__drop-button" aria-hidden="true">파일 선택</span>
            </label>
            <div className="cover-image-panel__side" aria-live="polite">
                {picked?.check.ok ? <>
                    <img className="cover-image-panel__thumb" src={picked.preview} alt="올릴 표지 그림 미리보기" style={{ aspectRatio: `${spec.widthMm} / ${spec.heightMm}` }} />
                    <div className="cover-image-panel__side-copy">
                        <p className="cover-image-panel__ok">✅ {spec.label} 규격에 맞아요 ({picked.size.width}×{picked.size.height}px)</p>
                        {picked.check.warning && <p className="cover-image-panel__warn">{picked.check.warning}</p>}
                        <Button type="button" disabled={blocked} onClick={apply}>이 그림으로 표지 바꾸기</Button>
                    </div>
                </> : active.kind === 'image' ? <>
                    {currentUrl ? <img className="cover-image-panel__thumb" src={currentUrl} alt="지금 표지 그림" style={{ aspectRatio: `${spec.widthMm} / ${spec.heightMm}` }} /> : <span className="cover-image-panel__thumb is-empty" style={{ aspectRatio: `${spec.widthMm} / ${spec.heightMm}` }} />}
                    <div className="cover-image-panel__side-copy">
                        <p className="cover-image-panel__ok">지금 표지로 쓰는 그림이에요.</p>
                        <small>{active.width}×{active.height}px · 바꾸려면 새 그림을 고르세요.</small>
                    </div>
                </> : <>
                    <span className="cover-image-panel__thumb is-empty" style={{ aspectRatio: `${spec.widthMm} / ${spec.heightMm}` }}><span>{spec.label}<br />{spec.widthMm}×{spec.heightMm}mm</span></span>
                    <div className="cover-image-panel__side-copy">
                        <p>아직 올린 그림이 없어요.</p>
                        <small>규격에 맞는 그림을 고르면 여기에서 미리 보고 표지로 바꿀 수 있어요. 처음이면 제목 옆 <b>캔바로 만드는 법</b>을 눌러 보세요.</small>
                    </div>
                </>}
            </div>
        </div>
        {picked && !picked.check.ok && <p className="cover-image-panel__error" role="alert">⚠️ {picked.check.error}</p>}

        <fieldset className="cover-image-panel__styles" disabled={blocked}>
            <legend>속지 스타일 (그림 표지일 때 목차·여는 글·작품 쪽)</legend>
            <div className="cover-image-panel__style-options">{BOOK_INNER_STYLES.map((item) => <label key={item.id} className={style === item.id ? 'is-selected' : ''}>
                <input type="radio" name="속지 스타일" checked={style === item.id} onChange={() => changeStyle(item.id)} />
                <InnerStylePreview style={item} />
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
            </label>)}</div>
        </fieldset>

        {active.kind === 'image' && <Button variant="outline" type="button" disabled={blocked} onClick={clear}>기본 디자인으로 돌아가기</Button>}
    </section>;
}
