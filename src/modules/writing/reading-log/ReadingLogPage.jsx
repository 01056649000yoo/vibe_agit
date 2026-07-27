import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Card from '../../../components/common/Card';
import Button from '../../../components/common/Button';
import WritingEditorFields from '../../../components/writing/WritingEditorFields';
import { supabase } from '../../../lib/supabaseClient';
import { countContentChars } from '../../../lib/textMetrics';

const EMPTY_FORM = {
    title: '',
    bookTitle: '',
    bookAuthor: '',
    content: '',
    visibility: 'private'
};

const formatDate = (value) => {
    if (!value) return '';
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(new Date(value));
};

const ReadingLogEditor = ({ studentSession, postId, onDone, onCancel }) => {
    const [form, setForm] = useState(EMPTY_FORM);
    const [initialForm, setInitialForm] = useState(EMPTY_FORM);
    const [loading, setLoading] = useState(Boolean(postId));
    const [saving, setSaving] = useState(false);
    const isMobile = window.innerWidth <= 768;
    const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

    useEffect(() => {
        if (!postId) return;

        let active = true;
        const loadPost = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('student_posts')
                .select('id, title, content, structured_content, visibility')
                .eq('id', postId)
                .eq('student_id', studentSession.id)
                .eq('writing_context', 'self')
                .eq('self_writing_type', 'reading_log')
                .maybeSingle();

            if (!active) return;
            if (error || !data) {
                alert('독서록을 불러오지 못했습니다.');
                onCancel();
                return;
            }

            const loadedForm = {
                title: data.title || '',
                bookTitle: data.structured_content?.bookTitle || '',
                bookAuthor: data.structured_content?.bookAuthor || '',
                content: data.content || '',
                visibility: data.visibility === 'class' ? 'class' : 'private'
            };
            setForm(loadedForm);
            setInitialForm(loadedForm);
            setLoading(false);
        };

        loadPost();
        return () => {
            active = false;
        };
    }, [onCancel, postId, studentSession.id]);

    useEffect(() => {
        const warnBeforeLeaving = (event) => {
            if (!isDirty || saving) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warnBeforeLeaving);
        return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
    }, [isDirty, saving]);

    const updateForm = (key, value) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    const handleCancel = () => {
        if (isDirty && !window.confirm('아직 저장하지 않은 내용이 있어요. 독서록 목록으로 나갈까요?')) return;
        onCancel();
    };

    const handleSave = async () => {
        if (!form.bookTitle.trim()) {
            alert('읽은 책의 제목을 적어주세요. 📖');
            return;
        }
        if (!form.title.trim()) {
            alert('독서록 제목을 적어주세요. ✍️');
            return;
        }
        if (!form.content.trim()) {
            alert('책을 읽고 떠오른 생각을 적어주세요. 💭');
            return;
        }

        setSaving(true);
        const payload = {
            title: form.title.trim(),
            content: form.content,
            char_count: countContentChars(form.content),
            paragraph_count: form.content.split(/\n+/).filter((line) => line.trim()).length,
            structured_content: {
                type: 'reading_log',
                bookTitle: form.bookTitle.trim(),
                bookAuthor: form.bookAuthor.trim()
            },
            visibility: form.visibility,
            is_submitted: true
        };

        let result;
        if (postId) {
            result = await supabase
                .from('student_posts')
                .update(payload)
                .eq('id', postId)
                .eq('student_id', studentSession.id)
                .eq('writing_context', 'self')
                .eq('self_writing_type', 'reading_log')
                .select('id')
                .single();
        } else {
            result = await supabase
                .from('student_posts')
                .insert({
                    ...payload,
                    student_id: studentSession.id,
                    mission_id: null,
                    writing_context: 'self',
                    self_writing_type: 'reading_log'
                })
                .select('id')
                .single();
        }

        setSaving(false);
        if (result.error) {
            console.error('독서록 저장 실패:', result.error.message);
            alert('독서록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
            return;
        }

        setInitialForm(form);
        alert(form.visibility === 'class'
            ? '독서록을 저장하고 친구 아지트 책장에 공개했어요! 📚'
            : '나만 보는 독서록으로 저장했어요! 🔒');
        onDone();
    };

    if (loading) {
        return <Card><p style={{ textAlign: 'center', padding: '40px' }}>독서록을 펼치는 중... 📖</p></Card>;
    }

    return (
        <Card style={{
            maxWidth: '900px',
            margin: '20px auto 50px',
            padding: isMobile ? '22px 18px' : '36px',
            border: 'none',
            boxShadow: '0 15px 40px rgba(0,0,0,0.08)'
        }}>
            <div className="reading-log-editor-header">
                <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>⬅️ 나가기</Button>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#2E7D32', fontWeight: 900, fontSize: '0.82rem' }}>📚 나의 독서록</div>
                    <h2 style={{ margin: '6px 0 0', color: '#263238' }}>{postId ? '독서록 다듬기' : '새 독서록 쓰기'}</h2>
                </div>
            </div>

            <section style={{
                padding: isMobile ? '20px' : '28px',
                borderRadius: '22px',
                background: '#F1F8E9',
                border: '1px solid #DCEDC8',
                marginBottom: '28px'
            }}>
                <h3 style={{ margin: '0 0 18px', color: '#33691E', fontSize: '1.1rem' }}>먼저 책을 알려주세요</h3>
                <div className="reading-log-book-fields">
                    <label>
                        <span>책 제목 *</span>
                        <input
                            value={form.bookTitle}
                            onChange={(event) => updateForm('bookTitle', event.target.value)}
                            placeholder="읽은 책의 제목"
                            disabled={saving}
                        />
                    </label>
                    <label>
                        <span>지은이</span>
                        <input
                            value={form.bookAuthor}
                            onChange={(event) => updateForm('bookAuthor', event.target.value)}
                            placeholder="책을 쓴 사람"
                            disabled={saving}
                        />
                    </label>
                </div>
            </section>

            <section style={{
                padding: isMobile ? '28px 20px' : '44px 54px',
                borderRadius: '28px',
                border: '2px solid #F1F3F5',
                boxShadow: '0 18px 45px rgba(0,0,0,0.04)'
            }}>
                <WritingEditorFields
                    title={form.title}
                    onTitleChange={(value) => updateForm('title', value)}
                    content={form.content}
                    onContentChange={(value) => updateForm('content', value)}
                    titlePlaceholder="독서록 제목을 적어주세요..."
                    contentPlaceholder={'책에서 기억에 남는 장면, 새롭게 알게 된 점, 내 생각을 자유롭게 적어보세요...'}
                    disabled={saving}
                    isMobile={isMobile}
                    contentMinHeight={420}
                />
            </section>

            <label className={`reading-log-visibility ${form.visibility === 'class' ? 'is-public' : ''}`}>
                <input
                    type="checkbox"
                    checked={form.visibility === 'class'}
                    onChange={(event) => updateForm('visibility', event.target.checked ? 'class' : 'private')}
                    disabled={saving}
                />
                <span style={{ fontSize: '1.6rem' }}>{form.visibility === 'class' ? '📚' : '🔒'}</span>
                <span>
                    <strong>{form.visibility === 'class' ? '친구 아지트 책장에 공개' : '나만 보기'}</strong>
                    <small>{form.visibility === 'class' ? '친구들이 읽고 반응과 댓글을 남길 수 있어요.' : '처음에는 나만 볼 수 있어요. 원할 때 공개할 수 있어요.'}</small>
                </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px' }}>
                <Button variant="ghost" onClick={handleCancel} disabled={saving}>취소</Button>
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? '저장하는 중...' : '독서록 저장하기 💾'}
                </Button>
            </div>

            <style>{`
                .reading-log-editor-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px; }
                .reading-log-book-fields { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
                .reading-log-book-fields label { display:flex; flex-direction:column; gap:8px; color:#558B2F; font-weight:800; }
                .reading-log-book-fields input { width:100%; box-sizing:border-box; padding:13px 14px; border:1px solid #C5E1A5; border-radius:12px; background:white; font:inherit; outline:none; }
                .reading-log-book-fields input:focus { border-color:#7CB342; box-shadow:0 0 0 3px rgba(124,179,66,.12); }
                .reading-log-visibility { display:flex; align-items:center; gap:14px; margin-top:24px; padding:18px 20px; border:2px solid #E0E0E0; border-radius:18px; cursor:pointer; background:#FAFAFA; }
                .reading-log-visibility.is-public { border-color:#81C784; background:#F1F8E9; }
                .reading-log-visibility input { width:20px; height:20px; accent-color:#43A047; }
                .reading-log-visibility span:last-child { display:flex; flex-direction:column; gap:4px; color:#37474F; }
                .reading-log-visibility small { color:#78909C; font-weight:500; }
                @media (max-width: 640px) {
                    .reading-log-book-fields { grid-template-columns:1fr; }
                    .reading-log-editor-header h2 { font-size:1.25rem; }
                }
            `}</style>
        </Card>
    );
};

