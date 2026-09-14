import { useEffect, useState } from 'react';
import { SERVICE_STAT_ITEMS } from '../../constants/serviceStats.js';
import { loadServiceStats } from '../../lib/serviceStats';
import './LandingServiceStats.css';

/*
 * 로그인 화면 아래쪽의 현황 한 줄.
 *
 * **로그인 버튼 아래에 둔다.** 숫자를 읽어 오는 데 잠깐 걸리는데, 버튼 위에 두면
 * 숫자가 도착할 때 버튼이 아래로 밀려 누르려던 손이 빗나간다.
 *
 * 못 읽으면 아무것도 그리지 않는다. 로그인이 먼저다.
 */

/*
 * 다시 읽는 주기. 서버가 **60초에 한 번만** 실제로 세므로(`get_service_stats_v1`) 그보다
 * 자주 물어도 같은 값이 돌아온다 — 서버만 두들기는 셈이라 주기를 서버와 맞춘다.
 */
const REFRESH_MS = 60000;

const LandingServiceStats = () => {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const read = () => {
            loadServiceStats()
                .then((next) => { if (!cancelled) setStats(next); })
                .catch(() => {});
        };
        read();
        /*
         * 로그인 화면은 **켜 둔 채로 오래 머문다.** 한 번만 읽으면 그동안 선생님이 더
         * 들어와도 숫자가 그대로다(2026-09-14 지적). 보이는 동안만 다시 읽는다 —
         * 덮어 둔 탭까지 1분마다 부르면 쓰지도 않을 값을 계속 세게 된다.
         */
        const timer = setInterval(() => { if (document.visibilityState === 'visible') read(); }, REFRESH_MS);
        // 탭을 다시 펴면 1분을 기다리지 않고 바로 읽는다.
        const onVisible = () => { if (document.visibilityState === 'visible') read(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    if (!stats) return null;

    return (
        <section className="landing-stats" aria-label="아지트 현황">
            <p className="landing-stats__lead">지금 아지트와 함께하고 있어요</p>
            <dl className="landing-stats__grid">
                {SERVICE_STAT_ITEMS.map((item) => (
                    <div key={item.key} className="landing-stats__item">
                        <dt>
                            <span aria-hidden="true">{item.icon}</span>
                            {item.label}
                        </dt>
                        <dd>
                            <strong>{Reflect.get(stats, item.key).toLocaleString('ko-KR')}</strong>
                            {item.unit}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
};

export default LandingServiceStats;
