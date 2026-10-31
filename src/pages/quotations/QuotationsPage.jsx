import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Pencil, Trash2, Filter, Bookmark, FileText } from 'lucide-react';
import { quotationService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader, SearchInput } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button, IconButton } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { Modal, ConfirmModal } from '../../components/ui/Modal';
import { formatCurrency } from '../../utils/quotationCalculations';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
];

export default function QuotationsPage() {
  const addToast = useToast();
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Templates modal
  const [templates, setTemplates] = useState([]);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);

  // Delete modal
  const [deleteModal, setDeleteModal] = useState({ open: false, quotation: null });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchQuotations = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== 'ALL') params.status = statusFilter;
      const res = await quotationService.getAll(params);
      const list = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setQuotations(list);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load quotations'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(fetchQuotations, 250);
    return () => clearTimeout(t);
  }, [fetchQuotations]);

  // Load templates for template preview
  useEffect(() => {
    if (quotationService.getTemplates) {
      quotationService
        .getTemplates()
        .then((res) => setTemplates(Array.isArray(res.data) ? res.data : []))
        .catch(() => {});
    }
  }, []);

  const handleDelete = async () => {
    if (!deleteModal.quotation) return;
    setActionLoading(true);
    try {
      await quotationService.delete(deleteModal.quotation.id);
      addToast('Quotation deleted successfully', 'info');
      fetchQuotations();
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to delete quotation'), 'error');
    } finally {
      setActionLoading(false);
      setDeleteModal({ open: false, quotation: null });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Quotations"
        subtitle={`${quotations.length} pricing proposal(s) and estimates`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setTemplatesModalOpen(true)}>
              <Bookmark className="w-4 h-4" /> Templates
            </Button>
            <Button onClick={() => navigate('/quotations/new')}>
              <Plus className="w-4 h-4" /> New Quotation
            </Button>
          </div>
        }
      />

      <Card>
        {/* Search & Filter Controls */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by quote #, client, company or notes..."
              className="w-full"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {STATUS_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quotations Table */}
        <Table>
          <TableHead>
            <Th>Quotation #</Th>
            <Th>Customer & Company</Th>
            <Th>Issue Date</Th>
            <Th>Valid Until</Th>
            <Th>Subtotal</Th>
            <Th>Tax</Th>
            <Th>Total</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={9} rows={5} />
          ) : quotations.length === 0 ? (
            <TableEmpty message="No quotations found matching your criteria." cols={9} />
          ) : (
            <TableBody>
              {quotations.map((q) => {
                const isDraft = (q.status || '').toUpperCase() === 'DRAFT';
                const isSent = (q.status || '').toUpperCase() === 'SENT';
                const canEdit = isDraft || isSent;

                return (
                  <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                    <Td className="font-mono text-xs font-semibold text-slate-900">
                      <button
                        type="button"
                        onClick={() => navigate(`/quotations/${q.id}`)}
                        className="hover:text-blue-600 transition-colors"
                      >
                        {q.quotation_number || q.reference || `QT-${q.id}`}
                      </button>
                    </Td>
                    <Td>
                      <div className="font-medium text-slate-900">{q.customer_name || q.customer?.name || '—'}</div>
                      {q.company && <div className="text-xs text-slate-400">{q.company}</div>}
                    </Td>
                    <Td>{formatDate(q.created_at || q.date)}</Td>
                    <Td>{formatDate(q.valid_until)}</Td>
                    <Td>{formatCurrency(q.subtotal)}</Td>
                    <Td>{formatCurrency(q.tax_amount ?? q.tax)}</Td>
                    <Td className="font-semibold text-slate-900">{formatCurrency(q.total)}</Td>
                    <Td>
                      <StatusBadge status={q.status} />
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <IconButton
                          icon={Eye}
                          label="View quotation"
                          onClick={() => navigate(`/quotations/${q.id}`)}
                          className="text-slate-500 hover:text-blue-600"
                        />
                        {canEdit && (
                          <IconButton
                            icon={Pencil}
                            label="Edit quotation"
                            onClick={() => navigate(`/quotations/${q.id}/edit`)}
                          />
                        )}
                        {isDraft && (
                          <IconButton
                            icon={Trash2}
                            label="Delete draft"
                            onClick={() => setDeleteModal({ open: true, quotation: q })}
                            className="text-red-400 hover:text-red-600"
                          />
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </TableBody>
          )}
        </Table>
      </Card>

      {/* Quotation Templates Preview Modal */}
      <Modal
        isOpen={templatesModalOpen}
        onClose={() => setTemplatesModalOpen(false)}
        title="Quotation Templates Library"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Use these standardized templates to accelerate quote creation with preset bundles, pricing formulas, and validity terms.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {templates.map((tmpl) => (
              <div key={tmpl.id} className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">{tmpl.name}</h4>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                    {tmpl.validity_days || 14} Days Validity
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{tmpl.description}</p>
                {tmpl.notes && (
                  <p className="text-[11px] text-slate-400 italic border-t border-slate-200/60 pt-1.5">
                    "{tmpl.notes}"
                  </p>
                )}
                <div className="pt-2 flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => {
                      setTemplatesModalOpen(false);
                      navigate('/quotations/new');
                    }}
                  >
                    Use Template in New Quote
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setTemplatesModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Draft Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, quotation: null })}
        onConfirm={handleDelete}
        title="Delete Draft Quotation"
        message={`Are you sure you want to permanently delete quotation ${deleteModal.quotation?.quotation_number || deleteModal.quotation?.id}?`}
        confirmLabel="Delete Quotation"
        variant="danger"
        loading={actionLoading}
      />
    </div>
  );
}