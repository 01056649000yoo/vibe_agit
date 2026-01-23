import React from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { motion, AnimatePresence } from 'framer-motion';

const TeacherProfileModal = ({
    isOpen,
    onClose,
    editName,
    setEditName,
    editSchool,
    setEditSchool,
    editPhone,
    setEditPhone,
    handleUpdateTeacherProfile,
    handleSwitchGoogleAccount,
    handleWithdrawal
}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 2500, backdropFilter: 'blur(4px)'
                }}>
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        style={{ width: '90%', maxWidth: '420px' }}
                    >
                        <Card style={{ padding: '32px', borderRadius: '28px', border: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
                            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>👤</div>
                                <h3 style={{ margin: 0, fontSize: '1.4rem', color: '#2C3E50', fontWeight: '900' }}>선생님 프로필 수정</h3>
                                <p style={{ margin: '4px 0 0 0', color: '#7F8C8D', fontSize: '0.9rem' }}>실명 또는 별칭을 입력해 주세요.</p>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#5D4037', fontWeight: 'bold', marginBottom: '6px' }}>이름 (또는 별칭)</label>
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        placeholder="예: 홍길동 선생님"
                                        style={{
                                            width: '100%', padding: '12px', borderRadius: '12px',
                                            border: '2px solid #ECEFF1', fontSize: '1rem', outline: 'none'
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#5D4037', fontWeight: 'bold', marginBottom: '6px' }}>소속 학교명</label>
                                    <input
                                        type="text"
                                        value={editSchool}
                                        onChange={(e) => setEditSchool(e.target.value)}
                                        placeholder="예: 서울미래초등학교"
                                        style={{
                                            width: '100%', padding: '12px', borderRadius: '12px',
                                            border: '2px solid #ECEFF1', fontSize: '1rem', outline: 'none'
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#5D4037', fontWeight: 'bold', marginBottom: '6px' }}>전화번호 (선택)</label>
                                    <input
                                        type="tel"
                                        value={editPhone}
                                        onChange={(e) => setEditPhone(e.target.value)}
                                        placeholder="010-0000-0000"
                                        style={{
                                            width: '100%', padding: '12px', borderRadius: '12px',
                                            border: '2px solid #ECEFF1', fontSize: '1rem', outline: 'none'
                                        }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <Button variant="ghost" style={{ flex: 1, height: '50px', borderRadius: '14px' }} onClick={onClose}>취소</Button>
                                <Button variant="primary" style={{ flex: 2, height: '50px', borderRadius: '14px', fontWeight: 'bold' }} onClick={handleUpdateTeacherProfile}>저장하기 ✨</Button>
                            </div>
                            <div style={{ marginTop: '16px' }}>
                                <button
                                    onClick={handleSwitchGoogleAccount}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        background: '#fff',
                                        border: '1px solid #dee2e6',
                                        borderRadius: '12px',
                                        color: '#495057',
                                        fontSize: '0.9rem',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" style={{ width: '16px' }} />
                                    다른 구글 계정으로 로그인
                                </button>
                            </div>
                            <div style={{ marginTop: '16px', textAlign: 'center' }}>
                                <button
                                    onClick={handleWithdrawal}
                                    style={{
                                        background: 'none', border: 'none',
                                        color: '#E74C3C', fontSize: '0.85rem', fontWeight: 'bold',
                                        cursor: 'pointer', textDecoration: 'underline'
                                    }}
                                >
                                    회원 탈퇴하기 (계정 삭제)
                                </button>
                            </div>
                        </Card>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default TeacherProfileModal;
