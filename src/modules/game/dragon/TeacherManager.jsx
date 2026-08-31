import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import ModalCloseButton from '../../../components/common/ModalCloseButton';
import ModalPortal from '../../../components/common/ModalPortal';
import {
    WRITER_LEVELS,
    getDiaryLevel,
    getReaderLevel,
    getReadingLevel,
    getWriterLevel
} from '../../../constants/writerLevels';
import { titleSeasonApi } from '../../writing/title-status/titleSeasonApi';
import DragonAvatar from './DragonAvatar';
import TeacherStagePreview from './TeacherStagePreview';
import TeacherWorkshopPreview from './TeacherWorkshopPreview';
import { DRAGON_DECOR_SLOTS, getDragonDecorItem, normalizeDragonDecor } from './decorCatalog';
import {
    getDragonGrowthFromWriterLevel,
    getDragonSpecies,
    getDragonStage,
    getReaderDragonEffect
} from './presentation';
import './TeacherManager.css';

const NUMBER_FORMAT = new Intl.NumberFormat('ko-KR');
const DATE_FORMAT = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
});

const formatNumber = (value) => NUMBER_FORMAT.format(Number(value) || 0);
const formatDate = (value) => (value ? DATE_FORMAT.format(new Date(value)) : '기록 없음');
const formatDateTime = (value) => (value ? DATE_TIME_FORMAT.format(new Date(value)) : '아직 없음');

const getSeasonDays = (startedAt) => {
    if (!startedAt) return 1;
    const elapsed = Date.now() - new Date(startedAt).getTime();
    return Math.max(1, Math.floor(elapsed / 86_400_000) + 1);
};

const normalizeStudent = (raw) => {
    const petData = raw?.pet_data || {};
    const writer = getWriterLevel(
        raw?.writer_total_chars,
        raw?.writer_completed_posts,
        raw?.writer_level_override
    );
    const reader = getReaderLevel(raw?.reader_score, raw?.reader_level_override);
    const diary = getDiaryLevel(raw?.diary_days);
    const reading = getReadingLevel(raw?.reading_log_count, raw?.reading_book_count);
    const dragon = getDragonStage(writer.level, petData.species);
    const growth = getDragonGrowthFromWriterLevel(writer);
    const readerEffect = getReaderDragonEffect(reader.level);
    const decor = normalizeDragonDecor(petData);

    return {
        ...raw,
        petData,
        writer,
        reader,
        diary,
        reading,
        dragon,
        growth,
        readerEffect,
        decor,
        hasSpecies: Boolean(petData.species),
        seasonPosts: Number(raw?.season_posts || 0),
        seasonChars: Number(raw?.season_chars || 0),
        writerChars: Number(raw?.writer_total_chars || 0),
        writerPosts: Number(raw?.writer_completed_posts || 0),
        careerChars: Number(raw?.career_chars || 0),
        careerPosts: Number(raw?.career_posts || 0),
        readerScore: Number(raw?.reader_score || 0),
        diaryDays: Number(raw?.diary_days || 0),
        readingLogs: Number(raw?.reading_log_count || 0),
        readingBooks: Number(raw?.reading_book_count || 0)
    };
};

