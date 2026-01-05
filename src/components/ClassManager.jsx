import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import Card from './common/Card';
import Button from './common/Button';

const ClassManager = ({ userId }) => {
    const [className, setClassName] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
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
            setIsModalOpen(false);
        }
        setIsSaving(false);
    };

    const copyCode = () => {
        if (myClass) {
            navigator.clipboard.writeText(myClass.invite_code);
            alert('초대 코드가 복사되었습니다! 학생들에게 공유해주세요. 📋');
        }
    };

    if (loading) return <div>학급 정보를 불러오는 중...</div>;

    return (
        <div style={{ marginTop: '24px' }}>
            {!myClass ? (
                <Button
                    variant="primary"
                    size="lg"
                    style={{ width: '100%', height: '80px', fontSize: '1.2rem', gap: '10px' }}
                    onClick={() => setIsModalOpen(true)}
                >
                    <span>🏫</span> 우리 클래스 만들기
                </Button>
            ) : (
                <div style={{
                    padding: '24px',
                    background: 'var(--bg-secondary)',
                    borderRadius: '16px',
                    border: '1px solid var(--primary-color)',
                    textAlign: 'left'
                }}>
                    <div style={{ marginBottom: '16px' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--primary-color)', fontWeight: 'bold' }}>내 학급</span>
                        <h3 style={{ margin: '4px 0 0 0', fontSize: '1.5rem', color: 'var(--text-primary)' }}>
                            {myClass.name}
                        </h3>
                    </div>

                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'white',
                        padding: '16px',
                        borderRadius: '12px',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
                    }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#888' }}>초대 코드</p>
                            <p style={{ margin: 0, fontSize: '1.3rem', fontWeight: '800', letterSpacing: '2px', color: 'var(--text-primary)' }}>
                                {myClass.invite_code}
                            </p>
                        </div>
                        <Button variant="secondary" size="sm" onClick={copyCode}>
                            복사하기 📋
                        </Button>
                    </div>
                </div>
            )}

            {/* 학급 생성 모달 */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.4)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 1000,
                    backdropFilter: 'blur(4px)'
                }}>
                    <Card style={{ width: '90%', maxWidth: '400px', padding: '32px' }}>
                        <h2 style={{ fontSize: '1.8rem', marginBottom: '12px', color: 'var(--text-primary)' }}>
                            우리 반 이름이 뭔가요?
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                            선생님과 학생들이 함께할<br />멋진 이름을 지어주세요! ✨
                        </p>

                        <input
                            type="text"
                            placeholder="예: 3학년 1반, 슬기로운 반"
                            value={className}
                            onChange={(e) => setClassName(e.target.value)}
                            autoFocus
                            style={{
                                width: '100%',
                                padding: '16px',
                                borderRadius: '12px',
                                border: '2px solid #eee',
                                fontSize: '1.1rem',
                                marginBottom: '24px',
                                outline: 'none',
                                transition: 'border-color 0.2s'
                            }}
                            onFocus={(e) => e.target.style.borderColor = 'var(--primary-color)'}
                            onBlur={(e) => e.target.style.borderColor = '#eee'}
                        />

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <Button
                                variant="ghost"
                                style={{ flex: 1 }}
                                onClick={() => setIsModalOpen(false)}
                                disabled={isSaving}
                            >
                                취소
                            </Button>
                            <Button
                                variant="primary"
                                style={{ flex: 2 }}
                                onClick={handleCreateClass}
                                disabled={isSaving}
                            >
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
