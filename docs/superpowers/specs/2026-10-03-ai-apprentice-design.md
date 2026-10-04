# AI Apprentice — Design

**Date:** 2026-10-03
**Status:** Approved
**Context:** ElevenLabs × Hack-Nation challenge 01. Solo build, ~11h45m to submission.

## Goal

An end-to-end MVP that watches an expert process supplier invoices on a mock ERP,
asks *why* at natural pauses (Capture), runs a spoken debrief that ends in a
confirmed teach-back and produces a clickable Work Map (Map), then coaches a new
hire on an unseen case and stops a wrong decision before it is saved (Teach).

## Decisions made

| Decision | Choice |
| --- | --- |
| Workflow | The brief's invoice example on a mock ERP we build. |
| Stack | Vite + React client, small Express server (holds keys). |
| Screen understanding | Real vision pipeline: `getDisplayMedia` frames → pixel-diff gate → Claude vision → structured events. |
| Voice | ElevenAgents via `@elevenlabs/react` `useConversation`, Claude as the agent LLM, Expressive Mode on. One agent per role (interviewer, tutor). |
| Staying quiet | `skip_turn` system tool + `sendUserActivity()` on input + client-side `[PAUSE]` signal. |
| Pre-save catch (Teach) | The ERP's Save posts `save_attempt` over `BroadcastChannel`; the client checks structured guardrails and can veto. Vision is not relied on to win this race. |
| PII | Vision prompt tokenizes names/IBANs/emails; server regex pass as backstop. No Presidio. |
| Storage | JSON files + JPEG frames under `server/data/sessions/`. No DB. |
| Out of scope | All stretch goals (two experts, multilingual, agent export), auth, multi-user. |

## Architecture

```
┌─ Tab A: /erp (mock ERP, screen-shared) ──┐      BroadcastChannel('apprentice')
│ invoice list · detail · cost center ·    │ ───▶ activity pings, save_attempt
│ Approve / Hold / Escalate · Save         │ ◀─── save_verdict {ok | veto}
└──────────────────────────────────────────┘
┌─ Tab B: /capture | /map | /teach ────────────────────────────────┐
│ ScreenSampler: frame every 1.5s → pixel-diff gate                │
│   → POST /api/frame (prev + curr JPEG) → Event[]                 │
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
│ POST /api/sessions/:id/synthesize  → draft WorkMap + openQuestions│
│ POST /api/sessions/:id/finalize    → confirmed WorkMap           │
│ GET  /api/workmaps/latest                                        │
│ GET  /frames/:session/:file.jpg                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Data model

```ts
Session  { id, mode: 'capture'|'teach', startedAt, events: Event[], transcript: Utterance[],
           frames: { t: number, file: string }[], offRecord: [number, number][] }
Event    { t, kind: 'open'|'field_change'|'action'|'hold'|'escalate'|'other',
           invoice?: string, field?: string, from?: string, to?: string, note: string, frame: string }
Utterance{ t, speaker: 'expert'|'agent'|'learner', text, offRecord?: boolean }
WorkMap  { id, task, expert, sessionId, steps: Step[], guardrails: Guardrail[], confirmedAt }
Step     { n, title, t, frame, decision, reason: { quote, source: 'live'|'debrief', t } }   // t + frame = screen moment
Guardrail{ id, stepN, rule, kind: 'limit'|'exception'|'stop_and_ask', quote, t, frame,
           check?: { when: Cond[], require: Cond } }   // machine-checkable form, used by Teach
Cond     { field: 'amount'|'category'|'supplier'|'entity'|'cost_center'|'asset_no'|'month'|'action',
           op: '>'|'<'|'=='|'!='|'in'|'empty'|'not_empty', value?: string|number|string[] }
