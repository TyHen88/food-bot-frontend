import { api } from "./api";

export interface InvoiceItem {
  item_name: string;
  qty: number;
  price: number;
  cost: number;
}

export interface InvoiceDetailEntry {
  user_id?: string;
  user_name: string;
  items: InvoiceItem[];
  subtotal: number;
  paid?: boolean;
  paid_at?: string;
  paid_amount?: number;
}

export interface Invoice {
  invoice_id: string;
  order_id: string;
  chat_id: string;
  chat_title?: string;
  order_date: string;
  details: InvoiceDetailEntry[];
  total: number;
  payer_name: string;
  sent_count: number;
  last_sent_at: string;
  payer_qr_image?: string;
  payer_khqr_text?: string;
}

interface CacheEntry {
  data: Invoice;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory TTL
const invoiceMemoryCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<Invoice>>();

/**
 * Fetch a single invoice by ID with in-memory caching and request deduplication.
 */
export async function fetchInvoiceWithCache(
  invoiceId: string,
  forceFresh = false
): Promise<Invoice> {
  const id = String(invoiceId).trim();
  if (!id) throw new Error("Missing invoiceId");

  const now = Date.now();
  if (!forceFresh) {
    const cached = invoiceMemoryCache.get(id);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  // Deduplicate concurrent inflight requests for the same invoice ID
  const existingInFlight = inFlightRequests.get(id);
  if (existingInFlight) {
    return existingInFlight;
  }

  const promise = (async () => {
    try {
      const inv = await api.get<Invoice>(`/invoices/${encodeURIComponent(id)}`);
      invoiceMemoryCache.set(id, { data: inv, timestamp: Date.now() });
      if (inv.order_id && inv.order_id !== id) {
        invoiceMemoryCache.set(inv.order_id, { data: inv, timestamp: Date.now() });
      }
      return inv;
    } finally {
      inFlightRequests.delete(id);
    }
  })();

  inFlightRequests.set(id, promise);
  return promise;
}

/**
 * Synchronously read an invoice from the cache if available and not expired.
 */
export function getInvoiceFromCache(invoiceId: string): Invoice | undefined {
  const id = String(invoiceId).trim();
  const cached = invoiceMemoryCache.get(id);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  return undefined;
}

/**
 * Manually update or populate the cache with a modified invoice.
 */
export function setInvoiceInCache(invoice: Invoice): void {
  if (!invoice?.invoice_id) return;
  const entry: CacheEntry = { data: invoice, timestamp: Date.now() };
  invoiceMemoryCache.set(invoice.invoice_id, entry);
  if (invoice.order_id) {
    invoiceMemoryCache.set(invoice.order_id, entry);
  }
}

/**
 * Invalidate a specific invoice or clear all cache.
 */
export function invalidateInvoiceCache(invoiceId?: string): void {
  if (invoiceId) {
    invoiceMemoryCache.delete(String(invoiceId).trim());
  } else {
    invoiceMemoryCache.clear();
  }
}