const SummaryCard = ({ tone, label, value, detail, icon }) => (
    <div className={`dragon-teacher-summary dragon-teacher-summary--${tone}`}>
        <span className="dragon-teacher-summary__icon" aria-hidden="true">{icon}</span>
        <div>
            <span className="dragon-teacher-summary__label">{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
        </div>
    </div>
);

const StudentAvatar = ({ student, compact = false }) => (
    <DragonAvatar
        dragon={student.dragon}
        readerLevel={student.reader.level}
        backgroundId={student.petData?.equippedDecor?.wallpaper || student.petData?.background}
        alt={`${student.name} 학생의 ${student.dragon.species.shortName}`}
        className={compact ? 'dragon-teacher-avatar dragon-teacher-avatar--compact' : 'dragon-teacher-avatar'}
    />
);

const LevelDistribution = ({ students }) => {
    const distribution = WRITER_LEVELS.map((level) => ({
        ...level,
        count: students.filter((student) => student.writer.level === level.level).length
    }));
    const maxCount = Math.max(1, ...distribution.map((item) => item.count));

    return (
        <section className="dragon-teacher-panel">
            <div className="dragon-teacher-panel__heading">
                <div>
                    <span className="dragon-teacher-eyebrow">CLASS GROWTH</span>
                    <h3>작가 성장 10단계 분포</h3>
                </div>
                <span className="dragon-teacher-panel__hint">학생 화면의 수호룡 단계와 같은 기준</span>
            </div>
            <div className="dragon-level-chart" aria-label="작가 성장 단계별 학생 수">
                {distribution.map((item) => (
                    <div className="dragon-level-chart__row" key={item.level}>
                        <span className="dragon-level-chart__level">Lv.{item.level}</span>
                        <span className="dragon-level-chart__track">
                            <span style={{ width: `${(item.count / maxCount) * 100}%` }} />
                        </span>
                        <strong>{item.count}명</strong>
                        <small>{item.name}</small>
                    </div>
                ))}
            </div>
        </section>
    );
};

const StudentCard = ({ student, onOpen }) => (
    <button type="button" className="dragon-student-card" onClick={() => onOpen(student)}>
        <span className="dragon-student-card__visual">
            <StudentAvatar student={student} compact />
            <span className="dragon-student-card__level">Lv.{student.writer.level}</span>
        </span>
        <span className="dragon-student-card__body">
            <span className="dragon-student-card__title">
                <strong>{student.name}</strong>
                {!student.hasSpecies && <em>수호룡 선택 전</em>}
                {student.farewell_status === 'completed' && <em className="is-farewell">작별 편지 완성</em>}
            </span>
            <span className="dragon-student-card__subtitle">
                {student.writer.emoji} {student.writer.name} · {student.readerEffect.name}
            </span>
            <span className="dragon-student-card__progress" aria-label={`다음 성장까지 진행도 ${student.growth.progress}%`}>
                <i style={{ width: `${student.growth.progress}%` }} />
            </span>
            <span className="dragon-student-card__stats">
                <span><b>{student.seasonPosts}</b>편<small>이번 시즌</small></span>
                <span><b>{formatNumber(student.writerChars)}</b>자<small>이번 학기</small></span>
                <span><b>Lv.{student.reader.level}</b><small>소통 효과</small></span>
            </span>
            <span className="dragon-student-card__more">성장 자세히 보기 ›</span>
        </span>
    </button>
);

const StudentDetailModal = ({ student, onClose, seasonLabel }) => {
    if (!student) return null;
    const species = getDragonSpecies(student.petData.species);
    const ownedDecorCount = student.decor.owned.size;

    return (
        <ModalPortal>
            <div className="dragon-teacher-modal" role="presentation" onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}>
                <section className="dragon-teacher-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="dragon-student-detail-title">
                    <ModalCloseButton onClick={onClose} className="dragon-teacher-modal__close" />
                    <div className="dragon-teacher-modal__hero">
                        <div className="dragon-teacher-modal__avatar"><StudentAvatar student={student} /></div>
                        <div>
                            <span className="dragon-teacher-eyebrow">{seasonLabel || 'STUDENT GUARDIAN'}</span>
                            <h2 id="dragon-student-detail-title">{student.name}의 작가 수호룡</h2>
                            <p>{student.petData.name || '나의 드래곤'} · {student.hasSpecies ? species.name : '수호룡 선택 전'}</p>
                            <div className="dragon-teacher-modal__badges">
                                <span>{student.writer.emoji} Lv.{student.writer.level} {student.writer.name}</span>
                                <span>{student.reader.emoji} Lv.{student.reader.level} {student.reader.name}</span>
                                <span>{student.diary.emoji} Lv.{student.diary.level} {student.diary.name}</span>
                                <span>{student.reading.emoji} Lv.{student.reading.level} {student.reading.name}</span>
                                {(student.writer.isTestOverride || student.reader.isTestOverride) && <span className="is-test">시험 단계 적용 중</span>}
                            </div>
                        </div>
                    </div>

                    <div className="dragon-teacher-detail-grid">
                        <div><small>작가 칭호 인정 글</small><strong>{formatNumber(student.writerPosts)}편</strong></div>
                        <div><small>작가 칭호 글자 수</small><strong>{formatNumber(student.writerChars)}자</strong></div>
                        <div><small>일기 기록일</small><strong>{formatNumber(student.diaryDays)}일</strong></div>
                        <div><small>독서록·서로 다른 책</small><strong>{formatNumber(student.readingLogs)}편 · {formatNumber(student.readingBooks)}권</strong></div>
                        <div><small>이번 시즌</small><strong>{formatNumber(student.seasonPosts)}편 · {formatNumber(student.seasonChars)}자</strong></div>
                        <div><small>전체 보관 기록</small><strong>{formatNumber(student.careerPosts)}편 · {formatNumber(student.careerChars)}자</strong></div>
                        <div><small>최근 완성</small><strong>{formatDateTime(student.latest_completed_at)}</strong></div>
                        <div><small>소통 활동 점수</small><strong>{formatNumber(student.readerScore)}점</strong></div>
                        <div><small>교감 기록</small><strong>{formatNumber(student.petData.bondCount)}회 · {student.petData.lastFed ? formatDate(student.petData.lastFed) : '아직 없음'}</strong></div>
                    </div>

                    <div className="dragon-teacher-growth-detail">
                        <div>
                            <strong>수호룡 성장 {student.writer.level}/10단계</strong>
                            <span>{student.dragon.name}</span>
                        </div>
                        <div className="dragon-teacher-growth-detail__bar"><span style={{ width: `${student.growth.progress}%` }} /></div>
                        <small>{student.writer.next ? `다음 단계까지 ${formatNumber(Math.max(0, student.writer.next - student.writer.progressValue))}${student.writer.nextUnit}` : '최고 단계에 도달했어요.'}</small>
                    </div>

                    <div className="dragon-teacher-decor">
                        <div className="dragon-teacher-panel__heading">
                            <div><span className="dragon-teacher-eyebrow">HIDEOUT DECOR</span><h3>장착한 아지트 꾸미기</h3></div>
                            <span className="dragon-teacher-panel__hint">보유 {ownedDecorCount}개</span>
                        </div>
                        <div className="dragon-teacher-decor__slots">
                            {DRAGON_DECOR_SLOTS.map((slot) => {
                                const itemId = Reflect.get(student.decor.equipped, slot.id);
                                const item = getDragonDecorItem(itemId);
                                return <span key={slot.id}><i>{slot.icon}</i><small>{slot.name}</small><strong>{item?.name || '기본'}</strong></span>;
                            })}
                        </div>
                    </div>
                </section>
            </div>
        </ModalPortal>
    );
};

