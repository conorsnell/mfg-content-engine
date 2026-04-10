export type ContentType =
  | "blog"
  | "email"
  | "linkedin"
  | "capability-onepager"
  | "case-study"
  | "trade-show-followup";

export interface ClientProfile {
  id: string;
  name: string;
  pm: string;
  writer: string;
  industry: string;
  what_they_make: string;
  who_they_sell_to: string;
  key_differentiators: string[];
  common_customer_pain_points: string[];
  certifications: string[];
  target_industries: string[];
  tone: string;
  avoid: string[];
  past_topics: string[];
  approval_contact: string;
  services: string[];
  notes: string;
}

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  blog: "Blog Post",
  email: "Marketing Email",
  linkedin: "LinkedIn Post",
  "capability-onepager": "Capability One-Pager",
  "case-study": "Case Study",
  "trade-show-followup": "Trade Show Follow-Up Email",
};

function buildClientContext(client: ClientProfile): string {
  return `
CLIENT PROFILE
==============
Company: ${client.name}
Industry: ${client.industry}

What they make:
${client.what_they_make}

Who they sell to:
${client.who_they_sell_to}

Key differentiators:
${client.key_differentiators.map((d) => `- ${d}`).join("\n")}

Common customer pain points they solve:
${client.common_customer_pain_points.map((p) => `- ${p}`).join("\n")}

Certifications & credentials:
${client.certifications.length > 0 ? client.certifications.join(", ") : "None listed"}

Target industries:
${client.target_industries.join(", ")}

Tone & voice guidance:
${client.tone}

Avoid in all content:
${client.avoid.map((a) => `- ${a}`).join("\n")}

Past content topics (for context/avoid repeating):
${client.past_topics.map((t) => `- ${t}`).join("\n")}

Additional writer notes:
${client.notes}
`.trim();
}

export function buildSystemPrompt(
  client: ClientProfile,
  contentType: ContentType
): string {
  const clientContext = buildClientContext(client);

  const baseSystem = `You are an expert B2B manufacturing content writer for demandDrive, a marketing agency specializing in US-based manufacturing companies. Your job is to write high-quality, revenue-focused content that helps manufacturing SMBs generate leads, build credibility, and support their sales teams.

You write content that:
- Is technically credible and specific, never generic
- Speaks directly to the buyer's pain points and decision criteria
- Positions the client as the expert, not just a vendor
- Avoids fluffy marketing language and empty claims
- Uses concrete details, numbers, and specifics wherever possible
- Is optimized to support the sales process, not just SEO metrics

${clientContext}`;

  const typeInstructions: Record<ContentType, string> = {
    blog: `
CONTENT TYPE: Blog Post
=======================
Write a complete, publish-ready blog post. Requirements:
- Length: 1,200-1,500 words
- Structure: Engaging headline, brief intro that hooks on a pain point, 4-5 substantive sections with clear H2 subheadings, conclusion with soft CTA
- Tone: Educational and expert, not salesy
- SEO: Naturally weave in the topic keyword and related terms; don't keyword-stuff
- CTA: End with a low-friction call to action (contact us, get a quote, learn more about X)
- Output the full post in markdown format, including the headline as H1
`,
    email: `
CONTENT TYPE: Marketing Email
==============================
Write a complete marketing email. Requirements:
- Subject line: Compelling, specific, under 50 characters. Provide 2-3 options.
- Preview text: 1 sentence that complements the subject line
- Length: 200-350 words in the body
- Structure: Personal opener tied to a pain point, brief value proposition, 1-2 sentences on how the client solves it, single clear CTA button/link
- Tone: Direct, human, not corporate-speak
- Format: Output as: Subject Options, Preview Text, then Email Body in plain text
`,
    linkedin: `
CONTENT TYPE: LinkedIn Post
============================
Write a LinkedIn post for the company page or to be ghostwritten for the owner/president. Requirements:
- Length: 150-300 words
- Structure: Hook in first line (before "see more" cut), story or insight, concrete takeaway, optional question or CTA
- Tone: Conversational and expert. First-person if ghostwritten for an individual.
- No hashtag spam — max 3 relevant hashtags at the end
- Output the post as plain text, ready to paste into LinkedIn
`,
    "capability-onepager": `
CONTENT TYPE: Capability One-Pager
====================================
Write a structured capability overview that a sales rep can send to a prospect or leave behind at a trade show. Requirements:
- Format: Use clear sections with headers
- Sections to include:
  1. Company Overview (2-3 sentences, what they do and who they serve)
  2. Core Capabilities (bullet list, be specific — materials, tolerances, processes, capacity)
  3. Industries Served
  4. Why [Company Name] (3-4 differentiators, framed as buyer benefits)
  5. Certifications & Quality
  6. Contact / Get a Quote (placeholder CTA)
- Tone: Professional and confident. Buyers will read this when evaluating vendors.
- Length: Enough to fill one printed page (roughly 300-450 words of body copy)
- Output in markdown format
`,
    "case-study": `
CONTENT TYPE: Case Study
=========================
Write a customer case study framework (note: since we don't have specific customer details, write this as a templated case study with clear [PLACEHOLDER] tags where the writer should insert real customer details).
Requirements:
- Structure:
  1. Headline: "[Customer Type] Achieves [Result] with [Client Name]" — provide a template
  2. The Challenge (2-3 sentences on the problem the customer faced)
  3. Why They Chose [Client Name] (2-3 sentences on the selection criteria)
  4. The Solution (what was delivered, how it worked)
  5. The Results (quantified outcomes — use [X%], [$X], [X weeks] placeholders)
  6. Quote (a templated testimonial quote with [CUSTOMER NAME] placeholder)
  7. About [Client Name] (2-3 sentence company boilerplate)
- Output in markdown format
`,
    "trade-show-followup": `
CONTENT TYPE: Trade Show Follow-Up Email
=========================================
Write a post-trade-show follow-up email sequence (3 emails). Requirements:
- Email 1 (Day 1-2 post show): Warm reconnect, specific reference to the show, brief reminder of value prop, low-friction next step
- Email 2 (Day 5-7): Add value with a resource or insight relevant to their likely pain point, reiterate the CTA
- Email 3 (Day 14): Final nudge, acknowledge they're busy, one last clear ask
- Each email: Subject line, 150-250 words, direct CTA
- Tone: Human and persistent without being pushy
- Output each email clearly labeled with subject line and body
`,
  };

  return baseSystem + "\n\n" + typeInstructions[contentType];
}

export function buildUserMessage(topic: string, additionalContext?: string): string {
  let message = `Topic / focus for this piece: ${topic}`;
  if (additionalContext && additionalContext.trim()) {
    message += `\n\nAdditional context or specific angles to cover:\n${additionalContext}`;
  }
  message += "\n\nPlease write this content now, ready for writer review.";
  return message;
}
