import React, { useState, useEffect } from 'react';
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
const ClassManager = ({ userId, classes = [], activeClass, setActiveClass, setClasses, onClassDeleted, isMobile }) => {
    const [className, setClassName] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isZoomModalOpen, setIsZoomModalOpen] = useState(false); // 초대 코드 크게 보기 모달
    const [isSaving, setIsSaving] = useState(false);

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
        if (!window.confirm(`정말 [${targetName}] 학급을 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며 모든 데이터가 삭제됩니다.`)) {
            return;
        }

        setIsSaving(true);
        try {
            // 2. DB 삭제 실행
            const { error } = await supabase
                .from('classes')
                .delete()
                .eq('id', targetId);

            if (error) {
                // 외래키 제약 조건 에러 처리
                if (error.code === '23503') {
                    alert('학급에 학생이 남아있습니다. 학생 명단을 먼저 삭제해야 합니다. ⚠️');
                } else {
                    alert(`삭제 권한이 없거나 오류가 발생했습니다: ${error.message}`);
                }
                return;
            }

            // 3. 상태 업데이트 순서 조정 (성공 시 즉시 반영)
            // (1) 목록에서 즉시 제거
            if (setClasses) {
                setClasses(prev => prev.filter(c => c.id !== targetId));
            }
            // (2) 현재 선택된 학급 정보 비우기
            if (activeClass && activeClass.id === targetId && setActiveClass) {
                setActiveClass(null);
            }

            alert(`[${targetName}] 학급이 삭제되었습니다. ✨`);

            // (3) 콜백 호출로 데이터 재정렬
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
                    </Card>

                    {classes.length > 0 && (
                        <div style={{ background: 'white', borderRadius: '24px', padding: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.03)' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#2C3E50', fontWeight: '900' }}>나의 학급 목록</h3>
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
                    <div style={{
                        padding: isMobile ? '16px 20px' : '24px 32px',
                        background: 'linear-gradient(135deg, #FFF9C4 0%, #FFF59D 100%)',
                        borderRadius: '24px',
                        border: '1px solid #FFE082',
                        display: 'flex',
                        flexDirection: isMobile ? 'column' : 'row',
                        justifyContent: 'space-between',
                        alignItems: isMobile ? 'flex-start' : 'center',
                        gap: isMobile ? '16px' : '20px',
                        boxShadow: '0 4px 15px rgba(255, 236, 179, 0.4)',
                        width: '100%',
                        boxSizing: 'border-box',
                        overflow: 'hidden'
                    }}>
                        <div>
                            <span style={{ fontSize: '0.85rem', color: '#795548', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '4px' }}>Active Class</span>
                            <h3 style={{ margin: 0, fontSize: '1.6rem', color: '#2C3E50', fontWeight: '900' }}>
                                {activeClass?.name}
                            </h3>
                        </div>

                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '20px',
                            background: 'white',
                            padding: '12px 24px',
                            borderRadius: '20px',
                            border: '1px solid rgba(255, 224, 130, 0.5)',
                            boxShadow: '0 4px 10px rgba(0,0,0,0.03)',
                            width: isMobile ? '100%' : 'auto',
                            boxSizing: 'border-box'
                        }}>
                            <div style={{ flex: 1 }}>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#95A5A6', fontWeight: 'bold' }}>초대 코드</p>
                                <p style={{ margin: 0, fontSize: isMobile ? '1.2rem' : '1.5rem', fontWeight: '900', color: '#3498DB', letterSpacing: '2px', fontFamily: 'monospace' }}>
                                    {activeClass?.invite_code}
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsZoomModalOpen(true)}
                                style={{ background: '#EBF5FB', color: '#1976D2', border: 'none', padding: '10px 16px', fontWeight: 'bold', borderRadius: '12px' }}
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
        </div>
    );
};

export default ClassManager;
