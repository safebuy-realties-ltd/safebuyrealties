import type { jsPDF } from "jspdf";

type DownloadHtmlPdfOptions = {
  filename: string;
  /** Capture width in CSS pixels (A4 ~794 at 96dpi). */
  widthPx?: number;
  backgroundColor?: string;
  marginPt?: number;
};

const STYLE_PROPS = [
  "align-items",
  "background",
  "background-color",
  "background-image",
  "border",
  "border-bottom",
  "border-color",
  "border-left",
  "border-radius",
  "border-right",
  "border-style",
  "border-top",
  "border-width",
  "box-shadow",
  "color",
  "column-gap",
  "display",
  "fill",
  "flex",
  "flex-direction",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "gap",
  "grid-template-columns",
  "height",
  "justify-content",
  "letter-spacing",
  "line-height",
  "margin",
  "max-width",
  "min-height",
  "min-width",
  "opacity",
  "overflow",
  "padding",
  "row-gap",
  "stroke",
  "text-align",
  "text-decoration",
  "text-transform",
  "vertical-align",
  "white-space",
  "width",
  "word-break",
] as const;

const COLOR_PROPS = new Set([
  "background",
  "background-color",
  "background-image",
  "border",
  "border-bottom",
  "border-color",
  "border-left",
  "border-right",
  "border-top",
  "box-shadow",
  "color",
  "fill",
  "stroke",
]);

let colorCanvas: HTMLCanvasElement | null = null;
let colorCtx: CanvasRenderingContext2D | null = null;

/** Convert any CSS color (including oklch/oklab) to rgba() for html2canvas. */
function toRgbColor(value: string): string {
  if (!value || value === "transparent" || value === "none") return value;
  if (/^rgba?\(/i.test(value) || /^#([0-9a-f]{3,8})$/i.test(value)) return value;

  if (!colorCanvas || !colorCtx) {
    colorCanvas = document.createElement("canvas");
    colorCanvas.width = 1;
    colorCanvas.height = 1;
    colorCtx = colorCanvas.getContext("2d", { willReadFrequently: true });
  }
  if (!colorCtx) return "rgba(0,0,0,0)";

  try {
    colorCtx.clearRect(0, 0, 1, 1);
    colorCtx.fillStyle = "#000000";
    colorCtx.fillStyle = value;
    const normalized = String(colorCtx.fillStyle);
    if (/^rgba?\(/i.test(normalized) || /^#/i.test(normalized)) {
      // Prefer rgba for alpha-aware values.
      colorCtx.clearRect(0, 0, 1, 1);
      colorCtx.fillStyle = value;
      colorCtx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = colorCtx.getImageData(0, 0, 1, 1).data;
      return `rgba(${r}, ${g}, ${b}, ${Number((a / 255).toFixed(3))})`;
    }
  } catch {
    // ignore and fall through
  }
  return "rgba(0,0,0,0)";
}

function sanitizeCssValue(prop: string, value: string): string | null {
  if (!value) return null;
  if (!/(oklch|oklab|color-mix)/i.test(value)) return value;
  if (!COLOR_PROPS.has(prop)) return null;

  // Replace each modern color function token inside gradients/shadows with rgba().
  return value.replace(/(?:oklch|oklab|color-mix)\([^)]+\)/gi, (token) => toRgbColor(token));
}

function inlineComputedStyles(sourceRoot: HTMLElement, cloneRoot: HTMLElement) {
  const sourceNodes = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll<HTMLElement>("*"))];
  const cloneNodes = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll<HTMLElement>("*"))];

  sourceNodes.forEach((source, index) => {
    const clone = cloneNodes[index];
    if (!clone) return;
    const computed = window.getComputedStyle(source);
    let css = "box-sizing:border-box;";
    for (const prop of STYLE_PROPS) {
      const raw = computed.getPropertyValue(prop);
      const value = sanitizeCssValue(prop, raw);
      if (!value || (value === "none" && prop !== "background-image")) {
        if (prop === "background-image" && raw === "none") continue;
        if (!value) continue;
      }
      if (!value) continue;
      css += `${prop}:${value};`;
    }

    // Always force resolved RGB for the critical paint colors.
    css += `color:${toRgbColor(computed.color)};`;
    css += `background-color:${toRgbColor(computed.backgroundColor)};`;
    const bgImage = sanitizeCssValue("background-image", computed.backgroundImage);
    if (bgImage && bgImage !== "none") css += `background-image:${bgImage};`;
    css += `border-top-color:${toRgbColor(computed.borderTopColor)};`;
    css += `border-right-color:${toRgbColor(computed.borderRightColor)};`;
    css += `border-bottom-color:${toRgbColor(computed.borderBottomColor)};`;
    css += `border-left-color:${toRgbColor(computed.borderLeftColor)};`;
    if (computed.fill && computed.fill !== "none") css += `fill:${toRgbColor(computed.fill)};`;
    if (computed.stroke && computed.stroke !== "none")
      css += `stroke:${toRgbColor(computed.stroke)};`;

    clone.setAttribute("style", css);
    clone.removeAttribute("class");
  });
}

