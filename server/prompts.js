export const FRAME_SYSTEM = `You watch screenshots of an accounts-payable ERP while a person works.
Compare PREVIOUS and CURRENT and report only what the person changed or did.
Return JSON only: {"events":[{"kind":"open|field_change|action|hold|escalate|other","invoice":"INV-…","field":"cost_center|asset_no|…","from":"…","to":"…","note":"≤12 words"}]}
- Omit keys that don't apply. Return {"events":[]} if nothing meaningful changed (cursor, hover, scrolling don't count).
- Opening an invoice = "open". Status becoming approved = "action"; on hold = "hold"; escalated = "escalate".
- Do not repeat anything listed in Recent events.
- Replace person names with [PERSON], IBANs with [IBAN], emails with [EMAIL]. Supplier and company names are not personal data.`

export const SYNTH_SYSTEM = `You turn an expert's recorded screen session into a draft Work Map.
Input: EVENTS (screen changes, t = seconds) and TRANSCRIPT (expert and apprentice speech, t = seconds).
Return JSON only:
{"workMap":{"task":"short task name","steps":[{"n":1,"title":"…","t":12.5,"decision":"what was decided","reason":{"quote":"verbatim expert words or empty","source":"live","t":15}}],
 "guardrails":[{"id":"g1","stepN":2,"rule":"…","kind":"limit|exception|stop_and_ask","quote":"verbatim or empty","t":16}]},
 "openQuestions":["…"]}
Rules:
- 5-9 steps in order. step.t is the screen moment the decision happened.
- Quotes must be copied verbatim from expert lines in TRANSCRIPT. Never invent a quote; leave it empty instead.
- 3-5 openQuestions about what is still unclear: decisions with no stated reason, rules that may or may not generalize ("every supplier or just this one?"), cases not seen ("what if there is no asset number?"), and who decides or must be asked. Do not ask what the expert already explained.`

export const FINALIZE_SYSTEM = `You finalize a Work Map from a DRAFT and the DEBRIEF transcript in which the expert answered open questions and confirmed a teach-back.
Return JSON only: {"workMap":{"task":"…","steps":[…same shape as draft…],"guardrails":[…same shape plus optional "check"…]}}
- Fill missing reasons and add new guardrails from the debrief, quoting the expert verbatim with "source":"debrief" and the debrief line's t.
- Apply any corrections the expert made. Keep step.t from the draft.
- For every guardrail expressible over a single invoice, add
  "check":{"when":[Cond,…],"require":Cond}
  Cond = {"field":"amount|category|supplier|entity|cost_center|asset_no|month|action","op":">|<|==|!=|in|empty|not_empty","value":…}
  Fields: amount in EUR (number); category: equipment|supplies|parts|services; cost_center: "4711" opex general, "0400" capex equipment, "4720" opex services; asset_no string; month 1-12; supplier and entity as shown on the invoice; action: approve|hold|escalate.
  A violation is: all "when" true and "require" false.
  Example "equipment over €5,000 is always capex":
  {"when":[{"field":"amount","op":">","value":5000},{"field":"category","op":"==","value":"equipment"},{"field":"action","op":"==","value":"approve"}],"require":{"field":"cost_center","op":"==","value":"0400"}}
  Example "never approve Brandt in December, hold it": {"when":[{"field":"supplier","op":"==","value":"Brandt Office Supplies"},{"field":"month","op":"==","value":12}],"require":{"field":"action","op":"==","value":"hold"}}`
