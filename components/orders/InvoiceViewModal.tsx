"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { downloadInvoicePdf } from "@/lib/invoicePdf";
import { Download, Send, Check, RotateCcw, Loader2 } from "lucide-react";
import { InvoicePdfDocument } from "./InvoicePdfDocument";

import { 
  fetchInvoiceWithCache, 
  setInvoiceInCache, 
  invalidateInvoiceCache, 
  type Invoice, 
  type InvoiceDetailEntry, 
  type InvoiceItem 
} from "@/lib/invoiceCache";

export type { Invoice, InvoiceDetailEntry, InvoiceItem };

/** Read-only invoice breakdown — any role can view; admins can re-send the
 * Telegram message. Uses client-side cache for instant display on click. */
export function InvoiceViewModal({
  invoiceId,
  open,
  onClose,
  isAdmin,
  onResent,
}: {
  invoiceId: string | null;
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onResent?: () => void;
}) {
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [updatingPersonIndex, setUpdatingPersonIndex] = useState<number | null>(null);
  const [confirmPerson, setConfirmPerson] = useState<{
    index: number;
    detail: InvoiceDetailEntry;
  } | null>(null);
  const pdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !invoiceId) { setInvoice(null); return; }
    let cancelled = false;
    setLoading(true);
    fetchInvoiceWithCache(invoiceId)
      .then(inv => { if (!cancelled) setInvoice(inv); })
      .catch((e: unknown) => { if (!cancelled) toast((e as Error).message, "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, invoiceId, toast]);

  async function togglePersonPaid(index: number, d: InvoiceDetailEntry) {
    if (!invoice) return;
    setUpdatingPersonIndex(index);
    const newPaid = !d.paid;
    try {
      await api.post(`/invoices/${invoice.invoice_id}/mark-paid`, {
        user_id: d.user_id || "",
        user_name: d.user_name,
        paid: newPaid,
      });
      const updatedInvoice: Invoice = {
        ...invoice,
        details: invoice.details.map((item, i) =>
          i === index ? { ...item, paid: newPaid, paid_amount: newPaid ? item.subtotal : 0 } : item
        ),
      };
      setInvoice(updatedInvoice);
      setInvoiceInCache(updatedInvoice);
      toast(newPaid ? `Marked ${d.user_name} as Paid` : `Unmarked ${d.user_name}`, "success");
      onResent?.();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setUpdatingPersonIndex(null);
    }
  }

  async function resend() {
    if (!invoice) return;
    setResending(true);
    try {
      const res = await api.post<{ sent_count: number }>(`/invoices/${invoice.invoice_id}/resend`, {});
      const updatedInvoice: Invoice = { ...invoice, sent_count: res?.sent_count ?? invoice.sent_count + 1 };
      setInvoice(updatedInvoice);
      setInvoiceInCache(updatedInvoice);
      toast("Invoice re-sent to the group", "success");
      onResent?.();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setResending(false);
    }
  }

  async function downloadPdf() {
    if (!invoice || !pdfRef.current) return;
    setDownloading(true);
    try {
      // Let images (QR data URI) and fonts settle before the snapshot.
      await document.fonts?.ready;
      await downloadInvoicePdf(
        pdfRef.current,
        `invoice_${invoice.order_date}_${invoice.order_id.slice(-6)}.pdf`,
      );
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invoice Breakdown"
      maxWidth="480px"
      footer={
        <>
          {isAdmin && (
            <Button
              variant="secondary"
              size="sm"
              loading={resending}
              onClick={resend}
              className="gap-1.5"
            >
              <Send size={14} /> Re-send
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            loading={downloading}
            disabled={!invoice}
            onClick={downloadPdf}
            className="gap-1.5"
          >
            <Download size={14} /> Download PDF
          </Button>
          <Button size="sm" onClick={onClose}>Close</Button>
        </>
      }
    >
      {loading || !invoice ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>
                {invoice.chat_title || `Order ${invoice.order_id.slice(-6)}`}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{invoice.order_date}</p>
            </div>
            <Badge variant="default" className="text-[10px]">
              Sent ×{invoice.sent_count}
            </Badge>
          </div>

          {/* Per-person breakdown */}
          <div className="divide-y rounded-[var(--radius-md)] border overflow-hidden"
            style={{ borderColor: "var(--border)" }}>
            {invoice.details.map((d, i) => (
              <div key={i} className="px-3 py-2" style={{ background: "var(--surface)" }}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-bold" style={{ color: "var(--text)" }}>
                    ▪️ {d.user_name}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {d.paid ? (
                      <Badge variant="success" className="text-[10px] py-0 px-1.5">✓ Paid</Badge>
                    ) : (
                      <Badge variant="danger" className="text-[10px] py-0 px-1.5">Unpaid</Badge>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        disabled={updatingPersonIndex === i}
                        onClick={() => setConfirmPerson({ index: i, detail: d })}
                        className={`px-1.5 py-0.5 text-[9px] font-bold rounded flex items-center gap-1 cursor-pointer transition-all ${
                          d.paid
                            ? "bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-[var(--border)]"
                            : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                        }`}
                        title={d.paid ? "Unmark as paid" : "Mark as paid"}
                      >
                        {updatingPersonIndex === i ? (
                          <Loader2 size={9} className="animate-spin" />
                        ) : d.paid ? (
                          <>
                            <RotateCcw size={9} /> Unmark
                          </>
                        ) : (
                          <>
                            <Check size={9} /> Mark Paid
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                {(d.items ?? []).map((it, j) => (
                  <div key={j} className="flex items-center justify-between gap-2 text-xs py-0.5">
                    <span className="truncate flex-1" style={{ color: "var(--text-2)" }}>
                      • {it.item_name} ×{it.qty}
                    </span>
                    <span className="font-mono shrink-0" style={{ color: "var(--text)" }}>
                      ${(it.cost ?? 0).toFixed(2)}
                    </span>
                  </div>
                ))}
                {(d.items ?? []).length > 1 && (
                  <div className="flex items-center justify-between text-xs pt-1 font-semibold"
                    style={{ color: "var(--text)" }}>
                    <span>Subtotal</span>
                    <span className="font-mono">${(d.subtotal ?? 0).toFixed(2)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Total block */}
          <div className="rounded-[var(--radius-md)] px-3 py-2 space-y-1"
            style={{ background: "var(--color-primary-light)" }}>
            <div className="flex items-center justify-between text-sm font-bold"
              style={{ color: "var(--color-primary)" }}>
              <span>💰 Total Due</span>
              <span className="font-mono">${(invoice.total ?? 0).toFixed(2)}</span>
            </div>
            <p className="text-xs" style={{ color: "var(--color-primary)" }}>
              💳 Pay to <span className="font-semibold">{invoice.payer_name || "—"}</span>
            </p>
          </div>

          {/* Payment QR / KHQR block if available */}
          {(invoice.payer_qr_image || invoice.payer_khqr_text) && (
            <div className="p-3 rounded-[var(--radius-md)] border flex items-center justify-between gap-3"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-3">
                {invoice.payer_qr_image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={invoice.payer_qr_image}
                    alt="ABA QR"
                    className="w-12 h-12 rounded-[var(--radius-sm)] border bg-white object-contain"
                    style={{ borderColor: "var(--border)" }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-[var(--radius-sm)] border flex items-center justify-center text-xs font-bold"
                    style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
                    KHQR
                  </div>
                )}
                <div>
                  <p className="text-xs font-bold" style={{ color: "var(--text)" }}>
                    Scan to Pay ({invoice.payer_name})
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Use ABA or any Bakong-enabled app
                  </p>
                </div>
              </div>
              {invoice.payer_khqr_text && (
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(invoice.payer_khqr_text!).then(
                      () => toast("KHQR code copied", "success"),
                      () => toast("Copy failed", "error"),
                    )
                  }
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-[var(--radius-sm)] border cursor-pointer hover:bg-[var(--surface-2)]"
                  style={{ background: "transparent", color: "var(--text-2)", borderColor: "var(--border)" }}
                >
                  Copy
                </button>
              )}
            </div>
          )}

          {/* Off-screen print layout captured by the PDF download. */}
          <InvoicePdfDocument ref={pdfRef} invoice={invoice} />
        </div>
      )}

      {/* Confirmation: Person Payment Status Toggle */}
      <ConfirmDialog
        open={!!confirmPerson}
        onClose={() => setConfirmPerson(null)}
        onConfirm={() => {
          if (confirmPerson) {
            const { index, detail } = confirmPerson;
            setConfirmPerson(null);
            togglePersonPaid(index, detail);
          }
        }}
        title={confirmPerson?.detail.paid ? "Confirm Unmark Payment" : "Confirm Mark as Paid"}
        variant={confirmPerson?.detail.paid ? "danger" : "success"}
        confirmText={confirmPerson?.detail.paid ? "Yes, Unmark" : "Yes, Mark Paid"}
        message={
          <div>
            <p className="font-semibold text-[var(--text)]">
              {confirmPerson?.detail.paid ? (
                <>
                  Unmark <span className="font-bold">{confirmPerson.detail.user_name}</span> as unpaid for this invoice?
                </>
              ) : (
                <>
                  Mark <span className="font-bold">{confirmPerson?.detail.user_name}</span> as <span className="text-emerald-600 dark:text-emerald-400 font-bold">PAID</span>?
                </>
              )}
            </p>
            {confirmPerson && (
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Amount: <strong className="text-[var(--text)]">${(confirmPerson.detail.subtotal ?? 0).toFixed(2)}</strong>.
              </p>
            )}
          </div>
        }
      />
    </Modal>
  );
}
