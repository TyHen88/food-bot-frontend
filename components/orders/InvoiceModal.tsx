"use client";

import { useState, useMemo, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { Send, CheckSquare, Square, Landmark } from "lucide-react";
import { type Order } from "./OrderItemsEditor";

interface InvoiceModalProps {
  open: boolean;
  onClose: () => void;
  order: Order;
  onInvoiceSent?: () => void;
}

interface UniqueItem {
  item_name: string;
  qty: number;
}

/** National Bank of Cambodia official rate, as served by /api/exchange-rate. */
interface ExchangeRate {
  available: boolean;
  rate_date: string | null;
  usd_khr: number | null;
  display: string | null;      // e.g. "4,047 KHR / USD"
  khr_rounding: number;
  stale?: boolean;
  today?: string;
}

export function InvoiceModal({ open, onClose, order, onInvoiceSent }: InvoiceModalProps) {
  const { toast } = useToast();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState("");
  const [sending, setSending] = useState(false);
  const [rate, setRate] = useState<ExchangeRate | null>(null);
  /** Currency the admin TYPES prices in. Amounts are always sent to the
   *  backend in USD — riel input is converted here, so one stored price
   *  means the same thing however it was keyed. */
  const [inputCurrency, setInputCurrency] = useState<"USD" | "KHR">("USD");
  /** Currencies the SENT invoice shows. Dollars only by default; both may
   *  be ticked, but never neither. */
  const [sendUsd, setSendUsd] = useState(true);
  const [sendKhr, setSendKhr] = useState(false);

  // The rate in force on the ORDER's date — invoicing last Friday's lunch
  // today must quote Friday's rate, which is what the backend will pin.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .get<ExchangeRate>(`/exchange-rate?order_date=${encodeURIComponent(order.order_date)}`)
      .then(data => {
        if (!cancelled) setRate(data);
      })
      .catch(() => {
        // Never block invoicing on the rate: the invoice still sends, just
        // in dollars only.
        if (!cancelled) setRate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, order.order_date]);

  // Riel, rounded the same way the backend rounds it (nearest 100៛), so the
  // preview matches the invoice the group receives.
  const toKhr = (usd: number): number | null => {
    if (!rate?.usd_khr) return null;
    const step = rate.khr_rounding || 1;
    const exact = usd * rate.usd_khr;
    return step > 1 ? Math.round(exact / step) * step : Math.round(exact);
  };

  const formatKhr = (usd: number): string | null => {
    const khr = toKhr(usd);
    return khr === null ? null : `${khr.toLocaleString("en-US")}៛`;
  };

  // Riel can't be typed or sent without a rate to convert with.
  const rateReady = Boolean(rate?.available && rate.usd_khr);

  // A typed price → the USD unit price the backend stores.
  const priceToUsd = (raw: string): number => {
    const value = parseFloat(raw || "0");
    if (isNaN(value)) return 0;
    if (inputCurrency === "KHR" && rate?.usd_khr) {
      return Math.round((value / rate.usd_khr) * 100) / 100;
    }
    return value;
  };

  // Falling back to USD input if the rate disappears keeps the typed numbers
  // meaningful — riel figures with no rate would be uninterpretable.
  useEffect(() => {
    if (!rateReady) {
      setInputCurrency("USD");
      setSendKhr(false);
    }
  }, [rateReady]);

  // Group items by name and sum quantities. Names are cleaned of leading
  // list markers ("- dish" → "dish") so prefix variants price as one item;
  // the backend applies the same cleaning when matching prices.
  const uniqueItems = useMemo<UniqueItem[]>(() => {
    const map: Record<string, number> = {};
    (order.items ?? []).forEach(it => {
      const name = (it.item_name || "Unknown").replace(/^[\s\-•*·]+/, "").trim() || "Unknown";
      map[name] = (map[name] || 0) + (it.qty ?? 1);
    });
    return Object.entries(map).map(([item_name, qty]) => ({ item_name, qty }));
  }, [order.items]);

  // Total invoice cost, in USD — the typed prices are converted first when
  // the admin is entering riel, so this always means the same thing.
  const totalCost = useMemo(() => {
    return uniqueItems.reduce(
      (sum, item) => sum + priceToUsd(prices[item.item_name] || "0") * item.qty,
      0
    );
    // priceToUsd depends on the input currency and the fetched rate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueItems, prices, inputCurrency, rate?.usd_khr]);

  const toggleSelect = (itemName: string) => {
    const next = new Set(selectedItems);
    if (next.has(itemName)) {
      next.delete(itemName);
    } else {
      next.add(itemName);
    }
    setSelectedItems(next);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === uniqueItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(uniqueItems.map(i => i.item_name)));
    }
  };

  const handleApplyBulkPrice = () => {
    if (!bulkPrice || isNaN(parseFloat(bulkPrice))) {
      toast("Please enter a valid price to apply", "info");
      return;
    }
    if (selectedItems.size === 0) {
      toast("Please select items to apply bulk pricing", "info");
      return;
    }

    const nextPrices = { ...prices };
    selectedItems.forEach(name => {
      nextPrices[name] = bulkPrice;
    });
    setPrices(nextPrices);
    setBulkPrice("");
    const unit = inputCurrency === "KHR" ? `${bulkPrice}៛` : `$${bulkPrice}`;
    toast(`Applied price of ${unit} to ${selectedItems.size} item(s)`, "success");
  };

  const handleSendInvoice = async () => {
    // An all-$0.00 invoice is always a missed input, never intended.
    if (totalCost <= 0) {
      toast("Enter the item prices before sending the invoice", "error");
      return;
    }
    // An invoice showing neither currency would have no amounts at all.
    if (!sendUsd && !sendKhr) {
      toast("Pick at least one currency to send the invoice in", "error");
      return;
    }
    setSending(true);
    try {
      const payload = {
        // Always USD: riel input is converted here so the stored price and
        // every total derived from it have one unambiguous unit.
        prices: uniqueItems.map(item => ({
          item_name: item.item_name,
          price: priceToUsd(prices[item.item_name] || "0"),
        })),
        currencies: [...(sendUsd ? ["USD"] : []), ...(sendKhr ? ["KHR"] : [])],
      };

      const result = await api.post<{ unpriced_items?: string[] }>(
        `/orders/${order.order_id}/invoice`,
        payload,
      );
      // Dishes whose name didn't match any price were billed at $0.00 — the
      // invoice is already sent, but the total is too low and every later
      // figure built on it (the Invoices page, the AI assistant) will be too.
      if (result?.unpriced_items?.length) {
        toast(
          `Invoice sent, but ${result.unpriced_items.length} item(s) had no price and were billed at $0.00: ${result.unpriced_items.join(", ")}`,
          "error",
        );
      } else {
        toast("Invoice shared successfully with Telegram group!", "success");
      }
      if (onInvoiceSent) onInvoiceSent();
      onClose();
    } catch (e: unknown) {
      toast((e as Error).message || "Failed to send invoice", "error");
    } finally {
      setSending(false);
    }
  };

  const allSelected = uniqueItems.length > 0 && selectedItems.size === uniqueItems.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate & Share Invoice"
      maxWidth="540px"
      footer={
        <div className="flex justify-between items-center w-full">
          {/* Previews the total exactly as the sent invoice will show it —
              riel-only sends lead with riel, so what is checked is what is
              seen before anything reaches the group. */}
          <div className="text-left">
            <span className="text-xs block text-[var(--text-muted)] font-medium">Estimated Total</span>
            <span className="text-lg font-bold text-[var(--color-primary)]">
              {!sendUsd && sendKhr ? formatKhr(totalCost) : `$${totalCost.toFixed(2)}`}
            </span>
            {sendUsd && sendKhr && formatKhr(totalCost) && (
              <span className="text-xs block text-[var(--text-muted)]">≈ {formatKhr(totalCost)}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button
              onClick={handleSendInvoice}
              loading={sending}
              disabled={uniqueItems.length === 0 || (!sendUsd && !sendKhr)}
            >
              <Send size={14} className="mr-1" /> Send Invoice
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-[var(--text-muted)]">
          Input prices for the ordered items. You can set them individually, or check multiple items to bulk-apply a price.
        </p>

        {/* Exchange rate pinned to this invoice. Shown before pricing so the
            admin sees which rate the riel amounts will use — the backend
            stores it on the invoice, so it never changes afterwards. */}
        {rate?.available ? (
          <div className="p-3 rounded-[var(--radius-md)] flex items-start gap-2.5 bg-[var(--surface-2)]">
            <Landmark size={16} className="text-[var(--color-primary)] mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[var(--text)]">
                {rate.display}
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                National Bank of Cambodia · published {rate.rate_date}
                {rate.khr_rounding > 1 && ` · riel rounded to ${rate.khr_rounding}៛`}
              </div>
              {rate.stale && (
                <div className="text-[10px] mt-1 text-[var(--color-danger,#dc2626)]">
                  ⚠ This rate hasn&apos;t refreshed in a while — check the daily
                  fetch before relying on the riel amounts.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-[var(--radius-md)] text-[10px] bg-[var(--surface-2)] text-[var(--text-muted)]">
            No exchange rate available — this invoice will show US dollars only.
          </div>
        )}

        {/* Input currency — what the admin types. Prices are converted to USD
            before sending, so switching this never changes what is stored. */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-[var(--text-2)]">Enter prices in</span>
          <div className="inline-flex rounded-[var(--radius-md)] border border-[var(--border)] overflow-hidden">
            {(["USD", "KHR"] as const).map(code => {
              const active = inputCurrency === code;
              const disabled = code === "KHR" && !rateReady;
              return (
                <button
                  key={code}
                  type="button"
                  disabled={disabled}
                  onClick={() => setInputCurrency(code)}
                  title={disabled ? "No exchange rate available yet" : undefined}
                  className={`px-3 py-1 text-xs font-semibold transition-colors ${
                    disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                  } ${
                    active
                      ? "bg-[var(--color-primary)] text-white"
                      : "bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  {code === "USD" ? "$ Dollar" : "៛ Riel"}
                </button>
              );
            })}
          </div>
          {inputCurrency === "KHR" && rate?.usd_khr && (
            <span className="text-[10px] text-[var(--text-muted)]">
              converted to USD at {rate.display}
            </span>
          )}
        </div>

        {/* Send options — which currencies the sent invoice shows. */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs font-semibold text-[var(--text-2)]">Send invoice in</span>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendUsd}
              onChange={e => setSendUsd(e.target.checked)}
              className="accent-[var(--color-primary)]"
            />
            <span className="text-xs text-[var(--text-2)]">$ Dollar</span>
          </label>
          <label
            className={`flex items-center gap-1.5 select-none ${
              rateReady ? "cursor-pointer" : "opacity-40 cursor-not-allowed"
            }`}
            title={rateReady ? undefined : "No exchange rate available yet"}
          >
            <input
              type="checkbox"
              checked={sendKhr}
              disabled={!rateReady}
              onChange={e => setSendKhr(e.target.checked)}
              className="accent-[var(--color-primary)]"
            />
            <span className="text-xs text-[var(--text-2)]">៛ Riel</span>
          </label>
          {!sendUsd && !sendKhr && (
            <span className="text-[10px] text-[var(--color-danger,#dc2626)]">
              Pick at least one
            </span>
          )}
        </div>

        {/* Bulk tools */}
        {uniqueItems.length > 0 && (
          <div className="p-3 rounded-[var(--radius-md)] flex flex-wrap items-center gap-3 bg-[var(--surface-2)]">
            <div className="flex items-center gap-1.5 cursor-pointer select-none" onClick={toggleSelectAll}>
              {allSelected ? (
                <CheckSquare size={16} className="text-[var(--color-primary)]" />
              ) : (
                <Square size={16} className="text-[var(--text-muted)]" />
              )}
              <span className="text-xs font-semibold text-[var(--text-2)]">Select All</span>
            </div>
            
            <div className="h-4 w-px bg-[var(--border)] hidden sm:block" />

            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <input
                type="number"
                step={inputCurrency === "KHR" ? "100" : "0.01"}
                placeholder={inputCurrency === "KHR" ? "Bulk Price (៛)" : "Bulk Price ($)"}
                className="flex-1 min-w-0 px-2 py-1 text-xs rounded border focus:outline-none focus:ring-1 bg-[var(--surface)] text-[var(--text)] border-[var(--border)]"
                value={bulkPrice}
                onChange={e => setBulkPrice(e.target.value)}
              />
              <Button size="sm" variant="secondary" onClick={handleApplyBulkPrice}>
                Apply to ({selectedItems.size})
              </Button>
            </div>
          </div>
        )}

        {/* Item Rows */}
        <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden">
          {uniqueItems.length === 0 ? (
            <div className="p-4 text-center text-xs text-[var(--text-muted)] italic">
              No items in this order
            </div>
          ) : (
            uniqueItems.map(item => {
              const isSelected = selectedItems.has(item.item_name);
              // Typed price → USD, then the line total in both currencies so
              // the admin sees exactly what the group will receive.
              const lineCost = priceToUsd(prices[item.item_name] || "0") * item.qty;
              const lineKhr = lineCost > 0 ? formatKhr(lineCost) : null;
              return (
                <div key={item.item_name} className="flex items-center gap-3 px-3 py-2 bg-[var(--surface)] hover:bg-[var(--surface-2)]/50">
                  <div className="cursor-pointer flex-shrink-0" onClick={() => toggleSelect(item.item_name)}>
                    {isSelected ? (
                      <CheckSquare size={16} className="text-[var(--color-primary)]" />
                    ) : (
                      <Square size={16} className="text-[var(--text-muted)]" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs text-[var(--text)] truncate">{item.item_name}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">
                      Qty: {item.qty}
                      {lineCost > 0 && ` · $${lineCost.toFixed(2)}`}
                      {lineKhr && ` ≈ ${lineKhr}`}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-28">
                    <span className="text-xs text-[var(--text-muted)]">
                      {inputCurrency === "KHR" ? "៛" : "$"}
                    </span>
                    <input
                      type="number"
                      step={inputCurrency === "KHR" ? "100" : "0.01"}
                      placeholder={inputCurrency === "KHR" ? "0" : "0.00"}
                      className="w-full px-2 py-1 text-xs rounded border focus:outline-none focus:ring-1 bg-[var(--surface)] text-[var(--text)] border-[var(--border)] text-right"
                      value={prices[item.item_name] || ""}
                      onChange={e => {
                        setPrices({
                          ...prices,
                          [item.item_name]: e.target.value,
                        });
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
