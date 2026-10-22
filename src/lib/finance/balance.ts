import { toKurus } from "@/lib/calc";

/**
 * Bakiye hesabı (PRD §9.3, Adım 2.8). Hesap kuruş cinsinden tam sayıyla yapılır.
 *
 *   müşteri bakiyesi = açılış bakiyesi
 *                    + kesinleşmiş satış ve ücretli servis tutarları
 *                    − müşteriden alınan ödemeler (IN)
 *                    − iade tutarları
 *                    + müşteriye yapılan ödemeler (OUT)
 *
 * Pozitif = müşteri işletmeye borçlu. Negatif = işletme müşteriye borçlu
 * (müşteri alacağı). Bakiye saklanmaz, her seferinde belgelerden hesaplanır.
 * Hatalı ödemenin ters kaydı karşı yönlü bir ödeme olduğundan formüle ayrıca
 * bir kural gerekmez.
 */
export type CustomerBalanceInput = {
  openingBalances: { direction: "OWED_BY_PARTY" | "OWED_TO_PARTY"; amount: number }[];
  /** Kesinleşmiş satışlar ve ücretli servisler (TL) */
  charges: number[];
  payments: { direction: "IN" | "OUT"; amount: number }[];
  /** İade tutarları (TL) */
  returns: number[];
};

export type BalanceBreakdown = {
  /** kuruş; pozitif = müşteri borçlu */
  balance: number;
  opening: number;
  charged: number;
  received: number;
  paidOut: number;
  returned: number;
};

const sumKurus = (values: number[]) => values.reduce((acc, v) => acc + toKurus(v), 0);

export function calcCustomerBalance(input: CustomerBalanceInput): BalanceBreakdown {
  const opening = input.openingBalances.reduce(
    (acc, o) => acc + (o.direction === "OWED_BY_PARTY" ? 1 : -1) * toKurus(o.amount),
    0
  );
  const charged = sumKurus(input.charges);
  const received = sumKurus(input.payments.filter((p) => p.direction === "IN").map((p) => p.amount));
  const paidOut = sumKurus(input.payments.filter((p) => p.direction === "OUT").map((p) => p.amount));
  const returned = sumKurus(input.returns);

  return {
    balance: opening + charged - received - returned + paidOut,
    opening,
    charged,
    received,
    paidOut,
    returned,
  };
}

export type BalanceState = "DEBT" | "CREDIT" | "CLEAR";

export function balanceState(balanceKurus: number): BalanceState {
  if (balanceKurus > 0) return "DEBT";
  if (balanceKurus < 0) return "CREDIT";
  return "CLEAR";
}

/**
 * Tedarikçi bakiyesi (PRD §9.3, Adım 4.7). Pozitif = işletme tedarikçiye
 * borçlu (müşteri bakiyesinin tersi yönlüdür).
 *
 *   tedarikçi bakiyesi = açılış bakiyesi
 *                      + teslim alınmış (RECEIVED) satın alma tutarları
 *                      − tedarikçiye yapılan ödemeler (OUT)
 *                      − tedarikçi iadeleri
 *                      + tedarikçiden alınan iade ödemeleri (IN)
 */
export type SupplierBalanceInput = {
  openingBalances: { direction: "OWED_BY_PARTY" | "OWED_TO_PARTY"; amount: number }[];
  /** Teslim alınmış satın almalar (TL) */
  purchases: number[];
  payments: { direction: "IN" | "OUT"; amount: number }[];
  /** Tedarikçiye iade tutarları (TL) */
  returns: number[];
};

export type SupplierBalanceBreakdown = {
  /** kuruş; pozitif = işletme borçlu */
  balance: number;
  opening: number;
  purchased: number;
  paid: number;
  refunded: number;
  returned: number;
};

export function calcSupplierBalance(input: SupplierBalanceInput): SupplierBalanceBreakdown {
  const opening = input.openingBalances.reduce(
    (acc, o) => acc + (o.direction === "OWED_TO_PARTY" ? 1 : -1) * toKurus(o.amount),
    0
  );
  const purchased = sumKurus(input.purchases);
  const paid = sumKurus(input.payments.filter((p) => p.direction === "OUT").map((p) => p.amount));
  const refunded = sumKurus(input.payments.filter((p) => p.direction === "IN").map((p) => p.amount));
  const returned = sumKurus(input.returns);

  return {
    balance: opening + purchased - paid - returned + refunded,
    opening,
    purchased,
    paid,
    refunded,
    returned,
  };
}
