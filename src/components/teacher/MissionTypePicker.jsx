import React from 'react';
import { motion } from 'framer-motion';
import { getGenreMissionType } from '../../modules/writing/mission-types/registry';
import { getGenreCategories } from '../../modules/writing/mission-types/genreCatalog';
import ModalCloseButton from '../common/ModalCloseButton';

// 교사는 "무슨 글을 쓰게 할까"만 고른다. 전용 틀로 갈지 자유 글쓰기로 갈지는 카탈로그가 정한다.
const describeEntry = (entry) => {
    if (entry.missionTypeId) {
        return entry.summary || getGenreMissionType(entry.missionTypeId)?.description || '';
    }
    if (entry.preset) return '안내와 질문이 채워진 채로 열립니다.';
    return entry.summary || '';
};

const entryIcon = (entry) => (
    entry.missionTypeId ? (getGenreMissionType(entry.missionTypeId)?.icon || '🧩') : '📝'
);

const MissionTypePicker = ({ isMobile, onSelectFreeform, onSelectGenre, onClose }) => {
    const choices = getGenreCategories().flatMap((category) => (
        category.entries.map((entry) => ({ ...entry, categoryLabel: category.label }))
    ));

    return (
        <div style={{
            marginBottom: '14px', padding: isMobile ? '12px' : '16px', borderRadius: '18px',
            background: '#F8FAFC', border: '1px solid #E2E8F0'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                    <h4 style={{ margin: 0, color: '#1E293B', fontSize: '1.05rem', fontWeight: '900' }}>어떤 글을 쓰게 할까요?</h4>
                    <p style={{ margin: '3px 0 0', color: '#64748B', fontSize: '0.78rem' }}>글 종류를 고르면 알맞은 안내·질문 또는 전용 틀로 바로 이어집니다.</p>
                </div>
                <ModalCloseButton onClick={onClose} label="글 종류 선택 닫기" />
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: isMobile ? '7px' : '8px'
            }}>
                {choices.map((entry) => {
                    const description = describeEntry(entry);
                    return (
                        <motion.button
                            key={entry.id}
                            whileHover={{ y: -2 }}
                            title={description}
                            onClick={() => (entry.missionTypeId
                                ? onSelectGenre(entry.missionTypeId)
                                : onSelectFreeform(entry.id))}
                            style={{
                                minWidth: 0, minHeight: isMobile ? '72px' : '76px', padding: isMobile ? '9px' : '10px 11px',
                                borderRadius: '13px',
                                border: entry.missionTypeId ? '1px solid #DDD6FE' : '1px solid #BFDBFE',
                                background: entry.missionTypeId ? 'white' : '#EFF6FF',
                                cursor: 'pointer', textAlign: 'left', display: 'flex', gap: '8px', alignItems: 'flex-start'
                            }}
                        >
                            <span aria-hidden="true" style={{ flex: '0 0 auto', marginTop: '14px', fontSize: isMobile ? '1.2rem' : '1.35rem' }}>{entryIcon(entry)}</span>
                            <span style={{ minWidth: 0, flex: 1 }}>
                                <span style={{
                                    display: 'block', color: '#64748B', fontSize: '0.64rem', fontWeight: '800',
                                    lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                }}>{entry.categoryLabel}</span>
                                <strong style={{
                                    display: 'flex', gap: '5px', alignItems: 'center', minWidth: 0,
                                    color: entry.missionTypeId ? '#5B21B6' : '#1D4ED8', fontSize: isMobile ? '0.82rem' : '0.9rem',
                                    lineHeight: 1.3
                                }}>
                                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{entry.id}</span>
                                    {entry.missionTypeId && (
                                        <span style={{
                                            flex: '0 0 auto', fontSize: '0.6rem', fontWeight: '900', color: '#6D28D9',
                                            background: '#F5F3FF', border: '1px solid #DDD6FE',
                                            borderRadius: '999px', padding: '1px 5px'
                                        }}>전용</span>
                                    )}
                                </strong>
                                <span style={{
                                    display: 'block', marginTop: '2px', color: '#64748B', fontSize: '0.68rem', lineHeight: 1.3,
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                }}>{description}</span>
                            </span>
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
};

export default MissionTypePicker;