const ReadingLogPage = ({ studentSession, params = {}, onBack, onNavigate }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const isEditing = params.mode === 'editor';

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('student_posts')
            .select('id, title, content, structured_content, visibility, published_at, created_at, updated_at')
            .eq('student_id', studentSession.id)
            .eq('writing_context', 'self')
            .eq('self_writing_type', 'reading_log')
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('독서록 목록 로드 실패:', error.message);
            setLogs([]);
        } else {
            setLogs(data || []);
        }
        setLoading(false);
    }, [studentSession.id]);

    useEffect(() => {
        if (isEditing) return undefined;
        const timerId = window.setTimeout(fetchLogs, 0);
        return () => window.clearTimeout(timerId);
    }, [fetchLogs, isEditing]);

    const openList = useCallback(() => {
        onNavigate('reading_logs');
    }, [onNavigate]);

    const handleDelete = async (log) => {
        if (!window.confirm(`「${log.title || '제목 없는 독서록'}」을 삭제할까요? 삭제하면 되돌릴 수 없어요.`)) return;
        const { error } = await supabase
            .from('student_posts')
            .delete()
            .eq('id', log.id)
            .eq('student_id', studentSession.id)
            .eq('writing_context', 'self');
        if (error) {
            alert('독서록을 삭제하지 못했습니다.');
            return;
        }
        setLogs((current) => current.filter((item) => item.id !== log.id));
    };

    const counts = useMemo(() => ({
        total: logs.length,
        public: logs.filter((log) => log.visibility === 'class').length
    }), [logs]);

    if (isEditing) {
        return (
            <ReadingLogEditor
                studentSession={studentSession}
                postId={params.postId}
                onDone={openList}
                onCancel={openList}
            />
        );
    }

    return (
        <div className="reading-log-page">
            <div className="reading-log-list-header">
                <div>
                    <Button variant="ghost" size="sm" onClick={onBack}>⬅️ 홈으로</Button>
                    <h1>📚 나의 독서록</h1>
                    <p>읽은 책과 떠오른 생각을 차곡차곡 모아보세요.</p>
                </div>
                <Button onClick={() => onNavigate('reading_logs', { mode: 'editor' })}>새 독서록 쓰기 ✍️</Button>
            </div>

            <div className="reading-log-summary">
                <span><strong>{counts.total}</strong>권의 독서 발자국</span>
                <span><strong>{counts.public}</strong>개를 친구들과 나눔</span>
            </div>

            {loading ? (
                <Card><p style={{ textAlign: 'center', padding: '42px' }}>내 책장을 정리하는 중... 📖</p></Card>
            ) : logs.length === 0 ? (
                <Card style={{ textAlign: 'center', padding: '64px 24px', border: '2px dashed #C5E1A5' }}>
                    <div style={{ fontSize: '4rem' }}>📗</div>
                    <h2 style={{ color: '#33691E' }}>아직 독서록이 없어요</h2>
                    <p style={{ color: '#78909C', marginBottom: '24px' }}>처음에는 나만 보이게 저장돼요. 준비되면 친구 책장에 공개할 수 있어요.</p>
                    <Button onClick={() => onNavigate('reading_logs', { mode: 'editor' })}>첫 독서록 쓰기</Button>
                </Card>
            ) : (
                <div className="reading-log-grid">
                    {logs.map((log, index) => (
                        <motion.article
                            key={log.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(index * 0.04, 0.24) }}
                            className="reading-log-card"
                        >
                            <div className="reading-log-card-top">
                                <span className={log.visibility === 'class' ? 'public' : 'private'}>
                                    {log.visibility === 'class' ? '📚 친구 공개' : '🔒 나만 보기'}
                                </span>
                                <small>{formatDate(log.updated_at || log.created_at)}</small>
                            </div>
                            <div className="reading-log-book-name">📖 {log.structured_content?.bookTitle || '책 제목 없음'}</div>
                            {log.structured_content?.bookAuthor && <div className="reading-log-author">지은이 {log.structured_content.bookAuthor}</div>}
                            <h2>{log.title || '제목 없는 독서록'}</h2>
                            <p>{log.content || '아직 내용이 없어요.'}</p>
                            <div className="reading-log-card-actions">
                                <Button size="sm" onClick={() => onNavigate('reading_logs', { mode: 'editor', postId: log.id })}>열어보기</Button>
                                <Button variant="ghost" size="sm" onClick={() => handleDelete(log)}>삭제</Button>
                            </div>
                        </motion.article>
                    ))}
                </div>
            )}

            <style>{`
                .reading-log-page { width:min(1080px, calc(100% - 32px)); margin:24px auto 70px; }
                .reading-log-list-header { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:24px; }
                .reading-log-list-header h1 { margin:22px 0 8px; color:#263238; font-size:2rem; }
                .reading-log-list-header p { margin:0; color:#78909C; }
                .reading-log-summary { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:22px; }
                .reading-log-summary span { padding:9px 14px; border-radius:999px; background:#F1F8E9; color:#558B2F; font-size:.9rem; }
                .reading-log-summary strong { font-size:1.1rem; margin-right:3px; }
                .reading-log-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:20px; }
                .reading-log-card { display:flex; flex-direction:column; min-height:300px; padding:24px; border:1px solid #E8E8E8; border-top:7px solid #8BC34A; border-radius:18px 18px 24px 24px; background:white; box-shadow:0 10px 28px rgba(51,105,30,.08); }
                .reading-log-card-top { display:flex; justify-content:space-between; align-items:center; gap:12px; }
                .reading-log-card-top span { padding:5px 9px; border-radius:9px; font-size:.75rem; font-weight:900; }
                .reading-log-card-top .public { background:#E8F5E9; color:#2E7D32; }
                .reading-log-card-top .private { background:#ECEFF1; color:#546E7A; }
                .reading-log-card-top small { color:#90A4AE; }
                .reading-log-book-name { margin-top:22px; color:#558B2F; font-weight:900; }
                .reading-log-author { color:#9E9E9E; font-size:.82rem; margin-top:5px; }
                .reading-log-card h2 { margin:14px 0 10px; color:#263238; font-size:1.25rem; }
                .reading-log-card p { display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; white-space:pre-wrap; color:#607D8B; line-height:1.65; margin:0 0 20px; }
                .reading-log-card-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:auto; }
                @media (max-width: 720px) {
                    .reading-log-page { width:min(100% - 24px, 1080px); margin-top:14px; }
                    .reading-log-list-header { align-items:stretch; flex-direction:column; }
                    .reading-log-list-header > button { width:100%; }
                    .reading-log-grid { grid-template-columns:1fr; }
                }
            `}</style>
        </div>
    );
};

export default ReadingLogPage;
