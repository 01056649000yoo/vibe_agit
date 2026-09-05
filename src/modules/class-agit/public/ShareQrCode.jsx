import { useEffect, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import { samlinkShareUrl } from './sharingPolicy.js';

// Only the displayed short link is encoded. QR generation makes no network request.
export default function ShareQrCode({ url }) {
    const shortUrl = samlinkShareUrl(url);
    const [result, setResult] = useState(null);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!shortUrl) return;
        let active = true;
        import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(new URL(shortUrl).href, {
            width: 1024, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' },
        })).then((image) => { if (active) setResult({ url: shortUrl, attempt, image }); })
            .catch(() => { if (active) setResult({ url: shortUrl, attempt, error: true }); });
        return () => { active = false; };
    }, [shortUrl, attempt]);
    if (!shortUrl) return null;
    const current = result?.url === shortUrl && result.attempt === attempt ? result : null;
    return <figure className="class-agit-share-qr">
        <figcaption>전시관 QR코드</figcaption>
        {current?.image ? <><img src={current.image} width="216" height="216" alt="샘링크 줄임주소로 전시관을 여는 QR코드" />
            <a href={current.image} download="전시관-QR코드.png" className="class-agit-qr-download">QR코드 이미지 저장</a></>
            : current?.error ? <><p role="alert">QR코드를 만들지 못했습니다.</p><Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>QR코드 다시 만들기</Button></>
                : <p role="status">QR코드를 만들고 있습니다…</p>}
    </figure>;
}
