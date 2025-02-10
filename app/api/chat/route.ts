import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Astrology-related keywords to validate queries
const ASTRO_KEYWORDS = [
  "astrology", "horoscope", "zodiac", "birth chart", "natal chart",
  "planets", "stars", "numerology", "saturn return", "retrograde",
  "sun sign", "moon sign", "rising sign", "houses", "aspects",
  "transit", "progression", "conjunction", "opposition", "trine",
];

// AstroGPT system prompt
const ASTROGPT_PROMPT = `
You are AstroGPT, an AI that provides personalized astrological and numerological insights in an elegant, professional format.

Your responses must follow this exact structure:

# ✨ [Title of Reading]

## 🌟 Celestial Overview
[Provide a poetic, engaging overview of the person's astrological profile]

## 🔮 Your Cosmic Blueprint
[Main astrological insights organized in clear paragraphs]

## 📊 Numerological Resonance
[Numerology insights woven into narrative paragraphs]

## 🌠 Guidance & Action Steps
[Practical advice and next steps in flowing paragraphs]

---
*[Optional: Any follow-up questions or missing information requests]*

Guidelines:
1. Always maintain a mystical yet professional tone
2. Use markdown formatting for clear section breaks
3. Write in flowing paragraphs instead of bullet points
4. Use emojis sparingly and strategically
5. Incorporate practical guidance naturally into the narrative
6. Use italics and bold for emphasis, not for section markers
`;

// Function to validate if the query is astrology-related
function isAstroQuery(message: string): boolean {
  const lowercaseMessage = message.toLowerCase();
  return ASTRO_KEYWORDS.some(keyword => lowercaseMessage.includes(keyword));
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const message = formData.get("message") as string;
    const sessionId = formData.get("sessionId") as string;
    const files = formData.getAll("files") as File[];

    // Validate if the query is astrology-related
    if (!isAstroQuery(message)) {
      return new Response(
        `data: ${JSON.stringify({
          content: "I can only assist with astrological and numerological readings. Please ask me about your cosmic journey!"
        })}\n\ndata: ${JSON.stringify({ content: "[DONE]" })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        }
      );
    }

    // Process files and extract content
    let fileContents = "";
    if (files && files.length > 0) {
      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const fileName = file.name.toLowerCase();
        try {
          let content = "";
          if (fileName.endsWith(".txt")) {
            const text = new TextDecoder().decode(buffer);
            content = `Astrological Information from ${fileName}:\n${text}\n\n`;
          } else if (fileName.endsWith(".pdf")) {
            const loader = new PDFLoader(
              new Blob([buffer], { type: "application/pdf" }),
              { splitPages: false }
            );
            const docs = await loader.load();
            content = `Astrological Information from ${fileName}:\n${docs
              .map((doc) => doc.pageContent)
              .join("\n")}\n\n`;
          } else if (fileName.endsWith(".csv")) {
            const text = new TextDecoder().decode(buffer);
            const loader = new CSVLoader(
              new Blob([text], { type: "text/csv" })
            );
            const docs = await loader.load();
            content = `Astrological Information from ${fileName}:\n${docs
              .map((doc) => doc.pageContent)
              .join("\n")}\n\n`;
          }
          fileContents += content;
        } catch (error) {
          console.error(`Error processing file ${fileName}:`, error);
          throw new Error(`Failed to process file ${fileName}`);
        }
      }
    }

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      temperature: 0.7,
      stream: true,
      system: ASTROGPT_PROMPT,
      messages: [
        {
          role: "user",
          content: `${message}\n\n${fileContents}`,
        },
      ],
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            if (chunk.type === 'content_block_delta' && 'text' in chunk.delta) {
              const data = JSON.stringify({ content: chunk.delta.text });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: "[DONE]" })}\n\n`));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in chat route:", error);
    return NextResponse.json(
      { error: "An error occurred while processing your request" },
      { status: 500 }
    );
  }
}