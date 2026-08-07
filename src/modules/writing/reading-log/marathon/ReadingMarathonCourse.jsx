import React, { useId } from 'react';
import { formatMarathonDistance, getCoursePosition } from './readingMarathon';
import './readingMarathon.css';

const COURSE_PATH = 'M44 186 C105 146 121 120 172 126 S255 184 305 168 S383 101 438 91 S525 153 578 137 S673 72 724 66 S815 121 856 108';

const ReadingMarathonCourse = ({ title, summary, completed = false }) => {
    const progress = summary?.progressPercent || 0;
    const runner = getCoursePosition(progress);
    const idPrefix = useId().replaceAll(':', '');
    const groundGradientId = `${idPrefix}-marathon-ground`;
    const progressGradientId = `${idPrefix}-marathon-progress`;

    return (
        <section className={`reading-marathon-course ${completed ? 'is-complete' : ''}`} aria-label={`${title} 공동 목표 ${Math.round(progress)}% 달성`}>
            <div className="reading-marathon-course__sky" aria-hidden="true">
                <span>☁️</span><span>☀️</span><span>☁️</span>
            </div>
            <svg viewBox="0 0 900 230" role="img" aria-label={`출발선에서 결승선까지 ${Math.round(progress)}% 이동한 마라톤 코스`}>
                <defs>
                    <linearGradient id={groundGradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#dcfce7" />
                        <stop offset="1" stopColor="#bbf7d0" />
                    </linearGradient>
                    <linearGradient id={progressGradientId} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0" stopColor="#fb923c" />
                        <stop offset="1" stopColor="#facc15" />
                    </linearGradient>
                </defs>
                <path d="M0 161 Q112 119 224 154 T450 139 T676 127 T900 141 V230 H0Z" fill={`url(#${groundGradientId})`} />
                <g className="reading-marathon-course__landmarks" aria-hidden="true">
                    <text x="26" y="209">🏫</text>
                    <text x="246" y="118">🌳</text>
                    <text x="480" y="188">🌲</text>
                    <text x="680" y="119">📚</text>
                    <text x="842" y="77">🏁</text>
                </g>
                <path d={COURSE_PATH} pathLength="100" className="reading-marathon-course__track" />
                <path
                    d={COURSE_PATH}
                    pathLength="100"
                    className="reading-marathon-course__progress"
                    style={{ stroke: `url(#${progressGradientId})`, strokeDasharray: `${progress} ${100 - progress}` }}
                />
                <g className="reading-marathon-course__runner" transform={`translate(${runner.x} ${runner.y})`} aria-hidden="true">
                    <circle r="22" />
                    <text x="0" y="8">🏃</text>
                </g>
            </svg>
            <div className="reading-marathon-course__caption">
                <span><strong>{formatMarathonDistance(summary?.totalDistanceM)}</strong> 함께 달림</span>
                <span>목표 <strong>{formatMarathonDistance(summary?.targetDistanceM)}</strong></span>
            </div>
            <div className="reading-marathon-course__bar" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
            </div>
        </section>
    );
};

export default ReadingMarathonCourse;
