import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';
import StudentManager from './StudentManager';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 학급 생성, 초대 코드 관리 및 학생 명단 통합 관리
 * 최적화된 레이아웃과 초대 코드 크게 보기 기능을 제공합니다. ✨
 */
const ClassManager = ({ userId, onClassFound }) => {
    const [className, setClassName] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isZoomModalOpen, setIsZoomModalOpen] = useState(false); // 초대 코드 크게 보기 모달
    const [myClass, setMyClass] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchMyClass();
    }, [userId]);

    const fetchMyClass = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('classes')
            .select('*')
            .eq('teacher_id', userId)
            .maybeSingle();

        if (data) {
            setMyClass(data);
            if (onClassFound) onClassFound(data);
        }
        setLoading(false);
    };

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
        const inviteCode = generateInviteCode();

        const { data, error } = await supabase
            .from('classes')
            .insert({
                name: className,
                invite_code: inviteCode,
                teacher_id: userId
            })
            .select()
            .single();

        if (error) {
            alert('학급 생성 중 오류가 생겼어요: ' + error.message);
        } else {
            setMyClass(data);
            if (onClassFound) onClassFound(data);
            setIsModalOpen(false);
        }
        setIsSaving(false);
    };

    if (loading) return <div style={{ textAlign: 'center', padding: '20px' }}>학급 정보를 불러오는 중...</div>;

    return (
        <div style={{ marginTop: '16px' }}>
            {!myClass ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>아직 등록된 학급이 없어요. 🏫</p>
                    <Button
                        variant="primary"
                        size="lg"
                        style={{ width: '100%', height: '80px', fontSize: '1.2rem', gap: '10px' }}
                        onClick={() => setIsModalOpen(true)}
                    >
                        <span>🏫</span> 우리 클래스 만들기
                    </Button>
                </div>
            ) : (
                <>
                    {/* [최적화] 학급 정보 카드 - 크기 축소 및 선명하게 */}
                    <div style={{
                        padding: '12px 20px',
                        background: '#FFF9C4', // 더 진한 노란색 파스텔
                        borderRadius: '12px',
                        border: '2px solid #FFE082',
                        textAlign: 'left',
                        marginBottom: '16px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: '#795548', fontWeight: 'bold', display: 'block', marginBottom: '2px' }}>클래스 정보</span>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#2C3E50', fontWeight: '900' }}>
                                {myClass.name}
                            </h3>
                        </div>

                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            background: 'white',
                            padding: '6px 12px',
                            borderRadius: '10px',
                            border: '1px solid #FFE082'
                        }}>
                            <div>
                                <p style={{ margin: 0, fontSize: '0.7rem', color: '#5D6D7E', fontWeight: 'bold' }}>초대 코드</p>
                                <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: '#2C3E50', letterSpacing: '1px' }}>
                                    {myClass.invite_code}
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsZoomModalOpen(true)}
                                style={{ background: '#FDF2E9', color: '#D35400', border: '1px solid #F5CBA7', padding: '4px 8px' }}
                            >
                                🔍 크게 보기
                            </Button>
                        </div>
                    </div>

                    {/* 학생 관리 섹션 */}
                    <StudentManager classId={myClass.id} />
                </>
            )}

            {/* 초대 코드 크게 보기 모달 */}
            <AnimatePresence>
                {isZoomModalOpen && (
                    <div style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(255,255,255,0.95)',
                        zIndex: 2000,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        backdropFilter: 'blur(5px)'
                    }}>
                        <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            style={{ textAlign: 'center' }}
                        >
                            <h1 style={{ fontSize: '2rem', color: '#2C3E50', marginBottom: '20px' }}>학급 초대 코드</h1>
                            <div style={{
                                fontSize: '8rem',
                                fontWeight: '900',
                                color: 'var(--primary-color)',
                                letterSpacing: '15px',
                                background: 'white',
                                padding: '40px 60px',
                                borderRadius: '30px',
                                boxShadow: '0 20px 50px rgba(0,0,0,0.1)',
                                border: '5px solid var(--primary-color)'
                            }}>
                                {myClass.invite_code}
                            </div>
                            <Button
                                variant="primary"
                                onClick={() => setIsZoomModalOpen(false)}
                                style={{ marginTop: '50px', padding: '15px 40px', fontSize: '1.5rem' }}
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
                    backgroundColor: 'rgba(0,0,0,0.4)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 1000, backdropFilter: 'blur(4px)'
                }}>
                    <Card style={{ width: '90%', maxWidth: '400px', padding: '32px' }}>
                        <h2 style={{ fontSize: '1.8rem', marginBottom: '12px', color: '#2C3E50' }}>우리 반 이름이 뭔가요?</h2>
                        <input
                            type="text"
                            placeholder="예: 3학년 1반, 슬기로운 반"
                            value={className}
                            onChange={(e) => setClassName(e.target.value)}
                            autoFocus
                            style={{
                                width: '100%', padding: '16px', borderRadius: '12px', border: '2px solid #eee',
                                fontSize: '1.1rem', marginBottom: '24px', outline: 'none'
                            }}
                        />
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <Button variant="ghost" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>취소</Button>
                            <Button variant="primary" style={{ flex: 2 }} onClick={handleCreateClass} disabled={isSaving}>
                                {isSaving ? '만드는 중...' : '학급 생성하기 🎉'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default ClassManager;
