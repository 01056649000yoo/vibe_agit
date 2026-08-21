import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PREVIEW_LENGTH = 140;

const formatDay = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
};

/*
 * 안 읽은 공지를 대시보드 위에 펼쳐 놓는다.
 *
 * 예전에는 머리말의 작은 `📢` 버튼이 전부였다. **눌러서 창을 열어야만** 무슨 공지인지 알 수 있어
 * 새 공지가 올라와도 그냥 지나쳤다. 그래서 여기서는
 *   ① 제목뿐 아니라 **내용 앞부분까지** 바로 보이고,
 *   ② `더 보기` 를 누르면 **그 자리에서 펼쳐진다**(창을 새로 열지 않는다),
 *   ③ 다 읽으면 **띠가 사라진다** — 읽은 공지까지 계속 자리를 차지하면 곧 눈에 안 들어온다.
 */
const AnnouncementSpotlight = ({ unread = [], onMarkSeen, onViewAll }) => {
    const [expandedId, setExpandedId] = useState(null);

    if (unread.length === 0) return null;

    const [newest, ...rest] = unread;
    const isExpanded = expandedId === newest.id;
    const body = newest.content || '';
    const needsMore = body.length > PREVIEW_LENGTH;

    return (
        <AnimatePresence>
            <motion.section
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                aria-label="새 공지사항"
                style={{
                    display: 'flex', gap: '14px', alignItems: 'flex-start',
                    margin: '0', padding: '16px 24px',
                    background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
                    borderBottom: '1px solid #C7D2FE'
                }}
            >
                <span style={{ fontSize: '1.4rem', lineHeight: 1.2 }} aria-hidden="true">📢</span>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <span style={{
                            padding: '1px 7px', borderRadius: '999px',
                            background: '#4338CA', color: 'white',
                            fontSize: '0.7rem', fontWeight: 900
                        }}>
                            새 공지
                        </span>
                        <strong style={{ color: '#312E81', fontSize: '0.98rem', wordBreak: 'keep-all' }}>
                            {newest.title}
                        </strong>
                        <span style={{ color: '#6366F1', fontSize: '0.75rem' }}>{formatDay(newest.created_at)}</span>
                    </div>

                    <p style={{
                        margin: 0, color: '#3730A3', fontSize: '0.88rem', lineHeight: 1.6,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                    }}>
                        {isExpanded || !needsMore ? body : `${body.slice(0, PREVIEW_LENGTH)}...`}
                    </p>

                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
                        {needsMore && (
                            <button
                                type="button"
                                onClick={() => setExpandedId(isExpanded ? null : newest.id)}
                                style={{
                                    border: 'none', background: 'none', padding: 0,
                                    color: '#4338CA', cursor: 'pointer',
                                    fontSize: '0.8rem', fontWeight: 800, textDecoration: 'underline'
                                }}
                            >
                                {isExpanded ? '접기' : '더 보기'}
                            </button>
                        )}
                        {/* 읽음 처리는 선생님이 직접 누른다. 스쳐 지나갔다고 읽은 것으로 치면 안 된다. */}
                        <button
                            type="button"
                            onClick={() => onMarkSeen?.([newest.id])}
                            style={{
                                border: '1px solid #C7D2FE', background: 'white',
                                borderRadius: '8px', padding: '5px 12px',
                                color: '#4338CA', cursor: 'pointer',
                                fontSize: '0.8rem', fontWeight: 800
                            }}
                        >
                            확인했어요
                        </button>
                        {rest.length > 0 && (
                            <button
                                type="button"
                                onClick={onViewAll}
                                style={{
                                    border: 'none', background: 'none', padding: 0,
                                    color: '#6366F1', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700
                                }}
                            >
                                안 읽은 공지 {rest.length}건 더 보기
                            </button>
                        )}
                    </div>
                </div>
            </motion.section>
        </AnimatePresence>
    );
};

export default AnnouncementSpotlight;
