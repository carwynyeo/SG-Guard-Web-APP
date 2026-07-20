# SG Guard

**A trust-first defence against AI-personalised scams — built for Singapore's seniors, not around them.**

## The Problem

Singapore's seniors are digitally comfortable but not digitally confident — a gap generative AI has turned into a public-safety crisis. Government-impersonation scams rose 124% year-on-year, with elderly victims losing an average of S$37,053 each, manipulated into transferring money themselves. Static defences like keyword blacklists can't keep pace with an adversary that drafts a personalised script in seconds or clones a voice from three seconds of audio.

## The Approach

Instead of racing generative AI on detection speed, SG Guard uses AI to support human judgement. Seniors share a suspicious message by **typing, photographing, or speaking it**. A schema-locked Gemini backend reads the message for manipulation *tactics* rather than keywords, returning one of three honest, schema-enforced verdicts:

- 🟢 **Safe**
- 🟡 **Unsure** — a deliberate fairness decision, so the model never fakes certainty on a genuinely ambiguous message
- 🔴 **Warning** — with each flagged tactic explained in plain language

Every result ends in a **one-tap handoff to a trusted person**, keeping the AI as a second opinion rather than the final word.

## Design Principles

- **Honesty over confidence** — interface copy matches what the backend actually does (a mid-project audit caught and corrected a false "never leaves this screen" privacy claim)
- **No forced inputs** — three ways in (type, photo, speech), never forcing the input a senior trusts least
- **Calibrated uncertainty** — a hard-constrained JSON schema keeps "unsure" a real, reachable state rather than one the model could collapse out of under pressure
- **Civic infrastructure framing** — digital safety treated like Singapore's physical priority infrastructure, not a personal gadget seniors must master alone

## Limitations

- No formal participatory testing with seniors at an Active Ageing Centre yet (biggest open gap)
- English only — no Mandarin, Malay, Tamil, or dialect support
- "Add someone you trust" contact feature is currently a placeholder
- Cost and latency at real scale remain unvalidated

## Grounded In

Lim & Tan (2003) · Ma (2023) · Zhai et al. (2025) · LaRubbio et al. (2025) · Roy & Nilizadeh (2024) · Singapore Police Force Annual Scam & Cybercrime Brief 2025

*AI and Design — Final Project, 2026 · Carwyn Yeo 

---

# Working Prototype

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

## 6. Privacy note 

Each request to `/api/check` sends only that one message, photo, or voice
transcript, for that one check — the backend doesn't write anything to a
database or log file. Note, though, that Google's terms differ from
Anthropic's here: free-tier Gemini usage may be used to improve Google's
products (check the current policy at
https://ai.google.dev/gemini-api/terms). If this matters for your project's
privacy claims, mention it explicitly in your writeup, or switch to a paid
Gemini tier, where this doesn't apply.

## 7. Known limitations 

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
