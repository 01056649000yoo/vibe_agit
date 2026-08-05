import React from 'react';
import { motion } from 'framer-motion';
import { getGenreMissionTypes } from '../../modules/writing/mission-types/registry';
import ModalCloseButton from '../common/ModalCloseButton';

const MissionTypePicker = ({ isMobile, onSelectFreeform, onSelectGenre, onClose }) => (
    <div style={{
        marginBottom: '20px', padding: isMobile ? '16px' : '22px', borderRadius: '20px',
        background: '#F8FAFC', border: '1px solid #E2E8F0'
    }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
            <div>
                <h4 style={{ margin: 0, color: '#1E293B', fontSize: '1.05rem', fontWeight: '900' }}>어떤 미션을 만들까요?</h4>
                <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: '0.82rem' }}>자유 입력을 기본으로 사용하고, 필요할 때만 장르별 틀을 선택합니다.</p>
            </div>
            <ModalCloseButton onClick={onClose} label="미션 종류 선택 닫기" style={{ border: 0, background: 'transparent', color: '#94A3B8' }} />
        </div>

        <div style={{ marginBottom: '16px' }}>
            <div style={{ color: '#64748B', fontWeight: '800', fontSize: '0.78rem', marginBottom: '8px' }}>✍️ 자유 글쓰기</div>
            <motion.button
                whileHover={{ y: -2 }}
                onClick={onSelectFreeform}
                style={{
                    width: '100%', padding: '16px', borderRadius: '16px', border: '2px solid #BFDBFE',
                    background: '#EFF6FF', cursor: 'pointer', textAlign: 'left', display: 'flex', gap: '12px', alignItems: 'center'
                }}
            >
                <span style={{ fontSize: '1.8rem' }}>📝</span>
                <span>
                    <strong style={{ display: 'block', color: '#1D4ED8', fontSize: '0.95rem' }}>자유 글쓰기 미션</strong>
                    <span style={{ color: '#64748B', fontSize: '0.8rem' }}>하위 글 종류를 선택하고 기존 제목·본문 입력창을 사용합니다.</span>
                </span>
            </motion.button>
        </div>

        <div style={{ color: '#64748B', fontWeight: '800', fontSize: '0.78rem', marginBottom: '8px' }}>🧩 장르 글쓰기</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
            {getGenreMissionTypes().map((type) => (
                <motion.button
                    key={type.id}
                    whileHover={{ y: -2 }}
                    onClick={() => onSelectGenre(type.id)}
                    style={{
                        padding: '16px', borderRadius: '16px', border: '1px solid #DDD6FE',
                        background: 'white', cursor: 'pointer', textAlign: 'left', display: 'flex', gap: '12px', alignItems: 'center'
                    }}
                >
                    <span style={{ fontSize: '1.8rem' }}>{type.icon}</span>
                    <span>
                        <strong style={{ display: 'block', color: '#5B21B6', fontSize: '0.95rem' }}>{type.name}</strong>
                        <span style={{ color: '#64748B', fontSize: '0.78rem', lineHeight: 1.45 }}>{type.description}</span>
                    </span>
                </motion.button>
            ))}
        </div>
    </div>
);

export default MissionTypePicker;
