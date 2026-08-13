import React from 'react';
import { ArrowLeft } from 'lucide-react';
import Button from '../common/Button';
import Card from '../common/Card';
import { STUDENT_WRITING_CARD_MAX_WIDTH } from '../../modules/writing/layout';
import './WritingWorkspace.css';

export const WritingWorkspace = ({ children, tone = 'assignment', className = '' }) => (
    <Card
        className={`writing-workspace writing-workspace--${tone} ${className}`.trim()}
        style={{
            maxWidth: STUDENT_WRITING_CARD_MAX_WIDTH,
            margin: '20px auto 50px',
            padding: 'clamp(20px, 3vw, 32px)',
            border: '1px solid var(--writing-workspace-border)',
            background: 'var(--writing-workspace-background)',
            boxShadow: 'var(--ui-shadow-md)',
            // 공통 Card의 overflow:hidden은 우측 참고함의 sticky 이동 범위를 막는다.
            // 글쓰기 작업공간만 visible로 풀어 긴 본문을 따라오게 한다.
            overflow: 'visible'
        }}
    >
        {children}
    </Card>
);

export const WritingWorkspaceHeader = ({
    onBack,
    disabled = false,
    eyebrow,
    title,
    description,
    backLabel = '나가기'
}) => (
    <header className="writing-workspace__header">
        <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            disabled={disabled}
            className="writing-workspace__back"
        >
            <ArrowLeft size={18} aria-hidden="true" />
            {backLabel}
        </Button>
        <div className="writing-workspace__identity">
            <span className="writing-workspace__eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
        </div>
    </header>
);

export const WritingWorkspacePath = ({ steps }) => (
    <nav className="writing-workspace__path" aria-label="이 화면에서 할 일">
        <span className="writing-workspace__path-label">이 화면에서</span>
        <ol>
            {steps.map((step, index) => (
                <li key={step}>
                    <span>{index + 1}</span>
                    {step}
                </li>
            ))}
        </ol>
    </nav>
);

export const WritingSectionHeader = ({ icon, title, description, action }) => (
    <div className="writing-section-heading">
        <div className="writing-section-heading__copy">
            {icon && <span className="writing-section-heading__icon" aria-hidden="true">{icon}</span>}
            <span>
                <strong>{title}</strong>
                {description && <small>{description}</small>}
            </span>
        </div>
        {action && <div className="writing-section-heading__action">{action}</div>}
    </div>
);

export const WritingNotice = ({ tone = 'info', icon, title, children, compact = false }) => (
    <div className={`writing-notice writing-notice--${tone} ${compact ? 'writing-notice--compact' : ''}`.trim()}>
        {icon && <span className="writing-notice__icon" aria-hidden="true">{icon}</span>}
        <div>
            {title && <strong>{title}</strong>}
            {children && <div className="writing-notice__body">{children}</div>}
        </div>
    </div>
);
