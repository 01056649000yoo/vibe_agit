import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

const BulkAIProgressModal = ({
    isGenerating,
    progress,
    title = "열심히 문장을 쓰고 있어요",
    description = "학생들의 기록을 꼼꼼히 검토하고 있어요."
}) => {
    // SSR 대응 (서버 사이드 환경에서는 포탈을 사용하지 않음)
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    const content = (
        <AnimatePresence>
            {isGenerating && progress.total > 0 && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 100000, backdropFilter: 'blur(4px)'
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
                            {title}
                        </h3>
                        <p style={{ margin: '0 0 24px 0', color: '#7F8C8D', fontSize: '1rem' }}>
                            {description}
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

    if (!mounted || typeof document === 'undefined') return null;
    return createPortal(content, document.body);
};

export default BulkAIProgressModal;
