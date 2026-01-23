import React from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { motion, AnimatePresence } from 'framer-motion';

const MissionForm = ({
    isFormOpen, isEditing, formData, setFormData,
    genreCategories, handleSubmit, handleCancelEdit, isMobile
}) => {
    return (
        <AnimatePresence>
            {isFormOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginBottom: '24px' }}>
                    <Card style={{
                        padding: isMobile ? '16px' : '24px',
                        border: '2px solid #3498DB',
                        width: '100%',
                        maxWidth: 'none',
                        margin: '0 0 24px 0',
                        boxSizing: 'border-box',
                        overflow: 'hidden'
                    }}>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px' }}>
                                <input
                                    type="text"
                                    placeholder="글쓰기 주제"
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    style={{
                                        flex: 2,
                                        padding: '14px',
                                        borderRadius: '12px',
                                        border: '1px solid #ddd',
                                        fontSize: '1rem',
                                        minHeight: '48px',
                                        width: '100%',
                                        boxSizing: 'border-box'
                                    }}
                                />
                                <select value={formData.genre} onChange={e => setFormData({ ...formData, genre: e.target.value })} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #ddd', minHeight: '48px', width: '100%', boxSizing: 'border-box' }}>
                                    {genreCategories.map(cat => (
                                        <optgroup key={cat.label} label={cat.label}>
                                            {cat.genres.map(g => <option key={g} value={g}>{g}</option>)}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>
                            <textarea placeholder="안내 가이드" value={formData.guide} onChange={e => setFormData({ ...formData, guide: e.target.value })} style={{ padding: '14px', borderRadius: '12px', border: '1px solid #ddd', minHeight: '120px', fontSize: '1rem', width: '100%', boxSizing: 'border-box' }} />

                            <div style={{
                                display: 'flex',
                                flexDirection: isMobile ? 'column' : 'row',
                                gap: isMobile ? '12px' : '16px',
                                alignItems: 'stretch',
                                width: '100%',
                                boxSizing: 'border-box'
                            }}>
                                {/* (1) 분량 제한 섹션 */}
                                <div style={{
                                    flex: 1,
                                    minWidth: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px',
                                    background: '#F0F7FF',
                                    padding: '16px',
                                    borderRadius: '16px',
                                    border: '1px solid #D6EAF8',
                                    boxSizing: 'border-box'
                                }}>
                                    <label style={{ fontSize: '0.8rem', color: '#2E86C1', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        📏 분량 제한 설정
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ fontSize: '0.7rem', color: '#5499C7', display: 'block', marginBottom: '4px' }}>최소 글자</span>
                                            <input type="number" step="100" placeholder="글자" value={formData.min_chars} onChange={e => setFormData({ ...formData, min_chars: parseInt(e.target.value) || 0 })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #AED6F1', fontSize: '0.9rem', textAlign: 'center', boxSizing: 'border-box' }} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ fontSize: '0.7rem', color: '#5499C7', display: 'block', marginBottom: '4px' }}>최소 문단</span>
                                            <input type="number" placeholder="문단" value={formData.min_paragraphs} onChange={e => setFormData({ ...formData, min_paragraphs: parseInt(e.target.value) || 0 })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #AED6F1', fontSize: '0.9rem', textAlign: 'center', boxSizing: 'border-box' }} />
                                        </div>
                                    </div>
                                </div>

                                {/* (2) 포인트 보상 섹션 */}
                                <div style={{
                                    flex: 1,
                                    minWidth: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px',
                                    background: '#FFFDF0',
                                    padding: '16px',
                                    borderRadius: '16px',
                                    border: '1px solid #FCF3CF',
                                    boxSizing: 'border-box'
                                }}>
                                    <label style={{ fontSize: '0.8rem', color: '#D4AC0D', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        💰 포인트 보상 설정
                                    </label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.5)', padding: '6px 10px', borderRadius: '10px' }}>
                                            <span style={{ fontSize: '0.75rem', color: '#B7950B', fontWeight: 'bold', whiteSpace: 'nowrap' }}>기본 보상:</span>
                                            <input type="number" step="100" value={formData.base_reward} onChange={e => setFormData({ ...formData, base_reward: parseInt(e.target.value) || 0 })} style={{ width: '80px', padding: '6px', borderRadius: '6px', border: '1px solid #F9E79F', fontSize: '0.85rem', textAlign: 'center' }} />
                                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#B7950B' }}>P</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', flexWrap: 'nowrap' }}>
                                            <span style={{ color: '#D35400', fontWeight: 'bold', whiteSpace: 'nowrap' }}>⚡ 보너스:</span>
                                            <input type="number" step="100" placeholder="글자수" value={formData.bonus_threshold} onChange={e => setFormData({ ...formData, bonus_threshold: parseInt(e.target.value) || 0 })} style={{ width: '60px', padding: '6px', borderRadius: '6px', border: '1px solid #F9E79F', fontSize: '0.8rem' }} />
                                            <span style={{ whiteSpace: 'nowrap' }}>자 ↑ 면</span>
                                            <span style={{ fontWeight: 'bold' }}>+</span>
                                            <input type="number" step="10" placeholder="점수" value={formData.bonus_reward} onChange={e => setFormData({ ...formData, bonus_reward: parseInt(e.target.value) || 0 })} style={{ width: '50px', padding: '6px', borderRadius: '6px', border: '1px solid #F9E79F', fontSize: '0.8rem' }} />
                                            <span style={{ fontWeight: 'bold', color: '#D35400' }}>P</span>
                                        </div>
                                        <div style={{
                                            marginTop: '4px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            background: formData.allow_comments ? 'rgba(52, 152, 219, 0.1)' : 'rgba(189, 195, 199, 0.2)',
                                            padding: '8px 12px',
                                            borderRadius: '10px',
                                            cursor: 'pointer',
                                            border: formData.allow_comments ? '1px solid #3498DB' : '1px solid #BDC3C7',
                                            transition: 'all 0.2s'
                                        }} onClick={() => setFormData({ ...formData, allow_comments: !formData.allow_comments })}>
                                            <input
                                                type="checkbox"
                                                checked={formData.allow_comments}
                                                readOnly
                                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                            />
                                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: formData.allow_comments ? '#2980B9' : '#7F8C8D' }}>
                                                {formData.allow_comments ? '💬 댓글 허용됨' : '🔒 댓글 잠금'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                {isEditing && (
                                    <Button
                                        type="button"
                                        onClick={handleCancelEdit}
                                        style={{ flex: 1, backgroundColor: '#95A5A6', color: 'white', fontWeight: 'bold', height: '54px', borderRadius: '14px' }}
                                    >
                                        취소하기
                                    </Button>
                                )}
                                <Button type="submit" style={{ flex: 2, backgroundColor: isEditing ? '#F39C12' : '#3498DB', color: 'white', fontWeight: 'bold', height: '54px', borderRadius: '14px' }}>
                                    {isEditing ? '수정 완료 ✏️' : '글쓰기 미션 공개하기 🚀'}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default MissionForm;
