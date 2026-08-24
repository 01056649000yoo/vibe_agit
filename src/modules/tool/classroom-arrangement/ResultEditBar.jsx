/*
 * 결과를 맞바꿀 수 있다고 알려 주고, 고친 뒤 저장 버튼을 내주는 띠.
 *
 * ⚠️ 자리와 역할이 이 안내를 **한 벌씩** 갖고 있었다(2026-08-24 점검에서 확인).
 *    "자리"/"역할" 이라는 낱말만 달랐는데, 문구를 다듬을 때마다 한쪽만 고칠 위험이 있었다.
 *    이제 낱말만 `noun` 으로 받고 나머지는 이 한 곳에서 정한다.
 *
 * `noun` 은 `자리`·`역할` 이며, 결과판 이름은 여기에 `표` 를 붙여 `자리표`·`역할표` 로 쓴다.
 */
export default function ResultEditBar({ noun, pickedKey, edited, manualResult, saving, onSave }) {
  const board = `${noun}표`;
  return <div className="arrange-edit-bar" aria-live="polite">
    <span className="arrange-edit-bar__icon" aria-hidden="true">↔</span>
    <div className="arrange-edit-bar__copy">
      <strong>학생 두 명을 차례로 누르면 {noun}를 맞바꿀 수 있습니다.</strong>
      <span>{pickedKey
        ? '첫 학생을 골랐습니다. 바꿀 다른 학생을 눌러 주세요.'
        : manualResult ? `교사가 직접 보완한 ${board}에는 조건 점수를 계산하지 않습니다.` : '조건과 관계없이 바꿀 수 있으며, 바꾼 뒤 수정본을 저장해 주세요.'}</span>
    </div>
    {edited ? <button type="button" className="arrange-small-button is-dark" disabled={saving} onClick={onSave}>{saving ? '저장 중…' : `고친 ${board} 저장`}</button> : null}
  </div>;
}
