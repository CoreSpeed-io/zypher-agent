import { z } from "zod";
import { defineTool } from "./mod.ts";
import OpenAI from "@openai/openai";


const explanationSchema = z.string().optional().describe(
  "One-sentence explanation as to why this tool is being used",
);

const client = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

/**
 * AskFileUrlQuestionTool
 * ──────────────────────
 * Accepts a publicly accessible **file URL** (image, PDF, text, etc.) plus a
 * natural-language question, and returns an answer powered by GPT-4o.
 */
export const AskFileUrlQuestionTool = defineTool({
  name: "ask_file_url_question",
  description:
    "Answer a natural-language question about the *content* of a remote file using OpenAI’s GPT-4o multimodal capabilities.\n\n" +
    "Features:\n" +
    "• Accepts any publicly reachable file URL (e.g. image, PDF, CSV, text file)\n" +
    "• No local upload needed—the URL is passed directly to OpenAI\n" +
    "• Returns a concise, text-only answer to the provided question\n\n" +
    "Best-practice tips for good answers:\n" +
    "• Ask direct questions (e.g. “What breed of dog is in this photo?”)\n" +
    "• Keep questions under 2,000 characters",
  parameters: z.object({
    fileUrl: z
      .string()
      .url("fileUrl must be a valid, publicly accessible URL.")
      .describe("The HTTPS URL of the file to analyze."),
    question: z
      .string()
      .min(
        5,
        "Your question is too short. Please provide more detail about what you want to know.",
      )
      .max(
        2000,
        "Your question is too long. Please keep it under 2,000 characters.",
      )
      .describe("The natural-language question about the file."),
    explanation: explanationSchema,
  }),

  execute: async ({ fileUrl, question }): Promise<string> => {
    try {
      const downloaded = await fetchFileWithName(fileUrl)
      // const downloadedResponse = await fetch(fileUrl);
      // if (!downloadedResponse.ok) {
      //   return `Failed to fetch file`
      // }
      // const mimeType = downloadedResponse.headers.get('content-type');
      // console.log(mimeType);           // → "image/png", "application/pdf", etc.
      console.log(`downloaded ${downloaded}`)
      const uploadedFile = await client.files.create({
        file: downloaded,
        purpose: "user_data",
      });

      console.log(`uploadedFile ${uploadedFile}`)

      const response = await client.responses.create({
        model: "o3-pro-2025-06-10",
        reasoning: {
          effort: "high"
        },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_file",
                file_id: uploadedFile.id,
              },
              {
                type: "input_text",
                text: question,
              },
            ],
          },
        ],
      });


      if (!response) {
        throw new Error("OpenAI returned an empty response. Please try again.");
      }

      return response.output_text;
    } catch (error) {
      return `Error during function call ${error}`;
    }
  },
});



/**
 * Download a resource and wrap it in a File whose name comes from
 *   1.  Content‑Disposition header (RFC 6266: filename* or filename)
 *   2.  URL path segment
 *   3.  If that segment lacks “.<ext>”, infer the ext from Content‑Type
 *
 * @param url         Resource to download
 * @param defaultName Used when nothing else yields a name (may omit ext)
 */
export async function fetchFileWithName(
  url: string,
  defaultName = 'download',
): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') ?? '';

  let name = extractFileName(res, url);
  if (!name) {
    name = defaultName;            // nothing usable in headers / URL
  }
  name = addExtIfMissing(name, contentType);   // ← new bit

  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || contentType || 'application/octet-stream' });
}

/* ───────────────────────── helpers ───────────────────────── */

function extractFileName(response: Response, url: string): string | null {
  const cd = response.headers.get('content-disposition');
  if (cd) {
    const star = cd.match(/filename\*\s*=\s*(?:[^\']*)\'\'([^;]+)/i);
    if (star?.[1]) {
      try { return decodeURIComponent(stripQuotes(star[1])); } catch {}
    }

    const normal = cd.match(/filename\s*=\s*("?)([^\";]+)\1/i);
    if (normal?.[2]) return normal[2].trim();
  }

  try {
    const { pathname } = new URL(url);
    const segment = pathname.substring(pathname.lastIndexOf('/') + 1);
    return segment || null;
  } catch {
    return null;
  }
}

function addExtIfMissing(base: string, contentType: string): string {
  if (hasExtension(base)) return base;        // already like "report.pdf"

  const ext = guessExt(contentType);
  return ext ? `${base}.${ext}` : base;       // e.g. "report" + ".pdf"
}

function hasExtension(filename: string): boolean {
  return /\.[a-z0-9]{1,8}$/i.test(filename);
}

function guessExt(mime: string): string | null {
  const type = mime.split(';', 1)[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/json': 'json',
    'application/zip': 'zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'text/html': 'html',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  };
  return map[type] ?? null;
}

const stripQuotes = (s: string) => s.replace(/^"(.*)"$/, '$1');