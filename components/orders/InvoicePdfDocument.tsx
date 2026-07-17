"use client";

import { forwardRef } from "react";
import type { Invoice } from "./InvoiceViewModal";

/**
 * Hidden print layout snapshotted by html2canvas-pro to build the PDF
 * (see lib/invoicePdf.ts). The browser text stack does the Khmer shaping,
 * so dish names render correctly with zero font shipping.
 *
 * Rules for this component:
 *  - Inline styles with hex colors ONLY — no CSS vars (dark mode must not
 *    leak into the document) and no Tailwind color classes.
 *  - Fixed 794px width = A4 at 96dpi; the capture scales it up 2×.
 */
export const InvoicePdfDocument = forwardRef<HTMLDivElement, { invoice: Invoice }>(
  function InvoicePdfDocument({ invoice }, ref) {
    const gray = "#6B7280";
    const line = "#E5E7EB";
    const ink = "#1A1714";
    const brand = "#2D6A4F";
    const brandBg = "#E8F5EE";

    return (
      <div
        ref={ref}
        aria-hidden
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          width: "794px",
          background: "#FFFFFF",
          color: ink,
          padding: "48px 56px",
          fontSize: "14px",
          lineHeight: 1.5,
          fontFamily:
            "'Noto Sans Khmer','Khmer OS',system-ui,-apple-system,'Segoe UI',sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: "22px", fontWeight: 700 }}>🧾 Order Invoice</div>
            <div style={{ fontSize: "13px", color: gray, marginTop: "2px" }}>
              {invoice.chat_title || "Group Chat"} · Order #{invoice.order_id.slice(-6)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "15px", fontWeight: 700 }}>{invoice.order_date}</div>
            <div style={{ fontSize: "12px", color: gray, marginTop: "2px" }}>
              Sent ×{invoice.sent_count}
            </div>
          </div>
        </div>

        <div style={{ borderTop: `2px solid ${ink}`, margin: "16px 0" }} />

        {/* Per-person breakdown — bordered like the modal's divide-y list */}
        {invoice.details.map((d, i) => (
          <div
            key={i}
            style={{
              padding: "10px 0",
              borderTop: i > 0 ? `1px solid ${line}` : "none",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "4px" }}>
              ▪️ {d.user_name}
            </div>
            {(d.items ?? []).map((it, j) => (
              <div
                key={j}
                style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "2px 0 2px 16px" }}
              >
                <span style={{ flex: 1 }}>• {it.item_name} ×{it.qty}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  ${(it.cost ?? 0).toFixed(2)}
                </span>
              </div>
            ))}
            {(d.items ?? []).length > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "4px 0 0 16px",
                  marginTop: "4px",
                  borderTop: `1px solid ${line}`,
                  fontWeight: 600,
                }}
              >
                <span>Subtotal</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  ${(d.subtotal ?? 0).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        ))}

        {/* Total band */}
        <div
          style={{
            background: brandBg,
            borderRadius: "8px",
            padding: "14px 18px",
            marginTop: "8px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: brand,
              fontWeight: 700,
              fontSize: "18px",
            }}
          >
            <span>💰 Total Due</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              ${(invoice.total ?? 0).toFixed(2)}
            </span>
          </div>
          <div style={{ color: brand, fontSize: "13px", marginTop: "4px" }}>
            💳 Pay to <b>{invoice.payer_name || "—"}</b>
          </div>
        </div>

        {/* Payer QR */}
        {invoice.payer_qr_image && (
          <div style={{ textAlign: "center", marginTop: "22px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={invoice.payer_qr_image}
              alt=""
              style={{ width: "230px", display: "inline-block" }}
            />
            <div style={{ fontSize: "12px", color: gray, marginTop: "6px" }}>
              📱 Scan KHQR to pay {invoice.payer_name || "the payer"}
            </div>
          </div>
        )}

        <div style={{ borderTop: `1px solid ${line}`, margin: "24px 0 10px" }} />
        <div style={{ fontSize: "11px", color: gray, textAlign: "center" }}>
          Generated {new Date().toISOString().slice(0, 10)} · Food Bot
        </div>
      </div>
    );
  }
);
