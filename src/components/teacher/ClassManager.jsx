import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';
import StudentManager from './StudentManager';
import { motion, AnimatePresence } from 'framer-motion';
import { generateUnambiguousCode } from '../../lib/codeGenerator';

/**
 * 역할: 선생님 - 학급 생성, 초대 코드 관리 및 학생 명단 통합 관리
 * 최적화된 레이아웃과 초대 코드 크게 보기 기능을 제공합니다. ✨
 * 
 * [DB 보안 알림]
 * - classes 테이블은 ON DELETE CASCADE 설정이 되어 있어야 합니다.
 *   (학급 삭제 시 student, writing_missions 등 관련 데이터가 자동 삭제됨)
 */
const ClassManager = ({ userId, classes = [], activeClass, setActiveClass, setClasses, onClassDeleted, isMobile, primaryClassId, onSetPrimaryClass, fetchDeletedClasses, onRestoreClass, onNavigate }) => {
    const [className, setClassName] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);
    const [deletedClasses, setDeletedClasses] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

    const handleCopyInviteCode = async () => {
        if (!activeClass?.invite_code) return;
        try {
            await navigator.clipboard.writeText(activeClass.invite_code);
            alert('학급 접속 코드를 복사했습니다.');
        } catch {
            alert(`학급 접속 코드: ${activeClass.invite_code}`);
        }
    };

    const handleOpenTrash = async () => {
        if (fetchDeletedClasses) {
            const data = await fetchDeletedClasses();
            setDeletedClasses(data);
            setIsTrashModalOpen(true);
        }
    };

    const handleRestore = async (id) => {
        if (onRestoreClass) {
            await onRestoreClass(id);
            const data = await fetchDeletedClasses();
            setDeletedClasses(data);
        }
    };

    useEffect(() => {
        // 학급이 하나도 없을 경우 자동으로 생성 모달을 띄워 유도합니다. ✨
        if (classes.length === 0) {
            setIsModalOpen(true);
        }
    }, [classes.length]);

    const generateInviteCode = () => generateUnambiguousCode(6);

    const handleCreateClass = async () => {
        if (!className.trim()) {
            alert('학급 이름을 입력해주세요! 😊');
            return;
        }

        setIsSaving(true);
        console.log("📡 ClassManager: Creating class...", className);
        const inviteCode = generateInviteCode();

        try {
            const { data, error } = await supabase
                .from('classes')
                .insert({
                    name: className,
                    invite_code: inviteCode,
                    teacher_id: userId
                })
                .select()
                .single();

            if (error) throw error;

            console.log("✅ ClassManager: Class created successfully!");
            // 로컬 상태 즉시 반영
            if (setClasses) setClasses(prev => [data, ...prev]);
            if (setActiveClass) setActiveClass(data);

            setIsModalOpen(false);
            setClassName('');
        } catch (error) {
            console.error('❌ ClassManager: 학급 생성 실패:', error.message);
            alert('학급 생성 중 오류가 생겼어요: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteClass = async (targetId, targetName) => {
        if (!targetId) return;

        // 1. 사용자 확인 (window.confirm)
        if (!window.confirm(`정말 [${targetName}] 학급을 삭제하시겠습니까?\n\n삭제된 학급은 3일 이내에 다시 되돌릴 수 있습니다.\n3일이 지나면 모든 데이터가 영구적으로 삭제됩니다.`)) {
            return;
        }

        setIsSaving(true);
        try {
            // 2. DB 업데이트 (삭제가 아닌 soft delete)
            const { error } = await supabase
                .from('classes')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', targetId);

            if (error) {
                alert(`삭제 권한이 없거나 오류가 발생했습니다: ${error.message}`);
                return;
            }

            // 3. 상태 업데이트 순서 조정 (성공 시 즉시 반영)
            if (setClasses) {
                setClasses(prev => prev.filter(c => c.id !== targetId));
            }
            if (activeClass && activeClass.id === targetId && setActiveClass) {
                setActiveClass(null);
            }

            alert(`[${targetName}] 학급이 삭제 대기 상태로 이동되었습니다. 📦\n3일 이내에 복구할 수 있으며, 이후에는 영구 삭제됩니다.`);

            if (onClassDeleted) await onClassDeleted();
        } catch (error) {
            console.error('❌ ClassManager: 삭제 처리 실패:', error);
            alert('삭제 중 예상치 못한 오류가 발생했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={{ width: '100%' }}>
            {!activeClass ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <Card style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '32px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🏢</div>
                        <h2 style={{ fontSize: '1.5rem', color: '#2C3E50', fontWeight: '900', marginBottom: '8px' }}>선택된 학급이 없습니다.</h2>
                        <p style={{ color: '#7F8C8D', marginBottom: '24px', fontSize: '1rem' }}>아래 목록에서 선택하거나 새로운 학급을 만들어보세요!</p>
                        <Button
                            variant="primary"
                            style={{ width: '100%', height: '60px', fontSize: '1.1rem', borderRadius: '16px', fontWeight: 'bold' }}
                            onClick={() => setIsModalOpen(true)}
                        >
                            ➕ 새 학급 만들기
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={handleOpenTrash}
                            style={{
                                width: '100%', marginTop: '12px', fontSize: '0.9rem', color: '#7F8C8D',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                            }}
                        >
                            🗑️ 삭제된 학급 복구하기
                        </Button>
                    </Card>

                    {classes.length > 0 && (
                        <div style={{ background: 'white', borderRadius: '24px', padding: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.03)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#2C3E50', fontWeight: '900' }}>나의 학급 목록</h3>
                                <button
                                    onClick={handleOpenTrash}
                                    style={{
                                        background: '#F8F9FA', border: '1px solid #E9ECEF', borderRadius: '10px',
                                        padding: '6px 12px', fontSize: '0.8rem', color: '#7F8C8D', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold'
                                    }}
                                >
                                    🗑️ 복구함
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {classes.map((cls) => (
                                    <div
                                        key={cls.id}
                                        onClick={() => setActiveClass(cls)}
                                        style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '16px 20px', borderRadius: '16px', background: '#F8F9FA',
                                            cursor: 'pointer', border: '1px solid #F1F3F5', transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#F1F8FF'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = '#F8F9FA'}
                                    >
                                        <span style={{ fontWeight: 'bold', color: '#2C3E50' }}>🏫 {cls.name}</span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteClass(cls.id, cls.name);
                                            }}
                                            style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                fontSize: '1.2rem', padding: '4px', borderRadius: '8px',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#FDEDEC'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', minWidth: 0 }}>
                            {classes.map((cls) => {
                                const selected = cls.id === activeClass.id;
                                const primary = cls.id === primaryClassId;
                                return (
                                    <button key={cls.id} type="button" onClick={() => setActiveClass(cls)} style={{
                                        padding: '9px 12px', borderRadius: '12px', cursor: 'pointer', fontWeight: '900', fontSize: '0.82rem',
                                        border: selected ? '1px solid #93C5FD' : '1px solid #E2E8F0',
                                        background: selected ? '#EFF6FF' : 'white', color: selected ? '#1D4ED8' : '#475569',
                                        boxShadow: selected ? '0 3px 10px rgba(37,99,235,.10)' : 'none'
                                    }}>
                                        {primary ? '⭐ ' : ''}{cls.name}{selected ? ' · 현재' : ''}
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', gap: '7px' }}>
                            <button type="button" onClick={handleOpenTrash} style={smallActionStyle}>복구함</button>
                            <button type="button" onClick={() => setIsModalOpen(true)} style={{ ...smallActionStyle, background: '#2563EB', color: 'white', borderColor: '#2563EB' }}>+ 학급 추가</button>
                        </div>
                    </div>

                    <section style={{ padding: isMobile ? '16px' : '18px 20px', background: 'white', border: '1px solid #DCE6EE', borderRadius: '18px', boxShadow: '0 5px 18px rgba(15,23,42,.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '190px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                                    <h3 style={{ margin: 0, color: '#1E293B', fontSize: '1.2rem' }}>🏫 {activeClass.name}</h3>
                                    {activeClass.id === primaryClassId && <span style={badgeStyle}>⭐ 주 학급</span>}
                                    <span style={{ ...badgeStyle, background: '#DCFCE7', color: '#15803D' }}>● 운영 중</span>
                                </div>
                                <div style={{ marginTop: '9px', display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', color: '#64748B', fontSize: '0.8rem' }}>
                                    <span>학생 접속 코드</span>
                                    <code style={{ padding: '4px 8px', borderRadius: '8px', background: '#F1F5F9', color: '#334155', fontWeight: '900', letterSpacing: '0.08em' }}>{activeClass.invite_code || '확인 필요'}</code>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', position: 'relative' }}>
                                <button type="button" onClick={handleCopyInviteCode} style={smallActionStyle}>코드 복사</button>
                                {onNavigate && <button type="button" onClick={() => onNavigate({ tab: 'students', section: 'students' })} style={smallActionStyle}>학생 관리</button>}
                                {activeClass.id !== primaryClassId && <button type="button" onClick={() => onSetPrimaryClass?.(activeClass.id)} style={smallActionStyle}>주 학급 설정</button>}
                                <button type="button" onClick={() => setIsActionMenuOpen((current) => !current)} aria-label="학급 추가 관리" style={{ ...smallActionStyle, width: '36px', padding: 0 }}>⋮</button>
                                {isActionMenuOpen && (
                                    <div style={{ position: 'absolute', zIndex: 5, top: '42px', right: 0, width: '170px', padding: '6px', borderRadius: '12px', border: '1px solid #E2E8F0', background: 'white', boxShadow: '0 12px 30px rgba(15,23,42,.16)' }}>
                                        <button type="button" disabled={isSaving} onClick={() => { setIsActionMenuOpen(false); handleDeleteClass(activeClass.id, activeClass.name); }} style={{ width: '100%', padding: '10px', border: 'none', borderRadius: '8px', background: 'transparent', color: '#DC2626', textAlign: 'left', fontWeight: '800', cursor: 'pointer' }}>🗑️ 학급 삭제</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    <section style={{ padding: isMobile ? '14px' : '15px 18px', border: '1px solid #E2E8F0', borderRadius: '16px', background: '#F8FAFC', display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: '12px', flexDirection: isMobile ? 'column' : 'row' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                <strong style={{ color: '#334155', fontSize: '0.88rem' }}>🔗 학급 간 글 공유</strong>
                                <span style={{ ...badgeStyle, background: '#E2E8F0', color: '#64748B' }}>비공개</span>
                            </div>
                            <p style={{ margin: '5px 0 0', color: '#64748B', fontSize: '0.74rem' }}>연결을 승인한 학급끼리 선택한 글을 공유하는 기능이 이곳에 추가됩니다.</p>
                        </div>
                        <span style={{ padding: '6px 9px', borderRadius: '9px', background: 'white', border: '1px solid #E2E8F0', color: '#94A3B8', fontSize: '0.7rem', fontWeight: '900', whiteSpace: 'nowrap' }}>업데이트 예정</span>
                    </section>
                </div>
            )}

            {/* 학급 생성 모달 */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(44, 62, 80, 0.6)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 2500, backdropFilter: 'blur(5px)'
                }}>
                    <Card style={{ width: '90%', maxWidth: '420px', padding: '40px', borderRadius: '32px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
                        <h2 style={{ fontSize: '1.8rem', marginBottom: '8px', color: '#2C3E50', fontWeight: '900' }}>새로운 학급 만들기</h2>
                        <p style={{ color: '#7F8C8D', marginBottom: '24px', fontSize: '0.95rem' }}>아이들과 함께할 멋진 학급 이름을 지어주세요!</p>
                        <input
                            type="text"
                            placeholder="예: 3학년 1반, 무지개반"
                            value={className}
                            onChange={(e) => setClassName(e.target.value)}
                            autoFocus
                            style={{
                                width: '100%', padding: '18px', borderRadius: '16px', border: '2px solid #ECEFF1',
                                fontSize: '1.2rem', marginBottom: '32px', outline: 'none', transition: 'border-color 0.2s',
                                boxSizing: 'border-box'
                            }}
                        />
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <Button variant="ghost" style={{ flex: 1, height: '56px', borderRadius: '16px' }} onClick={() => setIsModalOpen(false)}>취소</Button>
                            <Button variant="primary" style={{ flex: 2, height: '56px', borderRadius: '16px', fontWeight: 'bold' }} onClick={handleCreateClass} disabled={isSaving}>
                                {isSaving ? '생성 중...' : '학급 생성하기 🎉'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* 삭제된 학급 복구 모달 */}
            <AnimatePresence>
                {isTrashModalOpen && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(44, 62, 80, 0.7)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        zIndex: 3500, backdropFilter: 'blur(8px)'
                    }}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            style={{ width: '90%', maxWidth: '500px' }}
                        >
                            <Card style={{ padding: '32px', borderRadius: '32px', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                    <h2 style={{ fontSize: '1.5rem', margin: 0, color: '#2C3E50', fontWeight: '900' }}>🗑️ 삭제된 학급 복구</h2>
                                    <button onClick={() => setIsTrashModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#ADB5BD' }}>✕</button>
                                </div>

                                <div style={{ background: '#FFFCEB', padding: '16px', borderRadius: '16px', border: '1px solid #FFE082', marginBottom: '24px' }}>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#B26700', lineHeight: '1.5', fontWeight: 'bold' }}>
                                        💡 삭제된 학급은 <span style={{ textDecoration: 'underline' }}>삭제 후 3일간</span> 이곳에서 복구하실 수 있습니다.
                                        3일이 경과하면 모든 데이터가 자동으로 영구 삭제됩니다.
                                    </p>
                                </div>

                                <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
                                    {deletedClasses.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px', color: '#ADB5BD' }}>
                                            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🍃</div>
                                            복구할 수 있는 학급이 없습니다.
                                        </div>
                                    ) : (
                                        deletedClasses.map(cls => (
                                            <div key={cls.id} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '16px', borderRadius: '16px', background: '#F8F9FA',
                                                border: '1px solid #F1F3F5'
                                            }}>
                                                <div>
                                                    <span style={{ fontWeight: 'bold', color: '#2C3E50', display: 'block' }}>🏫 {cls.name}</span>
                                                    <span style={{ fontSize: '0.75rem', color: '#95A5A6' }}>
                                                        삭제일: {new Date(cls.deleted_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    style={{ background: '#E3F2FD', color: '#1976D2', border: '1px solid #BBDEFB' }}
                                                    onClick={() => handleRestore(cls.id)}
                                                >
                                                    되돌리기
                                                </Button>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <Button
                                    variant="ghost"
                                    style={{ width: '100%', height: '54px', marginTop: '24px', borderRadius: '16px', fontWeight: 'bold' }}
                                    onClick={() => setIsTrashModalOpen(false)}
                                >
                                    닫기
                                </Button>
                            </Card>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

const smallActionStyle = {
    minHeight: '36px', padding: '7px 10px', borderRadius: '10px', border: '1px solid #CBD5E1',
    background: 'white', color: '#475569', fontSize: '0.75rem', fontWeight: '900', cursor: 'pointer'
};

const badgeStyle = {
    display: 'inline-flex', alignItems: 'center', padding: '4px 7px', borderRadius: '999px',
    background: '#FEF3C7', color: '#92400E', fontSize: '0.66rem', fontWeight: '900'
};

export default ClassManager;
