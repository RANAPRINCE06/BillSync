import { db } from '../config/firebase';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { calculateFinancialRecords, toPaise, fromPaise } from '../utils/balanceEngine';
import { getMockStore, saveMockStore } from '../data/mockData';

const FINANCE_EVENT = 'billsync:finance_updated';

class FirestoreFinanceService {
  constructor() {
    this.invoices = [];
    this.payments = [];
    this.subscribers = new Set();
    this.isFirestoreLive = false;
    this.isSeeded = false;
    this.unsubInvoices = null;
    this.unsubPayments = null;
    this.lastCalculated = null;

    // Load initial local data
    this.loadFromLocalStore();

    // Start real-time Firestore synchronization
    this.initFirestoreListeners();

    // Listen to local window events for multi-tab or local updates
    if (typeof window !== 'undefined') {
      window.addEventListener(FINANCE_EVENT, () => {
        this.recalculateAndNotify();
      });
    }
  }

  loadFromLocalStore() {
    try {
      const store = getMockStore();
      this.invoices = Array.isArray(store.invoices) ? [...store.invoices] : [];
      this.payments = Array.isArray(store.payments) ? [...store.payments] : [];
      this.lastCalculated = calculateFinancialRecords(this.invoices, this.payments);
    } catch {
      this.invoices = [];
      this.payments = [];
      this.lastCalculated = calculateFinancialRecords([], []);
    }
  }

  initFirestoreListeners() {
    if (!db || typeof window === 'undefined') {
      this.isFirestoreLive = false;
      this.recalculateAndNotify();
      return;
    }

    try {
      const invoicesColl = collection(db, 'invoices');
      const paymentsColl = collection(db, 'payments');

      // Real-time listener for Invoices
      this.unsubInvoices = onSnapshot(
        invoicesColl,
        (snapshot) => {
          if (!snapshot.empty) {
            const liveInvoices = [];
            snapshot.forEach((docSnap) => {
              liveInvoices.push({ id: docSnap.id, ...docSnap.data() });
            });
            this.invoices = liveInvoices;
            this.isFirestoreLive = true;

            // Sync with local store so other services see identical data
            try {
              const store = getMockStore();
              store.invoices = liveInvoices;
              saveMockStore(store);
            } catch {
              // Silently ignore store serialization errors
            }
          } else {
            // If Firestore is empty, seed initial data once
            this.seedFirestoreIfEmpty();
          }
          this.recalculateAndNotify();
        },
        (error) => {
          // Cloud Firestore offline / permission error: fallback gracefully to local store
          console.warn('[Cloud Firestore Invoices Listener]: operating with local sync cache -', error.message || error);
          this.isFirestoreLive = false;
          this.loadFromLocalStore();
          this.recalculateAndNotify();
        }
      );

      // Real-time listener for Payments
      this.unsubPayments = onSnapshot(
        paymentsColl,
        (snapshot) => {
          if (!snapshot.empty) {
            const livePayments = [];
            snapshot.forEach((docSnap) => {
              livePayments.push({ id: docSnap.id, ...docSnap.data() });
            });
            this.payments = livePayments;
            this.isFirestoreLive = true;

            // Sync with local store
            try {
              const store = getMockStore();
              store.payments = livePayments;
              saveMockStore(store);
            } catch {
              // Silently ignore store serialization errors
            }
          }
          this.recalculateAndNotify();
        },
        (error) => {
          console.warn('[Cloud Firestore Payments Listener]: operating with local sync cache -', error.message || error);
          this.isFirestoreLive = false;
          this.loadFromLocalStore();
          this.recalculateAndNotify();
        }
      );
    } catch (err) {
      console.warn('Firestore initialization failed; using local real-time calculation engine:', err);
      this.isFirestoreLive = false;
      this.recalculateAndNotify();
    }
  }

  async seedFirestoreIfEmpty() {
    if (this.isSeeded || !db) return;
    this.isSeeded = true;
    try {
      const store = getMockStore();
      const initialInvoices = store.invoices || [];
      const initialPayments = store.payments || [];

      // Batch upload initial invoices and payments to Firestore
      for (const inv of initialInvoices) {
        if (inv.id) {
          await setDoc(doc(db, 'invoices', String(inv.id)), {
            invoice_number: inv.invoice_number,
            customer_id: inv.customer_id,
            customer_name: inv.customer_name || '',
            company: inv.company || '',
            issue_date: inv.issue_date,
            due_date: inv.due_date,
            status: inv.status,
            subtotal: inv.subtotal || 0,
            tax_amount: inv.tax_amount || 0,
            discount_amount: inv.discount_amount || 0,
            total: inv.total || 0,
            amount_paid: inv.amount_paid || 0,
            balance_due: inv.balance_due || 0,
            created_at: inv.created_at || new Date().toISOString(),
          }).catch(() => {});
        }
      }

      for (const pay of initialPayments) {
        if (pay.id) {
          await setDoc(doc(db, 'payments', String(pay.id)), {
            payment_reference: pay.payment_reference,
            customer_id: pay.customer_id,
            invoice_id: pay.invoice_id,
            invoice_number: pay.invoice_number,
            customer_name: pay.customer_name || '',
            amount: pay.amount || 0,
            payment_method: pay.payment_method || 'CREDIT_CARD',
            payment_date: pay.payment_date || new Date().toISOString(),
            status: pay.status || 'SUCCESSFUL',
            notes: pay.notes || '',
            created_at: pay.created_at || new Date().toISOString(),
          }).catch(() => {});
        }
      }
    } catch {
      // Ignore background seed failure
    }
  }

