import axios from 'axios';

// Azure Speech-to-Text via REST API.
// Required env vars:
//   AZURE_SPEECH_KEY     — Cognitive Services key (Key1 or Key2)
//   AZURE_SPEECH_REGION  — e.g. "eastus", "centralindia", "westeurope"
//   AZURE_SPEECH_LOCALE  — optional, defaults to "en-IN"

// Teams sends audio as OGG/Opus. Azure accepts it natively with the
// correct Content-Type header — no conversion step needed.
const MIME_TO_AZURE_CT = {
  'audio/ogg':  'audio/ogg; codecs=opus',
  'audio/webm': 'audio/webm; codecs=opus',
  'audio/wav':  'audio/wav; codecs=pcm',
  'audio/mp4':  'audio/mp4',
  'audio/mpeg': 'audio/mpeg',
};

export async function transcribeAudio(buffer, contentType) {
  const key    = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  const locale = process.env.AZURE_SPEECH_LOCALE || 'en-IN';

  if (!key || !region) throw new Error('AZURE_SPEECH_KEY or AZURE_SPEECH_REGION is not set');

  const azureCT = MIME_TO_AZURE_CT[contentType] ?? 'audio/ogg; codecs=opus';
  const url     = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`
                + `?language=${locale}&format=simple&profanity=raw`;

  const { data } = await axios.post(url, buffer, {
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': azureCT,
      'Accept': 'application/json',
    },
    timeout: 30_000,
  });

  if (data.RecognitionStatus === 'NoMatch' || data.RecognitionStatus === 'InitialSilenceTimeout') {
    return ''; // caller handles empty transcript gracefully
  }

  if (data.RecognitionStatus !== 'Success') {
    throw new Error(`Azure STT returned status: ${data.RecognitionStatus}`);
  }

  return (data.DisplayText ?? '').trim();
}
