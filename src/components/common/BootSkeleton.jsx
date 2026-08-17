import './BootSkeleton.css';

/**
 * 역할: 부팅 중 실제 홈과 같은 자리에 회색 틀을 먼저 보여 주는 뼈대 화면.
 *
 * 왜 필요한가: `끄적끄적아지트.site` 안에는 앱이 둘이다. `/lab`(연구소)은 서버가 완성된 HTML을
 * 보내 바로 그려지는데, `/`(아지트)는 `<div id="root"></div>` 빈 껍데기를 받은 뒤 JS 실행 →
 * 세션 확인 → 홈 데이터까지 기다려야 한다. 그래서 연구소에서 돌아올 때만 "처음 로딩"으로
 * 되돌아간 것처럼 느껴졌다(2026-08-17 사용자 제보).
 *
 * 이 컴포넌트는 실제로 빠르게 만들지 않는다. 대신 익숙한 틀이 즉시 자리를 잡아
 * 화면이 처음부터 다시 시작한다는 인상을 없앤다.
 *
 * `kind`는 로컬 스토리지로 **동기 판정**한 값이라 로그인 상태에 맞는 틀만 보여 준다.
 * 판정이 안 되면 이 컴포넌트를 쓰지 않고 기존 로딩 문구를 그대로 둔다.
 */
const BootSkeleton = ({ kind = 'student' }) => (
    <div className="boot-skeleton" role="status" aria-live="polite" aria-busy="true">
        <span className="boot-skeleton__sr">아지트를 불러오는 중이에요.</span>
        <div className="boot-skeleton__content">
            <div className="boot-skeleton__toolbar" aria-hidden="true">
                <div className="boot-skeleton__bar boot-skeleton__bar--brand" />
                <div className="boot-skeleton__toolbar-actions">
                    <div className="boot-skeleton__bar boot-skeleton__bar--action" />
                    <div className="boot-skeleton__bar boot-skeleton__bar--action" />
                    <div className="boot-skeleton__bar boot-skeleton__bar--action" />
                </div>
            </div>

            <div aria-hidden="true">
                <div className="boot-skeleton__bar boot-skeleton__bar--title" />
                <div className="boot-skeleton__bar boot-skeleton__bar--sub" />
            </div>

            {/* 학생 홈은 `지금 할 일`과 `활동 알림`이 2열로 먼저 온다. 교사 홈은 그 자리가 없다. */}
            {kind === 'student' && (
                <div className="boot-skeleton__grid" aria-hidden="true">
                    <div className="boot-skeleton__block" />
                    <div className="boot-skeleton__block" />
                </div>
            )}

            <div className="boot-skeleton__menu" aria-hidden="true">
                {Array.from({ length: kind === 'student' ? 4 : 6 }, (_, index) => (
                    <div key={index} className="boot-skeleton__block boot-skeleton__block--menu" />
                ))}
            </div>
        </div>
    </div>
);

export default BootSkeleton;