function waitFrame() {
  return new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

/**
 * Capture a live DOM node (same structure/styles as on the page) into a multi-page PDF.
 * Inlines computed styles as RGB into a clean iframe so html2canvas never sees theme oklch/oklab.
 */
export async function downloadElementAsPdf(
  source: HTMLElement,
  { filename, widthPx = 794, backgroundColor = "#f7f1ea", marginPt = 16 }: DownloadHtmlPdfOptions,
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const previousWidth = source.style.width;
  const previousMaxWidth = source.style.maxWidth;
  source.style.width = `${widthPx}px`;
  source.style.maxWidth = `${widthPx}px`;

  const gridNodes = Array.from(
    source.querySelectorAll<HTMLElement>(".md\\:grid-cols-2, .sm\\:grid-cols-2"),
  );
  const previousGridStyles = gridNodes.map((node) => node.getAttribute("style"));
  gridNodes.forEach((node) => {
    node.style.display = "grid";
    node.style.gridTemplateColumns = "1fr 1fr";
  });

  await waitFrame();
  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("data-pdf-capture-frame", "true");
  iframe.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    `width:${widthPx}px`,
    "height:10px",
    "border:0",
    "opacity:0",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument;
  if (!iframeDoc) {
    iframe.remove();
    throw new Error("Could not create PDF capture frame");
  }

  iframeDoc.open();
  iframeDoc.write(
    `<!doctype html><html><head><meta charset="utf-8" /></head><body style="margin:0;background:${backgroundColor};"></body></html>`,
  );
  iframeDoc.close();

  const clone = source.cloneNode(true) as HTMLElement;
  inlineComputedStyles(source, clone);
  iframeDoc.body.appendChild(clone);
  iframe.style.height = `${Math.max(clone.scrollHeight, clone.offsetHeight) + 40}px`;
  await waitFrame();

  try {
    const canvas = await html2canvas(clone, {
      scale: 1.75,
      useCORS: true,
      allowTaint: true,
      backgroundColor,
      logging: false,
      width: widthPx,
      windowWidth: widthPx,
      scrollX: 0,
      scrollY: 0,
    });

    if (!canvas.width || !canvas.height) {
      throw new Error("Could not capture the confirmation card for PDF");
    }

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    paintCanvasAcrossPdfPages(pdf, canvas, marginPt, backgroundColor);
    pdf.save(filename);
  } finally {
    iframe.remove();
    source.style.width = previousWidth;
    source.style.maxWidth = previousMaxWidth;
    gridNodes.forEach((node, index) => {
      const prior = previousGridStyles[index];
      if (prior == null) node.removeAttribute("style");
      else node.setAttribute("style", prior);
    });
  }
}

function paintCanvasAcrossPdfPages(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  marginPt: number,
  backgroundColor: string,
) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginPt * 2;
  const usableHeight = pageHeight - marginPt * 2;
  const imgWidth = usableWidth;
  const pxPerPt = canvas.width / imgWidth;
  const sliceHeightPx = Math.max(1, Math.floor(usableHeight * pxPerPt));

  const pageCanvas = document.createElement("canvas");
  const pageCtx = pageCanvas.getContext("2d");
  if (!pageCtx) {
    throw new Error("Canvas is not available for PDF pagination");
  }

  let sourceY = 0;
  let pageIndex = 0;

  while (sourceY < canvas.height) {
    const currentSlicePx = Math.min(sliceHeightPx, canvas.height - sourceY);
    pageCanvas.width = canvas.width;
    pageCanvas.height = currentSlicePx;
    pageCtx.fillStyle = backgroundColor;
    pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    pageCtx.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      currentSlicePx,
      0,
      0,
      canvas.width,
      currentSlicePx,
    );

    const sliceHeightPt = currentSlicePx / pxPerPt;
    // JPEG keeps the visual page design while avoiding multi‑MB PNG payloads.
    const dataUrl = pageCanvas.toDataURL("image/jpeg", 0.92);
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(dataUrl, "JPEG", marginPt, marginPt, imgWidth, sliceHeightPt);

    sourceY += currentSlicePx;
    pageIndex += 1;
  }
}
