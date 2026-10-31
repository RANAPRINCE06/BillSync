import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Layers, Pencil, Tag, DollarSign, FileText } from 'lucide-react';

function formatCurrency(val) {
  if (val === undefined || val === null || isNaN(val)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
}

export function ProductViewModal({ isOpen, onClose, product, onEdit }) {
  if (!product) return null;

  const basePrice = Number(product.sales_price ?? product.price ?? 0);
  const costPrice = Number(product.cost_price ?? 0);
  const margin = basePrice - costPrice;
  const marginPct = basePrice > 0 ? ((margin / basePrice) * 100).toFixed(1) : 0;
  const variants = product.variants || [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Product Offering Details" size="lg">
      <div className="space-y-5">
        {/* Top Header Information */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">{product.name}</h3>
              <Badge
                label={product.is_active !== false ? 'Active' : 'Inactive'}
                variant={product.is_active !== false ? 'success' : 'default'}
              />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={product.product_type || product.type} />
              <span className="text-xs text-slate-400 font-mono">ID: {product.id}</span>
            </div>
          </div>

          {onEdit && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onClose();
                onEdit(product);
              }}
            >
              <Pencil className="w-3.5 h-3.5" /> Edit Product
            </Button>
          )}
        </div>

        {/* Pricing Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Base Sales Price</span>
            <div className="text-lg font-bold text-slate-900 mt-0.5">{formatCurrency(basePrice)}</div>
            <span className="text-[11px] text-slate-400">Baseline single unit charge</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Unit Cost Price</span>
            <div className="text-lg font-bold text-slate-700 mt-0.5">{formatCurrency(costPrice)}</div>
            <span className="text-[11px] text-slate-400">Cost of goods / fulfillment</span>
          </div>
          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
            <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">Unit Margin</span>
            <div className="text-lg font-bold text-emerald-700 mt-0.5">{formatCurrency(margin)}</div>
            <span className="text-[11px] text-emerald-600 font-medium">{marginPct}% gross margin</span>
          </div>
        </div>

        {/* Descriptions & Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Tag className="w-3.5 h-3.5 text-slate-400" /> Public Description
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {product.description || <span className="italic text-slate-400">No public description provided.</span>}
            </p>
          </div>

          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/40 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
              <FileText className="w-3.5 h-3.5 text-amber-600" /> Internal / Admin Notes
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {product.notes || <span className="italic text-slate-400">No internal notes added.</span>}
            </p>
          </div>
        </div>

        {/* Product Variants Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm font-semibold text-slate-900">Product Variants & Pricing Breakdown</h4>
            </div>
            <span className="text-xs text-slate-500">
              {variants.length} variant{variants.length === 1 ? '' : 's'} configured
            </span>
          </div>

          {variants.length === 0 ? (
            <div className="p-4 text-center bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs text-slate-500">No custom variants configured for this product.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Standard single offering at Base Sales Price {formatCurrency(basePrice)}.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Variant Name</th>
                    <th className="px-3 py-2">SKU Code</th>
                    <th className="px-3 py-2 text-right">Base Price</th>
                    <th className="px-3 py-2 text-right">Additional Price</th>
                    <th className="px-3 py-2 text-right font-bold text-slate-900">Final Displayed Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {variants.map((v, i) => {
                    const addlPrice = Number(v.additional_price ?? Math.max(0, (v.price ?? basePrice) - basePrice));
                    const finalPrice = Number(v.final_price ?? basePrice + addlPrice);
                    return (
                      <tr key={v.id || i} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2.5 font-medium text-slate-900">{v.name}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-500">{v.sku || '—'}</td>
                        <td className="px-3 py-2.5 text-right text-slate-500">{formatCurrency(basePrice)}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-blue-600">
                          +{formatCurrency(addlPrice)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-700">
                          {formatCurrency(finalPrice)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end pt-3 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
