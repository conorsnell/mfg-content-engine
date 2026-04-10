"use client";

import { useState, useRef, useEffect } from "react";
import clientsData from "@/data/clients.json";
import { ContentType, CONTENT_TYPE_LABELS } from "@/lib/prompts";

const CONTENT_TYPES: { value: ContentType; label: string; description: string }[] = [
  { value: "blog", label: "Blog Post", description: "1,200–1,500 word SEO-friendly article" },
  { value: "email", label: "Marketing Email", description: "Subject lines + 200–350 word email" },
  { value: "linkedin", label: "LinkedIn Post", description: "150–300 word company or ghostwritten post" },
  { value: "capability-onepager", label: "Capability One-Pager", description: "Sales-ready capability overview" },
  { value: "case-study", label: "Case Study", description: "Templated case study with placeholder fields" },
  { value: "trade-show-followup", label: "Trade Show Follow-Up", description: "3-email post-show sequence" },
];

// ── Markdown renderer ──────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function processInline(text: string): string {
  text = escapeHtml(text);
  // Links before bold/italic so brackets don't interfere
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

    // Meta block delimiters (--- at start of document)
    if (trimmed === "---") {
      if (!inMetaBlock && i < 6) {
        inMetaBlock = true;
        metaLines = [];
        continue;
      } else if (inMetaBlock) {
        inMetaBlock = false;
        html += `<div class="meta-block">${metaLines.map((l) => `<div class="meta-line">${escapeHtml(l)}</div>`).join("")}</div>`;
        continue;
      }
    }

    if (inMetaBlock) {
      metaLines.push(line);
      continue;
    }

    // Close open list before non-list lines
    if (inList && !trimmed.startsWith("- ") && !trimmed.startsWith("* ")) {
      html += "</ul>";
      inList = false;
    }

    if (trimmed === "") {
      html += "<div class='spacer'></div>";
    } else if (trimmed.startsWith("# ")) {
      html += `<h1>${processInline(trimmed.slice(2))}</h1>`;
    } else if (trimmed.startsWith("## ")) {
      html += `<h2>${processInline(trimmed.slice(3))}</h2>`;
    } else if (trimmed.startsWith("### ")) {
      html += `<h3>${processInline(trimmed.slice(4))}</h3>`;
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${processInline(trimmed.slice(2))}</li>`;
    } else {
      html += `<p>${processInline(trimmed)}</p>`;
    }
  }

  if (inList) html += "</ul>";
  return html;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Home() {
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [contentType, setContentType] = useState<ContentType>("blog");
  const [topic, setTopic] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [output, setOutput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [viewMode, setViewMode] = useState<"preview" | "markdown">("preview");
  const outputRef = useRef<HTMLTextAreaElement>(null);

  const selectedClient = clientsData.find((c) => c.id === selectedClientId);
  const activeClients = clientsData.filter((c) => c.id !== "template-client");

  // Switch to preview automatically once generation finishes
  useEffect(() => {
    if (!isGenerating && output) {
      setViewMode("preview");
    }
  }, [isGenerating]);

  async function handleGenerate() {
    if (!selectedClientId || !topic.trim()) {
      setError("Please select a client and enter a topic.");
      return;
    }
    setError("");
    setOutput("");
    setViewMode("markdown"); // show raw text while streaming
    setIsGenerating(true);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: selectedClient,
          contentType,
          topic: topic.trim(),
          additionalContext: additionalContext.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Generation failed.");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setOutput(accumulated);
        if (outputRef.current) {
          outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopyLabel("Copied!");
    setTimeout(() => setCopyLabel("Copy"), 2000);
  }

  function handleClear() {
    setOutput("");
    setTopic("");
    setAdditionalContext("");
    setSelectedClientId("");
    setError("");
  }

  const wordCount = Math.ceil(output.split(/\s+/).filter(Boolean).length);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Markdown preview styles */}
      <style>{`
        .markdown-preview h1 {
          font-size: 1.45rem; font-weight: 700; color: #111827;
          margin: 1.25rem 0 0.5rem; line-height: 1.3;
        }
        .markdown-preview h2 {
          font-size: 1.1rem; font-weight: 700; color: #1f2937;
          margin: 1.5rem 0 0.4rem;
          padding-bottom: 0.3rem;
          border-bottom: 2px solid #e5e7eb;
          text-transform: uppercase; letter-spacing: 0.02em;
        }
        .markdown-preview h3 {
          font-size: 0.95rem; font-weight: 700; color: #374151;
          margin: 1rem 0 0.25rem;
        }
        .markdown-preview p {
          font-size: 0.875rem; color: #374151;
          line-height: 1.75; margin: 0.4rem 0;
        }
        .markdown-preview ul {
          list-style-type: disc; padding-left: 1.4rem; margin: 0.4rem 0;
        }
        .markdown-preview li {
          font-size: 0.875rem; color: #374151;
          line-height: 1.7; margin: 0.2rem 0;
        }
        .markdown-preview a {
          color: #2563eb; text-decoration: underline;
        }
        .markdown-preview a:hover { color: #1d4ed8; }
        .markdown-preview strong { font-weight: 700; }
        .markdown-preview em { font-style: italic; }
        .markdown-preview .meta-block {
          background: #f8fafc; border: 1px solid #cbd5e1;
          border-left: 3px solid #3b82f6;
          border-radius: 0.375rem; padding: 0.75rem 1rem;
          margin-bottom: 1.25rem; font-family: monospace;
          font-size: 0.8rem; color: #475569; line-height: 1.6;
        }
        .markdown-preview .meta-line { margin: 0.1rem 0; }
        .markdown-preview .spacer { height: 0.5rem; }
      `}</style>

      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
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
          <span className="text-xs bg-blue-50 text-blue-700 font-medium px-2.5 py-1 rounded-full border border-blue-200">
            Manufacturing
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* LEFT: Input Panel */}
          <div className="space-y-6">

            {/* Client Selector */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select a client...</option>
                {activeClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>

              {/* Client context preview */}
              {selectedClient && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client Snapshot</span>
                    <span className="text-xs text-gray-400">{selectedClient.industry}</span>
                  </div>
                  <p className="text-sm text-gray-700">{selectedClient.what_they_make}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedClient.key_differentiators.slice(0, 3).map((d, i) => (
                      <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                        {d}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 pt-1 text-xs text-gray-500">
                    <span>PM: <span className="text-gray-700 font-medium">{selectedClient.pm}</span></span>
                    <span>Writer: <span className="text-gray-700 font-medium">{selectedClient.writer}</span></span>
                  </div>
                  {selectedClient.website ? (
                    <a
                      href={selectedClient.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-1"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      {selectedClient.website.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    <p className="text-xs text-amber-600 mt-1 italic">No website on file — add to clients.json for internal linking</p>
                  )}
                </div>
              )}
            </div>

            {/* Content Type */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Content Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {CONTENT_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setContentType(type.value)}
                    className={`text-left px-3 py-3 rounded-lg border text-sm transition-all ${
                      contentType === type.value
                        ? "border-blue-500 bg-blue-50 text-blue-800"
                        : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-medium">{type.label}</div>
                    <div className={`text-xs mt-0.5 ${contentType === type.value ? "text-blue-600" : "text-gray-400"}`}>
                      {type.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Topic & Context */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Topic / Focus <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={
                    contentType === "blog"
                      ? "e.g. Why domestic powder coating beats overseas alternatives"
                      : contentType === "email"
                      ? "e.g. Re-engage prospects who attended last trade show"
                      : contentType === "linkedin"
                      ? "e.g. A recent job win story or industry insight"
                      : "Describe the focus of this piece"
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyDown={(e) => e.key === "Enter" && !isGenerating && handleGenerate()}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Context <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Any specific angles, talking points, recent news, or customer scenarios to incorporate..."
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={isGenerating || !selectedClientId || !topic.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Generating {CONTENT_TYPE_LABELS[contentType]}...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Generate {CONTENT_TYPE_LABELS[contentType]}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* RIGHT: Output Panel */}
          <div className="bg-white rounded-xl border border-gray-200 flex flex-col" style={{ minHeight: "600px" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">Draft Output</span>
                {output && (
                  <span className="text-xs text-gray-400">~{wordCount} words</span>
                )}
                {/* Preview / Markdown toggle */}
                {output && !isGenerating && (
                  <div className="flex items-center bg-gray-100 rounded-md p-0.5 ml-1">
                    <button
                      onClick={() => setViewMode("preview")}
                      className={`text-xs px-2.5 py-1 rounded transition-all font-medium ${
                        viewMode === "preview"
                          ? "bg-white text-gray-800 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => setViewMode("markdown")}
                      className={`text-xs px-2.5 py-1 rounded transition-all font-medium ${
                        viewMode === "markdown"
                          ? "bg-white text-gray-800 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Markdown
                    </button>
                  </div>
                )}
              </div>
              {output && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClear}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleCopy}
                    className="text-xs bg-gray-900 hover:bg-gray-700 text-white px-3 py-1.5 rounded-md transition-colors font-medium"
                  >
                    {copyLabel}
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 p-6 overflow-hidden flex flex-col">
              {/* Empty state */}
              {!output && !isGenerating && (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 space-y-3">
                  <svg className="h-10 w-10 text-gray-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Your draft will appear here</p>
                    <p className="text-xs text-gray-400 mt-1">Select a client, choose content type, enter a topic, and click Generate</p>
                  </div>
                </div>
              )}

              {/* Streaming / Markdown edit view */}
              {(output || isGenerating) && viewMode === "markdown" && (
                <textarea
                  ref={outputRef}
                  value={output}
                  onChange={(e) => setOutput(e.target.value)}
                  className="w-full flex-1 min-h-96 text-sm text-gray-800 leading-relaxed font-mono resize-none focus:outline-none bg-transparent"
                  placeholder={isGenerating ? "Writing your draft..." : ""}
                  spellCheck={true}
                />
              )}

              {/* Rendered preview view */}
              {output && !isGenerating && viewMode === "preview" && (
                <div
                  className="markdown-preview flex-1 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(output) }}
                />
              )}
            </div>

            {output && (
              <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <p className="text-xs text-gray-400">
                  AI-generated first draft. Review for accuracy, brand voice, and technical details before publishing.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
