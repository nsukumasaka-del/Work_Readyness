export declare const DAILY_JOB_MATCH_PRICE: number;
export declare const PAYMENT_PRODUCTS: Readonly<Record<
  'TEMPLATE_DOWNLOAD' | 'JOB_MATCH_UNLOCK' | 'MEGA_ACCESS',
  { readonly amount: number; readonly name: string; readonly priceZar: number }
>>;
export type PaymentType = keyof typeof PAYMENT_PRODUCTS;
