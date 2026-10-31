/**
 * BillSync Financial Balance Calculation Engine
 * 
 * Rules:
 * - Integer paise arithmetic to prevent IEEE-754 floating point inaccuracies.
 * - Total Balance = Total Confirmed Invoice Amount - Total Payments Received Against Those Invoices.
 * - Only confirmed invoices included (DRAFT and CANCELLED strictly excluded).
 * - Only payments linked to valid confirmed invoices are subtracted.
 * - Strict payment deduplication by ID to prevent double counting.
 * - Invoice-wise balance capped to prevent negative outstanding without explicit overpayment accounting.
 * - Indian currency formatting (INR) with 2 decimal places.
 */

export function toPaise(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return 0;
  return Math.round(Number(amount) * 100);
}

export function fromPaise(paise) {
  return Number((paise / 100).toFixed(2));
}

export function formatINR(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function isPastDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

export function isConfirmedInvoice(inv) {
  if (!inv) return false;
  const status = String(inv.status || '').toUpperCase().trim();
  // Exclude cancelled and draft invoices
  if (status === 'CANCELLED' || status === 'DRAFT') {
    return false;
  }
  return true;
}

export function isValidPayment(p) {
  if (!p) return false;
  const status = String(p.status || 'SUCCESSFUL').toUpperCase().trim();
  if (status === 'FAILED' || status === 'CANCELLED' || status === 'REVERSED') {
    return false;
  }
  const amt = Number(p.amount);
  return !isNaN(amt) && amt > 0;
}

/**
 * Calculates accurate total balance and invoice-wise breakdown from raw invoices and payments.
 * 
 * @param {Array} invoices - List of invoice records
 * @param {Array} payments - List of payment records
 * @returns {Object} Calculated balance summary and invoice breakdowns
 */
export function calculateFinancialRecords(invoices = [], payments = []) {
  const safeInvoices = Array.isArray(invoices) ? invoices : [];
  const safePayments = Array.isArray(payments) ? payments : [];

  // Filter confirmed invoices only (exclude draft and cancelled)
  const confirmedInvoices = safeInvoices.filter(isConfirmedInvoice);

  // Index confirmed invoices by id and invoice_number
  const invoiceIdMap = new Map();
  const invoiceNumMap = new Map();

  confirmedInvoices.forEach((inv) => {
    if (inv.id !== undefined && inv.id !== null) {
      invoiceIdMap.set(String(inv.id), inv);
    }
    if (inv.invoice_number) {
      invoiceNumMap.set(String(inv.invoice_number).trim().toUpperCase(), inv);
    }
  });

  // Deduplicate and filter payments linked to valid confirmed invoices
  const seenPaymentKeys = new Set();
  const paymentsByInvoiceId = new Map();

  safePayments.forEach((p) => {
    if (!isValidPayment(p)) return;

    // Unique payment key to prevent double counting
    const payKey = p.id ? String(p.id) : (p.payment_reference ? `ref-${p.payment_reference}` : null);
    if (payKey) {
      if (seenPaymentKeys.has(payKey)) {
        return; // Skip duplicate payment
      }
      seenPaymentKeys.add(payKey);
    }

    // Match payment to a confirmed invoice
    let targetInv = null;
    if (p.invoice_id !== undefined && p.invoice_id !== null && invoiceIdMap.has(String(p.invoice_id))) {
      targetInv = invoiceIdMap.get(String(p.invoice_id));
    } else if (p.invoice_number && invoiceNumMap.has(String(p.invoice_number).trim().toUpperCase())) {
      targetInv = invoiceNumMap.get(String(p.invoice_number).trim().toUpperCase());
    }

    if (!targetInv) {
      // Payment not linked to any valid confirmed invoice -> Excluded per rule
      return;
    }

    const invIdStr = String(targetInv.id);
    if (!paymentsByInvoiceId.has(invIdStr)) {
      paymentsByInvoiceId.set(invIdStr, []);
    }
    paymentsByInvoiceId.get(invIdStr).push(p);
  });

  // Perform Invoice-Wise Calculation
  let totalInvoicedPaise = 0;
  let totalReceivedPaise = 0;
  let overdueBalancePaise = 0;
  let totalOverpaymentPaise = 0;
  let overdueCount = 0;
  let paidCount = 0;

  const invoiceBreakdowns = confirmedInvoices.map((inv) => {
    const invIdStr = String(inv.id);

    // Compute invoice total in paise
    let invTotalPaise = 0;
    if (inv.total !== undefined && inv.total !== null && !isNaN(inv.total)) {
      invTotalPaise = toPaise(inv.total);
    } else {
      const subtotalPaise = toPaise(inv.subtotal || 0);
      const taxPaise = toPaise(inv.tax_amount || 0);
      const discountPaise = toPaise(inv.discount_amount || 0);
      invTotalPaise = Math.max(0, subtotalPaise + taxPaise - discountPaise);
    }

    // Sum actual recorded payments linked to this invoice
    const linkedPayments = paymentsByInvoiceId.get(invIdStr) || [];
    const rawPaidPaise = linkedPayments.reduce((sum, p) => sum + toPaise(p.amount), 0);

    // Cap payment to invoice total; track excess as overpayment
    const cappedPaidPaise = Math.min(invTotalPaise, rawPaidPaise);
    const overpaymentPaise = Math.max(0, rawPaidPaise - invTotalPaise);
    const outstandingPaise = Math.max(0, invTotalPaise - cappedPaidPaise);

    const isOverdue = outstandingPaise > 0 && isPastDate(inv.due_date);

    totalInvoicedPaise += invTotalPaise;
    totalReceivedPaise += cappedPaidPaise;
    totalOverpaymentPaise += overpaymentPaise;

    if (isOverdue) {
      overdueBalancePaise += outstandingPaise;
      overdueCount++;
    }

    if (outstandingPaise === 0 && invTotalPaise > 0) {
      paidCount++;
    }

    return {
      id: inv.id,
      invoice_number: inv.invoice_number || `INV-${inv.id}`,
      customer_id: inv.customer_id,
      customer_name: inv.customer_name || 'Customer',
      company: inv.company || '',
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      status: inv.status,
      total: fromPaise(invTotalPaise),
      amount_paid: fromPaise(cappedPaidPaise),
      balance_due: fromPaise(outstandingPaise),
      overpayment: fromPaise(overpaymentPaise),
      is_overdue: isOverdue,
      payments_count: linkedPayments.length,
    };
  });

  // Total Balance = Total Confirmed Invoice Amount - Total Payments Received Against Those Invoices
  const totalBalancePaise = Math.max(0, totalInvoicedPaise - totalReceivedPaise);

  return {
    // Primary Dashboard Metrics in Rupees
    totalInvoiced: fromPaise(totalInvoicedPaise),
    totalReceived: fromPaise(totalReceivedPaise),
    totalBalance: fromPaise(totalBalancePaise),
    overdueBalance: fromPaise(overdueBalancePaise),
    totalOverpayment: fromPaise(totalOverpaymentPaise),

    // Counts
    confirmedInvoicesCount: confirmedInvoices.length,
    overdueInvoicesCount: overdueCount,
    paidInvoicesCount: paidCount,

    // Formatted strings
    formattedTotalInvoiced: formatINR(fromPaise(totalInvoicedPaise)),
    formattedTotalReceived: formatINR(fromPaise(totalReceivedPaise)),
    formattedTotalBalance: formatINR(fromPaise(totalBalancePaise)),
    formattedOverdueBalance: formatINR(fromPaise(overdueBalancePaise)),

    // Detailed invoice breakdown list
    invoiceBreakdowns,
  };
}

