"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  Canvas as FabricCanvas,
  FabricObject,
  Line as FabricLine,
  Rect as FabricRect,
} from "fabric";

type Tool = "select" | "draw" | "text" | "rect" | "ellipse" | "line" | "crop";

interface Props {
  imageUrl: string;
}

// ─── tiny button helper ───────────────────────────────────────────────────────
function ToolBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded text-xs font-medium transition-colors select-none ${
        active
          ? "bg-blue-600 text-white shadow-inner"
          : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
      }`}
      style={{ minWidth: 44 }}
    >
      {children}
    </button>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function ImageEditor({ imageUrl }: Props) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);

  // Line drawing state
  const isDrawingLineRef = useRef(false);
  const activeLineRef = useRef<FabricLine | null>(null);

  // Crop state
  const isCropDrawingRef = useRef(false);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const cropRectRef = useRef<FabricRect | null>(null);

  // Undo snapshots (JSON strings)
  const historyRef = useRef<string[]>([]);

  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#e53e3e");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);

  // ── keep a ref of current tool so event handlers don't stale-close ──────────
  const toolRef = useRef<Tool>("select");
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  const colorRef = useRef(color);
  useEffect(() => {
    colorRef.current = color;
  }, [color]);
  const strokeWidthRef = useRef(strokeWidth);
  useEffect(() => {
    strokeWidthRef.current = strokeWidth;
  }, [strokeWidth]);

  // ── snapshot for undo ────────────────────────────────────────────────────────
  const saveSnapshot = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    historyRef.current.push(JSON.stringify(canvas.toJSON()));
    // keep at most 30 snapshots
    if (historyRef.current.length > 30) historyRef.current.shift();
  }, []);

  // ── undo ─────────────────────────────────────────────────────────────────────
  const undo = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || historyRef.current.length < 2) return;
    historyRef.current.pop(); // discard current
    const prev = historyRef.current[historyRef.current.length - 1];
    await canvas.loadFromJSON(JSON.parse(prev));
    canvas.renderAll();
  }, []);

  // ── delete selected ───────────────────────────────────────────────────────────
  const deleteSelected = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    if (active.length === 0) return;
    active.forEach((obj) => canvas.remove(obj));
    canvas.discardActiveObject();
    canvas.renderAll();
    saveSnapshot();
  }, [saveSnapshot]);

  // ── apply crop ───────────────────────────────────────────────────────────────
  const applyCrop = useCallback(async () => {
    const canvas = fabricRef.current;
    const cropRect = cropRectRef.current;
    if (!canvas || !cropRect) return;

    const left = cropRect.left ?? 0;
    const top = cropRect.top ?? 0;
    const width = (cropRect.width ?? 0) * (cropRect.scaleX ?? 1);
    const height = (cropRect.height ?? 0) * (cropRect.scaleY ?? 1);

    if (width < 10 || height < 10) return;

    // Export the cropped region
    const croppedData = canvas.toDataURL({
      format: "png",
      left,
      top,
      width,
      height,
      multiplier: 1,
    });

    // Remove the crop rect
    canvas.remove(cropRect);
    cropRectRef.current = null;

    // Resize canvas, clear objects, reload cropped image as background
    canvas.setDimensions({ width, height });
    canvas.getObjects().forEach((o) => canvas.remove(o));

    const { FabricImage } = await import("fabric");
    const img = await FabricImage.fromURL(croppedData);
    img.set({ left: 0, top: 0, selectable: false, evented: false });
    canvas.backgroundImage = img;
    canvas.renderAll();

    historyRef.current = [];
    saveSnapshot();
    setTool("select");
  }, [saveSnapshot]);

  // ── canvas initialisation (runs once) ────────────────────────────────────────
  useEffect(() => {
    if (!canvasElRef.current || !containerRef.current) return;
    let mounted = true;

    const init = async () => {
      const { Canvas, FabricImage, PencilBrush, Line, Rect, Ellipse, IText } =
        await import("fabric");

      if (!mounted || !canvasElRef.current || !containerRef.current) return;

      const TOOLBAR_H = 56;
      const w = containerRef.current.clientWidth || window.innerWidth;
      const h = (containerRef.current.clientHeight || window.innerHeight) - TOOLBAR_H;

      const canvas = new Canvas(canvasElRef.current, {
        width: w,
        height: h,
        selection: true,
        backgroundColor: "#ffffff",
      });
      fabricRef.current = canvas;

      // Free-draw brush
      canvas.freeDrawingBrush = new PencilBrush(canvas);
      canvas.freeDrawingBrush.color = colorRef.current;
      canvas.freeDrawingBrush.width = strokeWidthRef.current;

      // Load background image via proxy
      const proxyUrl = `/api/image?url=${encodeURIComponent(imageUrl)}`;
      try {
        const img = await FabricImage.fromURL(proxyUrl, { crossOrigin: "anonymous" });
        if (!mounted) return;

        // Scale to fit canvas while keeping aspect ratio
        const scaleX = w / (img.width ?? w);
        const scaleY = h / (img.height ?? h);
        const scale = Math.min(scaleX, scaleY);
        img.set({
          left: 0,
          top: 0,
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          evented: false,
          originX: "left",
          originY: "top",
        });
        canvas.backgroundImage = img;
        canvas.renderAll();
        saveSnapshot();
        if (mounted) setCanvasReady(true);
      } catch (e) {
        if (mounted) setImageLoadError(String(e));
      }

      // ── mouse events ────────────────────────────────────────────────────────
      canvas.on("mouse:down", (opt) => {
        const pointer = canvas.getScenePoint(opt.e);
        const currentTool = toolRef.current;

        if (currentTool === "text") {
          const txt = new IText("טקסט", {
            left: pointer.x,
            top: pointer.y,
            fontSize: 24,
            fill: colorRef.current,
            fontFamily: "Arial",
            editable: true,
          });
          canvas.add(txt);
          canvas.setActiveObject(txt);
          txt.enterEditing();
          txt.selectAll();
          canvas.renderAll();
        } else if (currentTool === "rect") {
          const rect = new Rect({
            left: pointer.x - 60,
            top: pointer.y - 30,
            width: 120,
            height: 60,
            fill: "transparent",
            stroke: colorRef.current,
            strokeWidth: strokeWidthRef.current,
          });
          canvas.add(rect);
          canvas.setActiveObject(rect);
          canvas.renderAll();
          saveSnapshot();
        } else if (currentTool === "ellipse") {
          const ellipse = new Ellipse({
            left: pointer.x - 50,
            top: pointer.y - 30,
            rx: 50,
            ry: 30,
            fill: "transparent",
            stroke: colorRef.current,
            strokeWidth: strokeWidthRef.current,
          });
          canvas.add(ellipse);
          canvas.setActiveObject(ellipse);
          canvas.renderAll();
          saveSnapshot();
        } else if (currentTool === "line") {
          isDrawingLineRef.current = true;
          const line = new Line(
            [pointer.x, pointer.y, pointer.x, pointer.y],
            {
              stroke: colorRef.current,
              strokeWidth: strokeWidthRef.current,
              selectable: false,
              evented: false,
            }
          );
          activeLineRef.current = line;
          canvas.add(line);
        } else if (currentTool === "crop") {
          isCropDrawingRef.current = true;
          cropStartRef.current = { x: pointer.x, y: pointer.y };
          // Remove previous crop rect if any
          if (cropRectRef.current) {
            canvas.remove(cropRectRef.current);
          }
          const rect = new Rect({
            left: pointer.x,
            top: pointer.y,
            width: 0,
            height: 0,
            fill: "rgba(59,130,246,0.15)",
            stroke: "#3b82f6",
            strokeWidth: 2,
            strokeDashArray: [6, 4],
            selectable: false,
            evented: false,
          });
          cropRectRef.current = rect;
          canvas.add(rect);
        }
      });

      canvas.on("mouse:move", (opt) => {
        const pointer = canvas.getScenePoint(opt.e);
        if (toolRef.current === "line" && isDrawingLineRef.current && activeLineRef.current) {
          activeLineRef.current.set({ x2: pointer.x, y2: pointer.y });
          canvas.renderAll();
        } else if (toolRef.current === "crop" && isCropDrawingRef.current && cropRectRef.current && cropStartRef.current) {
          const start = cropStartRef.current;
          const x = Math.min(pointer.x, start.x);
          const y = Math.min(pointer.y, start.y);
          const w2 = Math.abs(pointer.x - start.x);
          const h2 = Math.abs(pointer.y - start.y);
          cropRectRef.current.set({ left: x, top: y, width: w2, height: h2 });
          canvas.renderAll();
        }
      });

      canvas.on("mouse:up", () => {
        if (toolRef.current === "line" && isDrawingLineRef.current) {
          isDrawingLineRef.current = false;
          if (activeLineRef.current) {
            activeLineRef.current.set({ selectable: true, evented: true });
            canvas.setActiveObject(activeLineRef.current);
            activeLineRef.current = null;
          }
          saveSnapshot();
        }
        if (toolRef.current === "crop") {
          isCropDrawingRef.current = false;
        }
      });

      // Save snapshot after free-draw path added
      canvas.on("path:created", () => {
        saveSnapshot();
      });

      // Keyboard shortcuts
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Delete" || e.key === "Backspace") {
          // Don't delete if a text object is being edited
          const active = canvas.getActiveObject() as FabricObject & { isEditing?: boolean };
          if (active && active.isEditing) return;
          deleteSelected();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "z") {
          e.preventDefault();
          undo();
        }
      };
      window.addEventListener("keydown", handleKeyDown);

      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    };

    let cleanup: (() => void) | undefined;
    init().then((fn) => {
      cleanup = fn;
    });

    return () => {
      mounted = false;
      cleanup?.();
      fabricRef.current?.dispose();
      fabricRef.current = null;
    };
  }, [imageUrl, saveSnapshot, deleteSelected, undo]);

  // ── sync tool changes to canvas ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.isDrawingMode = tool === "draw";
    canvas.selection = tool === "select";
    canvas.defaultCursor = tool === "text" ? "text" : tool === "crop" ? "crosshair" : "default";

    // Clean up orphan crop rect when leaving crop mode
    if (tool !== "crop" && cropRectRef.current) {
      canvas.remove(cropRectRef.current);
      cropRectRef.current = null;
      canvas.renderAll();
    }
  }, [tool]);

  // ── sync brush color/width ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas?.freeDrawingBrush) return;
    canvas.freeDrawingBrush.color = color;
    canvas.freeDrawingBrush.width = strokeWidth;
  }, [color, strokeWidth]);

  // ── save to Vercel Blob ──────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    setSaving(true);
    setSaveError(null);
    setSavedUrl(null);

    try {
      const dataUrl = canvas.toDataURL({ format: "png", multiplier: 1 });
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "שגיאה בשמירה");

      setSavedUrl(json.url);
      window.parent.postMessage({ type: "image-editor-save", url: json.url }, "*");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, []);

  // ── render ────────────────────────────────────────────────────────────────────
  const showColorStroke =
    tool === "draw" || tool === "rect" || tool === "ellipse" || tool === "line";

  return (
    <div ref={containerRef} className="flex flex-col" style={{ height: "100vh" }}>
      {/* ── Toolbar ── */}
      <div
        dir="rtl"
        className="flex items-center gap-1.5 px-3 bg-gray-800 shadow-md flex-shrink-0"
        style={{ height: 56 }}
      >
        {/* Tools */}
        <ToolBtn active={tool === "select"} onClick={() => setTool("select")} title="בחר">
          <span className="text-base">🖱</span>
          <span>בחר</span>
        </ToolBtn>
        <ToolBtn active={tool === "draw"} onClick={() => setTool("draw")} title="ציור חופשי">
          <span className="text-base">✏️</span>
          <span>ציור</span>
        </ToolBtn>
        <ToolBtn active={tool === "text"} onClick={() => setTool("text")} title="טקסט">
          <span className="text-base font-bold">T</span>
          <span>טקסט</span>
        </ToolBtn>
        <ToolBtn active={tool === "rect"} onClick={() => setTool("rect")} title="מלבן">
          <span className="text-base">▭</span>
          <span>מלבן</span>
        </ToolBtn>
        <ToolBtn active={tool === "ellipse"} onClick={() => setTool("ellipse")} title="עיגול">
          <span className="text-base">○</span>
          <span>עיגול</span>
        </ToolBtn>
        <ToolBtn active={tool === "line"} onClick={() => setTool("line")} title="קו">
          <span className="text-base">╱</span>
          <span>קו</span>
        </ToolBtn>
        <ToolBtn active={tool === "crop"} onClick={() => setTool("crop")} title="חיתוך">
          <span className="text-base">✂️</span>
          <span>חיתוך</span>
        </ToolBtn>

        {/* Crop apply button */}
        {tool === "crop" && (
          <button
            onClick={applyCrop}
            className="px-3 py-1.5 rounded text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          >
            החל חיתוך
          </button>
        )}

        {/* Divider */}
        <div className="w-px h-8 bg-gray-600 mx-1" />

        {/* Color + stroke — visible when relevant */}
        {showColorStroke && (
          <>
            <label className="flex flex-col items-center gap-0.5 cursor-pointer" title="צבע">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-7 h-7 rounded border-0 p-0 cursor-pointer"
              />
              <span className="text-gray-300 text-xs">צבע</span>
            </label>
            <label className="flex flex-col items-center gap-0.5" title="עובי">
              <input
                type="range"
                min={1}
                max={20}
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                className="w-20 accent-blue-400"
              />
              <span className="text-gray-300 text-xs">עובי {strokeWidth}</span>
            </label>
          </>
        )}

        <div className="flex-1" />

        {/* Undo & Delete */}
        <button
          onClick={undo}
          title="בטל (Ctrl+Z)"
          className="px-2 py-1.5 rounded text-xs font-medium bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600"
        >
          ↩ בטל
        </button>
        <button
          onClick={deleteSelected}
          title="מחק בחור"
          className="px-2 py-1.5 rounded text-xs font-medium bg-red-700 text-white hover:bg-red-600 border border-red-600"
        >
          🗑 מחק
        </button>

        {/* Divider */}
        <div className="w-px h-8 bg-gray-600 mx-1" />

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || !canvasReady}
          className={`px-4 py-1.5 rounded text-sm font-semibold transition-colors ${
            savedUrl
              ? "bg-green-600 text-white"
              : "bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          }`}
        >
          {saving ? "שומר..." : savedUrl ? "✓ נשמר" : "💾 שמור"}
        </button>
      </div>

      {/* ── Canvas area ── */}
      <div className="flex-1 overflow-auto flex items-start justify-center bg-gray-400">
        {imageLoadError && (
          <div className="m-8 p-6 bg-red-50 rounded-lg text-red-700 text-center max-w-md">
            <div className="text-3xl mb-2">⚠️</div>
            <div className="font-bold mb-1">שגיאה בטעינת התמונה</div>
            <div className="text-sm text-red-600 break-all">{imageLoadError}</div>
          </div>
        )}
        {saveError && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm shadow-lg z-50">
            ⚠️ {saveError}
          </div>
        )}
        <canvas ref={canvasElRef} />
      </div>
    </div>
  );
}
