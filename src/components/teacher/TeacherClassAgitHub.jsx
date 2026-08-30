import React from 'react';
import PreparationRoadmap from '../common/PreparationRoadmap';
import { CLASS_AGIT_PREPARATION_ROADMAP } from '../../constants/preparationRoadmaps';
import './TeacherClassAgitHub.css';

const TeacherClassAgitHub = ({ activeClass }) => (
    <section className="teacher-class-agit" aria-labelledby="teacher-class-agit-title">
        <div className="teacher-class-agit__hero">
            <span className="teacher-class-agit__badge">Beta · 준비 중</span>
            <span className="teacher-class-agit__icon" aria-hidden="true">🏡</span>
            <h1 id="teacher-class-agit-title">우리반 아지트</h1>
            <p className="teacher-class-agit__summary">
                {activeClass?.name || '우리 반'}의 글을 전시하고 문집으로 남길 공간을 준비하고 있습니다.
            </p>
            <PreparationRoadmap
                headingId="teacher-class-agit-roadmap-title"
                roadmap={CLASS_AGIT_PREPARATION_ROADMAP}
                tone="green"
            />
        </div>
    </section>
);

export default TeacherClassAgitHub;
