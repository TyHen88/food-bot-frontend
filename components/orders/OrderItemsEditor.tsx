import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Trash2, Plus, Edit2, FileText } from "lucide-react";

export interface OrderItem {
  name?: string;
  item_name?: string;
  qty?: number;
  user_id?: string;
}

export interface Order {
  order_id: string;
  poll_id: string;
  chat_id?: string;
  chat_title?: string;
  question?: string;
  status?: string;
  order_date: string;      // "YYYY-MM-DD"
  created_at?: string;
  items: OrderItem[];
  item_count?: number;
  person_count?: number;
  paid_by?: { user_id?: string; username?: string };
}

export function OrderItemsEditor({ 
  order, 
  isAdmin, 
  onSaved,
  onInvoiceClick 
}: { 
  order: Order; 
  isAdmin: boolean; 
  onSaved: () => void;
  onInvoiceClick?: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftItems, setDraftItems] = useState(order.items ?? []);

  useEffect(() => {
    if (!editing) setDraftItems(order.items ?? []);
  }, [editing, order.items]);

  async function handleSave() {
    setSaving(true);
    try {
      // Filter out empty items
      const cleaned = draftItems.filter(it => it.name?.trim() || it.item_name?.trim());
      await api.put(`/orders/${order.order_id}/items`, { items: cleaned });
      toast("Items updated", "success");
      setEditing(false);
      onSaved();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    // Grid with fixed qty/delete columns and min-w-0 inputs: text inputs
    // shrink instead of pushing the qty box and delete button off-screen
    // on narrow (Telegram) viewports.
    const cellCls = "w-full min-w-0 px-1.5 py-1 text-xs rounded border focus:outline-none focus:ring-1";
    const cellStyle = { background: "var(--surface)", color: "var(--text)", borderColor: "var(--border)" };
    return (
      <div className="space-y-2">
        {draftItems.map((item, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_1.3fr_2.25rem_1.5rem] gap-1.5 items-center">
            <input
              className={cellCls}
              style={cellStyle}
              placeholder="Name"
              value={item.name || ""}
              onChange={e => {
                const arr = [...draftItems];
                arr[idx] = { ...arr[idx], name: e.target.value };
                setDraftItems(arr);
              }}
            />
            <input
              className={cellCls}
              style={cellStyle}
              placeholder="Dish"
              value={item.item_name || ""}
              onChange={e => {
                const arr = [...draftItems];
                arr[idx] = { ...arr[idx], item_name: e.target.value };
                setDraftItems(arr);
              }}
            />
            <input
              type="number"
              min="1"
              inputMode="numeric"
              className={`${cellCls} text-center px-0.5`}
              style={cellStyle}
              value={item.qty || 1}
              onChange={e => {
                const arr = [...draftItems];
                arr[idx] = { ...arr[idx], qty: parseInt(e.target.value) || 1 };
                setDraftItems(arr);
              }}
            />
            <button
              onClick={() => setDraftItems(draftItems.filter((_, i) => i !== idx))}
              className="w-6 h-6 flex items-center justify-center justify-self-end rounded border-0 cursor-pointer hover:opacity-80 transition-opacity"
              style={{ background: "var(--color-danger-light)", color: "var(--color-danger)" }}
              aria-label="Remove item"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}

        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => setDraftItems([...draftItems, { name: "", item_name: "", qty: 1 }])}>
            <Plus size={13} /> Add
          </Button>
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} loading={saving}>Save</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-1 mt-2">
        {(order.items ?? []).length === 0 ? (
          <p className="text-xs italic py-2" style={{ color: "var(--text-muted)" }}>No items in this order.</p>
        ) : (
          (order.items ?? []).map((item, idx) => (
            <div key={idx} className="flex items-center justify-between gap-2 text-xs py-1.5"
              style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                <span className="font-medium truncate max-w-[45%]" style={{ color: "var(--text)" }}>
                  {item.name || "Unknown User"}
                </span>
                <span className="truncate flex-1 text-right" style={{ color: "var(--text-muted)" }}>
                  {item.item_name || "Unknown Food"}
                </span>
              </div>
              {item.qty && item.qty > 1 && (
                <Badge variant="accent" className="font-bold text-[10px] shrink-0">
                  ×{item.qty}
                </Badge>
              )}
            </div>
          ))
        )}
      </div>
      {isAdmin && (
        <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            onClick={() => {
              setDraftItems([...draftItems, { name: "", item_name: "", qty: 1 }]);
              setEditing(true);
            }}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] hover:bg-[var(--surface-3)] cursor-pointer transition-colors"
            style={{ background: "var(--surface)", color: "var(--text)" }}
          >
            <Plus size={13} /> Add Order
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] hover:bg-[var(--surface-3)] cursor-pointer transition-colors"
              style={{ background: "var(--surface)", color: "var(--text)" }}
            >
              <Edit2 size={12} /> Edit Items
            </button>

            {onInvoiceClick && (
              <button
                onClick={onInvoiceClick}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] cursor-pointer transition-colors"
                style={{ 
                  background: "var(--color-primary-light)", 
                  color: "var(--color-primary)",
                  borderColor: "var(--border)" 
                }}
              >
                <FileText size={12} /> Invoice
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
