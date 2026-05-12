import 'dotenv/config';
import { App, HttpPlugin } from '@microsoft/teams.apps';
import { DevtoolsPlugin } from '@microsoft/teams.dev';
import axios from 'axios';
import { transcribeAudio } from './stt.js';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3000';
const AUDIO_TYPES = ['audio/ogg', 'audio/wav', 'audio/mp4', 'audio/mpeg', 'audio/webm'];
const PORT = parseInt(process.env.PORT || '3978', 10);
const isProd = process.env.NODE_ENV === 'production';

// ── Teams AI v2 App ──────────────────────────────────────────────────────────
const httpPlugin = new HttpPlugin();
const app = new App({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  tenantId: process.env.TENANT_ID,
  plugins: isProd ? [httpPlugin] : [httpPlugin, new DevtoolsPlugin()],
});

app.on('message', async (context) => {
  try {
    await handleMessage(context);
  } catch (err) {
    console.error('Bot error:', err);
    await context.send('Sorry, something went wrong. Please try again.');
  }
});

// ── Message handling ─────────────────────────────────────────────────────────
async function handleMessage(context) {
  const activity = context.activity;
  const teamsUserId = activity.from?.aadObjectId || activity.from?.id;
  const userName = activity.from?.name ?? '';
  const userEmail = activity.from?.email ?? '';
  const conversationReference = context.ref;

  console.log(`\n>>> teamsUserId: ${teamsUserId}  name: ${userName}\n`);

  let text = null;

  const audioAtt = (activity.attachments ?? []).find(a => AUDIO_TYPES.includes(a.contentType));
  if (audioAtt) {
    if (!process.env.OPENAI_API_KEY) {
      await context.send("I received your voice message but voice transcription isn't configured yet (OPENAI_API_KEY missing). Please type your message.");
      return;
    }
    try {
      const token = await getBotServiceToken();
      const { data } = await axios.get(audioAtt.contentUrl, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer',
      });
      text = await transcribeAudio(Buffer.from(data), audioAtt.contentType);
      console.log(`[STT] "${text}"`);
    } catch (err) {
      console.error('STT error:', err.message);
      await context.send("Sorry, I couldn't transcribe your voice message. Please try typing instead.");
      return;
    }
  } else {
    text = (activity.text ?? '').trim();
  }

  if (!text) {
    await context.send("I didn't receive any message. Please try again.");
    return;
  }

  const reply = await route(text, teamsUserId, userEmail, userName, conversationReference);
  await context.send(reply);
}

// ── Routing ──────────────────────────────────────────────────────────────────
async function route(text, teamsUserId, userEmail, userName, conversationReference) {
  let cmdRes;
  try {
    const { data } = await axios.post(`${BACKEND}/api/admin-command`, {
      text, teamsUserId, userEmail, userName, conversationReference,
    });
    cmdRes = data;
  } catch (err) {
    console.error('admin-command error:', err.message);
    return "Sorry, I couldn't reach the backend. Please try again.";
  }

  switch (cmdRes.type) {
    case 'not_a_command':
      return query(text, teamsUserId, userEmail, userName, conversationReference);
    case 'confirm_or_cancel':
      return confirm(text, teamsUserId);
    case 'needs_confirmation':
      return cmdRes.confirmation_prompt;
    case 'result':
      return cmdRes.formatted_message;
    case 'not_admin':
    case 'not_found':
    case 'executed':
      return cmdRes.message;
    case 'error':
      return `⚠️ ${cmdRes.message}`;
    default:
      return query(text, teamsUserId, userEmail, userName, conversationReference);
  }
}

async function query(text, teamsUserId, userEmail, userName, conversationReference) {
  try {
    const { data } = await axios.post(`${BACKEND}/api/query`, {
      text, teamsUserId, userEmail, userName, conversationReference,
    });
    return data.answered ? data.answer : data.message;
  } catch (err) {
    console.error('query error:', err.message);
    return "Sorry, I couldn't reach the backend. Please try again.";
  }
}

async function confirm(response, teamsUserId) {
  try {
    const { data } = await axios.post(`${BACKEND}/api/admin-confirm`, { teamsUserId, response });
    switch (data.type) {
      case 'executed': return data.message;
      case 'cancelled': return data.message;
      case 'no_pending': return data.message;
      case 'needs_confirmation': return data.confirmation_prompt;
      case 'error': return `⚠️ ${data.message}`;
      default: return data.message ?? 'Done.';
    }
  } catch (err) {
    console.error('admin-confirm error:', err.message);
    return "Sorry, I couldn't process that. Please try again.";
  }
}

// ── Bot service token (client_credentials) ───────────────────────────────────
async function getBotServiceToken() {
  const tokenRes = await axios.post(
    `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      scope: 'https://api.botframework.com/.default',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return tokenRes.data.access_token;
}

// ── Custom HTTP routes (mounted on the same port as /api/messages) ──────────
app.http.get('/health', (_req, res) => res.json({ ok: true }));

app.http.post('/api/proactive', async (req, res) => {
  const { teamsUserId, message, secret } = req.body ?? {};

  if (secret !== process.env.BOT_PROACTIVE_SECRET) return res.status(403).json({ error: 'Forbidden' });
  if (!teamsUserId || !message) return res.status(400).json({ error: 'teamsUserId and message are required' });

  let convRef = null;
  try {
    const { data } = await axios.get(`${BACKEND}/api/conv-ref/${teamsUserId}`);
    convRef = data.ref;
  } catch { /* not found */ }
  if (!convRef) return res.status(404).json({ error: 'No conversation reference for user' });

  try {
    const token = await getBotServiceToken();
    const serviceUrl = convRef.serviceUrl.replace(/\/$/, '');
    const conversationId = encodeURIComponent(convRef.conversation.id);

    await axios.post(
      `${serviceUrl}/v3/conversations/${conversationId}/activities`,
      { type: 'message', text: message },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Proactive send failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ────────────────────────────────────────────────────────────────────
app.start(PORT).then(() =>
  console.log(`Teams bot → http://localhost:${PORT}  (messages, /api/proactive, /health)`)
);
