/**
 * populate-clients.mjs
 *
 * Runs once to auto-generate client profiles using the Claude API.
 * Saves results to data/clients.json.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=your_key node scripts/populate-clients.mjs
 *
 * It processes clients in batches, saves progress as it goes, and can
 * be safely re-run if interrupted — already-completed profiles are skipped.
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "../data/clients.json");
const PROGRESS_PATH = path.join(__dirname, "../data/clients-progress.json");

// ─── Seed data from your spreadsheets ────────────────────────────────────────
// Each entry has: name, pm, writer, and notes from your internal records.
// Claude will research the rest from what it knows about each company.

const SEED_DATA = [
  { name: "A&G Machine, Inc.", pm: "Kristyna", writer: "Ryann", notes: "Had been through writer changes before. Concerned about slow sales." },
  { name: "Acme Foundry, Inc.", pm: "Anthony", writer: "Jake", notes: "New POC is Savannah. Blog, email, LinkedIn. Solid relationship." },
  { name: "Advantage Sintered Metals, Inc.", pm: "Alison", writer: "Jake", notes: "Recently started content marketing." },
  { name: "Alloy Fabrication Inc.", pm: "Kerrie", writer: "Jake", notes: "" },
  { name: "Auglaize Erie Machine, Inc.", pm: "Becky", writer: "Ryann", notes: "Published site in Nov. Laid back client. Concerned about slow sales. Doesn't fully understand content marketing yet." },
  { name: "Automated Systems, Inc.", pm: "Anthony", writer: "Whitney", notes: "Launched website recently. Keep close eye on sales performance." },
  { name: "Benchmark Foam, Inc.", pm: "Anthony", writer: "Ryann", notes: "Great relationship. Parted with sales team but kept marketing. Contact is Jackie." },
  { name: "Blackhawk Engineering", pm: "Ryan", writer: "Ryann", notes: "" },
  { name: "Brasch Environmental Technologies", pm: "TBD", writer: "Autumn", notes: "New client, not started yet." },
  { name: "Broadview Technologies, Inc.", pm: "Becky", writer: "Whitney", notes: "Chemical company. Added products over time. Sister company is HyCrete. Doing social media and blogs. Has specific target keywords and seeing SEO progress." },
  { name: "Century Wire Products", pm: "Alison", writer: "Jake", notes: "Focused on only limited logins to website." },
  { name: "ChemTec", pm: "Ryan", writer: "Ryann", notes: "Still in website writing phase." },
  { name: "CJSeto Support Services, LLC", pm: "Anthony", writer: "Ryann", notes: "Slow approvals. Serves government and school sectors." },
  { name: "Core Pipe Products, Inc.", pm: "Ryan", writer: "Ryann", notes: "" },
  { name: "Cryogenic Plastics, Inc.", pm: "TBD", writer: "Ryann", notes: "Not started yet." },
  { name: "Custom Magnetics, Inc.", pm: "Becky", writer: "Whitney", notes: "Renegotiated to cap at 20 hours/month. Slow to respond." },
  { name: "Detroit Stoker Company", pm: "Kerrie", writer: "Whitney", notes: "Turning focus to collateral content. Needs extra attention." },
  { name: "Eagle Group", pm: "Kerrie", writer: "Whitney", notes: "High tier client." },
  { name: "EnviCor Rotomolding", pm: "Kerrie", writer: "Autumn", notes: "In web development phase, planning site launch, ready to jump into content marketing." },
  { name: "Form Tool Technology, Inc.", pm: "TBD", writer: "Ryann", notes: "Not started yet." },
  { name: "Formco Metal Products, Inc.", pm: "Kerrie", writer: "Whitney", notes: "Reduced to 10 hours/month." },
  { name: "Formed Plastics, Inc.", pm: "Anthony", writer: "Ryann", notes: "" },
  { name: "G.A. Richards Group", pm: "Kerrie", writer: "Autumn", notes: "" },
  { name: "GDCA", pm: "Kerrie", writer: "Whitney", notes: "Very particular client. Whitney has a good handle on their preferences." },
  { name: "Glen Magnetics, Inc.", pm: "TBD", writer: "Autumn", notes: "Not started yet." },
  { name: "HeiQ ChemTex Inc.", pm: "Kristyna", writer: "Ryann", notes: "Content marketing to begin once website goes live." },
  { name: "Henry & Wright Corporation", pm: "TBD", writer: "Autumn", notes: "New client, not started yet." },
  { name: "Hy Tech Spring and Machine Co.", pm: "Alison", writer: "Jake", notes: "Good spot. Stable relationship." },
  { name: "Hycrete (a division of Broadview)", pm: "Ryan", writer: "Jake", notes: "Division of Broadview Technologies." },
  { name: "Jonti-Craft", pm: "TBD", writer: "Autumn", notes: "Not started yet." },
  { name: "Kay Industries", pm: "Ryan", writer: "Autumn", notes: "" },
  { name: "Kiesler Machine, Inc.", pm: "Anthony", writer: "Autumn", notes: "Doing translation work. Looking to focus on UK market." },
  { name: "Knight Carbide, Inc.", pm: "Alison", writer: "Autumn", notes: "Not super needy. Tough to get feedback or imagery." },
  { name: "Kuroda Jena Tec, Inc.", pm: "Alison", writer: "Whitney", notes: "Publishes blogs on their own site." },
  { name: "Liberty Molds, Inc.", pm: "Alison", writer: "Ryann", notes: "10 hours of marketing support per month. Biweekly cadence." },
  { name: "Lindquist Machine Corporation", pm: "Ryan", writer: "Ryann", notes: "" },
  { name: "Linfor, Inc.", pm: "Ryan", writer: "Autumn", notes: "" },
  { name: "LobePro Rotary Pumps", pm: "Anthony", writer: "Whitney", notes: "Great content historically. Slow on email approvals due to formatting preferences. Parts sales have dropped off." },
  { name: "Maca Casting and Machine", pm: "Anthony", writer: "Whitney", notes: "High tier client. Reads blogs aloud on calls. Did website updates and GMB listing updates." },
  { name: "MAE-Eitel Inc.", pm: "Alison", writer: "Autumn", notes: "" },
  { name: "Maxwell Lighting", pm: "Becky", writer: "Whitney", notes: "One of oldest clients. Lighting projects for new construction and retrofits. Built their site. Now sees SEO benefits and is very happy. Doing blogs, emails, social. Becky wants to add case studies." },
  { name: "Mectron Inspection Engineering", pm: "Anthony", writer: "Ryann", notes: "Great 2-year relationship. Slow to approve. Machines sell for ~$1.5M. Long sales cycle. Tariffs hitting hard." },
  { name: "MedFab Precision Solutions", pm: "Becky", writer: "Autumn", notes: "Reduced to 10-20 hours/month with 15 as the sweet spot." },
  { name: "MicroTool Company, Inc.", pm: "Kerrie", writer: "Jake", notes: "" },
  { name: "Miyama USA", pm: "Ryan", writer: "Jake", notes: "" },
  { name: "MW Piping Fabrication, LLC", pm: "Becky", writer: "Whitney", notes: "Built site in 2025. Very happy with marketing. Just got a job from organic search. Was reluctant about content early but now fully on board." },
  { name: "P&F Machining, Inc.", pm: "Ryan", writer: "Ryann", notes: "No issues. Stable." },
  { name: "Pacific Plastic Technology, Inc.", pm: "Becky", writer: "Ryann", notes: "" },
  { name: "Panova", pm: "Kerrie", writer: "Jake", notes: "Marketing only client. Needs extra attention — didn't love past writer changes." },
  { name: "Protective Coatings, Inc.", pm: "Alison", writer: "Autumn", notes: "" },
  { name: "RAM/Decorative Metal", pm: "Ryan", writer: "Jake", notes: "" },
  { name: "Rapid Machining, LLC", pm: "TBD", writer: "Autumn", notes: "Not started yet." },
  { name: "Regal Metal Products Company", pm: "Kerrie", writer: "Ryann", notes: "" },
  { name: "Reid", pm: "Ryan", writer: "Whitney", notes: "" },
  { name: "RG Precision", pm: "TBD", writer: "Autumn", notes: "Not started yet." },
  { name: "Riverstone Machining, LLC", pm: "TBD", writer: "Autumn", notes: "Not started yet." },
  { name: "S&W Metal Products", pm: "Alison", writer: "Jake", notes: "Launched site, working on second site, picking up content marketing now." },
  { name: "Scherer, Inc.", pm: "Ryan", writer: "Jake", notes: "" },
  { name: "SI Manufacturing", pm: "Kerrie", writer: "Whitney", notes: "Recently acquired by an ISR company. Watch closely." },
  { name: "Silvex Inc.", pm: "Becky", writer: "Jake", notes: "Launched site a few months ago. Another agency (PageOne) also writing blogs, alternating posts." },
  { name: "Specialty Machine", pm: "TBD", writer: "Ryann", notes: "Not started yet." },
  { name: "Stein Seal", pm: "Kerrie", writer: "Autumn", notes: "High stakes client. Was unhappy about losing their previous writer Chris." },
  { name: "Stone City Products", pm: "Anthony", writer: "Jake", notes: "Outside SEO agency also involved. Rebuilt website. Both demandDrive and consultant producing content. LinkedIn campaign running." },
  { name: "Superior Machining & Fabrication", pm: "Ryan", writer: "Jake", notes: "" },
  { name: "The Lindgren Group", pm: "Ryan", writer: "Ryann", notes: "High tier client." },
  { name: "Topcraft Precision Manufactured Solutions", pm: "Anthony", writer: "Ryann", notes: "Content marketing, website updates, created case studies. Sales not coming in as expected." },
  { name: "Triangle Rubber & Plastics", pm: "Kerrie", writer: "Whitney", notes: "" },
  { name: "Tryson Metal Stampings & Manufacturing, Inc.", pm: "Kerrie", writer: "Whitney", notes: "Not super passionate about marketing." },
  { name: "Vidon Plastics, Inc.", pm: "Becky", writer: "Jake", notes: "" },
  { name: "WINBCO Tank Company", pm: "Anthony", writer: "Whitney", notes: "Good relationship. Good about approvals. Niche market within ~1000 mile radius. Opportunity for PPC." },
  { name: "Winona Powder Coating, Inc.", pm: "Alison", writer: "Jake", notes: "Really good about providing photos and feedback." },
  { name: "World Class Industries, Inc.", pm: "Ryan", writer: "Ryann", notes: "High tier client." },
  { name: "World Class Plastics, Inc.", pm: "Kerrie", writer: "Whitney", notes: "Marketing-only client at 20 hours/month." },
];

// ─── Profile generation prompt ────────────────────────────────────────────────

function buildPrompt(seed) {
  return `You are helping populate a client knowledge base for demandDrive, a B2B marketing agency that serves US-based manufacturing SMBs.

Research the following company and fill out the profile template below as accurately as possible. Use your training knowledge about this company. If you are not certain about a specific detail, make a reasonable inference based on the company name, industry, and context — but flag inferred fields with "(inferred)" so a human can verify.

COMPANY: ${seed.name}
INTERNAL NOTES: ${seed.notes || "None"}

Fill out this JSON profile. Return ONLY valid JSON, no other text:

{
  "id": "${seed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}",
  "name": "${seed.name}",
  "pm": "${seed.pm}",
  "writer": "${seed.writer}",
  "industry": "The specific manufacturing industry or niche (e.g. 'CNC Precision Machining', 'Custom Foam Manufacturing')",
  "what_they_make": "1-2 sentences describing their products and manufacturing processes",
  "who_they_sell_to": "Who their buyers are — job titles, company types, industries",
  "key_differentiators": [
    "Differentiator 1",
    "Differentiator 2",
    "Differentiator 3",
    "Differentiator 4"
  ],
  "common_customer_pain_points": [
    "Pain point 1",
    "Pain point 2",
    "Pain point 3"
  ],
  "certifications": ["List any likely certifications like ISO 9001, IATF 16949, AS9100, etc. or empty array if none likely"],
  "target_industries": ["Industry 1", "Industry 2", "Industry 3"],
  "tone": "2-3 sentences describing recommended tone and voice for content, based on the type of company and buyer",
  "avoid": ["Thing to avoid 1", "Thing to avoid 2"],
  "past_topics": [],
  "approval_contact": "${seed.notes.includes("contact") ? "See notes" : "Primary contact"}",
  "services": ["Blog"],
  "notes": "${seed.notes}"
}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY environment variable not set.");
    console.error("Run as: ANTHROPIC_API_KEY=your_key node scripts/populate-clients.mjs");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  // Load existing progress if any
  let existing = [];
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8"));
    } catch {}
  }

  const existingIds = new Set(existing.map((c) => c.id));
  const toProcess = SEED_DATA.filter(
    (s) => !existingIds.has(s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
  );

  console.log(`\n📋 demandDrive Client Profile Generator`);
  console.log(`   Already done: ${existing.length}`);
  console.log(`   To process:   ${toProcess.length}`);
  console.log(`   Total:        ${SEED_DATA.length}\n`);

  if (toProcess.length === 0) {
    console.log("✅ All clients already processed. Check data/clients.json.");
    return;
  }

  const results = [...existing];

  for (let i = 0; i < toProcess.length; i++) {
    const seed = toProcess[i];
    const num = existing.length + i + 1;
    process.stdout.write(`[${num}/${SEED_DATA.length}] ${seed.name}... `);

    try {
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: buildPrompt(seed) }],
      });

      const text = message.content[0].text.trim();

      // Extract JSON from response (handle case where model adds extra text)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");

      const profile = JSON.parse(jsonMatch[0]);
      results.push(profile);

      // Save progress after every client
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
      console.log("✓");

      // Small delay to avoid rate limiting
      if (i < toProcess.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      console.log(`✗ ERROR: ${err.message}`);
      console.log("  Skipping — will use template for this client.");

      // Add a minimal template so the client still appears in the app
      results.push({
        id: seed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        name: seed.name,
        pm: seed.pm,
        writer: seed.writer,
        industry: "Manufacturing",
        what_they_make: "TODO: Fill in what this client manufactures",
        who_they_sell_to: "TODO: Fill in buyer profile",
        key_differentiators: ["TODO: Add differentiators"],
        common_customer_pain_points: ["TODO: Add pain points"],
        certifications: [],
        target_industries: ["Manufacturing"],
        tone: "Professional and technically credible.",
        avoid: [],
        past_topics: [],
        approval_contact: "Primary contact",
        services: ["Blog"],
        notes: seed.notes,
      });
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
    }
  }

  console.log(`\n✅ Done! ${results.length} client profiles saved to data/clients.json`);
  console.log("   Review the file, fix any (inferred) fields, then commit and push.\n");
}

main().catch(console.error);
