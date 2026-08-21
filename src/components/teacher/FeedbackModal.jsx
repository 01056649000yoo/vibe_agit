import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import {
    CORRECTION_PLACES,
    FEEDBACK_CATEGORIES,
    buildFeedbackContent,
    buildFeedbackContext,
    buildFeedbackTitle,
    describeFeedbackCategory,
    describeFeedbackStatus
} from '../../modules/feedback/feedbackCategories';
import '../../modules/feedback/feedbackModal.css';

const EMPTY_FIELDS = {
    place: '', wrong: '', right: '',   // 내용 정정
    tried: '', happened: '',           // 오류
    title: '', content: '',            // 자유 서술
    note: ''
};

const formatWhen = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
};

/*
 * 선생님 제보 창.
 *
 * 예전에는 제목·내용 두 칸이 백지였고, 보낸 뒤에는 읽혔는지도 알 수 없었다.
 * 그래서 선생님 203명 중 제보가 0건이었다(2026-08-21 확인). 세 가지를 바꿨다.
 *   ① 무엇에 대한 말인지 먼저 고르면 물어볼 칸이 정해진다. **제목은 앱이 만든다.**
 *   ② 어느 화면·어느 기기였는지 앱이 함께 담는다(학생 개인정보는 담지 않는다).
 *   ③ `내가 보낸 것` 에서 관리자 답장을 본다. 이게 없으면 아무도 두 번 보내지 않는다.
 */
