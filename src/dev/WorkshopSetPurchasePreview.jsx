import { useState } from 'react'
import BackgroundShopModal from '../modules/game/dragon/BackgroundShopModal.jsx'

// 아지트 공방 세트 구입 안내 — 레벨 부족·가진 것 빼고 나머지만·한 번에 구입을 DB 없이 눌러 본다(2026-10-24).
const OWNED_START = ['sunny-garden', 'pedestal-sunny-garden']

export default function WorkshopSetPurchasePreview() {
  const [points, setPoints] = useState(6000)
  const [owned, setOwned] = useState(OWNED_START)
  const [level, setLevel] = useState(3)
  const petData = {
    level, species: 'fire', background: 'sky', ownedDecorItems: owned, ownedItems: owned,
    equippedDecor: { wallpaper: 'sky', pedestal: 'pedestal-sunny-garden', leftProp: '', rightProp: '', nameplate: '' }
  }
  return (
    <div style={{ padding: 12 }}>
      <p style={{ margin: '0 0 8px' }}>
        작가 단계{' '}
        {[1, 3, 5, 7].map((n) => <button key={n} type="button" onClick={() => setLevel(n)} style={{ marginRight: 6, fontWeight: level === n ? 900 : 500 }}>{n}</button>)}
        · 포인트 {points.toLocaleString('ko-KR')}P ·{' '}
        <button type="button" onClick={() => { setOwned(OWNED_START); setPoints(6000) }}>처음으로</button>
      </p>
      <BackgroundShopModal
        isOpen onClose={() => {}} points={points} petData={petData} dragonInfo={{ name: '불꽃이' }} readerLevel={{ level: 2 }} ownerName="샘플 학생"
        buyDecorItem={async () => false} claimLegendaryReward={async () => false} equipDecorItem={async () => false} isBusy={false}
        buyDecorSet={async (ids) => {
          const fresh = ids.filter((id) => !owned.includes(id))
          setOwned([...owned, ...fresh]); setPoints((p) => p - fresh.length * 300)
          return { purchased: fresh.length, spent: fresh.length * 300 }
        }}
      />
    </div>
  )
}
