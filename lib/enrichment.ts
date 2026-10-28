import { z } from 'zod';
import { query } from './db';
import { generateJSON } from './ai';
export async function enrichLead(leadId: string) {
  const [lead] = await query('SELECT id,company,interest,budget,timeline FROM agentflow.leads WHERE id=$1', [leadId]);
  if (!lead) return;
  const schema = z.object({ summary: z.string().max(1000), recommendedNextStep: z.string().max(1000), urgency: z.enum(['low','normal','high']), aiScore: z.number().int().min(0).max(100), scoreRationale: z.string().max(1000), unknowns: z.array(z.string().max(200)).max(10) });
  const enrichment = await generateJSON('Assess this business enquiry using only the supplied facts. Return {summary,recommendedNextStep,urgency,aiScore,scoreRationale,unknowns}. Score readiness, not a person\'s identity. Missing budget or timeline is unknown, not a fact to invent. Do not look up private information or infer contact details. Do not assume consent. This advisory score must not replace the transparent completeness score.', [{ text: JSON.stringify(lead) }], schema);
  await query('UPDATE agentflow.leads SET enrichment=$2 WHERE id=$1', [leadId, { ...enrichment, generatedAt: new Date().toISOString(), advisory: true }]);
}
