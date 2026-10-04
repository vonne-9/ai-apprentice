# Demo script

Rough length: 6 to 7 minutes. Each beat is tagged with the Apprentice Test question it answers.

## Before you start

- `rm -rf server/data` so the Work Map is built from this run only.
- `npm run dev`. Open two browser windows side by side (not tabs, so the ERP stays visible when you share it):
  - Left: `http://localhost:5173/erp`
  - Right: `http://localhost:5173/capture`
- Headphones on, so the agent's voice doesn't leak back into the mic.

## Part 1: Capture (expert works, apprentice watches)

**Click:** on `/capture`, press "Start — share the ERP window", pick the ERP window in the share dialog, allow the mic.

**Say:** "I'm going to process three supplier invoices. Just watch, I'll talk when something isn't obvious."

### Invoice INV-4471 (Kessler, EUR 6,850, CNC spindle)

1. Open INV-4471. Read it quietly for a few seconds.
2. Change the cost center from 4711 to 0400 and type an asset number. Stay silent while you do this.
3. Wait. After about 4 seconds of no input the agent asks one short question about the recode.
4. **Say:** "Anything over 5,000 that's a machine or equipment isn't an expense, it's capex. It goes to 0400 and needs an asset number, otherwise fixed assets bounces it."
5. Click Approve.

**Apprentice Test 1 (when to ask):** while you were changing the field and typing, the agent said nothing. Point at the "listening" indicator and the "N questions asked" count on the capture page: the count stays flat while you type, then goes up after the pause. The mechanism is the `[PAUSE]` signal from `pauseDetector.js`, `sendUserActivity()` on every ERP keystroke, and the agent's `skip_turn` tool for everything else. Optional, confirm in rehearsal before relying on it: type in the asset number field while it is mid-question and see whether it stops.

**Apprentice Test 2 (what to ask):** the question was about the recode, a reason that isn't visible on screen. It did not ask "what is the supplier?" or "what is the amount?", which are already in the frame.

### Invoice INV-4472 (Brandt Office Supplies, EUR 312, December)

1. Open INV-4472, pause briefly.
2. Click Hold, without explaining.
3. When the agent asks why, **say:** "Brandt double-bills in December. They resend the same invoices at year end, so I hold anything from them in December until I've checked for duplicates."

### Invoice INV-4473 (Strojírny Plzeň s.r.o., EUR 2,140)

1. Open INV-4473.
2. Before touching anything, click "Go off the record" and say something like "Off the record, this supplier has had payment trouble." Then click "Back on the record".
3. Click Escalate.
4. **Say:** "This one belongs to the Czech subsidiary. I can't approve it alone, it needs a second approval from the local entity."

**Apprentice Test 5 (trust), part 1:** the off-the-record stretch has no frame sampling, the transcript lines are greyed out, and none of it reaches the Work Map. You can check this later: that remark isn't anywhere on the map.

Click "Task done → debrief".

## Part 2: Debrief and Work Map

**Click:** on `/map`, "Start debrief". Let the draft Work Map and the open-question checklist appear.

The agent asks the open questions one at a time. Answer them briefly. Deliberately correct one detail when it comes up, for example change the capex threshold or the December rule wording, so the teach-back has something to fix.

**Apprentice Test 3 (when it understands):** the open-question checklist turns green item by item as the agent calls `mark_answered`. The agent then gives a teach-back of about a minute. Say it's not quite right, let it correct that part, then confirm. The debrief only finishes when all questions are answered and `confirm_teachback` has fired. Point out that it didn't finish just because the questions ran out.

**Click** through the finished Work Map: select a step, show the frame from the expert's screen, the decision, the verbatim quote with timestamp and whether it came from live or the debrief, and the guardrails attached to the step.

**Apprentice Test 5 (trust), part 2:**
- Click "Remove step from the record" on one step, or "Remove" on one guardrail, and show it disappears from the map.
- Show the PII handling: supplier contacts, IBANs and emails in the frames and transcript show up as `[PERSON]`, `[IBAN]`, `[EMAIL]` tokens. If you want a live example, type a fake IBAN into a field during capture and show the token in the stored events.

## Part 3: Teach (new hire, unseen case)

**Click:** close the expert ERP window, open `http://localhost:5173/erp?mode=teach` on the left and `http://localhost:5173/teach` on the right. Press "Start — share the training ERP window".

The tutor opens by walking through the steps in the expert's words and asks you to predict the next decision before telling you.

**Say (as the new hire):** "Kessler, 7,200 for a hydraulic press, cost center is 4711. That looks fine, I'll approve it."

**Click** Approve on INV-5120 without changing the cost center.

The save is held. The ERP shows "Held by tutor", and the tutor speaks the rule in the expert's own words (capex over 5,000, needs 0400 and an asset number). The side panel shows the frame from the expert's session where that rule came from.

Now fix it: change the cost center to 0400, enter an asset number, click Approve again. This time it saves.

**Apprentice Test 4 (did the new hire learn):** INV-5120 is a case the expert never processed. The tutor stopped the wrong save before it was committed, and the correct one went through. Then click "Finish session"; the mastery screen only appears after that. Steps the learner got right are marked mastered, the capex step is listed under "Practice next" because it needed the veto. Steps the tutor never recorded an outcome for show "Not practiced yet". The veto is a client-side check of the Work Map's guardrails against the save attempt (`checkGuardrails`), not a model judgement, so it triggers reliably.

## Closing line

"The expert talked for about five minutes while working. The apprentice asked at the right moments, said back what it understood until the expert agreed, and then caught a mistake on a case it had never seen."

Optional, for the slide: each Work Map is versioned. When later sessions show steps that differ from the map, the apprentice only asks about the difference.

## If something goes wrong

- Agent talks over you during capture: check headphones first, then that the ERP window is the one being shared.
- No question after a long pause: look at the "Screen events" feed on the capture page. If no new events appear, the screen share is on the wrong window.
- Veto doesn't fire in Teach: the ERP must be opened with `?mode=teach`, otherwise saves go through without waiting for the tutor.
- Vision calls are slow or failing: the server logs it and drops that frame. Capture continues, just with fewer events.
