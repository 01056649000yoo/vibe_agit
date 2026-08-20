import React, { useState } from 'react';
import CenteredDialog from '../../../../components/common/CenteredDialog';
import {
    distributeMarathonRosterEvenly,
    distributeMarathonRosterRandomly
} from './readingMarathon';

const ReadingMarathonTeamAssignmentDialog = ({
    isOpen,
    onClose,
    teams,
    roster,
    onTeamsChange,
    locked = false
}) => {
    const [assignmentMethod, setAssignmentMethod] = useState('direct');

    const assignStudent = (studentId, teamKey) => {
        onTeamsChange(teams.map((team) => ({
            ...team,
            studentIds: team.key === teamKey
                ? [...new Set([...team.studentIds, studentId])]
                : team.studentIds.filter((id) => id !== studentId)
        })));
    };

    const applyEvenAssignment = () => {
        setAssignmentMethod('even');
        onTeamsChange(distributeMarathonRosterEvenly(teams, roster));
    };

    const applyRandomAssignment = () => {
        setAssignmentMethod('random');
        onTeamsChange(distributeMarathonRosterRandomly(teams, roster));
    };

    return (
        <CenteredDialog
            isOpen={isOpen}
            onClose={onClose}
            eyebrow="학생들과 함께 보는 큰 화면"
            title="모둠 배정하기"
            description={`${roster.length}명의 학생을 ${teams.length}개 모둠에 배정합니다. 원하는 방식을 고르고 결과를 함께 확인하세요.`}
            maxWidth="1400px"
            maxHeight="94dvh"
            bodyPadding="18px"
        >
            <div className="reading-marathon-assignment-dialog">
                <div className="reading-marathon-assignment-dialog__methods" aria-label="모둠 배정 방식">
                    <button type="button" className={assignmentMethod === 'even' ? 'is-selected' : ''} aria-pressed={assignmentMethod === 'even'} onClick={applyEvenAssignment} disabled={locked}>
                        <span>↻</span><strong>균등 재배정</strong><small>명단 순서대로 고르게</small>
                    </button>
                    <button type="button" className={assignmentMethod === 'random' ? 'is-selected' : ''} aria-pressed={assignmentMethod === 'random'} onClick={applyRandomAssignment} disabled={locked}>
                        <span>🎲</span><strong>랜덤 배정</strong><small>인원은 같게, 구성은 무작위</small>
                    </button>
                    <button type="button" className={assignmentMethod === 'direct' ? 'is-selected' : ''} aria-pressed={assignmentMethod === 'direct'} onClick={() => setAssignmentMethod('direct')} disabled={locked}>
                        <span>👆</span><strong>직접 배정</strong><small>학생별로 원하는 모둠 선택</small>
                    </button>
                </div>

                {locked && <p className="reading-marathon-assignment-dialog__locked">첫 독서 기록이 반영되어 현재 배정을 함께 볼 수만 있습니다.</p>}

                <div className="reading-marathon-assignment-dialog__board">
                    {teams.map((team, index) => {
                        const members = roster.filter((student) => team.studentIds.includes(student.student_id));
                        return (
                            <article key={team.key} style={{ '--team-color': team.color }}>
                                <header>
                                    <span>{index + 1}</span>
                                    <div><strong>{team.name}</strong><small>{members.length}명</small></div>
                                </header>
                                <div>
                                    {members.length > 0 ? members.map((student) => (
                                        <label key={student.student_id}>
                                            <span>{student.name}</span>
                                            {assignmentMethod === 'direct' && !locked ? (
                                                <select value={team.key} aria-label={`${student.name} 모둠 변경`} onChange={(event) => assignStudent(student.student_id, event.target.value)}>
                                                    {teams.map((optionTeam) => <option key={optionTeam.key} value={optionTeam.key}>{optionTeam.name}</option>)}
                                                </select>
                                            ) : <em>{team.name}</em>}
                                        </label>
                                    )) : <p>배정된 학생이 없습니다.</p>}
                                </div>
                            </article>
                        );
                    })}
                </div>

                <footer>
                    <span>{assignmentMethod === 'even' ? '명단 순서 기준으로 균등 배정했습니다.' : assignmentMethod === 'random' ? '누를 때마다 새로운 조합으로 균등하게 섞습니다.' : '학생 이름 오른쪽에서 모둠을 직접 바꿀 수 있습니다.'}</span>
                    <button type="button" onClick={onClose}>이 배정으로 돌아가기</button>
                </footer>
            </div>
        </CenteredDialog>
    );
};

export default ReadingMarathonTeamAssignmentDialog;
