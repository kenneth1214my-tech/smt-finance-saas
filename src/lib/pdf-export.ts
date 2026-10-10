"use client";

// One-click PDF of the page the user is looking at, laid out on A4 PORTRAIT.
//
// How: the page is loaded again in a hidden iframe exactly 794 CSS px wide (A4 at 96 dpi), so the
// responsive layout resolves to a portrait-width layout instead of the desktop one. The sidebar,
// top bar and footer are hidden, a report header is inserted, and each top-level block (a KPI row,
// a card, ...) is captured with the browser's own renderer — so Chinese text, SVG charts and
// colours match the screen. Blocks are then packed onto A4 pages WITHOUT being split across a page
// break (a block taller than one page is sliced as a last resort) and written with jsPDF.

const A4_W_MM = 210;
const A4_H_MM = 297;
const MARGIN_X_MM = 10;
const MARGIN_TOP_MM = 12;
const MARGIN_BOTTOM_MM = 14; // room for the page footer
const BLOCK_GAP_MM = 3;
const IFRAME_WIDTH_PX = 794;
const PIXEL_RATIO = 2.5;

export interface PdfOptions {
  filename: string;
  companyName: string;
  title: string;
  subtitle?: string;
  isZh: boolean;
  /** Append a Prepared by / Approved by sign-off block, anchored to the bottom of the last page. */
  signOff?: boolean;
}

export type PdfBlock = { heightMm: number };

// Pure layout step (unit-testable): assigns each block to a page, in order, never splitting a block
// that fits on one page. Returns, per block, the page index, the y offset on that page (mm) and —
// for a block taller than a page — how many full-page slices it needs.
export function layoutBlocks(blocks: PdfBlock[], pageContentMm: number, gapMm: number): { page: number; yMm: number; slices: number }[] {
  const out: { page: number; yMm: number; slices: number }[] = [];
  let page = 0;
  let y = 0;
  for (const b of blocks) {
    if (b.heightMm > pageContentMm) {
      if (y > 0) {
        page += 1;
        y = 0;
      }
      const slices = Math.ceil(b.heightMm / pageContentMm);
      out.push({ page, yMm: 0, slices });
      page += slices - 1;
      y = b.heightMm - (slices - 1) * pageContentMm + gapMm;
      continue;
    }
    if (y > 0 && y + b.heightMm > pageContentMm) {
      page += 1;
      y = 0;
    }
    out.push({ page, yMm: y, slices: 1 });
    y += b.heightMm + gapMm;
  }
  return out;
}

