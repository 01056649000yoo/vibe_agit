// Runtime-independent gateway; the same handler runs in Edge and isolated HTTP tests.
// rpc must always use the server role. Never forward visitor Authorization or log input.
const MAX_BODY_BYTES = 2048;
const MAX_WORKS = 120;
const MAX_ROOMS = 10;
const codeStatus = { unavailable: 404, changed: 409, rate_limited: 429 };
const baseHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive', 'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
};
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...baseHeaders, ...(status === 429 ? { 'Retry-After': '60' } : {}) } });
async function boundedBody(request) {
    if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return null;
    const reader = request.body?.getReader(); if (!reader) return null;
    let size = 0; const parts = [];
    try {
        while (true) {
            const { done, value } = await reader.read(); if (done) break;
            size += value.byteLength;
            if (size > MAX_BODY_BYTES) { await reader.cancel(); return null; }
            parts.push(value);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch { return null; } finally { reader.releaseLock(); }
}
export function createPublicReadHandler({ rpc }) {
    return async (request) => {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: baseHeaders });
        if (request.method !== 'POST') return reply({ version: 1, error: 'unavailable' }, 405);
        if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({ version: 1, error: 'unavailable' }, 415);
        const body = await boundedBody(request);
        if (!body || typeof body !== 'object' || Array.isArray(body)
            || Object.keys(body).some((key) => !['p_token', 'p_room', 'p_work_id', 'p_publication_no', 'p_layout_version'].includes(key))) return reply({ version: 1, error: 'unavailable' }, 400);
        const { p_token, p_room = 0, p_work_id = null, p_publication_no = null, p_layout_version = 1 } = body;
        if (typeof p_token !== 'string' || !/^[a-f0-9]{64}$/.test(p_token) || !Number.isInteger(p_room) || p_room < 0 || p_room > MAX_ROOMS || ![1, 2].includes(p_layout_version)
            || (p_work_id !== null && (typeof p_work_id !== 'string' || !/^published-[1-9][0-9]{0,2}$/.test(p_work_id) || Number(p_work_id.slice(10)) > MAX_WORKS))
            || (p_publication_no !== null && (!Number.isInteger(p_publication_no) || p_publication_no < 1 || p_publication_no > 2147483647))) return reply({ version: 1, error: 'unavailable' }, 404);
        try {
            // Awaiting two distinct requests releases budget row locks before reading content.
            const budget = await rpc('take_class_agit_public_read_budget_v1', { p_token });
            if (budget?.error) return reply({ version: 1, error: budget.error }, codeStatus[budget.error] || 503);
            if (budget?.allowed !== true) return reply({ version: 1, error: 'unavailable' }, 503);
            const data = await rpc('read_public_class_agit_v1', { p_token, p_room, p_work_id, p_publication_no, ...(p_layout_version === 2 ? { p_layout_version } : {}) });
            if (data?.error) return reply({ version: 1, error: data.error }, codeStatus[data.error] || 503);
            if (data?.version !== 1) return reply({ version: 1, error: 'unavailable' }, 503);
            return reply(data);
        } catch { return reply({ version: 1, error: 'unavailable' }, 503); }
    };
}
