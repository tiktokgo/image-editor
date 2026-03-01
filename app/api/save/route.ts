import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

/**
 * POST /api/save
 * Body: { dataUrl: string }  — a PNG data URL from canvas.toDataURL()
 * Uploads to Vercel Blob and returns { url: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { dataUrl?: string };
    const { dataUrl } = body;

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

    return NextResponse.json({ url: blob.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Save error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