const FeedbackModal = ({ isOpen, onClose, onRepliesSeen }) => {
    const [tab, setTab] = useState('write');
    const [categoryId, setCategoryId] = useState(null);
    const [fields, setFields] = useState(EMPTY_FIELDS);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [reports, setReports] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const category = categoryId ? describeFeedbackCategory(categoryId) : null;
    const setField = (key, value) => setFields((current) => ({ ...current, [key]: value }));

    const unreadReplies = useMemo(
        () => reports.filter((item) => item.admin_reply
            && (!item.reply_seen_at || new Date(item.reply_seen_at) < new Date(item.replied_at))).length,
        [reports]
    );

    const loadReports = useCallback(async () => {
        setHistoryLoading(true);
        const { data, error } = await supabase.rpc('get_my_feedback_reports_v1');
        if (error) console.error('내 제보 불러오기 실패:', error.message);
        setReports(Array.isArray(data) ? data : []);
        setHistoryLoading(false);
    }, []);

    // 창을 열 때 한 번만 읽는다. 폴링하지 않는다.
    useEffect(() => {
        if (!isOpen) return;
        void loadReports();
    }, [isOpen, loadReports]);

    /*
     * `내가 보낸 것` 을 실제로 연 순간에만 읽음으로 표시한다.
     * 창을 열자마자 표시하면, 답장을 못 본 채 배지만 사라진다.
     */
    useEffect(() => {
        if (!isOpen || tab !== 'history' || unreadReplies === 0) return undefined;
        let active = true;
        const markSeen = async () => {
            const { error } = await supabase.rpc('mark_my_feedback_replies_seen_v1');
            if (error) { console.error('답장 읽음 표시 실패:', error.message); return; }
            if (!active) return;
            onRepliesSeen?.();
            void loadReports();
        };
        void markSeen();
        return () => { active = false; };
    }, [isOpen, tab, unreadReplies, loadReports, onRepliesSeen]);

    const resetForm = () => {
        setCategoryId(null);
        setFields(EMPTY_FIELDS);
    };

    // 종류마다 꼭 있어야 하는 칸이 다르다. 보내기 전에 화면에서 먼저 본다.
    const missingField = (() => {
        if (!categoryId) return '종류를 먼저 골라 주세요.';
        if (category.shape === 'correction') {
            if (!fields.wrong.trim()) return '틀린 내용을 적어 주세요.';
            if (!fields.right.trim()) return '어떻게 고치면 좋을지 적어 주세요.';
            return '';
        }
        if (category.shape === 'bug') {
            if (!fields.tried.trim()) return '무엇을 하려던 중이었는지 적어 주세요.';
            if (!fields.happened.trim()) return '어떻게 됐는지 적어 주세요.';
            return '';
        }
        if (!fields.title.trim()) return '한 줄 요약을 적어 주세요.';
        if (!fields.content.trim()) return '자세한 내용을 적어 주세요.';
        return '';
    })();

    const handleSubmit = async () => {
        if (missingField) { alert(missingField); return; }

        setIsSubmitting(true);
        try {
            const { data, error } = await supabase.rpc('submit_teacher_feedback_v2', {
                p_category: categoryId,
                p_title: buildFeedbackTitle(categoryId, fields),
                p_content: buildFeedbackContent(categoryId, fields),
                p_context: buildFeedbackContext({ category: categoryId })
            });
            if (error || !data?.feedback_id) throw error || new Error('접수 결과가 없습니다.');

            // 알림 메일은 실패해도 제보 자체는 접수된 것이므로 막지 않는다.
            supabase.functions.invoke('send-feedback', { body: { feedbackId: data.feedback_id } })
                .then(({ error: mailError }) => { if (mailError) console.error('알림 메일 실패:', mailError); });

            resetForm();
            await loadReports();
            setTab('history');
        } catch (error) {
            console.error('제보 전송 실패:', error);
            alert(error?.message || '보내는 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="feedback-modal-backdrop" onClick={onClose}>
                <motion.div
                    className="feedback-modal"
                    initial={{ opacity: 0, scale: .96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: .96 }}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="feedback-modal__header">
                        <div>
                            <h3>🐞 오류·정정 알려주기</h3>
                            <p>
                                잘못된 낱말이나 안 되는 기능을 알려 주시면 고칩니다.
                                확인하면 이 창에 답을 남겨 드려요.
                            </p>
                        </div>
                    </div>

                    <div className="feedback-modal__tabs">
                        <button
                            type="button"
                            className={`feedback-modal__tab${tab === 'write' ? ' is-active' : ''}`}
                            onClick={() => setTab('write')}
                        >
                            알려주기
                        </button>
                        <button
                            type="button"
                            className={`feedback-modal__tab${tab === 'history' ? ' is-active' : ''}`}
                            onClick={() => setTab('history')}
                        >
                            내가 보낸 것
                            {reports.length > 0 && ` ${reports.length}`}
                            {unreadReplies > 0 && <span className="feedback-modal__badge">답장 {unreadReplies}</span>}
                        </button>
                    </div>

                    <div className="feedback-modal__body">
                        {tab === 'write' && !categoryId && (
                            <div className="feedback-choices">
                                {FEEDBACK_CATEGORIES.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className="feedback-choice"
                                        onClick={() => setCategoryId(item.id)}
                                    >
                                        <span className="feedback-choice__icon">{item.icon}</span>
                                        <span>
                                            <strong>{item.label}</strong>
                                            <small>{item.hint}</small>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {tab === 'write' && categoryId && (
                            <div className="feedback-form">
                                <div className="feedback-form__picked">
                                    <span>{category.icon} {category.label}</span>
                                    <button type="button" className="feedback-form__change" onClick={resetForm}>
                                        다시 고르기
                                    </button>
                                </div>

                                {category.shape === 'correction' && (
                                    <>
                                        <div className="feedback-field">
                                            <label htmlFor="feedback-place">어디에서 보셨나요?</label>
                                            <select
                                                id="feedback-place"
                                                value={fields.place}
                                                onChange={(event) => setField('place', event.target.value)}
                                            >
                                                <option value="">고르지 않음</option>
                                                {CORRECTION_PLACES.map((place) => (
                                                    <option key={place} value={place}>{place}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="feedback-field">
                                            <label htmlFor="feedback-wrong">틀린 내용</label>
                                            <textarea
                                                id="feedback-wrong"
                                                value={fields.wrong}
                                                onChange={(event) => setField('wrong', event.target.value)}
                                                placeholder="예: 3학년 2번 덱의 가늠하다 뜻풀이"
                                            />
                                        </div>
                                        <div className="feedback-field">
                                            <label htmlFor="feedback-right">이렇게 고치면 좋겠어요</label>
                                            <textarea
                                                id="feedback-right"
                                                value={fields.right}
                                                onChange={(event) => setField('right', event.target.value)}
                                                placeholder="예: 목표나 기준에 맞고 안 맞음을 헤아리다 가 맞습니다"
                                            />
                                        </div>
                                    </>
                                )}

                                {category.shape === 'bug' && (
                                    <>
                                        <div className="feedback-field">
                                            <label htmlFor="feedback-tried">무엇을 하려던 중이었나요?</label>
                                            <textarea
                                                id="feedback-tried"
                                                value={fields.tried}
                                                onChange={(event) => setField('tried', event.target.value)}
                                                placeholder="예: 학생 명단에서 전학생을 추가하려고 했어요"
                                            />
                                        </div>
                                        <div className="feedback-field">
                                            <label htmlFor="feedback-happened">어떻게 됐나요?</label>
                                            <textarea
                                                id="feedback-happened"
                                                value={fields.happened}
                                                onChange={(event) => setField('happened', event.target.value)}
                                                placeholder="예: 저장을 눌러도 아무 일도 일어나지 않았어요"
                                            />
                                        </div>
                                    </>
                                )}

                                {category.shape === 'free' && (
                                    <>
                                        <div className="feedback-field">
                                            <label htmlFor="feedback-title">한 줄 요약</label>
                                            <input
                                                id="feedback-title"
                                                type="text"
                                                value={fields.title}
                                                onChange={(event) => setField('title', event.target.value)}
                                                maxLength={100}
                                            />
                                        </div>
                                        <div className="feedback-field">
                                            <label htmlFor="feedback-content">자세한 내용</label>
                                            <textarea
                                                id="feedback-content"
                                                value={fields.content}
                                                onChange={(event) => setField('content', event.target.value)}
                                                maxLength={4000}
                                            />
                                        </div>
                                    </>
                                )}

                                {category.shape !== 'free' && (
                                    <div className="feedback-field">
                                        <label htmlFor="feedback-note">더 알려주실 것 (없으면 비워 두세요)</label>
                                        <input
                                            id="feedback-note"
                                            type="text"
                                            value={fields.note}
                                            onChange={(event) => setField('note', event.target.value)}
                                            maxLength={200}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {tab === 'history' && (
                            <div className="feedback-history">
                                {historyLoading && <div className="feedback-history__empty">불러오는 중...</div>}
                                {!historyLoading && reports.length === 0 && (
                                    <div className="feedback-history__empty">
                                        아직 보내신 것이 없어요.<br />
                                        잘못된 낱말이나 안 되는 기능을 발견하시면 알려 주세요.
                                    </div>
                                )}
                                {!historyLoading && reports.map((item) => {
                                    const itemCategory = describeFeedbackCategory(item.category);
                                    const status = describeFeedbackStatus(item.status);
                                    return (
                                        <div key={item.id} className="feedback-item">
                                            <div className="feedback-item__top">
                                                <span className="feedback-item__title">
                                                    {itemCategory.icon} {item.title}
                                                </span>
                                                <span className={`feedback-item__status is-${status.tone}`}>
                                                    {status.label}
                                                </span>
                                            </div>
                                            <div className="feedback-item__meta">{formatWhen(item.created_at)} 보냄</div>
                                            <p className="feedback-item__body">{item.content}</p>
                                            {item.admin_reply && (
                                                <div className="feedback-item__reply">
                                                    <strong>💬 답장</strong>
                                                    <p>{item.admin_reply}</p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="feedback-modal__footer">
                        <span className="feedback-modal__note">
                            어느 화면에서 보내셨는지가 함께 담깁니다. 학생 정보는 담기지 않아요.
                        </span>
                        <div className="feedback-modal__actions">
                            <Button variant="ghost" onClick={onClose}>닫기</Button>
                            {tab === 'write' && categoryId && (
                                <Button onClick={handleSubmit} disabled={isSubmitting}>
                                    {isSubmitting ? '보내는 중...' : '보내기'}
                                </Button>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default FeedbackModal;
