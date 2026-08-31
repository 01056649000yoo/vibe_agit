import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../common/Button';
import ModalPortal from '../common/ModalPortal';
import TeacherGuideButton from './TeacherGuideButton';
import { classKey, dataCache } from '../../lib/cache';
import { supabase } from '../../lib/supabaseClient';
import DragonHideoutScene from '../../modules/game/dragon/DragonHideoutScene';
import {
    getDragonGrowthFromWriterLevel,
    getDragonStage,
    getReaderDragonEffect
} from '../../modules/game/dragon/presentation';
import {
    getDiaryLevel,
    getReaderLevel,
    getReadingLevel,
    getWriterLevel
} from '../../constants/writerLevels';
import MasteryBadges from '../../modules/learning/MasteryBadges';
import useLearningMastery from '../../modules/learning/useLearningMastery';
import {
    FREE_WRITING_TYPE,
    SELF_WRITING_TYPES,
    getSelfWritingType
} from '../../modules/writing/selfWritingTypes';
import './TeacherStudentAgitViewer.css';

const TeacherStudentAgitPostDetail = lazy(() => import('./TeacherStudentAgitPostDetail'));

const OVERVIEW_TTL_MS = 60000;
const SHELF_TTL_MS = 30000;
const SHELF_LIMIT = 60;

const SHELF_SECTIONS = [
    {
        id: 'assignment', label: '과제 책장', icon: '📝', alwaysVisible: true,
        match: (post) => post.writing_context !== 'self'
    },
    {
        id: 'reading', label: SELF_WRITING_TYPES.reading_log.shelfTabLabel, icon: SELF_WRITING_TYPES.reading_log.icon, alwaysVisible: true,
        match: (post) => getSelfWritingType(post)?.id === 'reading_log'
    },
    {
        id: 'diary', label: SELF_WRITING_TYPES.diary.shelfTabLabel, icon: SELF_WRITING_TYPES.diary.icon, alwaysVisible: true,
        match: (post) => getSelfWritingType(post)?.id === 'diary'
    },
    {
        id: 'free', label: FREE_WRITING_TYPE.shelfTabLabel, icon: FREE_WRITING_TYPE.icon, alwaysVisible: false,
        match: (post) => getSelfWritingType(post)?.id === 'free'
    }
];

const formatNumber = (value) => Number(value || 0).toLocaleString('ko-KR');

const normalizeStudent = (raw, pointMap) => {
    const petData = raw?.pet_data || {};
    const writer = getWriterLevel(
        raw?.writer_total_chars,
        raw?.writer_completed_posts,
        raw?.writer_level_override
    );
    const reader = getReaderLevel(raw?.reader_score, raw?.reader_level_override);
    const diary = getDiaryLevel(raw?.diary_days);
    const reading = getReadingLevel(raw?.reading_log_count, raw?.reading_book_count);

    return {
        ...raw,
        id: raw?.student_id,
        petData,
        writer,
        reader,
        diary,
        reading,
        dragon: getDragonStage(writer.level, petData.species),
        growth: getDragonGrowthFromWriterLevel(writer),
        readerEffect: getReaderDragonEffect(reader.level),
        totalPoints: Number(pointMap.get(raw?.student_id) || 0),
        writerPosts: Number(raw?.writer_completed_posts || 0),
        writerChars: Number(raw?.writer_total_chars || 0),
        careerPosts: Number(raw?.career_posts || 0),
        careerChars: Number(raw?.career_chars || 0),
        readerScore: Number(raw?.reader_score || 0),
        diaryDays: Number(raw?.diary_days || 0),
        readingLogs: Number(raw?.reading_log_count || 0),
        readingBooks: Number(raw?.reading_book_count || 0)
    };
};

