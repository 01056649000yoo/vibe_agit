import React from 'react';

/**
 * 서버 자원 한눈에 보기.
 *
 * 값만 늘어놓으면 운영자가 "그래서 지금 괜찮은 건가"를 매번 스스로 판단해야 한다.
 * 그래서 칸마다 **판단 기준과 지금 해야 할 일**을 함께 적는다.
 *
 * 값의 출처는 두 갈래다.
 *   - 5분마다 재는 현재값: 맥·도커 메모리/스왑, 디스크, 컨테이너, 게이트웨이
 *   - 같은 표에 함께 남기는 오늘 최악값: 도커 메모리 최저, 도커 스왑·게이트웨이 최고
 *   - 하루 한 번(04:50) 재는 것: DB 크기와 트래픽 측정 구간
 */

const TONES = Object.freeze({
    good: { color: '#2F855A', background: '#F0FFF4', border: '#C6F6D5', mark: '정상' },
    watch: { color: '#B7791F', background: '#FFFBEB', border: '#FBD38D', mark: '지켜보기' },
    bad: { color: '#C53030', background: '#FFF5F5', border: '#FEB2B2', mark: '조치 필요' },
    none: { color: '#718096', background: '#F7FAFC', border: '#E2E8F0', mark: '기록 없음' },
});

const Card = ({ title, value, unit, tone, note }) => {
    const style = Reflect.get(TONES, tone) || TONES.none;
    return (
        <div style={{
            padding: '14px 16px', borderRadius: '12px',
            background: style.background, border: `1px solid ${style.border}`
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '0.78rem', color: '#4A5568', fontWeight: 'bold' }}>{title}</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 900, color: style.color }}>{style.mark}</span>
            </div>
            <div style={{ margin: '6px 0 4px', fontSize: '1.35rem', fontWeight: 900, color: '#2D3748' }}>
                {value}<span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: '#718096' }}>{unit}</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#718096', lineHeight: 1.5 }}>{note}</div>
        </div>
    );
};

const toFiniteNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const AdminResourceStatus = ({ latest }) => {
    if (!latest) {
        return (
            <div style={{ padding: '16px', background: '#F7FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', color: '#718096', fontSize: '0.85rem' }}>
                아직 서버 기록이 없습니다. 5분마다 도는 건강검진과 하루 한 번(04:50) 도는 지표 기록이 값을 채웁니다.
            </div>
        );
    }

    const hostMemPercent = toFiniteNumber(latest.host_mem_available_pct);
    const hostSwapUsed = toFiniteNumber(latest.host_swap_used_mb);
    const memTotal = toFiniteNumber(latest.vm_mem_total_mb);
    const memCurrent = toFiniteNumber(latest.vm_mem_available_current_mb);
    const memMinimum = toFiniteNumber(latest.vm_mem_available_min_mb);
    const memPercent = memTotal > 0 && Number.isFinite(memCurrent) ? Math.round((memCurrent / memTotal) * 100) : null;
    const memMinimumPercent = memTotal > 0 && Number.isFinite(memMinimum) ? Math.round((memMinimum / memTotal) * 100) : null;
    const swapCurrent = toFiniteNumber(latest.vm_swap_used_current_mb);
    const swapMaximum = toFiniteNumber(latest.vm_swap_used_max_mb);
    const gatewayCpu = toFiniteNumber(latest.gateway_cpu_current_pct);
    const gatewayCpuMaximum = toFiniteNumber(latest.gateway_cpu_max_pct);
    const gatewayMem = toFiniteNumber(latest.gateway_mem_current_mb);
    const diskFree = toFiniteNumber(latest.disk_free_gb);
    const dbSize = toFiniteNumber(latest.db_size_mb);
    const containers = toFiniteNumber(latest.container_total);
    const healthy = toFiniteNumber(latest.container_healthy);

    const hostMemTone = hostMemPercent === null ? 'none' : hostMemPercent < 15 ? 'bad' : hostMemPercent < 30 ? 'watch' : 'good';
    const hostSwapTone = !Number.isFinite(hostSwapUsed) ? 'none' : hostSwapUsed > 1024 ? 'bad' : hostSwapUsed > 0 ? 'watch' : 'good';
    const memTone = memPercent === null ? 'none' : memPercent < 15 ? 'bad' : memPercent < 30 ? 'watch' : 'good';
    const swapTone = !Number.isFinite(swapCurrent) ? 'none' : swapCurrent > 100 ? 'bad' : swapCurrent > 0 ? 'watch' : 'good';
    const cpuTone = !Number.isFinite(gatewayCpu) ? 'none' : gatewayCpu > 70 ? 'bad' : gatewayCpu > 40 ? 'watch' : 'good';
    const diskTone = !Number.isFinite(diskFree) ? 'none' : diskFree < 10 ? 'bad' : diskFree < 30 ? 'watch' : 'good';
    const dbTone = Number.isFinite(dbSize) ? 'good' : 'none';
    const containerTone = !Number.isFinite(containers) || !Number.isFinite(healthy)
        ? 'none'
        : healthy < containers ? 'bad' : 'good';

    return (
        <div style={{
            display: 'grid', gap: '10px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))'
        }}>
            <Card
                title="맥 메모리 여유 (현재)"
                value={Number.isFinite(hostMemPercent) ? hostMemPercent : '—'}
                unit={Number.isFinite(hostMemPercent) ? '%' : ''}
                tone={hostMemTone}
                note={hostMemTone === 'none' ? '아직 재지 않았습니다.'
                    : hostMemTone === 'bad' ? '맥 본체 메모리 압박이 큽니다. 가장 큰 프로세스를 확인하세요.'
                    : hostMemTone === 'watch' ? '맥 본체 여유가 줄었습니다.'
                        : '맥 본체에 여유가 있습니다.'}
            />
            <Card
                title="맥 스왑 사용 (현재)"
                value={Number.isFinite(hostSwapUsed) ? hostSwapUsed.toLocaleString() : '—'}
                unit={Number.isFinite(hostSwapUsed) ? 'MB' : ''}
                tone={hostSwapTone}
                note={hostSwapTone === 'none' ? '아직 재지 않았습니다.'
                    : hostSwapTone === 'bad' ? '맥 본체가 디스크로 많이 밀어냈습니다.'
                    : hostSwapTone === 'watch' ? '현재 스왑을 사용 중입니다.'
                        : '현재 스왑을 쓰지 않습니다.'}
            />
            <Card
                title="도커 메모리 여유 (현재)"
                value={memPercent === null ? '—' : memPercent}
                unit={memPercent === null ? '' : `% · ${memCurrent.toLocaleString()}MB`}
                tone={memTone}
                note={memPercent === null ? '아직 재지 않았습니다.'
                    : memTone === 'bad' ? '30% 아래로 오래 머무르면 도커 메모리 할당을 올리세요.'
                        : memTone === 'watch' ? '수업 시간에 더 떨어지는지 지켜보세요.'
                            : `현재는 여유 있습니다.${Number.isFinite(memMinimumPercent) ? ` 오늘 최저 ${memMinimumPercent}%` : ''}`}
            />
            <Card
                title="도커 스왑 사용 (현재)"
                value={Number.isFinite(swapCurrent) ? swapCurrent.toLocaleString() : '—'}
                unit={Number.isFinite(swapCurrent) ? 'MB' : ''}
                tone={swapTone}
                note={swapTone === 'none' ? '아직 재지 않았습니다.'
                    : swapTone === 'bad' ? '메모리가 모자라 디스크로 밀어냈습니다. 할당을 올릴 때입니다.'
                    : swapTone === 'watch' ? '조금씩 쓰기 시작했습니다.'
                        : `현재는 쓰지 않습니다.${Number.isFinite(swapMaximum) ? ` 오늘 최대 ${swapMaximum.toLocaleString()}MB` : ''}`}
            />
            <Card
                title="게이트웨이 CPU (현재)"
                value={Number.isFinite(gatewayCpu) ? gatewayCpu : '—'}
                unit={Number.isFinite(gatewayCpu) ? `% · ${Number.isFinite(gatewayMem) ? gatewayMem + 'MB' : ''}` : ''}
                tone={cpuTone}
                note={cpuTone === 'none' ? '아직 재지 않았습니다.'
                    : cpuTone === 'bad' ? '수업 시간에 계속 70%를 넘으면 kong 워커를 2에서 늘리세요.'
                    : cpuTone === 'watch' ? '아직 여유는 있습니다.'
                        : `워커 2개로 충분합니다.${Number.isFinite(gatewayCpuMaximum) ? ` 오늘 최대 ${gatewayCpuMaximum}%` : ''}`}
            />
            <Card
                title="디스크 여유"
                value={Number.isFinite(diskFree) ? diskFree : '—'}
                unit={Number.isFinite(diskFree) ? 'GB' : ''}
                tone={diskTone}
                note={diskTone === 'none' ? '아직 재지 않았습니다.'
                    : diskTone === 'bad' ? '10GB 아래입니다. 도커 캐시부터 정리하세요.'
                    : diskTone === 'watch' ? '30GB 아래로 내려왔습니다.'
                        : '넉넉합니다.'}
            />
            <Card
                title="DB 크기"
                value={Number.isFinite(dbSize) ? Math.round(dbSize).toLocaleString() : '—'}
                unit={Number.isFinite(dbSize) ? 'MB' : ''}
                tone={dbTone}
                note={dbTone === 'none' ? '아직 재지 않았습니다.' : '학기마다 얼마나 늘어나는지를 보는 값입니다.'}
            />
            <Card
                title="컨테이너"
                value={Number.isFinite(containers) && Number.isFinite(healthy) ? `${healthy}/${containers}` : '—'}
                unit={Number.isFinite(containers) && Number.isFinite(healthy) ? '개 정상' : ''}
                tone={containerTone}
                note={containerTone === 'none' ? '아직 재지 않았습니다.'
                    : containerTone === 'bad' ? '꺼졌거나 아픈 컨테이너가 있습니다. 장애 이력을 확인하세요.'
                        : '모두 정상입니다.'}
            />
        </div>
    );
};

export default AdminResourceStatus;
