import { createPublicReadHandler } from './handler.js'
const origin = Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// No user session, analytics, content cache, or source-writing query in the public path.
Deno.serve(createPublicReadHandler({
    async rpc(name: string, body: Record<string, unknown>) {
        if (!origin || !serviceKey) throw new Error('Public gallery unavailable')
        const response = await fetch(`${origin}/rest/v1/rpc/${name}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify(body), signal: AbortSignal.timeout(4000),
        })
        if (!response.ok) { await response.body?.cancel(); throw new Error('Public gallery unavailable') }
        return await response.json()
    },
}))
