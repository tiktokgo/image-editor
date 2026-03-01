import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/image?url=<encoded-image-url>
 *
 * Server-side proxy for fetching images from external sources (e.g. Bubble CDN).
 * Returns the image with CORS headers so Fabric.js canvas.toDataURL() works without tainting.
 * Also normalises protocol-relative URLs (//cdn...) → https://cdn...
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    const absoluteUrl = url.startsWith("//") ? `https:${url}` : url;
    const upstream = await fetch(absoluteUrl, { cache: "no-store" });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${upstream.status}` },
        { status: upstream.status }
      );
    }

    const buffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("Access-Control-Allow-Origin", "*");

    return new NextResponse(buffer, { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Image proxy error:", message);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
  }
}
