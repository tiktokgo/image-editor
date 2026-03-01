import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

/**
 * POST /api/save
 * Body: FormData { file: File, quoteId?: string, originalUrl?: string }
 * Uploads to Vercel Blob, calls Bubble callback API, returns { url: string }
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const quoteId = form.get("quoteId") as string | null;
    const originalUrl = form.get("originalUrl") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type === "image/jpeg" ? "jpg" : "png";
    const contentType = file.type || "image/jpeg";

    const blob = await put(`edited/${Date.now()}.${ext}`, buffer, {
      access: "public",
      contentType,
    });

    // Call Bubble API callback if configured
    const callbackUrl = process.env.BUBBLE_CALLBACK_URL;
    if (callbackUrl && quoteId) {
      await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_url: blob.url,
          old_url: originalUrl ?? "",
          quote_id: quoteId,
        }),
      });
    }

    return NextResponse.json({ url: blob.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Save error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
