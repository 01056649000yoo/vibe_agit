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

const MissionTypePicker = ({ isMobile, onSelectFreeform, onSelectGenre, onClose }) => (
    <div style={{
        marginBottom: '20px', padding: isMobile ? '16px' : '22px', borderRadius: '20px',
        background: '#F8FAFC', border: '1px solid #E2E8F0'
    }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
            <div>
                <h4 style={{ margin: 0, color: '#1E293B', fontSize: '1.05rem', fontWeight: '900' }}>어떤 글을 쓰게 할까요?</h4>
                <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: '0.82rem' }}>글 종류를 고르면 안내와 질문이 채워집니다. 전용 틀이 있는 종류는 그 화면으로 바로 넘어갑니다.</p>
            </div>
            <ModalCloseButton onClick={onClose} label="글 종류 선택 닫기" />
        </div>

        {getGenreCategories().map((category) => (
            <div key={category.label} style={{ marginBottom: '16px' }}>
                <div style={{ color: '#64748B', fontWeight: '800', fontSize: '0.78rem', marginBottom: '8px' }}>{category.label}</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                    {category.entries.map((entry) => (
                        <motion.button
                            key={entry.id}
                            whileHover={{ y: -2 }}
                            onClick={() => (entry.missionTypeId
                                ? onSelectGenre(entry.missionTypeId)
                                : onSelectFreeform(entry.id))}
                            style={{
                                padding: '16px', borderRadius: '16px',
                                border: entry.missionTypeId ? '1px solid #DDD6FE' : '1px solid #BFDBFE',
                                background: entry.missionTypeId ? 'white' : '#EFF6FF',
                                cursor: 'pointer', textAlign: 'left', display: 'flex', gap: '12px', alignItems: 'center'
                            }}
                        >
                            <span style={{ fontSize: '1.8rem' }}>{entryIcon(entry)}</span>
                            <span style={{ minWidth: 0 }}>
                                <strong style={{
                                    display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap',
                                    color: entry.missionTypeId ? '#5B21B6' : '#1D4ED8', fontSize: '0.95rem'
                                }}>
                                    {entry.id}
                                    {entry.missionTypeId && (
                                        <span style={{
                                            fontSize: '0.68rem', fontWeight: '900', color: '#6D28D9',
                                            background: '#F5F3FF', border: '1px solid #DDD6FE',
                                            borderRadius: '999px', padding: '2px 8px'
                                        }}>전용 틀</span>
                                    )}
                                </strong>
                                <span style={{ color: '#64748B', fontSize: '0.78rem', lineHeight: 1.45 }}>{describeEntry(entry)}</span>
                            </span>
                        </motion.button>
                    ))}
                </div>
            </div>
        ))}
    </div>
);

export default MissionTypePicker;
