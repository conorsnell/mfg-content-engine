import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, buildUserMessage, ContentType, ClientProfile } from "@/lib/prompts";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { client, contentType, topic, additionalContext } = await req.json();

    if (!client || !contentType || !topic) {
      return new Response(JSON.stringify({ error: "Missing required fields: client, contentType, topic" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const systemPrompt = buildSystemPrompt(client as ClientProfile, contentType as ContentType);
    const userMessage = buildUserMessage(topic, additionalContext);

    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
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
