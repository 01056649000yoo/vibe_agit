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

/**
 * 글 종류 고르기.
 *
 * 기본은 **그 자리에 펼쳐지는 판**이다(과제 만들기 화면이 이렇게 쓴다).
 * `embedded` 를 주면 자기 머리말·테두리를 그리지 않는다 — 창 안에 넣을 때 제목과 닫기 단추가
 * 두 번 나오는 것을 막는다(이웃 아지트의 `함께 쓰는 주제`가 이렇게 쓴다).
 */
const MissionTypePicker = ({ isMobile, onSelectFreeform, onSelectGenre, onClose, embedded = false }) => {
    const choices = getGenreCategories().flatMap((category) => (
        category.entries.map((entry) => ({ ...entry, categoryLabel: category.label }))
    ));
    const templateChoices = choices.filter((entry) => entry.missionTypeId);
    const basicChoices = choices.filter((entry) => !entry.missionTypeId);

    const renderChoices = (entries) => (
        <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
            gap: isMobile ? '7px' : '9px'
        }}>
            {entries.map((entry) => {
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
                            minWidth: 0, minHeight: isMobile ? '66px' : '72px', padding: isMobile ? '9px' : '10px 12px',
                            borderRadius: '13px',
                            border: entry.missionTypeId ? '1px solid #DDD6FE' : '1px solid #BFDBFE',
                            background: entry.missionTypeId ? 'white' : '#EFF6FF',
                            cursor: 'pointer', textAlign: 'left', display: 'flex', gap: '9px', alignItems: 'center'
                        }}
                    >
                        <span aria-hidden="true" style={{ flex: '0 0 auto', fontSize: isMobile ? '1.2rem' : '1.35rem' }}>{entryIcon(entry)}</span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                            <strong style={{
                                display: 'block', color: entry.missionTypeId ? '#5B21B6' : '#1D4ED8',
                                fontSize: isMobile ? '0.84rem' : '0.94rem', lineHeight: 1.3,
                                overflowWrap: 'anywhere'
                            }}>{entry.id}</strong>
                            <span style={{
                                display: 'block', marginTop: '3px', color: '#64748B', fontSize: '0.67rem', lineHeight: 1.3,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                            }}>{entry.missionTypeId ? description : entry.categoryLabel}</span>
                        </span>
                    </motion.button>
                );
            })}
        </div>
    );

    return (
        <div style={embedded ? { display: 'grid', gap: '12px' } : {
            marginBottom: '14px', padding: isMobile ? '12px' : '16px', borderRadius: '18px',
            background: '#F8FAFC', border: '1px solid #E2E8F0'
        }}>
            {embedded ? (
                <p style={{ margin: 0, color: '#64748B', fontSize: '0.82rem' }}>글 종류를 고르면 알맞은 안내·질문 또는 전용 틀로 바로 이어집니다.</p>
            ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                        <h4 style={{ margin: 0, color: '#1E293B', fontSize: '1.05rem', fontWeight: '900' }}>어떤 글을 쓰게 할까요?</h4>
                        <p style={{ margin: '3px 0 0', color: '#64748B', fontSize: '0.78rem' }}>글 종류를 고르면 알맞은 안내·질문 또는 전용 틀로 바로 이어집니다.</p>
                    </div>
                    <ModalCloseButton onClick={onClose} label="글 종류 선택 닫기" />
                </div>
            )}

            <div style={{ display: 'grid', gap: isMobile ? '12px' : '14px' }}>
                <section aria-labelledby="template-writing-types-heading">
                    <div style={{
                        display: 'flex', alignItems: 'baseline', gap: '7px', marginBottom: '7px',
                        padding: isMobile ? '0 2px' : '0 3px'
                    }}>
                        <h5 id="template-writing-types-heading" style={{ margin: 0, color: '#5B21B6', fontSize: '0.84rem', fontWeight: '900' }}>
                            양식이 준비된 글
                        </h5>
                        <span style={{ color: '#64748B', fontSize: '0.68rem' }}>글에 맞는 전용 화면으로 시작해요.</span>
                    </div>
                    {renderChoices(templateChoices)}
                </section>

                <section aria-labelledby="basic-writing-types-heading">
                    <div style={{
                        display: 'flex', alignItems: 'baseline', gap: '7px', marginBottom: '7px',
                        padding: isMobile ? '0 2px' : '0 3px'
                    }}>
                        <h5 id="basic-writing-types-heading" style={{ margin: 0, color: '#1D4ED8', fontSize: '0.84rem', fontWeight: '900' }}>
                            기본 글쓰기
                        </h5>
                        <span style={{ color: '#64748B', fontSize: '0.68rem' }}>안내와 질문을 채워 시작해요.</span>
                    </div>
                    {renderChoices(basicChoices)}
                </section>
            </div>
        </div>
    );
};

export default MissionTypePicker;
