/**
 * Quotation Calculations Utility
 * Pure functions to calculate line totals, taxable amounts, taxes, and grand totals.
 */

export function calculateLineTotal(quantity, unitPrice) {
  const q = Math.max(0, Number(quantity) || 0);
  const p = Math.max(0, Number(unitPrice) || 0);
  return Number((q * p).toFixed(2));
}

export function calculateQuotationTotals(items = [], discountAmount = 0, defaultTaxRate = 18) {
  const subtotal = items.reduce((sum, item) => {
    return sum + calculateLineTotal(item.quantity, item.unit_price);
  }, 0);

  const discount = Math.min(Math.max(0, Number(discountAmount) || 0), subtotal);
  const taxableBase = Math.max(0, subtotal - discount);

  const taxAmount = items.reduce((sum, item) => {
    const lineTotal = calculateLineTotal(item.quantity, item.unit_price);
    const itemDiscount = subtotal > 0 ? (lineTotal / subtotal) * discount : 0;
    const itemTaxable = Math.max(0, lineTotal - itemDiscount);
    const rate = item.tax_rate !== undefined && item.tax_rate !== null ? Number(item.tax_rate) : defaultTaxRate;
    return sum + (itemTaxable * (Number(rate) || 0)) / 100;
  }, 0);

  const total = taxableBase + taxAmount;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    taxableBase: Number(taxableBase.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
}

export function formatCurrency(val) {
  if (val === undefined || val === null || isNaN(val)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
}
