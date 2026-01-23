import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const BulkAIProgressModal = ({ isGenerating, progress }) => {
    return (
        <AnimatePresence>
            {isGenerating && progress.total > 0 && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 3000, backdropFilter: 'blur(4px)'
                }}>
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        style={{
                            background: 'white',
                            padding: '40px',
                            borderRadius: '24px',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                            textAlign: 'center',
                            width: '90%',
                            maxWidth: '400px'
                        }}
                    >
                        <div style={{ fontSize: '3rem', marginBottom: '20px' }}>🤖</div>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '1.4rem', color: '#2C3E50', fontWeight: '900' }}>
                            AI 피드백 생성 중...
                        </h3>
                        <p style={{ margin: '0 0 24px 0', color: '#7F8C8D', fontSize: '1rem' }}>
                            학생들의 글을 꼼꼼히 읽고 있어요! ✍️
                        </p>

                        <div style={{ position: 'relative', height: '12px', background: '#F1F3F5', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' }}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                                transition={{ duration: 0.5 }}
                                style={{ height: '100%', background: 'linear-gradient(90deg, #3498DB, #5CC6FF)' }}
                            />
                        </div>
                        <div style={{ fontWeight: 'bold', color: '#3498DB', fontSize: '1.1rem' }}>
                            {progress.current} / {progress.total}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default BulkAIProgressModal;
