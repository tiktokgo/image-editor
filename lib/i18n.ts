/**
 * i18n — set NEXT_PUBLIC_LANG=en for English deployment, default is Hebrew.
 * All strings and design tokens are resolved at build time.
 */

const lang = process.env.NEXT_PUBLIC_LANG === "en" ? "en" : "he";
const isHe = lang === "he";

export const dir: "rtl" | "ltr" = isHe ? "rtl" : "ltr";

export const t = {
  dir: dir,

  // Save button
  save:   isHe ? "💾 שמור"   : "💾 Save",
  saving: isHe ? "שומר..."   : "Saving...",
  saved:  isHe ? "✓ נשמר"   : "✓ Saved",

  // Toolbar tool labels
  draw:    isHe ? "ציור"    : "Draw",
  text:    isHe ? "טקסט"    : "Text",
  rect:    isHe ? "מלבן"    : "Rect",
  ellipse: isHe ? "עיגול"   : "Circle",
  line:    isHe ? "קו"      : "Line",
  crop:    isHe ? "חיתוך"   : "Crop",

  // Action buttons
  editText:  isHe ? "✏️ ערוך"       : "✏️ Edit",
  applyCrop: isHe ? "✂️ החל חיתוך"  : "✂️ Apply Crop",

  // Control labels
  colorLabel:     isHe ? "צבע"   : "Color",
  strokeLabel:    isHe ? "עובי"  : "Width",
  fontSizeLabel:  isHe ? "גודל"  : "Size",

  // Tooltip titles
  undoTitle:     isHe ? "בטל (Ctrl+Z)"   : "Undo (Ctrl+Z)",
  redoTitle:     isHe ? "שחזר (Ctrl+Y)"  : "Redo (Ctrl+Y)",
  clearTitle:    isHe ? "נקה הכל"        : "Clear all",
  editTextTitle: isHe ? "ערוך טקסט"      : "Edit text",
  colorTitle:    isHe ? "צבע"            : "Color",
  strokeTitle:   isHe ? "עובי"           : "Stroke width",
  fontTitle:     isHe ? "גודל טקסט"      : "Font size",

  // Hint toasts
  hintText:    isHe ? "הטקסט נוסף לתמונה - גרור אותו ושנה בהתאם" : "Text added — drag and resize as needed",
  hintDraw:    isHe ? "צייר על גבי התמונה"                       : "Draw on the image",
  hintRect:    isHe ? "לחצו על התמונה כדי להוסיף מלבן"           : "Tap the image to add a rectangle",
  hintEllipse: isHe ? "לחצו על התמונה כדי להוסיף עיגול"          : "Tap the image to add a circle",
  hintLine:    isHe ? "לחצו על התמונה כדי להוסיף קו"             : "Tap the image to add a line",
  hintCrop:    isHe ? "גרור על התמונה כדי לבחור אזור לחיתוך"     : "Drag on the image to select a crop area",

  // Errors
  errorLoading: isHe ? "שגיאה בטעינת התמונה" : "Error loading image",
  saveError:    isHe ? "שגיאה בשמירה"         : "Save error",

  // edit/page.tsx
  missingParam:        isHe ? "פרמטר חסר"                         : "Missing parameter",
  missingParamDesc:    isHe ? "יש לספק image_url בכתובת ה-URL."   : "Please provide image_url in the URL.",
  missingParamExample: isHe ? "דוגמה: /edit?image_url=https://..." : "Example: /edit?image_url=https://...",
};

/** Visual design tokens — dark theme for Hebrew, light theme for English */
export const design = {
  toolbar:    isHe ? "bg-gray-800 shadow-md"             : "bg-white border-b border-slate-200 shadow-sm",
  divider:    isHe ? "w-px h-8 bg-gray-600"              : "w-px h-8 bg-slate-300",
  sliderLabel: isHe ? "text-gray-400 text-xs"            : "text-slate-500 text-xs",

  // Icon buttons (undo / redo / clear / edit-text)
  iconBtn:  isHe
    ? "px-2 py-1.5 rounded text-base bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600"
    : "px-2 py-1.5 rounded text-base bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300",

  clearBtn: isHe
    ? "px-2 py-1.5 rounded text-base bg-red-800 text-white hover:bg-red-700 border border-red-700"
    : "px-2 py-1.5 rounded text-base bg-red-50 text-red-600 hover:bg-red-100 border border-red-300",

  editTextBtn: isHe
    ? "px-2 py-1.5 rounded text-base bg-blue-700 text-white hover:bg-blue-600 border border-blue-600"
    : "px-2 py-1.5 rounded text-base bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-300",

  // Tool buttons (inactive / active)
  toolBtn:       isHe
    ? "bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600"
    : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300",
  toolBtnActive: "bg-blue-500 text-white shadow-inner",
};
