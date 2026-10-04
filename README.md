# AI Apprentice

Built for the ElevenLabs x Hack-Nation challenge. An AI apprentice that watches an expert do a task on screen, asks why at natural pauses, repeats back what it understood until the expert agrees, produces a Work Map of the steps and rules, and then coaches a new hire on a case the expert never showed it.

The workflow is supplier invoice processing on a mock ERP that is part of this repo.

## How it works

1. **Capture** (`/capture`): the expert shares the ERP window and works normally. Screen frames are sampled, pixel-diffed, and sent to Claude vision, which returns structured events (PII replaced by tokens). The voice agent stays quiet while the expert is active and asks one short question when they pause.
2. **Debrief and Work Map** (`/map`): the server synthesizes a draft Work Map and a list of open questions. A voice debrief asks each one, then gives a teach-back. It finishes only when every question is answered and the expert confirms the teach-back. Each step and guardrail carries the expert's quote, timestamp, and screen frame.
3. **Teach** (`/teach`): a tutor agent walks a new hire through the Work Map. When the new hire saves a decision in the ERP, the guardrails are checked before the save is committed, and a violation is blocked and explained in the expert's words.

### Architecture

```
┌─ Tab A: /erp (mock ERP, screen-shared) ──┐      BroadcastChannel('apprentice')
│ invoice list · detail · cost center ·    │ ───▶ activity pings, save_attempt
│ Approve / Hold / Escalate · Save         │ ◀─── save_verdict {ok | veto}
└──────────────────────────────────────────┘
┌─ Tab B: /capture | /map | /teach ────────────────────────────────┐
│ ScreenSampler: frame every 1.5s → pixel-diff gate                │
│   → POST /api/sessions/:id/frame (prev + curr JPEG) → Event[]    │
│   → conversation.sendContextualUpdate("[EVENT] …")               │
│ PauseDetector: no ERP input ≥4s AND no speech AND no new event   │
│   → sendContextualUpdate("[PAUSE] …")                            │
│ useConversation (interviewer | tutor)                            │
└──────────────────────────────────────────────────────────────────┘
┌─ Express server ─────────────────────────────────────────────────┐
│ GET  /api/signed-url?role=interviewer|tutor                      │
│ POST /api/sessions                 create session                │
│ POST /api/sessions/:id/frame       Claude vision → Event[]       │
│ POST /api/sessions/:id/transcript  append utterances             │
│ POST /api/sessions/:id/offrecord   mark off-the-record window    │
│ POST /api/sessions/:id/synthesize  → draft WorkMap + openQuestions│
│ POST /api/sessions/:id/finalize    → confirmed WorkMap           │
│ GET  /api/workmaps/latest                                        │
│ GET  /frames/:session/:file.jpg                                  │
└──────────────────────────────────────────────────────────────────┘
```

Note: the ERP has no separate Save button; Approve, Hold and Escalate are the saves. Also, the pause signal is actually sent with `sendUserMessage`, because contextual updates never trigger an agent reply. The diagram is copied from the design spec (`docs/superpowers/specs/2026-10-03-ai-apprentice-design.md`), which has the details.

Stack: React 19 + Vite on the client, a small Express server that holds the API keys, `@elevenlabs/react` for the voice agents, Claude for vision and synthesis. Data is JSON files and JPEG frames under `server/data/` (no database).

## Setup

Requirements: Node 22.12 or newer (the Vite toolchain needs it), a Chromium-based browser (screen sharing and mic), an Anthropic API key, and an ElevenLabs account.

### 1. ElevenLabs agents

Create two agents in the ElevenLabs dashboard (Agents).

**Apprentice Interviewer**
- LLM: a Claude model (latest Sonnet offered). Voice: a calm, warm voice; turn on Expressive Mode if it's offered.
- System prompt: `You are an apprentice.` (the client overrides it). First message: blank.
- Tools: add the system tool **Skip turn** (`skip_turn`).
- Tools: add a client tool `mark_answered` with a required number parameter `index`; *Wait for response* off.
- Tools: add a client tool `confirm_teachback` with no parameters; *Wait for response* on.
- Advanced: turn eagerness set to patient, if available.
- Security: enable overrides for **System prompt** and **First message**, and enable authentication (signed URLs).

**Apprentice Tutor**
- Same settings as above, except the only client tool is `record_outcome` with parameters `step` (number) and `result` (string, either `mastered` or `practice`); *Wait for response* off. No `mark_answered` or `confirm_teachback`.

Copy both agent IDs.

### 2. Environment

```bash
cp .env.example .env
```

Fill in `.env`:

```
ANTHROPIC_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_INTERVIEWER_AGENT_ID=
ELEVENLABS_TUTOR_AGENT_ID=
# optional, defaults shown in .env.example
VISION_MODEL=claude-sonnet-5-5
SYNTH_MODEL=claude-opus-5-5
```

### 3. Install and run

```bash
npm install
npm run dev
```

This starts Vite on http://localhost:5173 and the API on :3001 (Vite proxies `/api` and `/frames`).

Run the tests with `npm test`.

## Running the demo

Open the ERP and the apprentice page in two **windows** placed side by side, not two tabs. Screen sharing captures one window, and the ERP needs to stay visible while you talk to the apprentice. Wear headphones so the agent's voice doesn't feed back into the mic.

- Expert side: `/erp` on one side, `/capture` on the other.
- New-hire side: `/erp?mode=teach` and `/teach`. The `mode=teach` part matters; without it the ERP doesn't wait for the tutor before saving.
- Start from a clean state with `rm -rf server/data`.

The full walkthrough with spoken lines is in [docs/demo-script.md](docs/demo-script.md). Short version: the expert processes INV-4471 (Kessler, EUR 6,850 CNC spindle, recoded from 4711 to 0400 capex), INV-4472 (Brandt Office Supplies in December, Hold because they double-bill then) and INV-4473 (Strojírny Plzeň, Czech subsidiary, Escalate for a second approval). After the debrief, a new hire handles INV-5120 (Kessler, EUR 7,200 hydraulic press, defaulting to 4711) and is blocked when trying to Approve it.

## Apprentice Test

| Question | Where it shows up |
| --- | --- |
| When to ask | `PauseDetector` plus `sendUserActivity()` on ERP input plus the agent's `skip_turn`. It stays silent while the expert types and speaks after a pause. |
| What to ask | Only events whose reason isn't visible on screen, with at least one question about a limit, exception, or when to stop and ask. |
| When it understands | All open questions marked answered and a confirmed teach-back (`confirm_teachback`). |
| Whether the new hire learned | An unseen invoice (INV-5120), a pre-save veto from the Work Map guardrails, and a mastery summary. |
| Trust | Off-the-record toggle (sampling stops, lines excluded from the map), PII tokenization with a server-side regex backstop, and delete controls for steps and guardrails. |

## Limitations

- Single user, no auth, no database.
- The mock ERP is the only workflow; the data model is not specific to invoices, but the guardrail fields (amount, category, supplier, entity, cost center, asset number, month, action) are.
- Vision calls that fail or time out are dropped rather than retried forever, so a noisy network means fewer captured events.

## Where this goes next: living company memory

Each Work Map is versioned. The apprentice stays on after the first session. When new sessions show steps that differ from the current map, it asks only about the difference and updates the map after the expert confirms. The same machine-checkable guardrails that block a new hire's save can let an agent take routine steps itself and stop at the points where the expert would stop and ask.
