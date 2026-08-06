import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { READER_LEVELS, WRITER_LEVELS } from '../../../constants/writerLevels';
import { supabase } from '../../../lib/supabaseClient';
import { getDragonStage, getReaderDragonEffect } from './presentation';
import './DragonFarewellPanel.css';

const MIN_FAREWELL_LENGTH = 50;
const MAX_FAREWELL_LENGTH = 1200;
const DATE_FORMAT = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

const getTitle = (levels, level) => levels.find((item) => item.level === Number(level)) || levels[0];
const safeFileName = (value) => String(value || '수호룡-작별편지').replace(/[\\/:*?"<>|]/g, '-');

const loadImage = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
});

const wrapCanvasText = (context, text, maxWidth) => {
    const paragraphs = String(text || '').split(/\n/);
    const lines = [];
    paragraphs.forEach((paragraph, paragraphIndex) => {
        if (!paragraph) {
            lines.push('');
        } else {
            let line = '';
            Array.from(paragraph).forEach((character) => {
                const next = line + character;
                if (line && context.measureText(next).width > maxWidth) {
                    lines.push(line);
                    line = character;
                } else {
                    line = next;
                }
            });
            if (line) lines.push(line);
        }
        if (paragraphIndex < paragraphs.length - 1 && lines.at(-1) !== '') lines.push('');
    });
    return lines;
};

const drawRoundedRect = (context, x, y, width, height, radius) => {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    context.fill();
};

const FAREWELL_FONT_MIN = 20;
const FAREWELL_FONT_MAX = 42;
const FAREWELL_LINE_HEIGHT_RATIO = 1.55;

/**
 * 편지 글씨 크기를 학생이 쓴 분량에 맞춰 정한다.
 *
 * 예전에는 21px 고정이라 최소 분량(50자)만 써도 커다란 편지 상자에 글씨가 작게 떠 있었다.
 * 큰 글씨부터 내려가며 목표 높이(상자의 약 2/3) 안에 들어오는 첫 크기를 고른다 — 짧은 편지는
 * 최대 크기 근처로 커지고, 긴 편지는 필요한 만큼만 작아진다. 최소 크기에서도 넘치면 자르고 말줄임표를 붙인다.
 */
const fitFarewellLetterText = (context, text, { maxWidth, targetHeight, maxHeight }) => {
    let best = null;
    for (let fontSize = FAREWELL_FONT_MAX; fontSize >= FAREWELL_FONT_MIN; fontSize -= 1) {
        context.font = `650 ${fontSize}px system-ui, sans-serif`;
        const lines = wrapCanvasText(context, text, maxWidth);
        const lineHeight = Math.round(fontSize * FAREWELL_LINE_HEIGHT_RATIO);
        best = { fontSize, lineHeight, lines, totalHeight: lines.length * lineHeight };
        if (best.totalHeight <= targetHeight) break;
    }
    if (best.totalHeight > maxHeight) {
        const maxLines = Math.max(1, Math.floor(maxHeight / best.lineHeight) - 1);
        best = {
            ...best,
            lines: [...best.lines.slice(0, maxLines), '…'],
            totalHeight: (maxLines + 1) * best.lineHeight
        };
    }
    return best;
};

