import React from 'react';
import { motion } from 'framer-motion';

const StudentStatsCards = ({ stats }) => {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '40px' }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                style={{ background: 'white', padding: '15px 10px', borderRadius: '20px', border: '1px solid #FFE082', textAlign: 'center' }}
            >
                <div style={{ fontSize: '1.5rem', marginBottom: '5px' }}>📝</div>
                <div style={{ fontSize: '0.75rem', color: '#8D6E63', fontWeight: 'bold' }}>쓴 글자 수</div>
                <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#5D4037' }}>{stats.totalChars.toLocaleString()}자</div>
            </motion.div>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                style={{ background: 'white', padding: '15px 10px', borderRadius: '20px', border: '1px solid #FFE082', textAlign: 'center' }}
            >
                <div style={{ fontSize: '1.5rem', marginBottom: '5px' }}>🚀</div>
                <div style={{ fontSize: '0.75rem', color: '#8D6E63', fontWeight: 'bold' }}>완료 미션</div>
                <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#5D4037' }}>{stats.completedMissions}개</div>
            </motion.div>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                style={{ background: 'white', padding: '15px 10px', borderRadius: '20px', border: '1px solid #FFE082', textAlign: 'center' }}
            >
                <div style={{ fontSize: '1.5rem', marginBottom: '5px' }}>📅</div>
                <div style={{ fontSize: '0.75rem', color: '#8D6E63', fontWeight: 'bold' }}>이달의 활동</div>
                <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#5D4037' }}>{stats.monthlyPosts}회</div>
            </motion.div>
        </div>
    );
};

export default StudentStatsCards;
