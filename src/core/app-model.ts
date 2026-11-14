import { z } from "zod";
import type { ShopConfig } from "./schema.js";

/** Types et règles partagés par le serveur, la boutique publiée et l'administration. */

export const ORDER_STATUSES = ["new", "confirmed", "preparing", "delivering", "done", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const PAYMENT_STATUSES = ["unpaid", "pending", "paid"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_METHODS = ["cod", "momo", "link"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "Nouvelle",
  confirmed: "Confirmée",
  preparing: "En préparation",
  delivering: "En livraison",
  done: "Terminée",
  cancelled: "Annulée",
};
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = { unpaid: "Non payée", pending: "À vérifier", paid: "Payée" };
export const METHOD_LABEL: Record<PaymentMethod, string> = { cod: "À la livraison", momo: "Mobile Money", link: "Lien de paiement" };

/** Étape suivante proposée à l'administrateur. */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  new: "confirmed",
  confirmed: "preparing",
  preparing: "delivering",
  delivering: "done",
  done: null,
  cancelled: null,
};

export interface OrderLine {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

export interface Order {
  id: string;
  /** Numéro lisible, propre à chaque boutique (#1, #2…). */
  number: number;
  customerId: string | null;
  name: string;
  phone: string;
  address: string;
  note: string;
  lines: OrderLine[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  currency: string;
  method: PaymentMethod;
  paymentRef: string;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  createdAt: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  createdAt: number;
}

/** Chiffres uniquement, indicatif compris. Retourne "" si le numéro est invalide. */
export function normalizePhone(input: unknown): string {
  let digits = String(input ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 7 && digits.length <= 15 ? digits : "";
}

const round = (n: number): number => Math.round(n * 100) / 100;

export function computeTotals(lines: { price: number; qty: number }[], shop: Pick<ShopConfig, "deliveryFee" | "freeDeliveryFrom">) {
  const subtotal = round(lines.reduce((sum, l) => sum + l.price * l.qty, 0));
  const free = subtotal === 0 || (shop.freeDeliveryFrom > 0 && subtotal >= shop.freeDeliveryFrom);
  const deliveryFee = free ? 0 : round(shop.deliveryFee);
  return { subtotal, deliveryFee, total: round(subtotal + deliveryFee) };
}

export const money = (amount: number, currency: string): string => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(amount)} ${currency}`.trim();

/** Remplace {amount} et {order} dans le lien de paiement ; n'accepte que du https. */
export function fillPayUrl(template: string, vars: { amount: number; order: number }): string | null {
  if (!template.trim()) return null;
  const filled = template.replaceAll("{amount}", encodeURIComponent(String(vars.amount))).replaceAll("{order}", encodeURIComponent(String(vars.order)));
  try {
    const u = new URL(filled);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/* ---- entrées d'API ---- */

export const RegisterInput = z.object({
  name: z.string().trim().min(2, "Écris ton nom.").max(80),
  phone: z.string().max(30),
  password: z.string().min(6, "Le mot de passe doit avoir au moins 6 caractères.").max(100),
});
export const LoginInput = z.object({ phone: z.string().max(30), password: z.string().min(1).max(100) });

export const OrderInput = z.object({
  name: z.string().trim().min(2, "Écris ton nom.").max(80),
  phone: z.string().max(30),
  address: z.string().trim().max(300).default(""),
  note: z.string().trim().max(300).default(""),
  method: z.enum(PAYMENT_METHODS),
  paymentRef: z.string().trim().max(60).default(""),
  items: z
    .array(z.object({ productId: z.string().min(1).max(40), qty: z.number().int().min(1).max(50) }))
    .min(1, "Le panier est vide.")
    .max(60),
});
export type OrderInput = z.infer<typeof OrderInput>;