const downloadFarewellCard = async ({ record, ownerName }) => {
    const snapshot = record?.snapshot || {};
    const petData = snapshot.pet_data || {};
    const writerLevel = Number(snapshot.writer_level || 1);
    const readerLevel = Number(snapshot.reader_level || 1);
    const writer = getTitle(WRITER_LEVELS, writerLevel);
    const reader = getTitle(READER_LEVELS, readerLevel);
    const dragon = getDragonStage(writerLevel, petData.species);
    const readerEffect = getReaderDragonEffect(readerLevel);
    const season = record?.season || {};
    const canvas = document.createElement('canvas');
    canvas.width = 1050;
    canvas.height = 2000;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('이미지 캔버스를 만들 수 없습니다.');

    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#18263f');
    gradient.addColorStop(.5, '#3a2c3f');
    gradient.addColorStop(1, '#7c4d2e');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = `${dragon.species.accent}CC`;
    context.lineWidth = 8;
    context.strokeRect(34, 34, 982, 1932);
    context.strokeStyle = 'rgba(255,235,183,.48)';
    context.lineWidth = 2;
    context.strokeRect(52, 52, 946, 1896);

    context.textAlign = 'center';
    context.fillStyle = '#F7D991';
    context.font = '800 22px system-ui, sans-serif';
    context.fillText(`GUARDIAN SEASON ${season.number || ''}`, 525, 105);
    context.fillStyle = '#FFFFFF';
    context.font = '900 48px system-ui, sans-serif';
    context.fillText(season.name || '수호룡과 함께한 학기', 525, 165);
    context.fillStyle = 'rgba(255,255,255,.72)';
    context.font = '700 20px system-ui, sans-serif';
    // "와/과"는 이름의 받침 유무에 따라 갈리는데(예: "유지담과", "김단우와"), 이걸 문자열로만
    // 판정하지 않는다. 가운뎃점으로 이어 문법 오류 없이 같은 뜻을 전달한다.
    context.fillText(`${ownerName || '나'} · ${petData.name || '작가 수호룡'}의 성장 기록`, 525, 205);

    // 수호룡을 더 크게 보여 달라는 요청으로 이전보다 카드·슬롯을 키웠다(510×360 → 650×470).
    context.fillStyle = 'rgba(255,255,255,.1)';
    drawRoundedRect(context, 70, 225, 910, 595, 36);

    const dragonImage = await loadImage(dragon.image);
    const dragonSlotY = 250;
    const dragonSlotHeight = 480;
    const maxDragonWidth = 650;
    const maxDragonHeight = 470;
    const ratio = Math.min(maxDragonWidth / dragonImage.naturalWidth, maxDragonHeight / dragonImage.naturalHeight);
    const dragonWidth = dragonImage.naturalWidth * ratio;
    const dragonHeight = dragonImage.naturalHeight * ratio;
    context.drawImage(
        dragonImage,
        (1050 - dragonWidth) / 2,
        dragonSlotY + (dragonSlotHeight - dragonHeight) / 2,
        dragonWidth,
        dragonHeight
    );

    context.fillStyle = 'rgba(10,16,30,.72)';
    drawRoundedRect(context, 125, 740, 800, 58, 29);
    context.fillStyle = '#FFFFFF';
    context.font = '850 21px system-ui, sans-serif';
    context.fillText(`${writer.emoji} 작가 ${writerLevel}/10 ${writer.name}   ·   ${reader.emoji} 독자 ${readerLevel}/7 ${reader.name}`, 525, 777);

    const letterBox = { x: 90, y: 850, width: 870, height: 980 };
    context.textAlign = 'left';
    context.fillStyle = '#FFF9EB';
    drawRoundedRect(context, letterBox.x, letterBox.y, letterBox.width, letterBox.height, 32);
    context.fillStyle = '#6B432A';
    context.font = '900 28px system-ui, sans-serif';
    context.fillText(`${petData.name || '나의 수호룡'}에게`, 135, letterBox.y + 60);

    // 편지 글씨는 분량에 맞춰 자동으로 커지거나 작아진다(짧은 편지가 작게 떠 있던 문제 해결).
    context.fillStyle = '#392C27';
    const contentLeft = 135;
    const contentMaxWidth = 780;
    const contentTop = letterBox.y + 110;
    const signatureReserve = 90;
    const maxTextAreaHeight = letterBox.height - 110 - signatureReserve;
    const { fontSize, lineHeight, lines, totalHeight } = fitFarewellLetterText(context, record?.farewell_content || '', {
        maxWidth: contentMaxWidth,
        targetHeight: maxTextAreaHeight * (2 / 3),
        maxHeight: maxTextAreaHeight
    });
    context.font = `650 ${fontSize}px system-ui, sans-serif`;
    lines.forEach((line, index) => context.fillText(line, contentLeft, contentTop + index * lineHeight));

    // 서명은 편지 길이에 맞춰 마지막 줄 바로 아래에 둔다 — 글씨가 커져도 겹치지 않는다.
    const signatureY = Math.min(contentTop + totalHeight + 44, letterBox.y + letterBox.height - 40);
    context.textAlign = 'right';
    context.fillStyle = '#815A3D';
    context.font = '800 20px system-ui, sans-serif';
    // 받침 유무에 따라 "이"/"가" 를 가리지 않고도 자연스러운 편지 서명 표현을 쓴다.
    context.fillText(`${ownerName || '나'} 씀`, letterBox.x + letterBox.width - 55, signatureY);

    context.textAlign = 'center';
    context.fillStyle = 'rgba(255,255,255,.65)';
    context.font = '700 17px system-ui, sans-serif';
    const closedAt = season.closed_at || season.closing_started_at;
    context.fillText(`${readerEffect.name} · ${closedAt ? DATE_FORMAT.format(new Date(closedAt)) : '함께한 학기'}`, 525, 1910);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('이미지를 저장하지 못했습니다.');
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeFileName(`${season.name}-${ownerName}-수호룡-작별편지`)}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const DragonFarewellPanel = ({ ownerName }) => {
    const [data, setData] = useState(null);
    const [content, setContent] = useState('');
    const [saving, setSaving] = useState(false);
    const [downloadingId, setDownloadingId] = useState(null);
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        const { data: next, error } = await supabase.rpc('get_my_dragon_season_farewell');
        if (error) {
            // 새 마이그레이션 적용 전 화면에서도 수호룡 방 전체가 깨지지 않게 조용히 격리한다.
            console.error('수호룡 학기 기록 조회 실패:', error);
            return;
        }
        setData(next || { current: null, history: [] });
        setContent(next?.current?.farewell_content || '');
    }, []);

    useEffect(() => {
        const timerId = window.setTimeout(load, 0);
        return () => window.clearTimeout(timerId);
    }, [load]);

    const current = data?.current || null;
    const history = useMemo(() => (Array.isArray(data?.history) ? data.history : []), [data?.history]);
    if (!current && history.length === 0) return null;

    const save = async (complete) => {
        if (saving) return;
        if (complete && content.trim().length < MIN_FAREWELL_LENGTH) {
            setMessage(`작별 편지는 ${MIN_FAREWELL_LENGTH}자 이상 써주세요.`);
            return;
        }
        setSaving(true);
        setMessage('');
        const { error } = await supabase.rpc('save_my_dragon_farewell', {
            p_content: content,
            p_complete: complete
        });
        setSaving(false);
        if (error) {
            console.error('수호룡 작별 편지 저장 실패:', error);
            setMessage(error.message || '편지를 저장하지 못했어요.');
            return;
        }
        setMessage(complete ? '작별 편지를 완성했어요. 이제 기념 이미지를 간직할 수 있어요.' : '작성 중인 편지를 저장했어요.');
        await load();
    };

    const download = async (record, key) => {
        setDownloadingId(key);
        setMessage('');
        try {
            await downloadFarewellCard({ record, ownerName });
        } catch (error) {
            console.error('수호룡 작별 카드 다운로드 실패:', error);
            setMessage('이미지를 만들지 못했어요. 잠시 후 다시 시도해주세요.');
        } finally {
            setDownloadingId(null);
        }
    };

    return (
        <section className="dragon-farewell" aria-label="수호룡 학기 기록">
            {current && (
                <div className="dragon-farewell__current">
                    <div className="dragon-farewell__heading">
                        <div><small>FAREWELL LETTER</small><h3>{current.season?.name} 작별 준비</h3></div>
                        <span className={current.farewell_status === 'completed' ? 'is-complete' : ''}>
                            {current.farewell_status === 'completed' ? '편지 완성' : '작성 중'}
                        </span>
                    </div>
                    <p>이번 학기 동안 함께 자란 수호룡에게 하고 싶은 말을 남겨보세요. 이 편지는 성장 점수나 포인트에 포함되지 않아요.</p>
                    <label htmlFor="dragon-farewell-content">나의 수호룡에게</label>
                    <textarea
                        id="dragon-farewell-content"
                        value={content}
                        maxLength={MAX_FAREWELL_LENGTH}
                        onChange={(event) => setContent(event.target.value)}
                        placeholder="함께한 순간, 고마웠던 점, 다음 학기에 이루고 싶은 일을 직접 써보세요."
                    />
                    <div className="dragon-farewell__counter">{content.length.toLocaleString('ko-KR')} / {MAX_FAREWELL_LENGTH.toLocaleString('ko-KR')}자 · 완성은 {MIN_FAREWELL_LENGTH}자부터</div>
                    <div className="dragon-farewell__actions">
                        <button type="button" onClick={() => save(false)} disabled={saving}>작성 중 저장</button>
                        <button type="button" className="is-primary" onClick={() => save(true)} disabled={saving}>작별 편지 완성</button>
                        {current.farewell_status === 'completed' && (
                            <button type="button" className="is-download" onClick={() => download({ ...current, farewell_content: content }, 'current')} disabled={downloadingId === 'current'}>
                                {downloadingId === 'current' ? '이미지 만드는 중…' : '기념 이미지 받기'}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {history.length > 0 && (
                <div className="dragon-farewell__archive">
                    <div className="dragon-farewell__heading"><div><small>GUARDIAN ARCHIVE</small><h3>지난 수호룡 기록</h3></div></div>
                    <div className="dragon-farewell__archive-list">
                        {history.map((record) => {
                            const writerLevel = Number(record.snapshot?.writer_level || 1);
                            const dragon = getDragonStage(writerLevel, record.snapshot?.pet_data?.species);
                            return (
                                <article key={record.season?.id}>
                                    <img src={dragon.image} alt="" width="84" height="84" loading="lazy" />
                                    <div><strong>{record.season?.name}</strong><small>작가 성장 {writerLevel}/10 · {record.farewell_status === 'completed' ? '작별 편지 완성' : '편지 미완성'}</small></div>
                                    {record.farewell_status === 'completed' && (
                                        <button type="button" onClick={() => download(record, record.season?.id)} disabled={downloadingId === record.season?.id}>이미지 받기</button>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                </div>
            )}
            {message && <p className="dragon-farewell__message" role="status">{message}</p>}
        </section>
    );
};

export default DragonFarewellPanel;
