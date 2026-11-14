import type { Customer, Order } from "../core/app-model.js";
import type { AppProject, Product } from "../core/schema.js";

export type PublicShop = Pick<AppProject, "kind" | "name" | "settings" | "blocks" | "shop" | "payments"> & { products: Product[] };

export const slugFromPath = (): string => location.pathname.split("/").filter(Boolean)[1] ?? "";
export const isAdminPath = (): boolean => location.pathname.split("/").filter(Boolean)[2] === "admin";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...headers } });
  } catch {
    throw new ApiError("Pas de connexion. Vérifie ton réseau et réessaie.", 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Erreur ${res.status}`, res.status);
  return data as T;
}

const base = (slug: string): string => `/api/shops/${encodeURIComponent(slug)}`;
const store = {
  get(key: string): string {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  },
  set(key: string, value: string): void {
    try {
      value ? localStorage.setItem(key, value) : localStorage.removeItem(key);
    } catch {
      /* stockage désactivé */
    }
  },
};
export const storage = store;

export interface OrderRequest {
  name: string; phone: string; address: string; note: string; method: "cod" | "momo" | "link"; paymentRef: string;
  items: { productId: string; qty: number }[];
}
export interface OrderResult {
  order: Order;
  payment: { momo: { operator: string; number: string; holder: string }[]; payUrl: string | null };
}

export const shopApi = {
  load: (slug: string) => call<PublicShop>(base(slug)),
  register: (slug: string, body: { name: string; phone: string; password: string }) => call<{ token: string; customer: Pick<Customer, "id" | "name" | "phone"> }>(`${base(slug)}/register`, { method: "POST", body: JSON.stringify(body) }),
  login: (slug: string, body: { phone: string; password: string }) => call<{ token: string; customer: Pick<Customer, "id" | "name" | "phone"> }>(`${base(slug)}/login`, { method: "POST", body: JSON.stringify(body) }),
  me: (slug: string, token: string) => call<{ customer: Pick<Customer, "id" | "name" | "phone">; orders: Order[] }>(`${base(slug)}/me`, {}, { authorization: `Bearer ${token}` }),
  order: (slug: string, body: OrderRequest, token: string) => call<OrderResult>(`${base(slug)}/orders`, { method: "POST", body: JSON.stringify(body) }, token ? { authorization: `Bearer ${token}` } : {}),
};

export interface Stats {
  toNotify: number; toVerify: number;
  today: { count: number; revenue: number }; week: { count: number; revenue: number }; all: { count: number; revenue: number };
  top: { name: string; qty: number; revenue: number }[];
}

export const adminApi = (slug: string, key: string) => {
  const h = { "x-admin-key": key };
  return {
    ping: () => call<{ ok: boolean; name: string; kind: string }>(`${base(slug)}/admin/ping`, {}, h),
    orders: () => call<{ orders: Order[]; products: Product[]; currency: string }>(`${base(slug)}/admin/orders`, {}, h),
    stats: () => call<Stats>(`${base(slug)}/admin/stats`, {}, h),
    customers: () => call<{ customers: Customer[] }>(`${base(slug)}/admin/customers`, {}, h),
    patchOrder: (id: string, body: { status?: string; paymentStatus?: string }) => call<{ order: Order }>(`${base(slug)}/admin/orders/${id}`, { method: "PATCH", body: JSON.stringify(body) }, h),
    patchProduct: (id: string, body: { active?: boolean; stock?: number | null; price?: number }) => call<{ products: Product[] }>(`${base(slug)}/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(body) }, h),
    csv: async (): Promise<Blob> => {
      const res = await fetch(`${base(slug)}/admin/orders.csv`, { headers: h });
      if (!res.ok) throw new ApiError("Export impossible.", res.status);
      return res.blob();
    },
  };
};
