import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, buildUserMessage, ContentType, ClientProfile } from "@/lib/prompts";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Fetch and parse a sitemap, returning a clean list of page URLs.
// Handles both sitemap indexes (which point to child sitemaps) and regular sitemaps.
// Returns an empty array on any failure — sitemap fetching is best-effort.
async function fetchSitePages(website: string): Promise<string[]> {
  if (!website) return [];

  const base = website.replace(/\/$/, "");
  const candidates = [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`, `${base}/page-sitemap.xml`];

  const extractUrls = (xml: string): string[] => {
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].trim());
    return locs;
  };

  const isChildSitemap = (url: string) =>
    /sitemap/i.test(url) && url.endsWith(".xml");

  // Filter to pages most useful for internal linking — skip categories, tags, authors, feeds
  const isContentPage = (url: string) => {
    const skip = ["/category/", "/tag/", "/author/", "/feed/", "/wp-json/", "?", "#"];
    return !skip.some((s) => url.includes(s));
  };

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "demandDrive-ContentEngine/1.0" },
      });
      if (!res.ok) continue;

      const xml = await res.text();
      let urls = extractUrls(xml);

      // If this is a sitemap index, fetch the first child sitemap (e.g. page-sitemap)
      const childSitemaps = urls.filter(isChildSitemap);
      if (childSitemaps.length > 0) {
        const pagesSitemap = childSitemaps.find((u) => /page|post|service|capabilit/i.test(u))
          || childSitemaps[0];
        try {
          const childRes = await fetch(pagesSitemap, {
            signal: AbortSignal.timeout(4000),
            headers: { "User-Agent": "demandDrive-ContentEngine/1.0" },
          });
          if (childRes.ok) {
            urls = extractUrls(await childRes.text());
          }
        } catch {
          // fall through with parent urls
        }
      }

      const pages = urls.filter(isContentPage).slice(0, 60); // cap at 60 to keep prompt size reasonable
      if (pages.length > 0) return pages;
    } catch {
      continue;
    }
  }

  return [];
}

export async function POST(req: Request) {
  try {
    const { client, contentType, topic, additionalContext } = await req.json();

    if (!client || !contentType || !topic) {
      return new Response(JSON.stringify({ error: "Missing required fields: client, contentType, topic" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // For blog posts, fetch the client's site pages for internal linking.
    // We do this in parallel with nothing else (fast enough), best-effort.
    let sitePages: string[] = [];
    if (contentType === "blog" && (client as ClientProfile).website) {
      sitePages = await fetchSitePages((client as ClientProfile).website!);
    }

    const systemPrompt = buildSystemPrompt(client as ClientProfile, contentType as ContentType, sitePages);
    const userMessage = buildUserMessage(topic, additionalContext);

    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Generation error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate content. Check your API key and try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
