import { useEffect, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import { BOOK_INNER_STYLES, COVER_SAFE_MARGIN_MM, COVER_SPECS, checkCoverImage, coverSource, coverSpec } from './coverImage.js';
import { readImageSize, uploadCoverImage } from '../api/coverImageApi.js';
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

/** 속지 스타일 미리보기: 목차 한 장 모양. */
function InnerStylePreview({ style }) {
    return <span className="cover-inner-preview" aria-hidden="true" style={{ '--inner-heading': style.heading, '--inner-rule': style.rule, '--inner-rule-style': style.ruleStyle, '--inner-rule-width': `${Math.max(1, style.ruleWidth * 4)}px` }}>
        <b>차례</b><i /><i /><i /><em data-page-number={style.pageNumber}>{style.pageNumber === 'dashes' ? '— 3 —' : '3'}</em>
    </span>;
}

export default function CoverImagePanel({ classId, book, api, dirty, locked, run, receive }) {
    const spec = coverSpec(book.paper_format);
    const active = coverSource(book);
    const [picked, setPicked] = useState(null); // { file, size, check, preview }
    const [style, setStyle] = useState(active.kind === 'image' ? active.innerStyle.id : 'plain');
    const blocked = locked || dirty;

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
    });

    return <section className="cover-image-panel" aria-labelledby="cover-image-panel-title">
        <div className="cover-image-panel__head">
            <h3 id="cover-image-panel-title">🖼️ 내가 만든 표지 그림 쓰기</h3>
            {active.kind === 'image' && <span className="cover-image-panel__badge">그림 표지 사용 중</span>}
        </div>
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
        <p className="cover-image-panel__note">가장자리 {COVER_SAFE_MARGIN_MM}mm 안쪽에 글자를 두세요(인쇄할 때 잘릴 수 있어요). <strong>학생 얼굴이나 이름이 드러난 사진은 넣지 마세요</strong> — 이 표지는 문집이 보이는 곳(우리 반 서가·모두의 아지트 도서관)에 함께 보여요.</p>

        {dirty && <p className="cover-image-panel__warn" role="status">먼저 위의 변경을 저장한 뒤 표지 그림을 올려 주세요(판형을 바꿨다면 저장한 판형 규격으로 확인해요).</p>}

        <label className="cover-image-panel__file">
            <span>{spec.label} 표지 그림 고르기</span>
            <input type="file" accept="image/png,image/jpeg" disabled={blocked} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
        {picked && !picked.check.ok && <p className="cover-image-panel__error" role="alert">⚠️ {picked.check.error}</p>}
        {picked?.check.ok && <div className="cover-image-panel__preview">
            <img src={picked.preview} alt="올릴 표지 그림 미리보기" style={{ aspectRatio: `${spec.widthMm} / ${spec.heightMm}` }} />
            <div>
                <p>✅ {spec.label} 규격에 맞아요 ({picked.size.width}×{picked.size.height}px).</p>
                {picked.check.warning && <p className="cover-image-panel__warn">{picked.check.warning}</p>}
                <Button type="button" disabled={blocked} onClick={apply}>이 그림으로 표지 바꾸기</Button>
            </div>
        </div>}

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
