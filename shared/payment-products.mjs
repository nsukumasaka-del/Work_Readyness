// Public product configuration shared by the UI and both payment backends.
// Amounts are integer ZAR cents; the server remains the pricing authority.
export const DAILY_JOB_MATCH_PRICE = 3000;
export const PAYMENT_PRODUCTS = {
  TEMPLATE_DOWNLOAD: { amount: 5000, name: 'CV template download', priceZar: 50 },
  JOB_MATCH_UNLOCK: { amount: DAILY_JOB_MATCH_PRICE, name: 'Daily Job Match Access', priceZar: DAILY_JOB_MATCH_PRICE / 100 },
  MEGA_ACCESS: { amount: 8000, name: 'Mega Access Promotion', priceZar: 80 },
};