const TeacherStudentAgitViewer = ({
    activeClass,
    isMobile,
    navigationTarget,
    onNavigationHandled
}) => {
    const classId = activeClass?.id;
    const [students, setStudents] = useState([]);
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [shelf, setShelf] = useState([]);
    const [shelfLoading, setShelfLoading] = useState(false);
    const [shelfError, setShelfError] = useState('');
    const [activeShelfId, setActiveShelfId] = useState('assignment');
    const [refreshKey, setRefreshKey] = useState(0);
    const [selectedShelfSummary, setSelectedShelfSummary] = useState(null);
    const [selectedShelfPost, setSelectedShelfPost] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState('');
    const detailRequestRef = useRef(0);

    const overviewKey = useMemo(
        () => classKey(classId, 'teacher-student-agit-overview'),
        [classId]
    );

    const loadStudents = useCallback(async (forceRefresh = false) => {
        if (!classId) return;
        if (forceRefresh) dataCache.invalidate(overviewKey);

        setLoading(true);
        setErrorMessage('');
        try {
            const payload = await dataCache.get(overviewKey, async () => {
                const [dragonResult, pointResult] = await Promise.all([
                    supabase.rpc('get_teacher_dragon_growth_dashboard', { p_class_id: classId }),
                    supabase
                        .from('students')
                        .select('id, total_points')
                        .eq('class_id', classId)
                        .is('deleted_at', null)
                        .order('name')
                        .limit(100)
                ]);

                if (dragonResult.error) throw dragonResult.error;
                if (pointResult.error) throw pointResult.error;
                return {
                    dragonDashboard: dragonResult.data || {},
                    points: pointResult.data || []
                };
            }, OVERVIEW_TTL_MS);

            const pointMap = new Map(payload.points.map((student) => [student.id, student.total_points]));
            const normalized = (payload.dragonDashboard.students || [])
                .slice(0, 100)
                .map((student) => normalizeStudent(student, pointMap));

            setStudents(normalized);
            setSelectedStudentId((current) => (
                normalized.some((student) => student.id === current)
                    ? current
                    : (normalized[0]?.id || '')
            ));
        } catch (error) {
            console.error('학생 아지트 목록 조회 실패:', error.message);
            setStudents([]);
            setErrorMessage('학생 아지트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        } finally {
            setLoading(false);
        }
    }, [classId, overviewKey]);

    useEffect(() => {
        const timerId = window.setTimeout(() => loadStudents(), 0);
        return () => window.clearTimeout(timerId);
    }, [loadStudents]);

    useEffect(() => {
        if (navigationTarget?.kind !== 'student-agit' || !navigationTarget.studentId) return;
        setSelectedStudentId(navigationTarget.studentId);
        if (navigationTarget.requestId) onNavigationHandled?.(navigationTarget.requestId);
    }, [navigationTarget, onNavigationHandled]);

    useEffect(() => {
        if (!classId || !selectedStudentId) {
            setShelf([]);
            return undefined;
        }

        let active = true;
        const shelfKey = classKey(classId, 'teacher-student-agit-shelf', { student: selectedStudentId });
        const timerId = window.setTimeout(async () => {
            setShelfLoading(true);
            setShelfError('');
            try {
                const rows = await dataCache.get(shelfKey, async () => {
                    const { data, error } = await supabase
                        .from('student_posts')
                        .select('id, title, writing_context, self_writing_type, char_count, visibility, created_at, updated_at')
                        .eq('class_id', classId)
                        .eq('student_id', selectedStudentId)
                        .eq('is_submitted', true)
                        .order('created_at', { ascending: false })
                        .limit(SHELF_LIMIT);
                    if (error) throw error;
                    return data || [];
                }, SHELF_TTL_MS);

                if (active) setShelf(rows);
            } catch (error) {
                console.error('학생 아지트 책장 조회 실패:', error.message);
                if (active) {
                    setShelf([]);
                    setShelfError('이 학생의 책장을 불러오지 못했습니다.');
                }
            } finally {
                if (active) setShelfLoading(false);
            }
        }, 0);

        return () => {
            active = false;
            window.clearTimeout(timerId);
        };
    }, [classId, selectedStudentId, refreshKey]);

    const { contents: masteryContents, loading: masteryLoading } = useLearningMastery({
        viewer: 'teacher', studentId: selectedStudentId || null, active: Boolean(selectedStudentId)
    });

    const selectedStudent = useMemo(
        () => students.find((student) => student.id === selectedStudentId) || null,
        [selectedStudentId, students]
    );
    const filteredStudents = useMemo(() => {
        const query = search.trim().toLocaleLowerCase('ko-KR');
        return students.filter((student) => !query || student.name.toLocaleLowerCase('ko-KR').includes(query));
    }, [search, students]);
    const shelfSections = useMemo(() => SHELF_SECTIONS.map((section) => ({
        ...section,
        posts: shelf.filter(section.match)
    })).filter((section) => section.alwaysVisible || section.posts.length > 0), [shelf]);
    const activeShelf = shelfSections.find((section) => section.id === activeShelfId) || shelfSections[0];

    const closeShelfPost = useCallback(() => {
        detailRequestRef.current += 1;
        setSelectedShelfSummary(null);
        setSelectedShelfPost(null);
        setDetailError('');
        setDetailLoading(false);
    }, []);

    const openShelfPost = useCallback(async (summary, forceRefresh = false) => {
        if (!classId || !selectedStudentId || !summary?.id) return;

        const requestId = detailRequestRef.current + 1;
        detailRequestRef.current = requestId;
        const detailKey = classKey(classId, 'teacher-student-agit-shelf-detail', {
            student: selectedStudentId,
            post: summary.id
        });
        if (forceRefresh) dataCache.invalidate(detailKey);

        setSelectedShelfSummary(summary);
        setSelectedShelfPost(null);
        setDetailError('');
        setDetailLoading(true);

        try {
            const detail = await dataCache.get(detailKey, async () => {
                const { data, error } = await supabase
                    .from('student_posts')
                    .select('id, title, content, mission_id, writing_context, self_writing_type, char_count, visibility, created_at, updated_at, structured_content, original_title, original_content, is_confirmed')
                    .eq('class_id', classId)
                    .eq('student_id', selectedStudentId)
                    .eq('id', summary.id)
                    .eq('is_submitted', true)
                    .limit(1)
                    .maybeSingle();
                if (error) throw error;
                if (!data) throw new Error('글을 찾지 못했습니다.');
                return data;
            }, SHELF_TTL_MS);

            if (detailRequestRef.current === requestId) setSelectedShelfPost(detail);
        } catch (error) {
            console.error('학생 아지트 글 상세 조회 실패:', error.message);
            if (detailRequestRef.current === requestId) {
                setDetailError('이 글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
            }
        } finally {
            if (detailRequestRef.current === requestId) setDetailLoading(false);
        }
    }, [classId, selectedStudentId]);

    const refresh = () => {
        if (classId && selectedStudentId) {
            dataCache.invalidate(classKey(classId, 'teacher-student-agit-shelf', { student: selectedStudentId }));
        }
        setRefreshKey((current) => current + 1);
        loadStudents(true);
    };

    if (!classId) return null;

    return (
        <div className={`teacher-student-agit${isMobile ? ' is-mobile' : ''}`}>
            <header className="teacher-student-agit__header">
                <div>
                    <span>CLASS HIDEOUTS</span>
                    <h2>🏡 학생 아지트 보기</h2>
                    <p>학생이 꾸민 공간과 성장·책장을 읽기 전용으로 확인합니다.</p>
                </div>
                <div className="teacher-student-agit__header-actions">
                    <TeacherGuideButton tabId="student-agits" variant="help" />
                    <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={loading}>새로고침</Button>
                </div>
            </header>

            {loading ? (
                <div className="teacher-student-agit__state" role="status">학생 아지트를 모으는 중입니다… 🏡</div>
            ) : errorMessage ? (
                <div className="teacher-student-agit__state is-error">
                    <strong>{errorMessage}</strong>
                    <Button type="button" variant="outline" onClick={() => loadStudents(true)}>다시 시도</Button>
                </div>
            ) : students.length === 0 ? (
                <div className="teacher-student-agit__state">등록된 학생이 없습니다.</div>
            ) : (
                <div className="teacher-student-agit__layout">
                    <aside className="teacher-student-agit__roster" aria-label="학생 아지트 목록">
                        <div className="teacher-student-agit__roster-heading">
                            <div><strong>우리 반 아지트</strong><span>{students.length}명</span></div>
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="학생 이름 찾기"
                                aria-label="학생 아지트 이름 검색"
                            />
                        </div>
                        <div className="teacher-student-agit__student-list">
                            {filteredStudents.map((student) => (
                                <button
                                    key={student.id}
                                    type="button"
                                    className={selectedStudentId === student.id ? 'is-selected' : ''}
                                    onClick={() => setSelectedStudentId(student.id)}
                                >
                                    <span className="teacher-student-agit__student-icon" aria-hidden="true">🏡</span>
                                    <span>
                                        <strong>{student.name}</strong>
                                        <small>{student.writer.emoji} {student.writer.name} · {formatNumber(student.totalPoints)}P</small>
                                    </span>
                                    <i aria-hidden="true">›</i>
                                </button>
                            ))}
                            {filteredStudents.length === 0 && <p>조건에 맞는 학생이 없습니다.</p>}
                        </div>
                    </aside>

                    {selectedStudent && (
                        <main className="teacher-student-agit__preview" aria-label={`${selectedStudent.name} 학생 아지트`}>
                            <div className="teacher-student-agit__preview-heading">
                                <div>
                                    <span>교사 읽기 전용</span>
                                    <h3>{selectedStudent.name}의 아지트</h3>
                                </div>
                                <small>학생의 글·포인트·꾸미기는 이 화면에서 바뀌지 않습니다.</small>
                            </div>

                            <div className="teacher-student-agit__overview">
                                <section className="teacher-student-agit__room" aria-label="학생이 꾸민 수호룡 방">
                                    <div className="teacher-student-agit__section-heading">
                                        <div><small>DRAGON HIDEOUT</small><h4>수호룡 아지트</h4></div>
                                        <span>{selectedStudent.petData.name || '작가 수호룡'} · {selectedStudent.readerEffect.name}</span>
                                    </div>
                                    <DragonHideoutScene
                                        petData={selectedStudent.petData}
                                        dragon={selectedStudent.dragon}
                                        readerLevel={selectedStudent.reader.level}
                                        ownerName={selectedStudent.name}
                                        compact
                                        eager
                                    />
                                </section>

                                <div className="teacher-student-agit__overview-details">
                                    <section className="teacher-student-agit__growth" aria-label={`${selectedStudent.name} 성장 상태`}>
                                        <div className="teacher-student-agit__growth-top">
                                            <div><small>성장 상태</small><strong>{selectedStudent.name}의 칭호</strong></div>
                                            <div className="teacher-student-agit__points"><span>★</span><div><small>보유 포인트</small><strong>{formatNumber(selectedStudent.totalPoints)}P</strong></div></div>
                                        </div>
                                        <div className="teacher-student-agit__badges">
                                            <div><span>{selectedStudent.writer.emoji}</span><small>작가 칭호</small><strong>Lv.{selectedStudent.writer.level} {selectedStudent.writer.name}</strong></div>
                                            <div><span>{selectedStudent.reader.emoji}</span><small>소통 칭호</small><strong>Lv.{selectedStudent.reader.level} {selectedStudent.reader.name}</strong></div>
                                            <div><span>{selectedStudent.diary.emoji}</span><small>기록가 칭호</small><strong>Lv.{selectedStudent.diary.level} {selectedStudent.diary.name}</strong></div>
                                            <div><span>{selectedStudent.reading.emoji}</span><small>독서가 칭호</small><strong>Lv.{selectedStudent.reading.level} {selectedStudent.reading.name}</strong></div>
                                        </div>
                                        {/* 학습 성취 — 교사는 학생 본인과 같은 범위(진행도 포함)를 본다. */}
                                        <MasteryBadges
                                            contents={masteryContents}
                                            loading={masteryLoading}
                                            emptyText="아직 도전한 기록이 없어요."
                                        />
                                    </section>
                                    <section className="teacher-student-agit__stats" aria-label={`${selectedStudent.name} 활동 요약`}>
                                        <div><small>작가 칭호 인정 글</small><strong>{formatNumber(selectedStudent.writerPosts)}편</strong></div>
                                        <div><small>작가 칭호 글자</small><strong>{formatNumber(selectedStudent.writerChars)}자</strong></div>
                                        <div><small>일기 기록일</small><strong>{formatNumber(selectedStudent.diaryDays)}일</strong></div>
                                        <div><small>독서록·서로 다른 책</small><strong>{formatNumber(selectedStudent.readingLogs)}편 · {formatNumber(selectedStudent.readingBooks)}권</strong></div>
                                        <div><small>전체 보관 기록</small><strong>{formatNumber(selectedStudent.careerPosts)}편</strong></div>
                                        <div><small>소통 활동</small><strong>{formatNumber(selectedStudent.readerScore)}점</strong></div>
                                    </section>
                                </div>
                            </div>

                            <section className="teacher-student-agit__shelf" aria-label={`${selectedStudent.name}의 서재`}>
                                <div className="teacher-student-agit__section-heading">
                                    <div><small>WRITING SHELF</small><h4>📖 내 서재</h4></div>
                                    <span>최근 완성 글 {shelf.length}편{ shelf.length === SHELF_LIMIT ? '까지' : ''}</span>
                                </div>
                                <div className="teacher-student-agit__shelf-tabs" role="tablist" aria-label="학생 책장 종류">
                                    {shelfSections.map((section) => (
                                        <button
                                            key={section.id}
                                            type="button"
                                            role="tab"
                                            aria-selected={activeShelf?.id === section.id}
                                            className={activeShelf?.id === section.id ? 'is-active' : ''}
                                            onClick={() => setActiveShelfId(section.id)}
                                        >
                                            {section.icon} {section.label} <strong>{section.posts.length}</strong>
                                        </button>
                                    ))}
                                </div>
                                {shelfLoading ? (
                                    <div className="teacher-student-agit__shelf-state">책장을 정리하는 중…</div>
                                ) : shelfError ? (
                                    <div className="teacher-student-agit__shelf-state is-error">{shelfError}</div>
                                ) : activeShelf?.posts.length ? (
                                    <div className="teacher-student-agit__books" aria-label={`${activeShelf.label} 글 목록`}>
                                        {activeShelf.posts.map((post, index) => (
                                            <button
                                                key={post.id}
                                                type="button"
                                                className={`teacher-student-agit__book is-variant-${index % 4}`}
                                                title={`${post.title || '제목 없는 글'} · ${formatNumber(post.char_count)}자`}
                                                aria-label={`${post.title || '제목 없는 글'} 읽기`}
                                                onClick={() => openShelfPost(post)}
                                            >
                                                <span>{post.title || '제목 없는 글'}</span>
                                                {post.visibility !== 'class' && <i aria-label="친구에게 비공개">🔒</i>}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="teacher-student-agit__shelf-state">이 책장에는 완성한 글이 없습니다.</div>
                                )}
                            </section>
                        </main>
                    )}
                </div>
            )}

            {selectedShelfSummary && (
                <Suspense fallback={(
                    <ModalPortal>
                        <div style={{ position: 'fixed', zIndex: 3400, inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(255,253,248,.96)', color: '#78695e', fontWeight: 900 }} role="status">
                            글 읽기 화면을 준비하는 중… 📖
                        </div>
                    </ModalPortal>
                )}>
                    <TeacherStudentAgitPostDetail
                        key={selectedShelfSummary.id}
                        studentName={selectedStudent?.name}
                        summary={selectedShelfSummary}
                        post={selectedShelfPost}
                        loading={detailLoading}
                        errorMessage={detailError}
                        onClose={closeShelfPost}
                        onRetry={() => openShelfPost(selectedShelfSummary, true)}
                    />
                </Suspense>
            )}
        </div>
    );
};

export default TeacherStudentAgitViewer;