  recalculateAndNotify() {
    this.lastCalculated = calculateFinancialRecords(this.invoices, this.payments);
    const result = {
      ...this.lastCalculated,
      isFirestoreLive: this.isFirestoreLive,
      invoices: this.invoices,
      payments: this.payments,
    };
    this.subscribers.forEach((callback) => {
      try {
        callback(result);
      } catch (err) {
        console.error('Error in financial balance subscriber:', err);
      }
    });
  }

  /**
   * Subscribe to real-time financial balance updates.
   * Invoked immediately with current state, and on every Firestore or local change.
   * 
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    // Immediate callback with current calculation
    callback({
      ...(this.lastCalculated || calculateFinancialRecords(this.invoices, this.payments)),
      isFirestoreLive: this.isFirestoreLive,
      invoices: this.invoices,
      payments: this.payments,
    });

    return () => {
      this.subscribers.delete(callback);
    };
  }

  getCurrentBalance() {
    if (!this.lastCalculated) {
      this.loadFromLocalStore();
    }
    return {
      ...this.lastCalculated,
      isFirestoreLive: this.isFirestoreLive,
      invoices: this.invoices,
      payments: this.payments,
    };
  }

  // --------------------------------------------------------------------------
  // Real-Time Mutation Handlers (Writes to Cloud Firestore & Dispatches Update)
  // --------------------------------------------------------------------------

  async recordPayment(paymentData) {
    const paymentId = paymentData.id || `pay-${Date.now()}`;
    const cleanPayment = {
      id: paymentId,
      payment_reference: paymentData.payment_reference || `PAY-${Date.now()}`,
      invoice_id: String(paymentData.invoice_id),
      invoice_number: paymentData.invoice_number || '',
      customer_id: paymentData.customer_id || '',
      customer_name: paymentData.customer_name || '',
      amount: Number(paymentData.amount) || 0,
      payment_method: paymentData.payment_method || 'CREDIT_CARD',
      payment_date: paymentData.payment_date || new Date().toISOString(),
      status: paymentData.status || 'SUCCESSFUL',
      notes: paymentData.notes || '',
      created_at: new Date().toISOString(),
    };

    // Update in-memory list
    this.payments = [cleanPayment, ...this.payments.filter((p) => String(p.id) !== String(paymentId))];

    // Push to Firestore if available
    if (db) {
      setDoc(doc(db, 'payments', paymentId), cleanPayment).catch((err) => {
        console.warn('Could not sync payment to Firestore backend:', err.message || err);
      });
    }

    this.recalculateAndNotify();
    this.dispatchLocalEvent();
    return cleanPayment;
  }

  async saveInvoice(invoiceData) {
    const invId = invoiceData.id || `inv-${Date.now()}`;
    const cleanInvoice = {
      ...invoiceData,
      id: invId,
      updated_at: new Date().toISOString(),
    };

    this.invoices = [cleanInvoice, ...this.invoices.filter((i) => String(i.id) !== String(invId))];

    if (db) {
      setDoc(doc(db, 'invoices', String(invId)), cleanInvoice).catch((err) => {
        console.warn('Could not sync invoice to Firestore backend:', err.message || err);
      });
    }

    this.recalculateAndNotify();
    this.dispatchLocalEvent();
    return cleanInvoice;
  }

  async updateInvoiceStatus(invoiceId, newStatus) {
    const strId = String(invoiceId);
    this.invoices = this.invoices.map((inv) => {
      if (String(inv.id) === strId) {
        return { ...inv, status: newStatus, updated_at: new Date().toISOString() };
      }
      return inv;
    });

    if (db) {
      updateDoc(doc(db, 'invoices', strId), {
        status: newStatus,
        updated_at: new Date().toISOString(),
      }).catch((err) => {
        console.warn('Could not update invoice in Firestore:', err.message || err);
      });
    }

    this.recalculateAndNotify();
    this.dispatchLocalEvent();
  }

  async deletePayment(paymentId) {
    const strId = String(paymentId);
    this.payments = this.payments.filter((p) => String(p.id) !== strId);

    if (db) {
      deleteDoc(doc(db, 'payments', strId)).catch((err) => {
        console.warn('Could not delete payment from Firestore:', err.message || err);
      });
    }

    this.recalculateAndNotify();
    this.dispatchLocalEvent();
  }

  dispatchLocalEvent() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(FINANCE_EVENT));
    }
  }
}

export const firestoreFinanceService = new FirestoreFinanceService();

