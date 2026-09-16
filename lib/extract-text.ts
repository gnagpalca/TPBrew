import mammoth from "mammoth";

/**
 * Extracts plain text from a downloaded Drive file buffer, based on its
 * MIME type. Supports the two formats used in the client/framework
 * folders today (PDF, DOCX) — throws for anything else so a sync run
 * surfaces unsupported files instead of silently skipping them.
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Unsupported file type for text extraction: ${mimeType}`);
}
