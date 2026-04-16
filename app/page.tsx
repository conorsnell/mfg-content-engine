"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import clientsData from "@/data/clients.json";
import { ContentType, CONTENT_TYPE_LABELS } from "@/lib/prompts";
import {
  DraftRecord,
  getDrafts,
  saveDraft,
  deleteDraft,
  createDraftRecord,
  formatDraftDate,
} from "@/lib/history";

// ── Markdown renderer ──────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function processInline(text: string): string {
  text = escapeHtml(text);
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return text;
}

function markdownToHtml(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  let html = "";
  let inList = false;
  let inMetaBlock = false;
  let metaLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "---") {
      if (!inMetaBlock && i < 6) { inMetaBlock = true; metaLines = []; continue; }
      else if (inMetaBlock) {
        inMetaBlock = false;
        html += `<div class="meta-block">${metaLines.map((l) => `<div class="meta-line">${escapeHtml(l)}</div>`).join("")}</div>`;
        continue;
      }
    }
    if (inMetaBlock) { metaLines.push(line); continue; }
    if (inList && !trimmed.startsWith("- ") && !trimmed.startsWith("* ")) { html += "</ul>"; inList = false; }

    if (trimmed === "") { html += "<div class='spacer'></div>"; }
    else if (trimmed.startsWith("# ")) { html += `<h1>${processInline(trimmed.slice(2))}</h1>`; }
    else if (trimmed.startsWith("## ")) { html += `<h2>${processInline(trimmed.slice(3))}</h2>`; }
    else if (trimmed.startsWith("### ")) { html += `<h3>${processInline(trimmed.slice(4))}</h3>`; }
    else if (trimmed.startsWith("#### ")) { html += `<h4>${processInline(trimmed.slice(5))}</h4>`; }
    else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${processInline(trimmed.slice(2))}</li>`;
    } else { html += `<p>${processInline(trimmed)}</p>`; }
  }
  if (inList) html += "</ul>";
  return html;
}

// ── Types ──────────────────────────────────────────────────────────────────────

type WorkflowStep = "client" | "topic" | "research" | "brief" | "draft" | "history";

const STEP_ORDER: WorkflowStep[] = ["client", "topic", "research", "brief", "draft"];

const WORKFLOW_CONTENT_TYPES: { value: ContentType; label: string; description: string }[] = [
  { value: "blog", label: "Blog Post", description: "1,200–1,500 word article" },
  { value: "case-study", label: "Case Study", description: "Customer success story" },
  { value: "capability-onepager", label: "One-Pager", description: "Sales capability overview" },
  { value: "email", label: "Marketing Email", description: "200–350 word email" },
  { value: "linkedin", label: "LinkedIn Post", description: "150–300 word social post" },
  { value: "snippet", label: "Snippet", description: "1–3 paragraphs on a specific angle" },
  { value: "rephrase", label: "Rephrase", description: "4 alternatives for a sentence/paragraph" },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function Home() {
  // Workflow
  const [step, setStep] = useState<WorkflowStep>("client");

  // Client
  const [selectedClientId, setSelectedClientId] = useState("");

  // Topic
  const [contentType, setContentType] = useState<ContentType>("blog");
  const [keyword, setKeyword] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [calendarNotes, setCalendarNotes] = useState("");

  // Research
  const [research, setResearch] = useState("");
  const [citations, setCitations] = useState<string[]>([]);
  const [isResearching, setIsResearching] = useState(false);
  const [researchError, setResearchError] = useState("");
  const [researchCollapsed, setResearchCollapsed] = useState(false);

  // Brief
  const [brief, setBrief] = useState("");
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [briefCollapsed, setBriefCollapsed] = useState(false);

  // Draft
  const [draft, setDraft] = useState("");
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [draftViewMode, setDraftViewMode] = useState<"preview" | "markdown">("preview");
  const [draftError, setDraftError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isApplyingFeedback, setIsApplyingFeedback] = useState(false);
  const [copyDraftLabel, setCopyDraftLabel] = useState("Copy Draft");

  // Repurposing
  const [linkedinPost, setLinkedinPost] = useState("");
  const [emailCopy, setEmailCopy] = useState("");
  const [isGeneratingLinkedin, setIsGeneratingLinkedin] = useState(false);
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [showRepurpose, setShowRepurpose] = useState(false);

  // History
  const [currentDraftId, setCurrentDraftId] = useState("");
  const [historyList, setHistoryList] = useState<DraftRecord[]>([]);

  // Refs
  const briefRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  const selectedClient = clientsData.find((c) => c.id === selectedClientId);
  const activeClients = [...clientsData]
    .filter((c) => c.id !== "template-client")
    .sort((a, b) => a.name.localeCompare(b.name));

  const currentStepIndex = STEP_ORDER.indexOf(step);

  // Load history when client changes
  useEffect(() => {
    if (selectedClientId) setHistoryList(getDrafts(selectedClientId));
  }, [selectedClientId]);

  // Autosave draft (debounced)
  const autosave = useCallback(() => {
    if (!currentDraftId || !selectedClientId) return;
    saveDraft({
      id: currentDraftId,
      clientId: selectedClientId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: draft ? "complete" : "in-progress",
      contentType,
      keyword,
      articleTitle,
      research,
      citations,
      brief,
      draft,
      repurposed: { linkedin: linkedinPost, email: emailCopy },
    });
    setHistoryList(getDrafts(selectedClientId));
  }, [currentDraftId, selectedClientId, contentType, keyword, articleTitle, research, citations, brief, draft, linkedinPost, emailCopy]);

  useEffect(() => {
    if (!draft || !currentDraftId) return;
    const t = setTimeout(autosave, 2500);
    return () => clearTimeout(t);
  }, [draft, autosave]);

  // ── Streaming helper ──────────────────────────────────────────────────────────

  async function streamGenerate(
    payload: Record<string, unknown>,
    onChunk: (accumulated: string) => void,
    onDone?: () => void
  ) {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Generation failed");
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      onChunk(accumulated);
    }
    onDone?.();
  }

  // ── Step handlers ──────────────────────────────────────────────────────────────

  function handleContinueToTopic() {
    const record = createDraftRecord({ clientId: selectedClientId, contentType });
    setCurrentDraftId(record.id);
    setStep("topic");
  }

  async function handlePullResearch() {
    if (!articleTitle.trim() && !keyword.trim()) return;
    setResearchError("");
    setIsResearching(true);
    setResearch("");
    setCitations([]);
    setStep("research");
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
          articleTitle,
          clientName: selectedClient?.name,
          industry: selectedClient?.industry,
          whatTheyMake: selectedClient?.what_they_make,
          whoTheySellTo: selectedClient?.who_they_sell_to,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed");
      setResearch(data.research || "");
      setCitations(data.citations || []);
    } catch (err: unknown) {
      setResearchError(err instanceof Error ? err.message : "Research failed");
    } finally {
      setIsResearching(false);
    }
  }

  async function handleGenerateBrief() {
    setIsGeneratingBrief(true);
    setBrief("");
    setStep("brief");
    try {
      await streamGenerate(
        {
          client: selectedClient,
          contentType: "brief",
          topic: articleTitle || keyword,
          additionalContext: [
            keyword ? `Target keyword: ${keyword}` : "",
            `Content type: ${CONTENT_TYPE_LABELS[contentType]}`,
            calendarNotes ? `Editorial notes: ${calendarNotes}` : "",
            research ? `Research findings:\n${research}` : "",
          ].filter(Boolean).join("\n\n"),
        },
        (acc) => {
          setBrief(acc);
          if (briefRef.current) briefRef.current.scrollTop = briefRef.current.scrollHeight;
        }
      );
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingBrief(false);
    }
  }

  async function handleGenerateDraft() {
    setIsGeneratingDraft(true);
    setDraftError("");
    setDraft("");
    setDraftViewMode("markdown");
    setStep("draft");
    try {
      await streamGenerate(
        {
          client: selectedClient,
          contentType: "draft-from-brief",
          topic: articleTitle || keyword || "General overview",
          additionalContext: brief
            ? `CONTENT BRIEF:\n${brief}`
            : [keyword && `Target keyword: ${keyword}`, calendarNotes].filter(Boolean).join("\n\n"),
        },
        (acc) => {
          setDraft(acc);
          if (draftRef.current) draftRef.current.scrollTop = draftRef.current.scrollHeight;
        },
        () => setDraftViewMode("preview")
      );
    } catch (err: unknown) {
      setDraftError(err instanceof Error ? err.message : "Draft generation failed. Check your API key and try again.");
    } finally {
      setIsGeneratingDraft(false);
    }
  }

  async function handleApplyFeedback() {
    if (!feedback.trim()) return;
    setIsApplyingFeedback(true);
    const prevDraft = draft;
    setDraft("");
    setDraftViewMode("markdown");
    try {
      await streamGenerate(
        {
          client: selectedClient,
          contentType: "draft-from-brief",
          topic: articleTitle || keyword,
          additionalContext: [
            brief ? `CONTENT BRIEF:\n${brief}` : "",
            `CURRENT DRAFT:\n${prevDraft}`,
            `WRITER FEEDBACK (apply these changes and return the full revised draft):\n${feedback}`,
          ].filter(Boolean).join("\n\n---\n\n"),
        },
        (acc) => {
          setDraft(acc);
          if (draftRef.current) draftRef.current.scrollTop = draftRef.current.scrollHeight;
        },
        () => { setDraftViewMode("preview"); setFeedback(""); }
      );
    } catch {
      setDraft(prevDraft);
    } finally {
      setIsApplyingFeedback(false);
    }
  }

  async function handleGenerateLinkedin() {
    setIsGeneratingLinkedin(true);
    setLinkedinPost("");
    try {
      await streamGenerate(
        {
          client: selectedClient,
          contentType: "linkedin-from-draft",
          topic: articleTitle || keyword,
          existingContent: draft,
        },
        setLinkedinPost
      );
    } catch (err) { console.error(err); }
    finally { setIsGeneratingLinkedin(false); }
  }

  async function handleGenerateEmail() {
    setIsGeneratingEmail(true);
    setEmailCopy("");
    try {
      await streamGenerate(
        {
          client: selectedClient,
          contentType: "email-from-draft",
          topic: articleTitle || keyword,
          existingContent: draft,
        },
        setEmailCopy
      );
    } catch (err) { console.error(err); }
    finally { setIsGeneratingEmail(false); }
  }

  function handleLoadDraft(record: DraftRecord) {
    setSelectedClientId(record.clientId);
    setContentType(record.contentType as ContentType);
    setKeyword(record.keyword);
    setArticleTitle(record.articleTitle);
    setResearch(record.research);
    setCitations(record.citations || []);
    setBrief(record.brief);
    setDraft(record.draft);
    setLinkedinPost(record.repurposed?.linkedin || "");
    setEmailCopy(record.repurposed?.email || "");
    setCurrentDraftId(record.id);
    setStep("draft");
  }

  function handleDeleteDraft(clientId: string, draftId: string) {
    deleteDraft(clientId, draftId);
    setHistoryList(getDrafts(clientId));
  }

  function handleStartOver() {
    setStep("client");
    setKeyword(""); setArticleTitle(""); setCalendarNotes("");
    setResearch(""); setCitations([]);
    setBrief(""); setDraft("");
    setLinkedinPost(""); setEmailCopy("");
    setCurrentDraftId(""); setFeedback("");
    setResearchError("");
  }

  async function handleCopyDraft() {
    await navigator.clipboard.writeText(draft);
    setCopyDraftLabel("Copied!");
    setTimeout(() => setCopyDraftLabel("Copy Draft"), 2000);
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  const wordCount = Math.ceil(draft.split(/\s+/).filter(Boolean).length);

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Global styles for markdown preview */}
      <style>{`
        .md-preview h1 { font-size: 1.45rem; font-weight: 700; color: #111827; margin: 1.25rem 0 0.5rem; line-height: 1.3; }
        .md-preview h2 { font-size: 1.1rem; font-weight: 700; color: #1f2937; margin: 1.5rem 0 0.4rem; padding-bottom: 0.3rem; border-bottom: 2px solid #e5e7eb; text-transform: uppercase; letter-spacing: 0.02em; }
        .md-preview h3 { font-size: 0.95rem; font-weight: 700; color: #374151; margin: 1rem 0 0.25rem; }
        .md-preview h4 { font-size: 0.875rem; font-weight: 600; color: #4b5563; margin: 0.75rem 0 0.2rem; }
        .md-preview p { font-size: 0.875rem; color: #374151; line-height: 1.75; margin: 0.4rem 0; }
        .md-preview ul { list-style-type: disc; padding-left: 1.4rem; margin: 0.4rem 0; }
        .md-preview li { font-size: 0.875rem; color: #374151; line-height: 1.7; margin: 0.2rem 0; }
        .md-preview a { color: #2563eb; text-decoration: underline; }
        .md-preview strong { font-weight: 700; }
        .md-preview em { font-style: italic; }
        .md-preview .meta-block { background: #f8fafc; border: 1px solid #cbd5e1; border-left: 3px solid #3b82f6; border-radius: 0.375rem; padding: 0.75rem 1rem; margin-bottom: 1.25rem; font-family: monospace; font-size: 0.8rem; color: #475569; line-height: 1.6; }
        .md-preview .meta-line { margin: 0.1rem 0; }
        .md-preview .spacer { height: 0.5rem; }
      `}</style>

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://manufacturing.demanddrive.com/wp-content/uploads/sites/2/2026/03/demanddrive_manufacturing_logo_dark_svg.svg"
              alt="demandDrive Manufacturing"
              className="h-8 w-auto"
            />
            <div className="h-6 w-px bg-gray-200" />
            <div>
              <p className="text-sm font-semibold text-gray-800 leading-tight">Content Engine</p>
              <p className="text-xs text-gray-400 leading-tight">AI-assisted drafting</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {selectedClient && step !== "client" && step !== "history" && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
                {selectedClient.name}
              </span>
            )}
            {selectedClient && step !== "client" && (
              <button
                onClick={() => setStep("history")}
                className="text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
              >
                History
              </button>
            )}
            {step !== "client" && (
              <button
                onClick={handleStartOver}
                className="text-xs text-gray-500 hover:text-red-600 px-2.5 py-1.5 rounded-md hover:bg-red-50 transition-colors"
              >
                Start Over
              </button>
            )}
            <span className="text-xs bg-blue-50 text-blue-700 font-medium px-2.5 py-1 rounded-full border border-blue-200">
              Manufacturing
            </span>
          </div>
        </div>

        {/* Step indicator */}
        {step !== "client" && step !== "history" && (
          <div className="max-w-6xl mx-auto px-6 pb-3">
            <div className="flex items-center gap-1">
              {STEP_ORDER.map((s, idx) => {
                const labels: Record<WorkflowStep, string> = {
                  client: "Client", topic: "Topic & Keyword", research: "Research",
                  brief: "Brief & Structure", draft: "Draft", history: "History",
                };
                const isDone = currentStepIndex > idx;
                const isCurrent = currentStepIndex === idx;
                return (
                  <div key={s} className="flex items-center gap-1">
                    <button
                      onClick={() => isDone && setStep(s)}
                      disabled={!isDone}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors ${
                        isCurrent
                          ? "bg-blue-600 text-white font-medium"
                          : isDone
                          ? "bg-blue-100 text-blue-700 font-medium hover:bg-blue-200 cursor-pointer"
                          : "text-gray-400"
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold ${
                        isCurrent ? "bg-white text-blue-600" : isDone ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"
                      }`}>
                        {isDone ? "✓" : idx + 1}
                      </span>
                      {labels[s]}
                    </button>
                    {idx < STEP_ORDER.length - 1 && (
                      <div className={`w-6 h-px ${isDone ? "bg-blue-300" : "bg-gray-200"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* ── Main content ── */}
      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━ STEP: CLIENT ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === "client" && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Who are you writing for?</h1>
              <p className="text-gray-500 text-sm">Select a client to get started.</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a client...</option>
                {activeClients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {selectedClient && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client Snapshot</span>
                    <span className="text-xs text-gray-400">{selectedClient.industry}</span>
                  </div>
                  <p className="text-sm text-gray-700">{selectedClient.what_they_make}</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedClient.key_differentiators.slice(0, 3).map((d, i) => (
                      <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{d}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 pt-1">
                    <span>PM: <span className="text-gray-700 font-medium">{selectedClient.pm}</span></span>
                    <span>Writer: <span className="text-gray-700 font-medium">{selectedClient.writer}</span></span>
                  </div>
                  {historyList.length > 0 && (
                    <button
                      onClick={() => setStep("history")}
                      className="text-xs text-blue-600 hover:text-blue-800 mt-1 flex items-center gap-1"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {historyList.length} saved draft{historyList.length !== 1 ? "s" : ""} for this client
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={handleContinueToTopic}
                disabled={!selectedClientId}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg text-sm transition-colors"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━ STEP: TOPIC ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === "topic" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
                <h2 className="text-base font-semibold text-gray-900">Topic & Keyword</h2>

                {/* Content Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Content Type</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {WORKFLOW_CONTENT_TYPES.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => setContentType(t.value)}
                        className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                          contentType === t.value
                            ? "border-blue-500 bg-blue-50 text-blue-800"
                            : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <div className="font-medium">{t.label}</div>
                        <div className={`text-xs mt-0.5 ${contentType === t.value ? "text-blue-600" : "text-gray-400"}`}>{t.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Article Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Article / Content Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={articleTitle}
                    onChange={(e) => setArticleTitle(e.target.value)}
                    placeholder="e.g. Why Tolerances Matter More Than Price in Precision Machining"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Target Keyword */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Target Keyword</label>
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="e.g. precision machining tolerances"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Editorial Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Editorial Notes <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={calendarNotes}
                    onChange={(e) => setCalendarNotes(e.target.value)}
                    placeholder="Any notes from the editorial calendar, specific angles to cover, or client feedback..."
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handlePullResearch}
                    disabled={!articleTitle.trim() && !keyword.trim()}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Pull Research from Web
                  </button>
                  <button
                    onClick={handleGenerateBrief}
                    disabled={!articleTitle.trim() && !keyword.trim()}
                    className="px-4 py-3 border border-gray-300 hover:border-gray-400 text-gray-700 font-medium rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Skip Research →
                  </button>
                </div>
              </div>
            </div>

            {/* Client sidebar */}
            <div className="space-y-4">
              <ClientSidebar client={selectedClient} />
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━ STEP: RESEARCH ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === "research" && (
          <div className="space-y-4">
            {isResearching && (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <svg className="animate-spin h-8 w-8 text-blue-500 mx-auto mb-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <p className="text-gray-600 font-medium">Pulling research from Perplexity...</p>
                <p className="text-gray-400 text-sm mt-1">Searching for facts, stats, and buyer insights on <em>{articleTitle || keyword}</em></p>
              </div>
            )}

            {researchError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                <p className="text-red-700 font-medium mb-1">Research failed</p>
                <p className="text-red-600 text-sm mb-4">{researchError}</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={handlePullResearch} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                    Try Again
                  </button>
                  <button onClick={handleGenerateBrief} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                    Skip Research, Build Brief
                  </button>
                </div>
              </div>
            )}

            {!isResearching && research && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white rounded-xl border border-gray-200">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                      <div>
                        <h2 className="text-sm font-semibold text-gray-900">Research Results</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Powered by Perplexity — review and use to inform the brief</p>
                      </div>
                      <button
                        onClick={handleGenerateBrief}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors flex items-center gap-2"
                      >
                        Build Brief →
                      </button>
                    </div>
                    <div className="p-6">
                      <div
                        className="md-preview overflow-y-auto max-h-[600px]"
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(research) }}
                      />
                    </div>
                  </div>

                  {citations.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sources</p>
                      <div className="space-y-1">
                        {citations.slice(0, 8).map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                            className="block text-xs text-blue-600 hover:text-blue-800 truncate">
                            {url}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <ClientSidebar client={selectedClient} compact />
                  <div className="mt-4 bg-blue-50 rounded-xl border border-blue-200 p-4 text-sm text-blue-800">
                    <p className="font-medium mb-1">Next step</p>
                    <p className="text-xs text-blue-700">Review the research above, then click "Build Brief" to generate a structured content outline.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━ STEP: BRIEF ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === "brief" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl border border-gray-200 flex flex-col" style={{ minHeight: "500px" }}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">Content Brief & Structure</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Edit freely — this is your outline before drafting</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {brief && !isGeneratingBrief && (
                      <button
                        onClick={handleGenerateBrief}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-md hover:bg-gray-100"
                      >
                        Regenerate
                      </button>
                    )}
                    <button
                      onClick={handleGenerateDraft}
                      disabled={!brief.trim() || isGeneratingBrief}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
                    >
                      Draft from Brief →
                    </button>
                  </div>
                </div>
                <div className="flex-1 p-6">
                  {isGeneratingBrief && !brief && (
                    <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                      <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Building brief...
                    </div>
                  )}
                  <textarea
                    ref={briefRef}
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder={isGeneratingBrief ? "Building your content brief..." : "Brief will appear here..."}
                    className="w-full h-full min-h-96 text-sm text-gray-800 leading-relaxed font-mono resize-none focus:outline-none bg-transparent"
                    spellCheck={true}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Topic summary */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">This Piece</p>
                {articleTitle && <p className="text-sm font-medium text-gray-900">{articleTitle}</p>}
                {keyword && <p className="text-xs text-gray-500">Keyword: <span className="text-gray-700">{keyword}</span></p>}
                <p className="text-xs text-gray-500">Type: <span className="text-gray-700">{CONTENT_TYPE_LABELS[contentType]}</span></p>
              </div>

              {/* Research reference */}
              {research && (
                <div className="bg-white rounded-xl border border-gray-200">
                  <button
                    onClick={() => setResearchCollapsed(!researchCollapsed)}
                    className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:bg-gray-50 rounded-xl"
                  >
                    Research Reference
                    <svg className={`h-4 w-4 text-gray-400 transition-transform ${researchCollapsed ? "" : "rotate-180"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {!researchCollapsed && (
                    <div className="px-4 pb-4 max-h-64 overflow-y-auto">
                      <div className="md-preview text-xs" dangerouslySetInnerHTML={{ __html: markdownToHtml(research) }} />
                    </div>
                  )}
                </div>
              )}

              <ClientSidebar client={selectedClient} compact />
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━ STEP: DRAFT ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === "draft" && (
          <div className="space-y-5">
            {/* Brief reference (collapsible) */}
            {brief && (
              <div className="bg-white rounded-xl border border-gray-200">
                <button
                  onClick={() => setBriefCollapsed(!briefCollapsed)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Content Brief</span>
                    {articleTitle && <span className="text-xs text-gray-400">— {articleTitle}</span>}
                  </div>
                  <svg className={`h-4 w-4 text-gray-400 transition-transform ${briefCollapsed ? "" : "rotate-180"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {!briefCollapsed && (
                  <div className="px-5 pb-4 max-h-72 overflow-y-auto border-t border-gray-100">
                    <div className="md-preview pt-3" dangerouslySetInnerHTML={{ __html: markdownToHtml(brief) }} />
                  </div>
                )}
              </div>
            )}

            {/* Draft area */}
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col" style={{ minHeight: "600px" }}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">Draft</span>
                  {draft && <span className="text-xs text-gray-400">~{wordCount} words</span>}
                  {draft && !isGeneratingDraft && (
                    <div className="flex items-center bg-gray-100 rounded-md p-0.5 ml-1">
                      <button onClick={() => setDraftViewMode("preview")} className={`text-xs px-2.5 py-1 rounded transition-all font-medium ${draftViewMode === "preview" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Preview</button>
                      <button onClick={() => setDraftViewMode("markdown")} className={`text-xs px-2.5 py-1 rounded transition-all font-medium ${draftViewMode === "markdown" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Markdown</button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!draft && !isGeneratingDraft && (
                    <button
                      onClick={handleGenerateDraft}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors flex items-center gap-2"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Draft from Brief
                    </button>
                  )}
                  {draft && !isGeneratingDraft && (
                    <>
                      <button onClick={handleGenerateDraft} className="text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-md hover:bg-gray-100">Regenerate</button>
                      <button onClick={handleCopyDraft} className="text-xs bg-gray-900 hover:bg-gray-700 text-white px-3 py-1.5 rounded-md transition-colors font-medium">{copyDraftLabel}</button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex-1 p-6 overflow-hidden flex flex-col">
                {draftError && !isGeneratingDraft && (
                  <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2">
                    <svg className="h-4 w-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <span>{draftError}</span>
                  </div>
                )}
                {!draft && !isGeneratingDraft && (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 space-y-3">
                    <svg className="h-10 w-10 text-gray-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Ready to draft</p>
                      <p className="text-xs text-gray-400 mt-1">{brief ? "Click \"Draft from Brief\" to generate the full article." : "Add a brief or click generate to start drafting."}</p>
                    </div>
                  </div>
                )}
                {(draft || isGeneratingDraft) && draftViewMode === "markdown" && (
                  <textarea
                    ref={draftRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="w-full flex-1 min-h-96 text-sm text-gray-800 leading-relaxed font-mono resize-none focus:outline-none bg-transparent"
                    placeholder={isGeneratingDraft ? "Drafting..." : ""}
                    spellCheck={true}
                  />
                )}
                {draft && !isGeneratingDraft && draftViewMode === "preview" && (
                  <div className="md-preview flex-1 overflow-y-auto" dangerouslySetInnerHTML={{ __html: markdownToHtml(draft) }} />
                )}
              </div>

              {draft && (
                <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                  <p className="text-xs text-gray-400">AI-generated first draft. Review for accuracy, brand voice, and technical details before publishing.</p>
                </div>
              )}
            </div>

            {/* Feedback / Revision */}
            {draft && !isGeneratingDraft && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Request Revisions</h3>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Describe what to change — e.g. 'Make the intro more direct', 'Add more detail to the section on tolerances', 'Shorten the conclusion', 'Replace generic claims with specific numbers'..."
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-gray-400">Feedback applies to the entire draft. Claude will revise and return the full updated version.</p>
                  <button
                    onClick={handleApplyFeedback}
                    disabled={!feedback.trim() || isApplyingFeedback}
                    className="bg-gray-900 hover:bg-gray-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors flex items-center gap-2"
                  >
                    {isApplyingFeedback && (
                      <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    )}
                    Apply Feedback
                  </button>
                </div>
              </div>
            )}

            {/* Repurposing */}
            {draft && !isGeneratingDraft && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setShowRepurpose(!showRepurpose)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">Repurpose This Draft</span>
                    <span className="text-xs text-gray-400">LinkedIn + Email</span>
                  </div>
                  <svg className={`h-4 w-4 text-gray-400 transition-transform ${showRepurpose ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showRepurpose && (
                  <div className="border-t border-gray-100 p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* LinkedIn */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-gray-800">LinkedIn Post</h4>
                        <button
                          onClick={handleGenerateLinkedin}
                          disabled={isGeneratingLinkedin}
                          className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5"
                        >
                          {isGeneratingLinkedin && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>}
                          {linkedinPost ? "Regenerate" : "Generate"}
                        </button>
                      </div>
                      {linkedinPost ? (
                        <textarea
                          value={linkedinPost}
                          onChange={(e) => setLinkedinPost(e.target.value)}
                          className="w-full text-sm text-gray-800 leading-relaxed font-mono border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={10}
                        />
                      ) : (
                        <div className="h-32 border border-dashed border-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-400">
                          3 post options will appear here
                        </div>
                      )}
                    </div>

                    {/* Email */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-gray-800">Marketing Email</h4>
                        <button
                          onClick={handleGenerateEmail}
                          disabled={isGeneratingEmail}
                          className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5"
                        >
                          {isGeneratingEmail && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>}
                          {emailCopy ? "Regenerate" : "Generate"}
                        </button>
                      </div>
                      {emailCopy ? (
                        <textarea
                          value={emailCopy}
                          onChange={(e) => setEmailCopy(e.target.value)}
                          className="w-full text-sm text-gray-800 leading-relaxed font-mono border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={10}
                        />
                      ) : (
                        <div className="h-32 border border-dashed border-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-400">
                          Subject lines + email body will appear here
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━ STEP: HISTORY ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === "history" && (
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Draft History</h2>
                {selectedClient && <p className="text-sm text-gray-500 mt-0.5">{selectedClient.name}</p>}
              </div>
              <button
                onClick={handleContinueToTopic}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
              >
                + New Draft
              </button>
            </div>

            {historyList.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
                <p className="text-sm font-medium text-gray-500">No saved drafts yet</p>
                <p className="text-xs mt-1">Drafts are saved automatically as you work.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {historyList.map((record) => (
                  <div key={record.id} className="bg-white rounded-xl border border-gray-200 p-5 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{record.articleTitle || "(Untitled)"}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${record.status === "complete" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                          {record.status === "complete" ? "Complete" : "In Progress"}
                        </span>
                        <span className="text-xs text-gray-400">{CONTENT_TYPE_LABELS[record.contentType as ContentType] || record.contentType}</span>
                        {record.keyword && <span className="text-xs text-gray-400 truncate">· {record.keyword}</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Saved {formatDraftDate(record.updatedAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleLoadDraft(record)}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md font-medium transition-colors"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleDeleteDraft(record.clientId, record.id)}
                        className="text-xs text-gray-400 hover:text-red-600 px-2 py-1.5 rounded-md hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}

// ── Client Sidebar component ──────────────────────────────────────────────────

function ClientSidebar({
  client,
  compact = false,
}: {
  client: ReturnType<typeof clientsData.find>;
  compact?: boolean;
}) {
  if (!client) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</span>
        <span className="text-xs text-gray-400">{client.industry}</span>
      </div>
      <p className="text-sm font-semibold text-gray-900">{client.name}</p>
      {!compact && <p className="text-xs text-gray-600">{client.what_they_make}</p>}
      <div className="flex flex-wrap gap-1">
        {client.key_differentiators.slice(0, compact ? 2 : 3).map((d, i) => (
          <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{d}</span>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500 pt-1">
        <span>PM: <span className="text-gray-700 font-medium">{client.pm}</span></span>
        <span>Writer: <span className="text-gray-700 font-medium">{client.writer}</span></span>
      </div>
      {client.website && (
        <a href={client.website} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          {client.website.replace(/^https?:\/\//, "")}
        </a>
      )}
    </div>
  );
}
