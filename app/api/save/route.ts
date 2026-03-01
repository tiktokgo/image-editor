import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

/**
 * POST /api/save
 * Body: { dataUrl: string, quoteId?: string, originalUrl?: string }
 * Uploads to Vercel Blob, calls Bubble callback API, returns { url: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { dataUrl?: string; quoteId?: string; originalUrl?: string };
    const { dataUrl, quoteId, originalUrl } = body;

    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "Invalid dataUrl" }, { status: 400 });
    }

    // Strip the "data:image/png;base64," prefix
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    const blob = await put(`edited/${Date.now()}.png`, buffer, {
      access: "public",
      contentType: "image/png",
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