```

`t` is seconds since session start. Every reason and guardrail carries the
expert's verbatim quote and timestamp — a requirement of the brief.

## Mock ERP (`/erp`)

Single page. Left: invoice list. Right: detail with supplier, entity, amount,
line description, category, cost center (editable select: 4711 Opex, 0400 Capex,
4720 Services), asset number field, buttons Approve / Hold / Escalate. Each button
is a save: it commits the decision for that invoice.
State in memory, seeded from `client/src/erp/seed.js`:

- **Capture set** (expert): INV-4471 Kessler Maschinen €6,850 "CNC spindle" (expert recodes 4711→0400);
  INV-4472 Brandt Office Supplies €312, December (supplier double-bills in December → Hold);
  INV-4473 Strojírny Plzeň s.r.o. (Czech subsidiary) €2,140 → Escalate for second approval.
- **Teach set** (new hire): INV-5120 Kessler Maschinen €7,200 "Hydraulic press" defaulting to 4711.

The ERP posts every keydown/click as `{type:'activity'}` and every decision as
`{type:'save_attempt', invoice:{…full record…}, action}`. In Capture mode no one answers
and the save proceeds after 300 ms; in Teach mode it waits for `save_verdict`.

## Module 1: Capture

1. Expert opens `/erp` in Tab A and `/capture` in Tab B, clicks **Start**, picks Tab A in the share dialog.
2. `ScreenSampler` grabs a frame every 1.5 s into a 64×36 canvas; if mean abs pixel diff vs. last sent frame < threshold, skip. Otherwise POST full-res JPEG (q=0.7, max 1280 px wide) plus previous frame.
3. Server asks Claude (vision) for JSON `Event[]` describing only what changed, with PII replaced by tokens (`[PERSON]`, `[IBAN]`, `[EMAIL]`); server regex backstop; saves the frame.
4. Client pushes each event as `[EVENT t=…] …` via `sendContextualUpdate`.
5. `PauseDetector` fires `[PAUSE] last events: …` via `sendUserMessage` (contextual updates never trigger a reply) once per quiet window (≥4 s no ERP activity, agent and user not speaking, no event in last 3 s). Calls `sendUserActivity()` on every ERP activity ping.
6. Interviewer system prompt: you are an apprentice; use `skip_turn` unless you receive `[PAUSE]` or are addressed directly; on `[PAUSE]` ask one ≤15-word question about the most recent event whose reason is not visible on screen, prefer guardrails (limits, exceptions, when to stop and ask); 3–5 questions total, at least one guardrail question; never ask what the screen already shows.
7. `onMessage` appends to transcript (posted to server in batches).
8. **Off the record** toggle: stops sampling, sends `[OFF RECORD]` context, flags utterances `offRecord`. Excluded from synthesis.
9. **Task done** → Map.

## Module 2: Map

1. `POST /synthesize`: Claude merges events + on-record transcript → draft `WorkMap` and `openQuestions[]` (3–5: unexplained events, uncertain rules, unseen cases).
2. Debrief session starts with the interviewer agent, `overrides.agent.prompt` swapped to the debrief prompt with open questions and draft steps interpolated client-side. It asks each open question, then gives a ≤60 s teach-back. Client tools: `mark_answered({index})`, `confirm_teachback()`.
3. **Done criterion:** all open questions marked answered AND `confirm_teachback` called after the expert says it is right. Corrections → agent revises and repeats the changed part.
4. `POST /finalize`: Claude produces the final `WorkMap` from draft + debrief transcript, including `check` conditions for each guardrail where expressible. Saved; `/map` renders it.
5. `/map` UI: horizontal timeline of steps; clicking a step shows its frame, decision, quote with source + timestamp, and attached guardrails. Each step/guardrail has a delete (trust) control.

## Module 3: Teach

1. New hire opens `/erp?mode=teach` and `/teach`; tutor agent starts with the latest Work Map interpolated into its prompt override (compact text) and the same frame pipeline.
2. Tutor prompt: explain each step in the expert's words, ask the learner to predict the next decision at pauses, never just give the answer first.
3. On `save_attempt`, `checkGuardrails(invoice, action, workmap.guardrails)` (pure function). Violation → `save_verdict:veto`, ERP shows "Held by tutor", client sends `[VIOLATION] guardrail …, expert said "…"` to tutor via `sendUserMessage` so it speaks; panel shows the expert's frame from that guardrail. Learner fixes and saves again → ok.
4. Client tool `record_outcome({stepN, result:'mastered'|'practice'})`; end screen lists mastered vs. practice-next.

## Error handling

- Vision call fails/times out (8 s): drop that frame, keep going; never block the agent.
- Vision returns invalid JSON: one retry with "JSON only", else drop.
- ElevenLabs disconnect: show banner + Reconnect; session data is server-side, so nothing is lost.
- Synthesis invalid JSON: retry once; on failure show raw text with a Retry button.
- Screen share ended by user: stop sampler, keep conversation.

## Testing

- Vitest unit tests for pure logic: pixel-diff gate, `PauseDetector` state machine, `checkGuardrails`, PII regex, Work Map JSON validation.
- Server routes tested with Claude mocked.
- Manual end-to-end rehearsal of the judge script (capture → debrief → teach on INV-5120) before recording.

## Demo answers to the Apprentice Test

1. **When to ask** — PauseDetector + `sendUserActivity` + `skip_turn`.
2. **What to ask** — only events whose reason isn't on screen; guardrail-first budget.
3. **When understood** — all open questions answered + confirmed teach-back.
4. **Learned?** — unseen INV-5120, pre-save veto, mastery summary.
5. **Trust** — off-the-record toggle, PII tokenization, delete step.
