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

const LandingServiceStats = () => {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        let cancelled = false;
        loadServiceStats()
            .then((next) => { if (!cancelled) setStats(next); })
            .catch(() => {});
        return () => { cancelled = true; };
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
