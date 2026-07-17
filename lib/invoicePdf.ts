/**
 * Client-side invoice PDF: snapshot the hidden InvoicePdfDocument DOM with
 * html2canvas-pro (handles Tailwind 4's oklch colors; the browser does the
 * Khmer text shaping) and lay the image onto A4 pages with jsPDF.
 */

import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

const A4_W = 210; // mm
const A4_H = 297; // mm

export async function downloadInvoicePdf(el: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#FFFFFF",
    logging: false,
  });

  const img = canvas.toDataURL("image/jpeg", 0.95);
  const imgH = (canvas.height * A4_W) / canvas.width;

  const pdf = new jsPDF("p", "mm", "a4");
  let position = 0;
  let heightLeft = imgH;
  pdf.addImage(img, "JPEG", 0, position, A4_W, imgH);
  heightLeft -= A4_H;
  while (heightLeft > 0) {
    position -= A4_H;
    pdf.addPage();
    pdf.addImage(img, "JPEG", 0, position, A4_W, imgH);
    heightLeft -= A4_H;
  }

  try {
    pdf.save(filename);
  } catch {
    // Some webviews block programmatic downloads — open the PDF instead so
    // the user can save it from the viewer / share sheet.
    window.open(pdf.output("bloburl"), "_blank");
  }
}
