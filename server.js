// SG Guard — backend
// A small Express server that sits between the prototype's frontend and the
// Google Gemini API. The API key lives here, server-side, and is never sent
// to the browser — the frontend only ever talks to this server.

require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// gemini-3.5-flash is the current stable, multimodal (text + image) default —
// fast and reasonably priced. Swap to 'gemini-3.1-flash-lite' for an even
// cheaper/faster option if you hit free-tier rate limits. Check current
// model availability at https://ai.google.dev/gemini-api/docs/models if
// either of these ever return a 404 like gemini-2.5-flash just did.
const MODEL = 'gemini-3.5-flash';

if (!GEMINI_API_KEY) {
  console.warn(
    '\n⚠️  GEMINI_API_KEY is not set. Copy .env.example to .env and add your key,\n' +
    '   or the /api/check endpoint will fail on every request.\n'
  );
}

// Allow a generous JSON body limit since uploaded photos are sent as base64.
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `You are the detection engine behind SG Guard, a web portal that helps \
elderly users in Singapore check whether a message they received (by text, photo of a \
screenshot, or spoken aloud and transcribed) might be a scam. Your output is read aloud or \
shown in large text to someone who may be anxious and unfamiliar with tech jargon. Calibrated \
honesty matters more than sounding confident.

You will be given either:
- typed/transcribed text of a message, or
- a photo (e.g. a screenshot of an SMS/WhatsApp chat, or a photo of a letter), optionally
  with a short caption the user typed alongside it.

Your job:
1. Read the message (transcribing it from the photo if needed).
2. Decide whether it shows patterns common in scams targeting seniors — urgency/time
   pressure, impersonation of banks/government/family, requests for money or personal
   /banking details, instructions to keep it secret from family, unfamiliar links, etc.
3. Choose ONE of three verdicts:

   - "warning" — you are reasonably confident this shows real scam tactics: impersonating
     an authority (bank, CPF, IRAS, police), manufactured urgency, requests for NRIC/OTP/
     bank details/passwords, threats of suspension or legal action, instructions to keep
     it secret from family, suspicious links, or an unnatural channel for the claimed
     sender (e.g. "CPF Board" texting via SMS).

   - "safe" — you are reasonably confident this is an ordinary message: no financial or
     credential requests, no urgency or threats, consistent with a normal personal or
     routine notification.

   - "unsure" — the signals genuinely conflict, or there is only one weak/ambiguous
     indicator without others reinforcing it, or the photo is too unclear to be confident.
     Use this honestly instead of forcing "warning" or "safe" — a confident wrong answer is
     more dangerous to an elderly user than an honest "not sure." Do not use "unsure" as a
     lazy default for every message; most ordinary messages should still resolve to "safe,"
     and clear scams should still resolve to "warning."

4. Fill in the response fields as described below. Your output is constrained to a fixed
   JSON schema, but these rules still apply to how you fill each field:

- "highlightPhrases" and "tactics" MUST be empty arrays when verdict is "safe".
- Every string in "highlightPhrases" MUST be an exact, verbatim substring of "sourceText"
  (so the app can find and highlight it) — do not paraphrase these.
- For "unsure", "tactics" should list BOTH what looks concerning AND what looks reassuring,
  so the reason for the uncertainty is legible (e.g. "Sounds official" alongside "But no
  request for money or personal details").
- For "unsure", "summary" must explicitly name the ambiguity rather than hedge silently —
  e.g. "This has one thing that looks a bit off, but not the full pattern of a scam. Worth
  a second opinion rather than something to panic about."
- Keep "summary" reassuring and never blame the user for receiving or almost acting on
  the message.
- Never include real advice to click links, call numbers, or provide personal/banking
  details, even inside example text.
- If the image is unreadable, transcribe what you can and lean toward "unsure" rather than
  silently guessing "safe" or "warning."`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['warning', 'unsure', 'safe'] },
    sourceText: { type: 'string', description: 'The message text, verbatim or transcribed from the photo.' },
    summary: { type: 'string', description: 'One or two short sentences, written directly to the senior in warm, plain, non-technical language.' },
    highlightPhrases: { type: 'array', items: { type: 'string' } },
    tactics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          icon: { type: 'string', description: 'A single emoji or symbol.' },
          title: { type: 'string', description: 'Short tactic name, 2-5 words.' },
          explanation: { type: 'string', description: 'One plain-language sentence explaining why this is a red flag.' }
        },
        required: ['icon', 'title', 'explanation']
      }
    }
  },
  required: ['verdict', 'sourceText', 'summary', 'highlightPhrases', 'tactics']
};

app.post('/api/check', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY.' });
    }

    const { mode, text, imageDataUrl, caption } = req.body || {};

    let parts;
    if (mode === 'photo') {
      if (!imageDataUrl || typeof imageDataUrl !== 'string') {
        return res.status(400).json({ error: 'imageDataUrl is required for mode "photo".' });
      }
      const match = imageDataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ error: 'imageDataUrl must be a base64 data URL.' });
      }
      const [, mimeType, base64Data] = match;
      parts = [
        { inlineData: { mimeType, data: base64Data } },
        {
          text: caption && caption.trim()
            ? `Here is a photo of the message. The user also typed this note alongside it: "${caption.trim()}"`
            : 'Here is a photo of the message the user wants checked.'
        }
      ];
    } else if (mode === 'text') {
      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'text is required for mode "text".' });
      }
      parts = [{ text: text.trim() }];
    } else {
      return res.status(400).json({ error: 'mode must be "text" or "photo".' });
    }

    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA
          }
        })
      }
    );

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Gemini API error:', apiRes.status, errText);
      return res.status(502).json({ error: 'The AI service could not be reached. Please try again.' });
    }

    const apiData = await apiRes.json();
    const candidate = (apiData.candidates || [])[0];
    const raw = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      console.error('Failed to parse model output as JSON:', raw);
      return res.status(502).json({ error: 'The AI response was not understood. Please try again.' });
    }

    // Minimal shape validation so a malformed response can't break the frontend.
    const validVerdicts = ['warning', 'unsure', 'safe'];
    const safeParsed = {
      verdict: validVerdicts.includes(parsed.verdict) ? parsed.verdict : 'unsure',
      sourceText: typeof parsed.sourceText === 'string' ? parsed.sourceText : (text || ''),
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      highlightPhrases: Array.isArray(parsed.highlightPhrases) ? parsed.highlightPhrases.filter((p) => typeof p === 'string') : [],
      tactics: Array.isArray(parsed.tactics) ? parsed.tactics.filter((t) => t && typeof t === 'object') : []
    };

    res.json(safeParsed);
  } catch (err) {
    console.error('Unexpected error in /api/check:', err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  }
});

app.listen(PORT, () => {
  console.log(`SG Guard server running at http://localhost:${PORT}`);
});