function waitForIframe(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    iframe.onload = () => resolve();
    iframe.onerror = () => reject(new Error("Could not load the page for PDF export"));
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function downloadPagePdf(opts: PdfOptions): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = `position:fixed;left:-20000px;top:0;width:${IFRAME_WIDTH_PX}px;height:1400px;border:0;visibility:hidden;`;
  iframe.src = window.location.pathname + window.location.search;
  document.body.appendChild(iframe);

  try {
    await waitForIframe(iframe);
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) throw new Error("PDF export frame unavailable");

    // html-to-image (vendored in /public/vendor, UMD build) must run inside the iframe's own window:
    // used from this window on the iframe's elements it hangs (cross-document styles/fonts).
    await new Promise<void>((resolve, reject) => {
      const script = doc.createElement("script");
      script.src = "/vendor/html-to-image.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load the PDF renderer"));
      doc.head.appendChild(script);
    });
    // Browsers pause requestAnimationFrame in a background tab, and html-to-image awaits it — so if
    // the user switched tabs while the PDF was building it would hang forever. Run it on a timer.
    win.requestAnimationFrame = (cb: FrameRequestCallback) => win.setTimeout(() => cb(win.performance.now()), 0);
    const toCanvas = (win as unknown as { htmlToImage: { toCanvas: (n: HTMLElement, o?: object) => Promise<HTMLCanvasElement> } }).htmlToImage.toCanvas;
    doc.documentElement.setAttribute("data-theme", "light");
    const style = doc.createElement("style");
    style.textContent = `
      :root{color-scheme:light}
      html,body{background:#fff !important}
      aside, footer, [data-pdf-hide], div.sticky{display:none !important}
      main{display:block !important}
      *{animation:none !important;transition:none !important}
    `;
    doc.head.appendChild(style);
    if (doc.fonts?.ready) await doc.fonts.ready;
    await sleep(700); // client components/charts finish rendering

    const container = doc.querySelector<HTMLElement>("main > div.mx-auto");
    if (!container) throw new Error("Nothing to export on this page");

    const header = doc.createElement("div");
    header.style.cssText = "padding-bottom:10px;border-bottom:2px solid #1f6f54;margin-bottom:2px;font-family:inherit;";
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    header.innerHTML = `
      <div style="font-size:11px;color:#6b7280;letter-spacing:.02em">${esc(opts.companyName)}</div>
      <div style="font-size:24px;font-weight:700;color:#111827;margin-top:2px">${esc(opts.title)}</div>
      ${opts.subtitle ? `<div style="font-size:11.5px;color:#6b7280;margin-top:3px">${esc(opts.subtitle)}</div>` : ""}`;
    container.insertBefore(header, container.firstChild);
    container.style.paddingTop = "16px";
    await sleep(50);

    // Not `instanceof HTMLElement` — these elements belong to the iframe's window, so that check fails.
    let signOffEl: HTMLElement | null = null;
    if (opts.signOff) {
      const L = opts.isZh
        ? { prepared: "编制人：", approved: "审批人：", name: "姓名：", title: "职务：", date: "日期：" }
        : { prepared: "Prepared by:", approved: "Approved by:", name: "Name:", title: "Title:", date: "Date:" };
      const column = (heading: string) => `
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:#111827">${esc(heading)}</div>
          <div style="height:58px"></div>
          <div style="border-top:1.5px solid #111827;margin-bottom:12px"></div>
          ${[L.name, L.title, L.date].map((l) => `<div style="font-size:12.5px;color:#374151;padding:7px 0 4px;border-bottom:1px solid #d1d5db">${esc(l)}</div>`).join("")}
        </div>`;
      signOffEl = doc.createElement("div");
      signOffEl.style.cssText = "display:flex;gap:56px;padding:18px 0 6px;font-family:inherit;";
      signOffEl.innerHTML = column(L.prepared) + column(L.approved);
      container.appendChild(signOffEl);
      await sleep(30);
    }

    const blocks = (Array.from(container.children) as HTMLElement[]).filter((el) => el.offsetHeight > 0);
    if (blocks.length === 0) throw new Error("Nothing to export on this page");

    const widthPx = blocks[0].getBoundingClientRect().width;
    const contentWidthMm = A4_W_MM - 2 * MARGIN_X_MM;
    const mmPerPx = contentWidthMm / widthPx;
    const pageContentMm = A4_H_MM - MARGIN_TOP_MM - MARGIN_BOTTOM_MM;

    const canvases: HTMLCanvasElement[] = [];
    for (const block of blocks) {
      canvases.push(await toCanvas(block, { pixelRatio: PIXEL_RATIO, backgroundColor: "#ffffff", width: Math.ceil(widthPx), cacheBust: false }));
    }
    const heightsMm = canvases.map((c) => (c.height / PIXEL_RATIO) * mmPerPx);
    const placement = layoutBlocks(heightsMm.map((h) => ({ heightMm: h })), pageContentMm, BLOCK_GAP_MM);
    if (signOffEl) {
      // Last block: it already got its own page if it did not fit, so pinning it to the bottom of
      // that page can only move it further from the content above, never onto it.
      const i = blocks.indexOf(signOffEl);
      if (i >= 0 && placement[i].slices === 1) placement[i].yMm = pageContentMm - heightsMm[i];
    }

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    let pagesUsed = 1;
    const ensurePage = (p: number) => {
      while (pagesUsed <= p) {
        pdf.addPage("a4", "portrait");
        pagesUsed += 1;
      }
      pdf.setPage(p + 1);
    };

    canvases.forEach((canvas, i) => {
      const pl = placement[i];
      if (pl.slices === 1) {
        ensurePage(pl.page);
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.93), "JPEG", MARGIN_X_MM, MARGIN_TOP_MM + pl.yMm, contentWidthMm, heightsMm[i], undefined, "FAST");
        return;
      }
      // Taller than a page: slice it into page-height strips.
      const slicePx = Math.floor((pageContentMm / mmPerPx) * PIXEL_RATIO);
      for (let s = 0; s < pl.slices; s++) {
        const sy = s * slicePx;
        const sh = Math.min(slicePx, canvas.height - sy);
        const part = document.createElement("canvas");
        part.width = canvas.width;
        part.height = sh;
        part.getContext("2d")!.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
        ensurePage(pl.page + s);
        pdf.addImage(part.toDataURL("image/jpeg", 0.93), "JPEG", MARGIN_X_MM, MARGIN_TOP_MM, contentWidthMm, (sh / PIXEL_RATIO) * mmPerPx, undefined, "FAST");
      }
    });

    // Footer on every page — ASCII only (jsPDF's built-in fonts have no CJK glyphs; the company name
    // already appears in the rasterised header).
    const total = pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      pdf.setPage(p);
      pdf.setFontSize(8);
      pdf.setTextColor(120);
      pdf.text("© smt-finance. All rights reserved", A4_W_MM / 2, A4_H_MM - 7, { align: "center" });
      pdf.text(`Page ${p} / ${total}`, A4_W_MM - MARGIN_X_MM, A4_H_MM - 7, { align: "right" });
    }

    const out = opts.filename.endsWith(".pdf") ? opts.filename : `${opts.filename}.pdf`;
    pdf.save(out);
  } finally {
    iframe.remove();
  }
}
