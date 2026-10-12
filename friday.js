// Vercel Edge Function: proxies the portfolio's AI chat to Anthropic so the
// API key stays on the server. Lives at /api/friday on your Vercel site.
//
// Requires the env var ANTHROPIC_API_KEY (Vercel dashboard → Settings → Environment Variables).

export const config = { runtime: 'edge' };

const MODEL = 'claude-sonnet-5-5';
const MAX_MESSAGES = 10;
const MAX_CHARS = 500;

// The system prompt lives here, not in the browser, so visitors can't change it.
const SYSTEM = `You are Friday, the AI assistant on Mithilesh Tumuganti's portfolio terminal. Answer concisely in 1-3 sentences. No markdown. Be warm, professional, and slightly witty.
Only answer questions about Mithilesh or his portfolio; politely steer anything else back.
Profile: Mithilesh Tumuganti. CS student at UNB Saint John, Canada (2024-2028). Previously at New Millennium School Bahrain. GitHub: techberry00.
Skills: Photography, Event Photography, Leadership Development, Volunteering, Graphic Design. Tools: Microsoft PowerPoint, Python.
Volunteer roles: UNB SRC Spring Orientation 2025, invigilator at Saint John HS Programming Competition (UNBSJ), charity book sale (NMS), Think-Pink bake sale for breast cancer awareness (NMS), NMMUN Media Team Photographer (NMS).
If you don't know something about him, say so rather than guessing.`;

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Only accept calls coming from this same site (works for preview deployments too).
  const origin = request.headers.get('origin') || '';
  const host = request.headers.get('host') || '';
  let originHost = '';
  try { originHost = new URL(origin).host; } catch {}
  if (!originHost || originHost !== host) {
    return new Response('Forbidden', { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response('Server not configured', { status: 500 });
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response('Bad JSON', { status: 400 }); }

  // Accept only plain user/assistant text, trimmed and length-capped.
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .slice(-MAX_MESSAGES)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

  // The API needs the conversation to start and end with a user turn.
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return new Response('Invalid messages', { status: 400 });
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      stream: true,
      system: SYSTEM,
      messages,
    }),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
  });
}
