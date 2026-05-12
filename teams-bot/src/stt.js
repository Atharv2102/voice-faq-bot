import OpenAI from 'openai';

let client = null;
const MIME_TO_EXT = { 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/webm': 'webm' };

export async function transcribeAudio(buffer, contentType) {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const ext = MIME_TO_EXT[contentType] || 'ogg';
  const file = new File([buffer], `audio.${ext}`, { type: contentType });
  const res = await client.audio.transcriptions.create({ model: 'whisper-1', file, language: 'en' });
  return res.text.trim();
}
