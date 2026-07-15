"use client";

import { useState, useMemo } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { Send, CheckSquare, Square } from "lucide-react";
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

export function InvoiceModal({ open, onClose, order, onInvoiceSent }: InvoiceModalProps) {
  const { toast } = useToast();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState("");
  const [sending, setSending] = useState(false);

  // Group items by name and sum quantities
  const uniqueItems = useMemo<UniqueItem[]>(() => {
    const map: Record<string, number> = {};
    (order.items ?? []).forEach(it => {
      const name = it.item_name || "Unknown";
      map[name] = (map[name] || 0) + (it.qty ?? 1);
    });
    return Object.entries(map).map(([item_name, qty]) => ({ item_name, qty }));
  }, [order.items]);

  // Total invoice cost
  const totalCost = useMemo(() => {
    return uniqueItems.reduce((sum, item) => {
      const price = parseFloat(prices[item.item_name] || "0");
      return sum + (isNaN(price) ? 0 : price * item.qty);
    }, 0);
  }, [uniqueItems, prices]);

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
    toast(`Applied price of $${bulkPrice} to ${selectedItems.size} item(s)`, "success");
  };

  const handleSendInvoice = async () => {
    setSending(true);
    try {
      const payload = {
        prices: uniqueItems.map(item => ({
          item_name: item.item_name,
          price: parseFloat(prices[item.item_name] || "0") || 0,
        })),
      };

      await api.post(`/orders/${order.order_id}/invoice`, payload);
      toast("Invoice shared successfully with Telegram group!", "success");
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
          <div className="text-left">
            <span className="text-xs block text-[var(--text-muted)] font-medium">Estimated Total</span>
            <span className="text-lg font-bold text-[var(--color-primary)]">${totalCost.toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSendInvoice} loading={sending} disabled={uniqueItems.length === 0}>
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
                step="0.01"
                placeholder="Bulk Price ($)"
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
                    <div className="text-[10px] text-[var(--text-muted)]">Qty: {item.qty}</div>
                  </div>

                  <div className="flex items-center gap-2 w-28">
                    <span className="text-xs text-[var(--text-muted)]">$</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
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
