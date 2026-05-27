import { Router } from 'express';
import multer from 'multer';
import axios from 'axios';
import * as fileStore from '../services/fileStore.js';
import * as excelLogger from '../services/excelLogger.js';
import { findBestMatchSemantic, getNearMatches } from '../services/semanticMatcher.js';
import * as access from '../services/access.js';

const router  = Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB max

// Map browser MIME types to what Azure Speech expects
const MIME_TO_AZURE_CT = {
  'audio/webm':             'audio/webm; codecs=opus',
  'audio/webm;codecs=opus': 'audio/webm; codecs=opus',
  'audio/ogg':              'audio/ogg; codecs=opus',
  'audio/ogg;codecs=opus':  'audio/ogg; codecs=opus',
  'audio/wav':              'audio/wav; codecs=pcm',
  'audio/mp4':              'audio/mp4',
  'audio/mpeg':             'audio/mpeg',
};

async function transcribeWithAzure(buffer, contentType) {
  const key    = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  const locale = process.env.AZURE_SPEECH_LOCALE || 'en-US';

  if (!key || !region) throw new Error('AZURE_SPEECH_KEY or AZURE_SPEECH_REGION is not configured on the backend.');

  // Normalise content-type (strip params for lookup, fall back gracefully)
  const baseMime  = (contentType || '').split(';')[0].trim().toLowerCase();
  const azureCT   = MIME_TO_AZURE_CT[contentType] ?? MIME_TO_AZURE_CT[baseMime] ?? 'audio/webm; codecs=opus';

  const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`
            + `?language=${locale}&format=simple&profanity=raw`;

  console.log(`[STT] key set=${!!key} region=${region} locale=${locale} contentType=${contentType} → azureCT=${azureCT} bufferBytes=${buffer.length}`);

  const { data } = await axios.post(url, buffer, {
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': azureCT,
      'Accept': 'application/json',
    },
    timeout: 30_000,
  });

  console.log(`[STT] Azure response:`, JSON.stringify(data));

  if (data.RecognitionStatus === 'NoMatch' || data.RecognitionStatus === 'InitialSilenceTimeout') return '';
  if (data.RecognitionStatus !== 'Success') throw new Error(`Azure STT status: ${data.RecognitionStatus}`);
  return (data.DisplayText ?? '').trim();
}

// POST /api/voice-query
// Body: multipart form  — audio (file), contentType, teamsUserId, userEmail, userName
router.post('/voice-query', upload.single('audio'), async (req, res) => {
  try {
    const { contentType, teamsUserId, userEmail, userName } = req.body;

    if (!req.file) return res.status(400).json({ error: 'No audio file received.' });

    // ── 1. Access check ──────────────────────────────────────────
    const role = access.getRole(teamsUserId, userEmail);
    if (role === null) {
      return res.status(403).json({ error: "You don't have access to this FAQ bot. Ask your admin to add you." });
    }

    // ── 2. Transcribe ─────────────────────────────────────────────
    const transcript = await transcribeWithAzure(req.file.buffer, contentType || req.file.mimetype);

    if (!transcript) {
      return res.json({ transcript: '', answered: false, message: "I couldn't make out any words. Please try again." });
    }

    // ── 3. FAQ search ─────────────────────────────────────────────
    const { questions } = fileStore.read('faqs');
    const match = await findBestMatchSemantic(questions, transcript);

    // ── 4. Log query ──────────────────────────────────────────────
    excelLogger.appendQueryLog({
      user_email:      userEmail ?? '',
      user_name:       userName  ?? '',
      query:           transcript,
      matched_faq_id:  match?.faq.id ?? null,
      confidence:      match ? Math.round(match.score * 100) / 100 : null,
      answered:        !!match,
    }).catch(console.error);

    // ── 5. Respond ────────────────────────────────────────────────
    if (!match) {
      const near = getNearMatches(questions, transcript, 3);
      const escalation = `Appreciate the question! This topic isn't covered in our knowledge base just yet, but that's exactly where utpala.viswanath@inmobi.com & shantanu.rawat@inmobi.com come in — they're your go-to experts on this. They're well-positioned to walk you through the details and provide any additional context you may need. Please contact them directly, and they'll ensure you get the most accurate information.`;
      let message = escalation;
      if (near.length) {
        const lines = near.map((r, i) => `${i + 1}. "${r.faq.question}" (${Math.round(r.score * 100)}% match)`);
        message += `\n\nYou might also be looking for one of these:\n${lines.join('\n')}`;
      }
      return res.json({ transcript, answered: false, message, near_matches: near.map(r => ({ question: r.faq.question, score: r.score })) });
    }

    return res.json({
      transcript,
      answered:   true,
      answer:     match.faq.answer,
      question:   match.faq.question,
      confidence: match.score,
    });

  } catch (err) {
    console.error('[voice-query]', err.message);
    return res.status(500).json({ error: err.message || 'Internal server error.' });
  }
});

export default router;
