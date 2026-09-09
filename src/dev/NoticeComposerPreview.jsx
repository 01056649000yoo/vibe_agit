import React, { useState } from 'react';
import NoticeComposer from '../modules/tool/class-board/widgets/notice-board/NoticeComposer';
import { normalizeNoticeTemplates } from '../modules/tool/class-board/widgets/notice-board/noticeTemplates';

/*
 * 알림장 작성 부품 미리보기.
 *
 * 이 부품은 스크린 설정창·열린 스크린 머리말·알림장 도구 **세 곳**에 들어가는데 미리보기가
 * 없어서 눈으로 볼 길이 없었다. 특히 설정창은 좁아서 서식 버튼이 넘치는지 봐야 한다.
 * DB 없이 보려고 통로를 샘플로 넣는다(부품이 `api`·`templateStore` 를 받는다).
 */

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const makeApi = (store) => Object.freeze({
    getNotices: (_classId, date) => Promise.resolve({
        version: 1,
        today,
        date: date || today,
        recent: [{ date: yesterday, preview: '어제 알림 미리보기' }],
        notice: { body: store.bodies[date || today] || '' },
    }),
    saveNotice: (_classId, date, body) => {
        store.bodies[date || today] = body;
        return Promise.resolve({ version: 1, notice: { body } });
    },
});

const WIDTHS = Object.freeze([
    { id: 'panel', label: '설정창 (380px)', width: 380 },
    { id: 'header', label: '열린 스크린 머리말 (560px)', width: 560 },
    { id: 'tool', label: '알림장 도구 (900px)', width: 900 },
]);

export default function NoticeComposerPreview() {
    const [widthId, setWidthId] = useState('panel');
    const [filled, setFilled] = useState(false);
    const [store] = useState(() => ({ bodies: {} }));
    const [api] = useState(() => makeApi(store));
    const [saved, setSaved] = useState([]);

    // 서식은 교사 프로필에 저장된다. 여기서는 메모리에만 담아 화면 흐름만 본다.
    const [templates, setTemplates] = useState(() => normalizeNoticeTemplates([]));
    const templateStore = React.useMemo(() => ({
        load: () => Promise.resolve(templates),
        save: (next) => { setTemplates(next); return Promise.resolve(next); },
    }), [templates]);

    const width = WIDTHS.find((item) => item.id === widthId)?.width || 380;

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {WIDTHS.map((item) => (
                    <button key={item.id} type="button" onClick={() => setWidthId(item.id)}
                        style={{ fontWeight: item.id === widthId ? 900 : 600 }}>{item.label}</button>
                ))}
                <button type="button" onClick={() => { setFilled(true); setTemplates(normalizeNoticeTemplates([
                    { name: '오늘 알림', body: '[오늘 배운 것]\n\n[준비물]\n' },
                    { name: '', body: '내일 준비물\n- \n' },
                    { name: '', body: '' },
                ])); }}>서식 채운 상태로</button>
            </div>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem' }}>
                DB 없이 화면만 봅니다. 저장은 이 화면 메모리에만 남습니다.
                {filled ? ' · 서식 두 칸이 채워진 상태입니다.' : ' · 서식이 비어 있어 `기본 서식 담기`가 보입니다.'}
            </p>
            <div style={{ width, maxWidth: '100%', border: '1px dashed #cbd5e1', borderRadius: 12, padding: 8 }}>
                <NoticeComposer
                    classId="preview-class"
                    api={api}
                    templateStore={templateStore}
                    widgetHint={widthId === 'panel'}
                    onSaved={(entry) => setSaved((list) => [`${entry.date} · ${entry.body.length}자`, ...list].slice(0, 4))}
                />
            </div>
            {saved.length > 0 ? (
                <p style={{ margin: 0, color: '#334155', fontSize: '0.8rem' }}>저장 기록: {saved.join(' / ')}</p>
            ) : null}
        </div>
    );
}