const firstLevel = WRITER_LEVELS[0];
const lastLevel = WRITER_LEVELS[WRITER_LEVELS.length - 1];

const HistoryPanel = ({ history, onOpenStudent }) => {
    const [expandedId, setExpandedId] = useState(null);

    return (
        <div className="dragon-season-history">
            {history.length === 0 ? (
                <div className="dragon-teacher-empty">
                    <span>📚</span>
                    <strong>아직 보관한 시즌이 없습니다.</strong>
                    <p>현재 시즌을 마치면 학급의 성장 현황이 여기에 스냅샷으로 남습니다.</p>
                </div>
            ) : history.map((season) => {
                const totals = season.snapshot?.totals || {};
                const snapshotStudents = Array.isArray(season.snapshot?.students) ? season.snapshot.students : [];
                const levelCounts = WRITER_LEVELS.map((level) => snapshotStudents.filter((student) => Number(student.writer_level) === level.level).length);
                const isExpanded = expandedId === season.id;
                const seasonLabel = `SEASON ${season.season_number} · ${formatDate(season.ended_at)} 종료 기준`;
                return (
                    <article className="dragon-season-history__card" key={season.id}>
                        <div className="dragon-season-history__header">
                            <div><span>SEASON {season.season_number}</span><h3>{season.name}</h3></div>
                            <time>{formatDate(season.started_at)} ~ {formatDate(season.ended_at)}</time>
                        </div>
                        <div className="dragon-season-history__totals">
                            <span><small>참여 학생</small><strong>{formatNumber(totals.student_count ?? snapshotStudents.length)}명</strong></span>
                            <span><small>시즌 완성 글</small><strong>{formatNumber(totals.season_posts)}편</strong></span>
                            <span><small>시즌 글자</small><strong>{formatNumber(totals.season_chars)}자</strong></span>
                        </div>
                        <p className="dragon-season-history__levels-caption">
                            시즌이 끝난 시점, 학생들이 도달해 있던 <b>작가 성장 단계</b>예요. 왼쪽 1단계
                            ({firstLevel.emoji} {firstLevel.name})부터 오른쪽 10단계
                            ({lastLevel.emoji} {lastLevel.name})까지, 숫자는 그 단계였던 학생 수입니다.
                        </p>
                        <div className="dragon-season-history__levels" aria-label="시즌 종료 시 성장 단계별 학생 수">
                            {levelCounts.map((count, index) => {
                                const level = Reflect.get(WRITER_LEVELS, index);
                                return (
                                    <span
                                        key={index}
                                        title={`${index + 1}단계 ${level.emoji} ${level.name} · ${count}명`}
                                        className={count > 0 ? 'has-student' : ''}
                                    >
                                        <i>Lv.{index + 1}</i>
                                        <b>{count}명</b>
                                    </span>
                                );
                            })}
                        </div>
                        {snapshotStudents.length > 0 && (
                            <div className="dragon-season-history__students">
                                <Button type="button" variant="ghost" size="sm" onClick={() => setExpandedId(isExpanded ? null : season.id)}>
                                    {isExpanded ? '학생별 수호룡 접기 ▴' : `학생별 수호룡 보기 · ${snapshotStudents.length}명 ▾`}
                                </Button>
                                {isExpanded && (
                                    <div className="dragon-student-grid">
                                        {snapshotStudents.map(normalizeStudent).map((student) => (
                                            <StudentCard
                                                key={student.student_id}
                                                student={student}
                                                onOpen={(picked) => onOpenStudent(picked, seasonLabel)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </article>
                );
            })}
        </div>
    );
};

const DragonTeacherManager = ({ activeClass }) => {
    const classId = activeClass?.id;
    const [dashboard, setDashboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [search, setSearch] = useState('');
    const [levelFilter, setLevelFilter] = useState('all');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [selectedStudentSeasonLabel, setSelectedStudentSeasonLabel] = useState(null);
    const [seasonName, setSeasonName] = useState('');
    const [farewellDeadline, setFarewellDeadline] = useState('');
    const [closingSeason, setClosingSeason] = useState(false);

    const loadDashboard = useCallback(async () => {
        if (!classId) return;
        setLoading(true);
        try {
            const data = await titleSeasonApi.getTeacherDashboard(classId);
            setError(null);
            setDashboard(data);
            setSeasonName(data?.season?.name || '');
        } catch (loadError) {
            console.error('학기 성장·칭호 시즌 현황 조회 실패:', loadError);
            setError(loadError);
        }
        setLoading(false);
    }, [classId]);

    useEffect(() => {
        // 선택한 학급의 수호룡 운영 현황을 RPC 한 번으로 동기화한다.
        loadDashboard();
    }, [loadDashboard]);

    const students = useMemo(
        () => (Array.isArray(dashboard?.students) ? dashboard.students.map(normalizeStudent) : []),
        [dashboard]
    );
    const history = Array.isArray(dashboard?.history) ? dashboard.history : [];
    const season = dashboard?.season || {};

    const summary = useMemo(() => {
        const totalStudents = students.length;
        const activeStudents = students.filter((student) => student.seasonPosts > 0).length;
        const seasonPosts = students.reduce((sum, student) => sum + student.seasonPosts, 0);
        const seasonChars = students.reduce((sum, student) => sum + student.seasonChars, 0);
        const selectedSpecies = students.filter((student) => student.hasSpecies).length;
        const avgWriterLevel = totalStudents
            ? students.reduce((sum, student) => sum + student.writer.level, 0) / totalStudents
            : 0;
        const generatedAt = new Date(dashboard?.generated_at || 0).getTime();
        const inactiveThirtyDays = students.filter((student) => (
            !student.latest_completed_at
            || generatedAt - new Date(student.latest_completed_at).getTime() > 30 * 86_400_000
        )).length;
        return { totalStudents, activeStudents, seasonPosts, seasonChars, selectedSpecies, avgWriterLevel, inactiveThirtyDays };
    }, [dashboard?.generated_at, students]);

    const filteredStudents = useMemo(() => {
        const query = search.trim().toLocaleLowerCase('ko-KR');
        return students.filter((student) => {
            const matchesName = !query || student.name.toLocaleLowerCase('ko-KR').includes(query);
            const matchesLevel = levelFilter === 'all' || student.writer.level === Number(levelFilter);
            return matchesName && matchesLevel;
        });
    }, [students, search, levelFilter]);

    const runSeasonAction = async ({ action, confirmMessage, successMessage, nextTab = 'overview' }) => {
        if (closingSeason || !classId) return;
        if (!window.confirm(confirmMessage)) return;

        setClosingSeason(true);
        try {
            const data = await action();
            window.alert(successMessage(data));
            await loadDashboard();
            setActiveTab(nextTab);
        } catch (actionError) {
            console.error('수호룡 시즌 처리 실패:', actionError);
            window.alert(actionError.message || '시즌을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            setClosingSeason(false);
        }
    };

    const handleOpenFarewell = () => {
        const currentName = seasonName.trim() || season.name || `${season.number || 1}번째 시즌`;
        runSeasonAction({
            action: () => titleSeasonApi.openClosing(classId, {
                seasonName: currentName,
                farewellDeadline
            }),
            confirmMessage: `“${currentName}”의 작별 기간을 열까요?\n\n이 순간의 작가·소통·기록가·독서가 단계와 수호룡 모습이 동결됩니다. 학생들은 작별 편지를 쓰고 기념 이미지를 받을 수 있습니다.`,
            successMessage: () => `${currentName}의 성장을 마무리하고 작별 편지 쓰기를 열었습니다.`
        });
    };

    const handleFinalizeSeason = () => {
        const pending = Math.max(0, Number(season.farewell_total || students.length) - Number(season.farewell_completed || 0));
        runSeasonAction({
            action: () => titleSeasonApi.finalize(classId),
            confirmMessage: `현재 시즌을 최종 종료할까요?\n\n작별 편지 미완성 학생 ${pending}명도 그대로 보관됩니다. 종료 뒤에는 편지를 수정할 수 없습니다.`,
            successMessage: (data) => `${data?.season_name || season.name}을 보관했습니다. 새 학기는 준비가 되었을 때 별도로 시작하세요.`,
            nextTab: 'history'
        });
    };

    // `시즌 종료`를 잘못 눌렀을 때 되돌린다. `작별 편지 기간`이 아니라 **작별 기간을 열기 전,
    // 평소처럼 성장하던 상태**로 완전히 되돌아간다(사용자 결정). 학생이 쓴 편지는 지우지 않으므로
    // 나중에 다시 작별 기간을 열면 그대로 이어서 보인다. 새 학기를 아직 시작하지 않았을 때만 가능하다 —
    // 그 뒤로는 pet_data 가 이미 초기화됐을 수 있어 서버가 거절한다.
    const handleCancelFinalize = () => {
        runSeasonAction({
            action: () => titleSeasonApi.cancelFinalize(classId),
            confirmMessage: `“${season.name}” 종료를 취소하고 시즌 종료를 누르기 전, 학기 성장 중 상태로 되돌릴까요?\n\n학생이 쓴 작별 편지는 지워지지 않고 그대로 남아요. 새 학기를 이미 시작했다면 되돌릴 수 없어요.`,
            successMessage: (data) => `${data?.season_name || season.name}을 시즌 종료 이전, 학기 성장 중 상태로 되돌렸습니다.`,
            nextTab: 'overview'
        });
    };

    const handleStartSeason = () => {
        const nextNumber = Number(season.number || history[0]?.season_number || 0) + 1;
        const nextName = seasonName.trim() && seasonName.trim() !== season.name ? seasonName.trim() : `${nextNumber}번째 시즌`;
        runSeasonAction({
            action: () => titleSeasonApi.start(classId, nextName),
            confirmMessage: `“${nextName}”을 시작할까요?\n\n학생의 포인트·구입한 소품·지난 글은 보존됩니다. 새 수호룡은 알부터 시작하며 학생이 종류를 다시 고릅니다.`,
            successMessage: (data) => `${data?.season_name || nextName}을 시작했습니다. 학생들은 새 수호룡을 선택할 수 있습니다.`
        });
    };

    if (!activeClass) return <div className="dragon-teacher-empty"><strong>학급을 먼저 선택해주세요.</strong></div>;
    if (loading) return <div className="dragon-teacher-loading"><span>🐉</span>수호룡 성장 현황을 불러오는 중입니다...</div>;
    if (error) return (
        <div className="dragon-teacher-empty dragon-teacher-empty--error">
            <span>⚠️</span><strong>수호룡 현황을 불러오지 못했습니다.</strong>
            <Button type="button" variant="outline" onClick={loadDashboard}>다시 시도</Button>
        </div>
    );

    return (
        <div className="dragon-teacher-manager">
            <section className="dragon-season-hero">
                <div className="dragon-season-hero__copy">
                    <span className="dragon-teacher-eyebrow">TITLE SEASON {season.number || 1}</span>
                    <h2>{season.name || '현재 시즌'}</h2>
                    <p>학기 동안 글과 함께 성장하고, 네 가지 칭호와 수호룡을 한 시즌으로 묶어 최종 모습을 보관합니다.</p>
                    <div className="dragon-season-hero__meta">
                        <span>시작 {formatDate(season.started_at)}</span>
                        <span>{getSeasonDays(season.started_at)}일째</span>
                        <span>{season.status === 'closing' ? '작별 편지 기간' : season.status === 'closed' ? '시즌 보관 완료' : '학기 성장 중'}</span>
                    </div>
                </div>
                <div className="dragon-season-hero__action">
                    <label htmlFor="dragon-season-name">{season.status === 'closed' ? '새 시즌 이름' : '현재 시즌 이름'}</label>
                    <input
                        id="dragon-season-name"
                        value={seasonName}
                        maxLength={40}
                        onChange={(event) => setSeasonName(event.target.value)}
                        placeholder={`${season.number || 1}번째 시즌`}
                    />
                    {season.status === 'active' && (
                        <>
                            <label htmlFor="dragon-farewell-deadline">작별 편지 마감일 (선택)</label>
                            <input id="dragon-farewell-deadline" type="date" value={farewellDeadline} onChange={(event) => setFarewellDeadline(event.target.value)} />
                            <Button type="button" loading={closingSeason} loadingText="성장 기록 중..." onClick={handleOpenFarewell}>성장 마감 · 작별 편지 열기</Button>
                            <small>누르는 순간 최종 수호룡 모습과 칭호가 동결됩니다.</small>
                        </>
                    )}
                    {season.status === 'closing' && (
                        <>
                            <div className="dragon-season-hero__farewell-progress">
                                <strong>{season.farewell_completed || 0} / {season.farewell_total || students.length}명</strong>
                                <span>작별 편지 완성</span>
                            </div>
                            <Button type="button" loading={closingSeason} loadingText="시즌 보관 중..." onClick={handleFinalizeSeason}>작별 기간 마감 · 시즌 종료</Button>
                            <small>시즌 종료 뒤에도 학생의 완성 편지와 기념 이미지는 보관됩니다.</small>
                        </>
                    )}
                    {season.status === 'closed' && (
                        <>
                            <Button type="button" loading={closingSeason} loadingText="새 시즌 준비 중..." onClick={handleStartSeason}>새 학기 · 알부터 시작</Button>
                            <small>포인트·구입 소품·지난 글은 유지하고 수호룡 성장만 다시 시작합니다.</small>
                            <Button
                                type="button" variant="ghost" size="sm"
                                loading={closingSeason} loadingText="되돌리는 중..."
                                onClick={handleCancelFinalize}
                            >
                                실수로 종료했어요 · 시즌 종료 취소
                            </Button>
                            <small>학기 성장 중 상태로 완전히 되돌아갑니다. 새 학기를 시작하기 전까지만 가능해요.</small>
                        </>
                    )}
                </div>
            </section>

            <nav className="dragon-teacher-tabs" aria-label="작가 수호룡 관리 메뉴">
                {[
                    ['overview', '성장 현황'],
                    ['students', `학생별 수호룡 ${students.length}`],
                    ['preview', '단계 미리보기'],
                    ['workshop', '공방 미리보기'],
                    ['history', `지난 시즌 ${history.length}`]
                ].map(([id, label]) => (
                    <button type="button" key={id} className={activeTab === id ? 'is-active' : ''} onClick={() => setActiveTab(id)}>{label}</button>
                ))}
            </nav>

            {activeTab === 'overview' && (
                <div className="dragon-teacher-overview">
                    <div className="dragon-teacher-summary-grid">
                        <SummaryCard tone="amber" icon="✦" label="평균 작가 성장" value={`${summary.avgWriterLevel.toFixed(1)} / 10`} detail={`최고 단계 ${students.filter((student) => student.writer.level === 10).length}명`} />
                        <SummaryCard tone="green" icon="✍" label="이번 시즌 참여" value={`${summary.activeStudents} / ${summary.totalStudents}명`} detail={`완성 글 ${formatNumber(summary.seasonPosts)}편`} />
                        <SummaryCard tone="blue" icon="字" label="이번 시즌 글자" value={`${formatNumber(summary.seasonChars)}자`} detail={`학생 1명당 ${summary.totalStudents ? formatNumber(Math.round(summary.seasonChars / summary.totalStudents)) : 0}자`} />
                        <SummaryCard tone="violet" icon="◇" label="수호룡 선택" value={`${summary.selectedSpecies} / ${summary.totalStudents}명`} detail={`선택 전 ${summary.totalStudents - summary.selectedSpecies}명`} />
                    </div>
                    <div className="dragon-teacher-overview__grid">
                        <LevelDistribution students={students} />
                        <section className="dragon-teacher-panel dragon-teacher-watchlist">
                            <div className="dragon-teacher-panel__heading"><div><span className="dragon-teacher-eyebrow">TEACHER CHECK</span><h3>선생님 확인 항목</h3></div></div>
                            <div className="dragon-teacher-watchlist__items">
                                <button type="button" onClick={() => { setLevelFilter('all'); setSearch(''); setActiveTab('students'); }}>
                                    <span>이번 시즌 글쓰기 전</span><strong>{students.filter((student) => student.seasonPosts === 0).length}명</strong><small>시즌 완성 글이 아직 없어요</small>
                                </button>
                                <button type="button" onClick={() => setActiveTab('students')}>
                                    <span>수호룡 선택 전</span><strong>{students.filter((student) => !student.hasSpecies).length}명</strong><small>알에서 키울 종류를 아직 고르지 않았어요</small>
                                </button>
                                <button type="button" onClick={() => setActiveTab('students')}>
                                    <span>최근 30일 완성 글 없음</span><strong>{summary.inactiveThirtyDays}명</strong><small>성장 정체를 살펴볼 수 있어요</small>
                                </button>
                            </div>
                            <p>수호룡 단계는 교사가 직접 올리는 값이 아니라 학생의 완성 글과 작가 칭호를 따라 자동으로 바뀝니다.</p>
                        </section>
                    </div>
                </div>
            )}

            {activeTab === 'students' && (
                <section className="dragon-teacher-students">
                    <div className="dragon-teacher-students__toolbar">
                        <div><span className="dragon-teacher-eyebrow">STUDENT GUARDIANS</span><h3>학생별 성장 상태</h3></div>
                        <div className="dragon-teacher-students__filters">
                            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="학생 이름 찾기" aria-label="학생 이름 찾기" />
                            <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)} aria-label="작가 성장 단계 필터">
                                <option value="all">전체 단계</option>
                                {WRITER_LEVELS.map((level) => <option value={level.level} key={level.level}>Lv.{level.level} {level.name}</option>)}
                            </select>
                        </div>
                    </div>
                    {filteredStudents.length > 0 ? (
                        <div className="dragon-student-grid">
                            {filteredStudents.map((student) => (
                                <StudentCard
                                    key={student.student_id}
                                    student={student}
                                    onOpen={(picked) => { setSelectedStudent(picked); setSelectedStudentSeasonLabel(null); }}
                                />
                            ))}
                        </div>
                    ) : <div className="dragon-teacher-empty"><strong>조건에 맞는 학생이 없습니다.</strong></div>}
                </section>
            )}

            {activeTab === 'history' && (
                <HistoryPanel
                    history={history}
                    onOpenStudent={(picked, seasonLabel) => { setSelectedStudent(picked); setSelectedStudentSeasonLabel(seasonLabel); }}
                />
            )}

            {activeTab === 'preview' && <TeacherStagePreview />}

            {activeTab === 'workshop' && <TeacherWorkshopPreview />}

            <StudentDetailModal
                student={selectedStudent}
                seasonLabel={selectedStudentSeasonLabel}
                onClose={() => { setSelectedStudent(null); setSelectedStudentSeasonLabel(null); }}
            />
        </div>
    );
};

export default DragonTeacherManager;
