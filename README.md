# SG Guard — working prototype

This wires our HTML prototype up to a real backend that calls the **Google
Gemini API** (`gemini-3.5-flash`) to actually analyse messages — typed text,
an uploaded photo, or voice transcribed in the browser — for scam tactics.
Nothing here is simulated: the "Check this for me" button sends a real
request and Gemini decides the verdict.

## How it fits together

```
Browser (public/index.html)
   │  type / upload a photo / speak (Web Speech API converts speech to text)
   ▼
POST /api/check   ──────────────►  server.js (Express, this repo)
   │                                    │
   │                                    │  key sent server-side only,
   │                                    │  never sent to the browser
   │                                    ▼
   │                       generativelanguage.googleapis.com
   │                             model: gemini-3.5-flash
   │◄───────────── structured JSON ─────┘  (verdict, tactics, summary…)
   ▼
Warning / Safe screen rendered from that JSON
```

The frontend never talks to Google directly and never holds an API key —
that's the whole point of having a backend here. `server.js` is the only
place the key lives.

## 1. Prerequisites

- [Node.js](https://nodejs.org) 18 or newer (for built-in `fetch`)
- A free Gemini API key from **Google AI Studio**:
  https://aistudio.google.com/apikey (sign in with a Google account, no
  credit card needed to generate a key on the free tier)

## 2. Setup

```bash
cd sgguard-app
npm install
cp .env.example .env
```

Open `.env` and paste our generated API key in:

```
GEMINI_API_KEY=AIza...
```

## 3. Run it

```bash
npm start
```

Then open **http://localhost:3000** in browser (Chrome or Edge work
best — see the voice input note below).

## 4. What's real vs. what's still a demo shortcut

- **Text checking** — fully real. Whatever typed is sent to Gemini with
  the detection system prompt and the verdict/tactics come straight back.
- **Photo checking** — fully real. The image is sent directly to Gemini
  (it's a multimodal model), so there's no separate OCR step — Gemini reads
  the photo and analyses it in one call.
- **Voice input** — real when browser supports the Web Speech API
  (Chrome/Edge do; Safari and Firefox support is inconsistent). It
  transcribes speech to text *in the browser*, then that text goes through
  the same real text-checking path as typing. If speech recognition isn't
  supported, the button falls back to a short simulated demo transcript so
  the flow can still be shown end-to-end.
- **Contacting "Mei Ling" / the PA centre** — still a UI-only stub (shows a
  toast). Wiring this to a real call/SMS is a separate integration
  (e.g. Twilio) and wasn't in scope here.

## 5. About the free tier

Gemini's free tier and quotas change fairly often — check current limits at
https://ai.google.dev/gemini-api/docs/pricing before a big demo. If you hit
a `429` rate-limit error, that's the free-tier quota, not a bug in this app;
either wait a minute or switch `MODEL` in `server.js` to
`gemini-3.1-flash-lite`, which tends to have the most generous free quota.

## 6. Privacy note this matches your deck

Each request to `/api/check` sends only that one message, photo, or voice
transcript, for that one check — the backend doesn't write anything to a
database or log file. Note, though, that Google's terms differ from
Anthropic's here: free-tier Gemini usage may be used to improve Google's
products (check the current policy at
https://ai.google.dev/gemini-api/terms). If this matters for your project's
privacy claims, mention it explicitly in your writeup, or switch to a paid
Gemini tier, where this doesn't apply.

## 7. Known limitations to mention if asked

- No rate limiting or auth — fine for a class demo, not for production.
- No retry/backoff on API errors — a failed request just shows a toast
  asking the user to try again.
- Image uploads are capped by Express's JSON body limit (currently 15MB,
  set in `server.js`) — large photos may need compressing first.
- Structured output is enforced via Gemini's `responseSchema`, so malformed
  JSON should be rare, but the server still validates the shape defensively
  before sending it to the frontend.

## 8. Project structure

```
sgguard-app/
├── server.js          Express backend + Gemini API call
├── package.json
├── .env.example        Copy to .env and add your key
├── public/
│   └── index.html      Your prototype, now calling /api/check
└── README.md
```
