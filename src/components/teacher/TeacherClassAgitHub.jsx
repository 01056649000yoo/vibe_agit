import React from 'react';
import './TeacherClassAgitHub.css';

const TeacherClassAgitHub = ({ activeClass }) => (
    <section className="teacher-class-agit" aria-labelledby="teacher-class-agit-title">
        <div className="teacher-class-agit__hero">
            <span className="teacher-class-agit__badge">Beta · 준비 중</span>
            <span className="teacher-class-agit__icon" aria-hidden="true">🏡</span>
            <h1 id="teacher-class-agit-title">우리반 아지트</h1>
            <p className="teacher-class-agit__summary">
                {activeClass?.name || '우리 반'}을 위한 공간을 준비하고 있습니다.
            </p>
        </div>
    </section>
);

export default TeacherClassAgitHub;
