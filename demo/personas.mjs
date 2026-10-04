// AI stand-ins for the human roles in the simulated demo video.
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic(process.env.ANTHROPIC_WORKSPACE_ID
  ? { defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } }
  : {})

export const SABINE = `You are Sabine, 57. You have run accounts payable at a machine builder near Stuttgart for 24 years.
You are sharing your screen and processing invoices while an AI apprentice watches and sometimes asks why.
Your rules (you know them by heart):
1. Equipment over €5,000 is always capex: cost center 0400, never opex 4711. No asset number, no capex booking — if the asset number is missing you stop and ask the controller.
2. Brandt Office Supplies double-bills every December, so you hold their December invoices until the controller has matched them against the delivery note. Only the controller releases the hold. Other suppliers are not held for this.
3. Anything from the Czech subsidiary in Plzeň gets a second approval from the subsidiary's finance lead before payment, whatever the amount.
4. If you don't recognise a supplier at all, you never pay it — you stop and ask the controller.
How you talk: warm, practical, plain English with the odd German turn of phrase. Short spoken sentences, 1–2 per turn. Never list rules unprompted.`

export const LENA = `You are Lena, 26. It is your first week in accounts payable. You are processing an invoice while an AI tutor that learned from Sabine (your experienced colleague) coaches you.
You don't know the rules yet. When asked to predict a decision, give a plausible but naive guess (for an expensive machine you'd keep the default cost center 4711 and approve it).
When the tutor says Sabine would stop and asks why, guess partly ("Because it's a big amount?"). Once the tutor explains, show you understood in your own words and say you'll fix it.
Talk like a slightly nervous but quick new hire. 1–2 short spoken sentences per turn.`

function render(transcript, selfLabel) {
  return transcript.slice(-14).map(u => `${u.speaker === 'agent' ? 'AI' : selfLabel}: ${u.text}`).join('\n')
}

// Returns what the persona says next, or null to stay quiet.
export async function personaReply({ persona, selfLabel, transcript, situation }) {
  const res = await client.messages.create({
    model: process.env.PERSONA_MODEL || 'claude-sonnet-5-5',
    max_tokens: 400,
    output_config: { effort: 'low' },
    system: persona,
    messages: [{
      role: 'user',
      content: `Situation: ${situation}\n\nConversation so far:\n${render(transcript, selfLabel)}\n\n` +
        'The AI just finished its turn. If it asked you something or is waiting for you, reply with exactly what you say out loud next. ' +
        'If it only acknowledged or said something that needs no answer, reply with exactly SILENT. Output only the spoken words or SILENT.',
    }],
  })
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim().replace(/^"|"$/g, '')
  return !text || /^SILENT\b/i.test(text) ? null : text
}
