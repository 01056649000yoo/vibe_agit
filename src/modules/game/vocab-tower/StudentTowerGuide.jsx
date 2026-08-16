import React, { useState } from 'react';
import Modal from '../../../components/common/Modal';
import ModalPortal from '../../../components/common/ModalPortal';
import GuideInfoButton from '../../../components/common/GuideInfoButton';

/**
 * 학생용 어휘의 탑 안내.
 *
 * 학생이 화면만 보고는 알 수 없는 두 가지를 설명한다.
 *   1) 포인트를 언제 받는가 — 한 판을 다 맞혀서가 아니라 익힌 낱말이 늘어야 받는다.
 *   2) `익힘`이 왜 한 번에 안 되는가 — 서로 다른 두 형태를 연속으로 맞혀야 한다.
 * 기능을 나열하지 않고 오해하기 쉬운 것만 담는다(교사 도움말과 같은 기준).
 *
 * 창은 `ModalPortal` 로 띄운다. 지도 카드가 자기 쌓임 맥락을 만들기 때문에
 * 그 안에서 그리면 창이 다른 요소에 덮인다.
 */
const GUIDE_SECTIONS = [
    {
        icon: '🗺️',
        title: '어느 층이든 골라서 연습해요',
        lines: [
            '탑은 10개 층이고 층마다 낱말이 40개쯤 있어요.',
            '1층부터 차례로 갈 필요 없어요. 지도에서 원하는 층을 골라 12문제씩 풀면 돼요.'
        ]
    },
    {
        icon: '🌱',
        title: '낱말은 네 가지 상태로 자라요',
        lines: [
            '처음 볼 낱말 → 연습 중 → 완전히 익힘 순서로 자라요.',
            '틀린 낱말은 다시 볼 낱말이 되고, 다음 연습에서 먼저 만나요.',
            '한 번 맞혔다고 바로 익힘이 되지는 않아요. 서로 다른 두 가지 문제를 연달아 맞혀야 익힘이에요.'
        ]
    },
    {
        icon: '✍️',
        title: '잘하면 문제가 조금 어려워져요',
        lines: [
            '처음 만나는 낱말은 보기 중에서 고르면 돼요.',
            '한 번 맞힌 낱말은 다음에 보기 없이 직접 써 보게 돼요. 실력이 늘었다는 뜻이에요.',
            '직접 쓰다가 틀려도 점수가 깎이지 않아요. 다시 보기 중에서 고르는 문제로 만나요.'
        ]
    },
    {
        icon: '🔁',
        title: '틀린 낱말은 그 자리에서 다시 만나요',
        lines: [
            '한 연습에서 틀린 낱말은 서너 문제 뒤에 다시 나와요.',
            '이때는 방금과 다른 방식으로 물어봐요. 답을 외우지 말고 뜻을 생각해 보라는 뜻이에요.'
        ]
    },
    {
        icon: '🎁',
        title: '포인트는 익힌 낱말이 늘 때 받아요',
        lines: [
            '한 판을 다 맞혀야 주는 게 아니에요. 그 층에서 완전히 익힌 낱말이 많아질수록 받아요.',
            '4분의 1, 반, 4분의 3, 전부 익혔을 때 이렇게 네 번 나눠서 받아요.',
            '한 번 받은 포인트는 다음에 많이 틀려도 그대로 있어요. 사라지지 않아요.'
        ]
    },
    {
        icon: '⭐',
        title: '금색 별은 자랑거리예요',
        lines: [
            '한 연습에서 12문제를 모두 맞히면 그 층에 금색 별이 붙어요.',
            '별은 포인트와는 상관없는 기록이에요. 포인트는 익힌 낱말 수로만 받아요.'
        ]
    }
];

const StudentTowerGuide = ({ className = '' }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <GuideInfoButton
                className={className}
                variant="help"
                label="어휘의 탑 안내 보기"
                title="어휘의 탑 안내"
                onClick={() => setIsOpen(true)}
            />

            <ModalPortal>
                <Modal
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                    title="💡 어휘의 탑은 이렇게 해요"
                    maxWidth="600px"
                >
                    <div className="vocab-guide">
                        <p className="vocab-guide__lead">
                            낱말을 익히면서 탑을 오르는 곳이에요. 빨리 푸는 것보다 <strong>정확히 아는 것</strong>이 중요해요.
                        </p>
                        {GUIDE_SECTIONS.map((section) => (
                            <section className="vocab-guide__section" key={section.title}>
                                <h4><span aria-hidden="true">{section.icon}</span>{section.title}</h4>
                                <ul>
                                    {section.lines.map((line) => <li key={line}>{line}</li>)}
                                </ul>
                            </section>
                        ))}
                    </div>
                </Modal>
            </ModalPortal>
        </>
    );
};

export default StudentTowerGuide;
