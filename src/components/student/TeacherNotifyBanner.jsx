import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 선생님이 방금 한 일을 알리는 **순간 알림**만 담당한다.
 * "다시 쓸 글이 N개 있다" 같은 **상시 상태**는 홈 맨 위 할 일 카드가 센다.
 * 예전에는 둘 다 여기서 보여 줘서 같은 것이 두 번 보였다.
 */
const TeacherNotifyBanner = ({ teacherNotify, setTeacherNotify, handleDirectRewriteGo }) => {
    return (
        <AnimatePresence>
            {teacherNotify && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                        background: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
                        padding: '16px 20px',
                        borderRadius: '24px',
                        border: '2px solid #FFB74D',
                        marginBottom: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '15px',
                        cursor: 'pointer',
                        boxShadow: '0 8px 16px rgba(255, 183, 77, 0.2)',
                        textAlign: 'left',
                        width: '100%',
                        boxSizing: 'border-box'
                    }}
                    onClick={() => {
                        if (teacherNotify?.type === 'rewrite') handleDirectRewriteGo();
                        else setTeacherNotify(null);
                    }}
                >
                    <span style={{ fontSize: '2.5rem' }}>
                        {teacherNotify?.icon || (
                            teacherNotify?.type === 'point' ? '🎁' :
                                teacherNotify?.type === 'approve' ? '🎉' :
                                    teacherNotify?.type === 'recovery' ? '⚠️' : '♻️'
                        )}
                    </span>
                    <div style={{ flex: 1 }}>
                        <div style={{
                            fontSize: '1.05rem',
                            fontWeight: '900',
                            color: '#E65100',
                            marginBottom: '2px',
                            whiteSpace: 'normal',
                            wordBreak: 'keep-all'
                        }}>
                            {teacherNotify?.message || "♻️ 선생님의 다시 쓰기 요청이 있습니다."}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#F57C00', fontWeight: 'bold' }}>
                            {/* 상황에 맞는 안내를 준다. 예전에는 회의 안건 결정·회수에도
                                "완벽한 글을 완성해봐요" 가 떠서 문구가 겉돌았다. */}
                            {teacherNotify?.type === 'point' ? "포인트 내역은 상단 지갑(P)을 눌러 확인할 수 있어요! ✨"
                                : teacherNotify?.type === 'idea_decided' ? "우리 반 회의에서 내 안건이 뽑혔어요! 🏛️"
                                    : teacherNotify?.type === 'recovery' ? "궁금한 점은 선생님께 여쭤보세요."
                                        : teacherNotify?.type === 'approve' ? "내 글이 우리 반에 공개되었어요! 🎉"
                                            : "지금 바로 확인하고 완벽한 글을 완성해봐요! ✨"}
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default TeacherNotifyBanner;
