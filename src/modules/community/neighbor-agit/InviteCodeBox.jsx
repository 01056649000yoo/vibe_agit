import { useState } from 'react';
import Button from '../../../components/common/Button';

/*
 * 이웃 반에 건넬 초대 코드(2026-09-25). 준비 화면과 공간 관리 창이 함께 쓴다.
 *
 * 코드는 서버에 해시로만 남아 **만든 지금 한 번만** 보인다. 그래서 바로 복사할 단추와, 메신저에 그대로
 * 붙여 넣을 안내문 단추를 둔다. 코드 하나로 남은 자리만큼 여러 반이 신청할 수 있고 7일 동안 쓴다(20261348).
 */
const writeClipboard = async (text) => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
};

export default function InviteCodeBox({ invite, spaceName }) {
    const [copied, setCopied] = useState('');
    if (!invite?.invite_key) return null;
    const until = new Date(invite.expires_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' });
    const guide = `끄적끄적 아지트 '모두의 아지트'${spaceName ? ` [${spaceName}]` : ''}에 초대합니다.\n`
        + `선생님 화면 → 모두의 아지트 → '받은 초대 코드로 들어가기'에 아래 코드를 넣어 주세요.\n`
        + `초대 코드: ${invite.invite_key}\n(${until}까지)`;
    const copy = async (kind, text) => {
        setCopied(await writeClipboard(text) ? kind : 'failed');
    };
    return (
        <div className="neighbor-invite-box" role="group" aria-label="초대 코드">
            <strong className="neighbor-invite-box__code">{invite.invite_key}</strong>
            <small>
                {until}까지
                {invite.max_uses ? ` · 반 ${invite.max_uses}곳까지 이 코드로 신청할 수 있어요` : ''}
            </small>
            <span className="neighbor-invite-box__actions">
                <Button type="button" size="sm" onClick={() => copy('code', invite.invite_key)}>
                    {copied === 'code' ? '✓ 복사했어요' : '코드 복사'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => copy('guide', guide)}>
                    {copied === 'guide' ? '✓ 복사했어요' : '안내문 복사'}
                </Button>
            </span>
            {copied === 'failed' && <small className="neighbor-invite-box__warn">복사하지 못했어요. 코드를 직접 옮겨 적어 주세요.</small>}
            <small className="neighbor-invite-box__note">🔒 코드는 지금 한 번만 보여요. 잊으셨으면 새 코드를 만드세요(이전 코드는 멈춰요).</small>
        </div>
    );
}
