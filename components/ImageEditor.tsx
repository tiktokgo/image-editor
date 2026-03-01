"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  Canvas as FabricCanvas,
  FabricObject,
  Line as FabricLine,
} from "fabric";

type Tool = "select" | "draw" | "text" | "rect" | "ellipse" | "line" | "crop";

interface Props {
  imageUrl: string;
  quoteId?: string;
}

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
          ? "bg-blue-500 text-white shadow-inner"
          : "bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600"
      }`}
      style={{ minWidth: 44 }}
    >
      {children}
    </button>
  );
}

export default function ImageEditor({ imageUrl, quoteId }: Props) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);

  // Ref to IText class (populated after dynamic import)
  const ITextClassRef = useRef<typeof import("fabric")["IText"] | null>(null);

  // Line drawing
  const isDrawingLineRef = useRef(false);
  const activeLineRef = useRef<FabricLine | null>(null);

  // Undo / redo stacks (JSON snapshots)
  const historyRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);

  // Crop HTML overlay state (avoids Fabric.js DOM manipulation during crop)
  const [cropOverlay, setCropOverlay] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cropBtnPos, setCropBtnPos] = useState<{ x: number; y: number } | null>(null);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const cropDraggingRef = useRef(false);

  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#e53e3e");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fontSize, setFontSize] = useState(28);
  const [selectedObjectType, setSelectedObjectType] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);
  // Canvas display size (matches rendered image, not full viewport)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  // Multiplier for toDataURL so saved PNG = original image resolution (1 / renderScale)
  const multiplierRef = useRef(1);

  // Stable refs so Fabric event handlers always read current values
  const toolRef = useRef<Tool>("select");
  useEffect(() => { toolRef.current = tool; }, [tool]);
  const colorRef = useRef(color);
  useEffect(() => { colorRef.current = color; }, [color]);
  const strokeWidthRef = useRef(strokeWidth);
  useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);
  const setToolRef = useRef(setTool);
  useEffect(() => { setToolRef.current = setTool; }, []);
  const setColorRef = useRef(setColor);
  const setFontSizeRef = useRef(setFontSize);
  const setSelectedObjectTypeRef = useRef(setSelectedObjectType);

  // ── history ──────────────────────────────────────────────────────────────────
  const saveSnapshot = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    historyRef.current.push(JSON.stringify(canvas.toJSON()));
    if (historyRef.current.length > 30) historyRef.current.shift();
    redoStackRef.current = []; // new action clears redo
  }, []);

  const undo = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || historyRef.current.length < 2) return;
    redoStackRef.current.push(historyRef.current.pop()!);
    const prev = historyRef.current[historyRef.current.length - 1];
    await canvas.loadFromJSON(JSON.parse(prev));
    canvas.renderAll();
  }, []);

  const redo = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;
    historyRef.current.push(next);
    await canvas.loadFromJSON(JSON.parse(next));
    canvas.renderAll();
  }, []);

  // ── clear all drawn elements (keep background) ────────────────────────────────
  const clearAll = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getObjects().forEach((obj) => canvas.remove(obj));
    canvas.discardActiveObject();
    canvas.renderAll();
    saveSnapshot();
  }, [saveSnapshot]);

  // ── add text via toolbar button ───────────────────────────────────────────────
  const handleAddText = useCallback(() => {
    const canvas = fabricRef.current;
    const IText = ITextClassRef.current;
    if (!canvas || !IText) return;

    const cw = canvas.width ?? 400;
    const ch = canvas.height ?? 300;

    // On mobile, place text near the top so keyboard doesn't cover it
    const isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const topPos = isMobile
      ? Math.max(10, ch * 0.15 + (Math.random() * 20 - 10))
      : Math.max(10, ch / 2 - 20 + (Math.random() * 60 - 30));

    const txt = new IText("טקסט", {
      left: Math.max(10, cw / 2 - 40 + (Math.random() * 60 - 30)),
      top: topPos,
      fontSize: 28,
      fill: colorRef.current,
      fontFamily: "Arial",
    });
    canvas.add(txt);
    canvas.setActiveObject(txt);
    canvas.renderAll();
    saveSnapshot();
    setToolRef.current("select");
  }, [saveSnapshot]);

  // ── edit text (toolbar button — safe way to enter editing on mobile) ────────────
  const handleEditText = useCallback(() => {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject() as (FabricObject & { enterEditing?: () => void; selectAll?: () => void }) | null;
    if (!active || active.type !== "i-text") return;
    active.enterEditing?.();
    active.selectAll?.();
    canvas?.renderAll();
  }, []);

  // ── crop (HTML overlay — avoids Fabric.js insertBefore DOM error) ─────────────
  const handleCropMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cropStartRef.current = { x, y };
    cropDraggingRef.current = true;
    setCropOverlay({ x, y, w: 0, h: 0 });
    setCropBtnPos(null);
  }, []);

  const handleCropMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cropDraggingRef.current || !cropStartRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const s = cropStartRef.current;
    setCropOverlay({
      x: Math.min(x, s.x),
      y: Math.min(y, s.y),
      w: Math.abs(x - s.x),
      h: Math.abs(y - s.y),
    });
  }, []);

  const handleCropMouseUp = useCallback(() => {
    if (!cropDraggingRef.current) return;
    cropDraggingRef.current = false;
    setCropOverlay((prev) => {
      if (prev && prev.w > 10 && prev.h > 10) {
        setCropBtnPos({ x: prev.x + prev.w, y: prev.y + prev.h });
        return prev;
      }
      return null;
    });
  }, []);

  const applyCrop = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || !cropOverlay) return;
    const { x, y, w, h } = cropOverlay;
    if (w < 10 || h < 10) return;

    const croppedData = canvas.toDataURL({ format: "png", left: x, top: y, width: w, height: h, multiplier: multiplierRef.current });

    canvas.setDimensions({ width: w, height: h });
    setCanvasSize({ w, h });
    canvas.getObjects().forEach((o) => canvas.remove(o));

    const { FabricImage } = await import("fabric");
    const img = await FabricImage.fromURL(croppedData);
    img.set({ left: 0, top: 0, selectable: false, evented: false });
    canvas.backgroundImage = img;
    canvas.renderAll();

    setCropOverlay(null);
    setCropBtnPos(null);
    historyRef.current = [];
    redoStackRef.current = [];
    saveSnapshot();
    setTool("select");
  }, [cropOverlay, saveSnapshot]);

  // ── canvas initialisation ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasElRef.current || !containerRef.current) return;
    let mounted = true;

    const init = async () => {
      const { Canvas, FabricImage, PencilBrush, Line, Rect, Ellipse, IText } =
        await import("fabric");

      if (!mounted || !canvasElRef.current) return;

      ITextClassRef.current = IText;

      const TOOLBAR_H = 56;
      const maxW = window.innerWidth;
      const maxH = window.innerHeight - TOOLBAR_H;

      const canvas = new Canvas(canvasElRef.current, {
        width: maxW,
        height: maxH,
        selection: true,
        backgroundColor: "#ffffff",
      });
      fabricRef.current = canvas;

      canvas.freeDrawingBrush = new PencilBrush(canvas);
      canvas.freeDrawingBrush.color = colorRef.current;
      canvas.freeDrawingBrush.width = strokeWidthRef.current;

      const proxyUrl = `/api/image?url=${encodeURIComponent(imageUrl)}`;
      try {
        const img = await FabricImage.fromURL(proxyUrl, { crossOrigin: "anonymous" });
        if (!mounted) return;

        const imgW = img.width ?? maxW;
        const imgH = img.height ?? maxH;

        const scale = Math.min(1, maxW / imgW, maxH / imgH);
        const canvasW = Math.round(imgW * scale);
        const canvasH = Math.round(imgH * scale);

        canvas.setDimensions({ width: canvasW, height: canvasH });
        multiplierRef.current = imgW / canvasW;

        img.set({ left: 0, top: 0, scaleX: scale, scaleY: scale, selectable: false, evented: false });
        canvas.backgroundImage = img;
        canvas.renderAll();
        saveSnapshot();
        if (mounted) {
          setCanvasSize({ w: canvasW, h: canvasH });
          setCanvasReady(true);
        }
      } catch (e) {
        if (mounted) setImageLoadError(String(e));
      }

      // ── selection events — show color/stroke for selected object ─────────────
      const onSelect = (obj: FabricObject | undefined) => {
        if (!obj) return;
        setSelectedObjectTypeRef.current(obj.type ?? null);
        // Sync color picker to the selected object's color
        const c = obj.type === "i-text"
          ? (obj as unknown as { fill: string }).fill
          : (obj as unknown as { stroke: string }).stroke;
        if (c && typeof c === "string") setColorRef.current(c);
        // Sync font size for text
        if (obj.type === "i-text") {
          const fs = (obj as unknown as { fontSize: number }).fontSize;
          if (fs) setFontSizeRef.current(fs);
        }
      };

      canvas.on("selection:created", (opt) => onSelect((opt as unknown as { selected: FabricObject[] }).selected?.[0]));
      canvas.on("selection:updated", (opt) => onSelect((opt as unknown as { selected: FabricObject[] }).selected?.[0]));
      canvas.on("selection:cleared", () => setSelectedObjectTypeRef.current(null));

      // ── mouse:down ───────────────────────────────────────────────────────────
      canvas.on("mouse:down", (opt) => {
        const pointer = canvas.getScenePoint(opt.e);
        const currentTool = toolRef.current;
        const target = opt.target as (FabricObject & { isEditing?: boolean; enterEditing?: () => void; selectAll?: () => void }) | undefined;

        // Mobile text tap: always select only (never auto-enter edit) so user can drag freely
        // To edit, user taps the ✏️ toolbar button
        if (target?.type === "i-text") {
          const isTouch = (opt.e as PointerEvent).pointerType === "touch" || "touches" in opt.e;
          if (isTouch) {
            canvas.setActiveObject(target);
            // Fabric may have auto-entered edit mode internally — exit it asynchronously
            setTimeout(() => {
              if ((target as unknown as { isEditing?: boolean; exitEditing?: () => void }).isEditing) {
                (target as unknown as { exitEditing: () => void }).exitEditing();
                canvas.renderAll();
              }
            }, 0);
            canvas.renderAll();
            return;
          }
        }

        if (currentTool === "select" || currentTool === "draw" || currentTool === "crop") return;

        if (target) {
          canvas.setActiveObject(target);
          canvas.renderAll();
          return;
        }

        if (currentTool === "rect") {
          const rect = new Rect({
            left: pointer.x - 60,
            top: pointer.y - 30,
            width: 120,
            height: 60,
            fill: "transparent",
            stroke: colorRef.current,
            strokeWidth: strokeWidthRef.current,
            strokeUniform: true,
          });
          canvas.add(rect);
          canvas.setActiveObject(rect);
          canvas.renderAll();
          saveSnapshot();
          setToolRef.current("select");

        } else if (currentTool === "ellipse") {
          const ellipse = new Ellipse({
            left: pointer.x - 50,
            top: pointer.y - 30,
            rx: 50,
            ry: 30,
            fill: "transparent",
            stroke: colorRef.current,
            strokeWidth: strokeWidthRef.current,
            strokeUniform: true,
          });
          canvas.add(ellipse);
          canvas.setActiveObject(ellipse);
          canvas.renderAll();
          saveSnapshot();
          setToolRef.current("select");

        } else if (currentTool === "line") {
          isDrawingLineRef.current = true;
          const line = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke: colorRef.current,
            strokeWidth: strokeWidthRef.current,
            selectable: false,
            evented: false,
          });
          activeLineRef.current = line;
          canvas.add(line);
        }
      });

      canvas.on("mouse:move", (opt) => {
        if (toolRef.current === "line" && isDrawingLineRef.current && activeLineRef.current) {
          const pointer = canvas.getScenePoint(opt.e);
          activeLineRef.current.set({ x2: pointer.x, y2: pointer.y });
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
          setToolRef.current("select");
        }
      });

      canvas.on("path:created", () => saveSnapshot());

      const handleKeyDown = (e: KeyboardEvent) => {
        const active = canvas.getActiveObject() as (FabricObject & { isEditing?: boolean }) | null;
        if ((e.key === "Delete" || e.key === "Backspace") && !active?.isEditing) {
          clearAll();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
        if ((e.ctrlKey || e.metaKey) && e.key === "y") { e.preventDefault(); redo(); }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Z") { e.preventDefault(); redo(); }
        if (e.key === "Escape") setToolRef.current("select");
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    };

    let cleanup: (() => void) | undefined;
    init().then((fn) => { cleanup = fn; });
    return () => {
      mounted = false;
      cleanup?.();
      fabricRef.current?.dispose();
      fabricRef.current = null;
    };
  }, [imageUrl, saveSnapshot, clearAll, undo, redo]);

  // ── sync tool → canvas mode ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.isDrawingMode = tool === "draw";
    canvas.selection = tool !== "draw" && tool !== "crop";
    canvas.defaultCursor =
      tool === "crop" || tool === "line" ? "crosshair" : "default";

    if (tool !== "crop") {
      setCropOverlay(null);
      setCropBtnPos(null);
    }
  }, [tool]);

  // ── sync color/stroke → brush + selected object ───────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = color;
      canvas.freeDrawingBrush.width = strokeWidth;
    }
    const active = canvas.getActiveObject() as (FabricObject & { fill?: string; stroke?: string; fontSize?: number }) | null;
    if (active) {
      if (active.type === "i-text") {
        active.set("fill" as keyof FabricObject, color as unknown as never);
      } else {
        active.set("stroke" as keyof FabricObject, color as unknown as never);
        active.set("strokeWidth" as keyof FabricObject, strokeWidth as unknown as never);
      }
      canvas.renderAll();
    }
  }, [color, strokeWidth]);

  // ── sync font size → selected text ───────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (active?.type === "i-text") {
      active.set("fontSize" as keyof FabricObject, fontSize as unknown as never);
      canvas.renderAll();
    }
  }, [fontSize]);

  // ── save ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    setSaving(true);
    setSaveError(null);
    setSavedUrl(null);
    try {
      const dataUrl = canvas.toDataURL({ format: "png", multiplier: multiplierRef.current });
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, quoteId, originalUrl: imageUrl }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "שגיאה בשמירה");
      setSavedUrl(json.url);
      window.parent.postMessage({ type: "image-editor-save", url: json.url, quoteId, originalUrl: imageUrl }, "*");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [imageUrl, quoteId]);

  // Show color picker: when a drawing tool is active OR an object is selected
  const hasSelection = selectedObjectType !== null;
  const showColorStroke = tool === "draw" || tool === "rect" || tool === "ellipse" || tool === "line" || tool === "text" || hasSelection;
  // Show stroke width: not for text
  const showStrokeSlider = tool !== "text" && selectedObjectType !== "i-text";
  // Show font size: when text tool active or i-text selected
  const showFontSize = tool === "text" || selectedObjectType === "i-text";

  return (
    <div ref={containerRef} style={{ height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>

      {/* ── Toolbar: Save is static, rest scrolls on mobile ── */}
      <div
        className="bg-gray-800 shadow-md flex-shrink-0 flex items-center"
        style={{ height: 56 }}
      >
        {/* Save button — always visible, never scrolls */}
        <div className="flex items-center gap-1.5 pl-3 flex-shrink-0">
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
          <div className="w-px h-8 bg-gray-600" />
        </div>

        {/* Scrollable area for all other controls */}
        <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", height: "100%" }}>
        <div className="flex items-center gap-1.5 px-2 h-full" style={{ minWidth: "max-content" }}>

        {/* Undo / Redo / Clear all */}
        <button onClick={undo} title="בטל (Ctrl+Z)" className="px-2 py-1.5 rounded text-base bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600">↩</button>
        <button onClick={redo} title="שחזר (Ctrl+Y)" className="px-2 py-1.5 rounded text-base bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600">↪</button>
        <button onClick={clearAll} title="נקה הכל" className="px-2 py-1.5 rounded text-base bg-red-800 text-white hover:bg-red-700 border border-red-700">🗑</button>
        {/* Edit text button — appears when text is selected, lets mobile users enter editing mode */}
        {selectedObjectType === "i-text" && (
          <button onClick={handleEditText} title="ערוך טקסט" className="px-2 py-1.5 rounded text-base bg-blue-700 text-white hover:bg-blue-600 border border-blue-600">✏️ ערוך</button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Color + stroke + font size (when relevant) */}
        {showColorStroke && (
          <>
            <label className="flex flex-col items-center gap-0.5 cursor-pointer" title="צבע">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-7 h-7 rounded border-0 p-0 cursor-pointer"
              />
              <span className="text-gray-400 text-xs">צבע</span>
            </label>
            {showStrokeSlider && (
              <label className="flex flex-col items-center gap-0.5" title="עובי">
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  className="w-20 accent-blue-400"
                />
                <span className="text-gray-400 text-xs">עובי {strokeWidth}</span>
              </label>
            )}
            {showFontSize && (
              <label className="flex flex-col items-center gap-0.5" title="גודל טקסט">
                <input
                  type="range"
                  min={10}
                  max={120}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-20 accent-blue-400"
                />
                <span className="text-gray-400 text-xs">גודל {fontSize}</span>
              </label>
            )}
            <div className="w-px h-8 bg-gray-600 mx-0.5" />
          </>
        )}

        {/* RIGHT: Tools */}
        <ToolBtn active={tool === "draw"} onClick={() => setTool("draw")} title="ציור חופשי">
          <span>✏️</span><span>ציור</span>
        </ToolBtn>
        <ToolBtn active={tool === "text"} onClick={handleAddText} title="הוסף טקסט">
          <span className="font-bold text-sm">T</span><span>טקסט</span>
        </ToolBtn>
        <ToolBtn active={tool === "rect"} onClick={() => setTool("rect")} title="מלבן">
          <span>▭</span><span>מלבן</span>
        </ToolBtn>
        <ToolBtn active={tool === "ellipse"} onClick={() => setTool("ellipse")} title="עיגול">
          <span>○</span><span>עיגול</span>
        </ToolBtn>
        <ToolBtn active={tool === "line"} onClick={() => setTool("line")} title="קו">
          <span>╱</span><span>קו</span>
        </ToolBtn>
        <ToolBtn active={tool === "crop"} onClick={() => setTool("crop")} title="חיתוך">
          <span>✂️</span><span>חיתוך</span>
        </ToolBtn>
      </div>
      </div>
      </div>

      {/* ── Canvas area: gray background, canvas centered inside ── */}
      <div
        className="flex-1 bg-gray-500 overflow-auto"
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, position: "relative" }}
      >
        {/* Canvas wrapper — exactly sized to the rendered image, centered in the gray area */}
        <div
          style={{
            position: "relative",
            flexShrink: 0,
            ...(canvasSize.w > 0 ? { width: canvasSize.w, height: canvasSize.h } : {}),
            boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          }}
        >
          <canvas ref={canvasElRef} style={{ display: "block" }} />

          {/* ── Crop overlay ── */}
          {tool === "crop" && (
            <div
              style={{ position: "absolute", inset: 0, cursor: "crosshair", zIndex: 10 }}
              onMouseDown={handleCropMouseDown}
              onMouseMove={handleCropMouseMove}
              onMouseUp={handleCropMouseUp}
              onMouseLeave={handleCropMouseUp}
            >
              {cropOverlay && cropOverlay.w > 2 && cropOverlay.h > 2 && (
                <div
                  style={{
                    position: "absolute",
                    left: cropOverlay.x,
                    top: cropOverlay.y,
                    width: cropOverlay.w,
                    height: cropOverlay.h,
                    border: "2px dashed #3b82f6",
                    backgroundColor: "rgba(59,130,246,0.1)",
                    pointerEvents: "none",
                  }}
                />
              )}
              {cropBtnPos && (
                <button
                  style={{ position: "absolute", left: cropBtnPos.x + 6, top: cropBtnPos.y + 6, zIndex: 20 }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={applyCrop}
                  className="px-3 py-1.5 rounded text-xs font-semibold bg-blue-500 text-white shadow-lg hover:bg-blue-600 border border-blue-400"
                >
                  ✂️ החל חיתוך
                </button>
              )}
            </div>
          )}
        </div>

        {/* Error / save-error overlays */}
        {imageLoadError && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="m-8 p-6 bg-red-50 rounded-lg text-red-700 text-center max-w-md">
              <div className="text-3xl mb-2">⚠️</div>
              <div className="font-bold mb-1">שגיאה בטעינת התמונה</div>
              <div className="text-sm text-red-600 break-all">{imageLoadError}</div>
            </div>
          </div>
        )}
        {saveError && (
          <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 50 }}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm shadow-lg whitespace-nowrap"
          >
            ⚠️ {saveError}
          </div>
        )}
      </div>
    </div>
  );
}
