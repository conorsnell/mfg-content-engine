import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  if (!process.env.PERPLEXITY_API_KEY) {
    return NextResponse.json(
      { error: "PERPLEXITY_API_KEY is not configured in environment variables." },
      { status: 500 }
    );
  }

  const { keyword, articleTitle, clientName, industry, whatTheyMake, whoTheySellTo } =
    await req.json();

  const userPrompt = `Research this article topic for a B2B manufacturing content writer:

Article title: "${articleTitle}"
Target keyword: "${keyword}"
Client: ${clientName} (${industry})
What they make: ${whatTheyMake}
Who buys from them: ${whoTheySellTo}

Please provide structured research with these sections:

## Key Facts & Statistics
Relevant data points, industry stats, or benchmarks (cite sources where possible).

## Buyer Pain Points
What challenges or frustrations does this topic address for their buyers?

## Technical Context
Background knowledge the writer should understand to write credibly on this topic.

## Recommended Angles (3–5)
Specific talking points or sub-topics worth exploring in the article.

## Relevant Trends
Any recent developments, shifts, or news relevant to this topic.

Be specific and practical — this research will be used directly to write the article.`;

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "system",
            content:
              "You are a research assistant helping a B2B manufacturing content writer. Surface specific facts, data, buyer insights, and technical context. Be concrete — no filler or generic advice.",
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        errData?.error?.message || `Perplexity returned ${response.status}`
      );
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content || "";
    const citations: string[] = data.citations || [];

    return NextResponse.json({ research: content, citations });
  } catch (err: unknown) {
    console.error("Research error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Research failed" },
      { status: 500 }
    );
  }
}
