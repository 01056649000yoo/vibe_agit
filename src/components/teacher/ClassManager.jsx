import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';
import StudentManager from './StudentManager';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 학급 생성, 초대 코드 관리 및 학생 명단 통합 관리
 * 최적화된 레이아웃과 초대 코드 크게 보기 기능을 제공합니다. ✨
 * 
 * [DB 보안 알림]
 * - classes 테이블은 ON DELETE CASCADE 설정이 되어 있어야 합니다.
 *   (학급 삭제 시 student, writing_missions 등 관련 데이터가 자동 삭제됨)
 */
const ClassManager = ({ userId, classes = [], activeClass, setActiveClass, setClasses, onClassDeleted, isMobile, primaryClassId, onSetPrimaryClass, fetchDeletedClasses, onRestoreClass }) => {
    const [className, setClassName] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
    const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);
    const [deletedClasses, setDeletedClasses] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

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

    const generateInviteCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    };

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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* 학급 정보 및 초대 코드 섹션 (슬림 2열 레이아웃) */}
                    <div style={{
                        padding: isMobile ? '16px' : '14px 32px', // [수정] 세로 높이 축소를 위해 패딩 조정
                        background: 'linear-gradient(135deg, #FFF9C4 0%, #FFF59D 100%)',
                        borderRadius: '24px',
                        border: '1px solid #FFE082',
                        display: 'flex',
                        flexDirection: isMobile ? 'column' : 'row',
                        justifyContent: 'space-between', // [수정] 좌우 균형 배치로 변경
                        alignItems: 'center',
                        gap: '16px',
                        boxShadow: '0 4px 15px rgba(255, 236, 179, 0.3)',
                        width: '100%',
                        boxSizing: 'border-box',
                        overflow: 'hidden'
                    }}>
                        {/* 좌측: 학급 이름 및 뱃지 그룹 */}
                        <div style={{
                            display: 'flex',
                            flexDirection: isMobile ? 'column' : 'row',
                            alignItems: 'center',
                            gap: '16px',
                            textAlign: isMobile ? 'center' : 'left'
                        }}>
                            <div>
                                <span style={{
                                    fontSize: '0.75rem',
                                    color: '#B26700',
                                    background: '#FFF176',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    fontWeight: '900',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    display: 'inline-block',
                                    marginBottom: '6px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                }}>
                                    CURRENT CLASS
                                </span>
                                <h3 style={{
                                    margin: 0,
                                    fontSize: isMobile ? '1.8rem' : '2.4rem',
                                    color: '#2C3E50',
                                    fontWeight: '950',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    lineHeight: 1,
                                    textShadow: '1px 1px 0px rgba(255,255,255,0.8)'
                                }}>
                                    <span style={{ fontSize: '1.2em' }}>🏫</span> {activeClass?.name}
                                </h3>
                            </div>

                            {activeClass?.id === primaryClassId ? (
                                <div style={{ background: '#FFD700', color: '#8B4513', padding: '6px 12px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 8px rgba(255, 215, 0, 0.2)' }}>
                                    ⭐ 주 학급
                                </div>
                            ) : (
                                <button
                                    onClick={() => onSetPrimaryClass && onSetPrimaryClass(activeClass.id)}
                                    style={{
                                        background: 'white', border: '1px solid #FFD700', color: '#DAA520',
                                        padding: '6px 14px', borderRadius: '10px', fontSize: '0.75rem',
                                        fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s',
                                        display: 'flex', alignItems: 'center', gap: '4px'
                                    }}
                                >
                                    ⭐ 주 학급 설정
                                </button>
                            )}
                        </div>

                        {/* 우측: 초대 코드 컴팩트 카드 */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            background: 'white',
                            padding: '10px 20px',
                            borderRadius: '16px',
                            border: '1px solid rgba(255, 224, 130, 0.5)',
                            boxShadow: '0 4px 10px rgba(0,0,0,0.03)',
                            minWidth: isMobile ? '100%' : 'auto',
                            boxSizing: 'border-box'
                        }}>
                            <div style={{ textAlign: 'right' }}>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#95A5A6', fontWeight: 'bold' }}>초대 코드</p>
                                <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900', color: '#3498DB', letterSpacing: '2px', fontFamily: 'monospace', lineHeight: 1 }}>
                                    {activeClass?.invite_code}
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsZoomModalOpen(true)}
                                style={{
                                    background: '#F0F7FF',
                                    color: '#3498DB',
                                    border: 'none',
                                    padding: '8px 16px',
                                    fontWeight: '900',
                                    borderRadius: '10px',
                                    fontSize: '0.8rem'
                                }}
                            >
                                🔍 크게 보기
                            </Button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <Button
                            variant="ghost"
                            style={{ flex: 2, background: 'white', border: '1px solid #ECEFF1', color: '#2C3E50', height: '54px', fontWeight: 'bold' }}
                            onClick={() => setIsModalOpen(true)}
                        >
                            ➕ 다른 학급 추가
                        </Button>
                        <Button
                            variant="ghost"
                            style={{ flex: 1, background: '#FDEDEC', border: '1px solid #FADBD8', color: '#E74C3C', height: '54px', fontWeight: 'bold' }}
                            onClick={() => activeClass && handleDeleteClass(activeClass.id, activeClass.name)}
                            disabled={!activeClass || isSaving}
                        >
                            {isSaving ? '삭제 중...' : '🗑️ 학급 삭제'}
                        </Button>
                    </div>
                </div>
            )}

            {/* 초대 코드 크게 보기 모달 */}
            <AnimatePresence>
                {isZoomModalOpen && activeClass && (
                    <div style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(255,255,255,0.98)',
                        zIndex: 3000,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        backdropFilter: 'blur(10px)'
                    }}>
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            style={{ textAlign: 'center', maxWidth: '90%' }}
                        >
                            <span style={{ fontSize: '1.2rem', color: '#7F8C8D', fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>{activeClass.name}</span>
                            <h1 style={{ fontSize: '3rem', color: '#2C3E50', marginBottom: '40px', fontWeight: '900' }}>학급 초대 코드 🏫</h1>
                            <div style={{
                                fontSize: 'min(15vw, 10rem)',
                                fontWeight: '900',
                                color: '#3498DB',
                                letterSpacing: '10px',
                                background: 'white',
                                padding: '40px 60px',
                                borderRadius: '40px',
                                boxShadow: '0 30px 60px rgba(52, 152, 219, 0.15)',
                                border: '6px solid #3498DB',
                                fontFamily: 'monospace'
                            }}>
                                {activeClass.invite_code}
                            </div>
                            <Button
                                variant="primary"
                                onClick={() => setIsZoomModalOpen(false)}
                                style={{ marginTop: '60px', padding: '20px 60px', fontSize: '1.5rem', borderRadius: '24px', fontWeight: '900' }}
                            >
                                닫기
                            </Button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

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

            {/* 삭제된 학급 복구 모달 (Trash Modal) */}
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

export default ClassManager;
