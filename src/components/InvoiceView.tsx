import { formatCurrency, formatPhone } from '../lib/utils';
import { type Invoice, type Profile } from '../db';
import { cn } from '../lib/utils';

export type InvoiceTheme = 'modern' | 'classic' | 'minimal' | 'bold' | 'elegant' | 'tabular';

export function InvoiceView({ 
  invoice, 
  profile, 
  isThermalMode = false,
  theme
}: { 
  invoice: Invoice; 
  profile: Profile | undefined; 
  isThermalMode?: boolean;
  theme?: InvoiceTheme;
}) {
  const activeTheme = theme || profile?.invoiceTheme || 'modern';
  
  if (isThermalMode) {
    return (
      <div className="text-black font-mono p-1 leading-tight text-[11px] w-[72mm] mx-auto bg-white">
        <div className="text-center mb-2 border-b border-dashed border-black pb-2">
          <h1 className="text-sm font-bold uppercase">{profile?.businessName || 'INVOICE'}</h1>
          <p className="text-[9px] uppercase">{profile?.address}</p>
          {profile?.phone && <p>Ph: {formatPhone(profile.phone)}</p>}
          {profile?.gstin && <p className="text-[9px]">GSTIN: {profile.gstin}</p>}
        </div>

        <div className="flex justify-between text-[10px] mb-2">
          <span>Bill No: {invoice.invoiceNumber}</span>
          <span>{new Date(invoice.date).toLocaleDateString()}</span>
        </div>
        
        <div className="mb-2 border-b border-dashed border-black pb-1">
          <p className="font-bold">Party: {invoice.customerName}</p>
          {invoice.customerMobile && <p>Mob: {invoice.customerMobile}</p>}
        </div>

        <table className="w-full text-left mb-2">
          <thead className="border-b border-dashed border-black">
            <tr>
              <th className="py-1">Item</th>
              <th className="py-1 text-right">Qty</th>
              <th className="py-1 text-right">Price</th>
              <th className="py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dashed divide-gray-200">
            {invoice.items.map((item, i) => (
              <tr key={i}>
                <td className="py-1 max-w-[100px] truncate">{item.name}</td>
                <td className="py-1 text-right">{item.quantity}</td>
                <td className="py-1 text-right">{item.price.toFixed(2)}</td>
                <td className="py-1 text-right">{item.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-dashed border-black pt-2 space-y-1">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>{formatCurrency(invoice.subtotal)}</span>
          </div>
          {invoice.tax > 0 && (
            <div className="flex justify-between">
              <span>Tax:</span>
              <span>{formatCurrency(invoice.tax)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-sm border-t border-dashed border-black mt-1 pt-1">
            <span>GRAND TOTAL:</span>
            <span>{formatCurrency(invoice.total)}</span>
          </div>
          {invoice.receivedAmount > 0 && (
            <div className="border-t border-dashed border-black mt-1 pt-1 text-[9px]">
              <p className="font-bold">PAID DETAILS:</p>
              {invoice.paymentMethod === 'split' && invoice.splitPayments ? (
                invoice.splitPayments.map((p, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="uppercase">{p.method}:</span>
                    <span>{formatCurrency(p.amount)}</span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between">
                  <span className="uppercase">{invoice.paymentMethod}:</span>
                  <span>{formatCurrency(invoice.receivedAmount)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 text-center text-[9px] border-t border-dashed border-black pt-2">
          <p>THANKS FOR VISITING!</p>
          <p>This is a computer generated bill.</p>
        </div>
      </div>
    );
  }

  // A4 Professional Layout (GST Compatible)
  return (
    <div className="text-black bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto font-sans p-[15mm] print:p-0 relative">
      {/* Header Info */}
      <div className="flex justify-between items-start mb-8 border-b-2 border-indigo-600 pb-6">
        <div className="flex gap-6 items-start max-w-[70%]">
          {profile?.logo && (
            <img src={profile.logo} alt="Business Logo" className="w-20 h-20 object-contain rounded-lg border border-slate-100 bg-white shadow-sm" />
          )}
          <div>
            <h1 className="text-3xl font-black text-indigo-900 uppercase tracking-tighter mb-2 leading-none">
              {profile?.businessName || 'Business Name'}
            </h1>
            <div className="text-sm text-slate-600 space-y-1">
              <p className="whitespace-pre-line leading-relaxed">{profile?.address}</p>
              {profile?.phone && <p className="font-medium text-slate-800">Contact: {formatPhone(profile.phone)}</p>}
              {profile?.gstin && <p className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded inline-block mt-1 border border-slate-200">GSTIN: {profile.gstin}</p>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="bg-indigo-900 text-white px-6 py-2 rounded-xl inline-block mb-4 shadow-lg shadow-indigo-100">
            <h2 className="text-xl font-bold uppercase tracking-widest">{invoice.type === 'quotation' ? 'Quotation' : 'Tax Invoice'}</h2>
          </div>
          <div className="text-sm space-y-1">
            <p className="text-slate-500 uppercase text-[10px] font-bold tracking-wider">Document Details</p>
            <p><span className="text-slate-400">No:</span> <span className="font-bold text-slate-900">#{invoice.invoiceNumber}</span></p>
            <p><span className="text-slate-400">Date:</span> <span className="font-bold text-slate-900">{new Date(invoice.date).toLocaleDateString('en-IN')}</span></p>
            {invoice.type === 'quotation' && invoice.validityDate && (
              <p className="mt-2 pt-2 border-t border-slate-100"><span className="text-slate-400">Valid Until:</span> <br/><span className="font-black text-red-600">{new Date(invoice.validityDate).toLocaleDateString('en-IN')}</span></p>
            )}
          </div>
        </div>
      </div>

      {/* Party Details */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
          <h3 className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-2">Details of Receiver (Billed To)</h3>
          <p className="text-lg font-bold text-indigo-900">{invoice.customerName}</p>
          <div className="text-sm text-slate-600 mt-1 space-y-0.5">
            {invoice.customerAddress && <p className="whitespace-pre-line text-xs">{invoice.customerAddress}</p>}
            {invoice.customerMobile && <p>Phone: {invoice.customerMobile}</p>}
            {invoice.customerGstin && <p className="font-bold text-slate-900">GSTIN: {invoice.customerGstin}</p>}
          </div>
        </div>
        <div className="flex flex-col justify-center text-right pr-4">
          {invoice.isGstInvoice && (
            <div>
              <h3 className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-1">Place of Supply</h3>
              <p className="text-lg font-medium">{invoice.stateOfSupply || 'Local'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Items Table */}
      <div className="mb-8">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-indigo-900 text-white text-[10px] uppercase font-bold tracking-wider">
              <th className="py-3 px-4 rounded-tl-lg">#</th>
              <th className="py-3 px-4">Item Description</th>
              {invoice.isGstInvoice && <th className="py-3 px-4 text-center">HSN/SAC</th>}
              <th className="py-3 px-4 text-right">Qty</th>
              <th className="py-3 px-4 text-center">Unit</th>
              <th className="py-3 px-4 text-right">Rate</th>
              {invoice.isGstInvoice && <th className="py-3 px-4 text-right">GST %</th>}
              <th className="py-3 px-4 text-right rounded-tr-lg">Amount</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-slate-100 font-medium">
            {invoice.items.map((item, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="py-3 px-4 text-slate-400">{i + 1}</td>
                <td className="py-3 px-4 text-indigo-900">{item.name}</td>
                {invoice.isGstInvoice && <td className="py-3 px-4 text-center text-slate-500 font-mono text-xs">{item.hsnCode || '-'}</td>}
                <td className="py-3 px-4 text-right text-indigo-900">{item.quantity}</td>
                <td className="py-3 px-4 text-center text-slate-500 text-xs">{item.unit || 'pcs'}</td>
                <td className="py-3 px-4 text-right text-indigo-900">{formatCurrency(item.price).replace('₹', '')}</td>
                {invoice.isGstInvoice && <td className="py-3 px-4 text-right text-xs text-indigo-600">{item.gstRate}%</td>}
                <td className="py-3 px-4 text-right font-bold text-indigo-950">{formatCurrency(item.total).replace('₹', '')}</td>
              </tr>
            ))}
            {/* Blank rows to ensure table looks substantial if few items */}
            {invoice.items.length < 5 && Array.from({ length: 5 - invoice.items.length }).map((_, i) => (
              <tr key={`blank-${i}`} className="h-10">
                <td colSpan={invoice.isGstInvoice ? 7 : 5}></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary Section */}
      <div className="flex justify-between items-start gap-12">
        <div className="flex-1">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
            <h4 className="font-bold text-indigo-900 mb-2 uppercase tracking-wide">Terms & Conditions</h4>
            <ul className="list-disc pl-4 space-y-1 text-slate-600">
              <li>Please check items before leaving the counter.</li>
              <li>Goods once sold will not be taken back.</li>
              <li>Interest 18% p.a. will be charged if payment delayed.</li>
              <li>Subject to local jurisdiction.</li>
            </ul>
          </div>
          {invoice.receivedAmount > 0 && (
            <div className="mt-4 p-4 border border-emerald-100 bg-emerald-50 rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <h4 className="font-bold text-emerald-900 text-sm uppercase">Payment Details</h4>
              </div>
              {invoice.paymentMethod === 'split' && invoice.splitPayments ? (
                <div className="space-y-1 mt-2">
                  {invoice.splitPayments.map((p, i) => (
                    <div key={i} className="flex justify-between text-xs text-emerald-700">
                      <span className="uppercase font-medium">{p.method}</span>
                      <span className="font-bold">{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs text-emerald-900 border-t border-emerald-200 mt-1 pt-1 font-black">
                    <span>TOTAL RECEIVED</span>
                    <span>{formatCurrency(invoice.receivedAmount)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-emerald-700">Received {formatCurrency(invoice.receivedAmount)} via {invoice.paymentMethod}</p>
              )}
            </div>
          )}
        </div>
        
        <div className="w-80 space-y-2">
          <div className="flex justify-between text-sm py-1">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-medium text-slate-900">{formatCurrency(invoice.subtotal)}</span>
          </div>

          {invoice.discount ? (
            <div className="flex justify-between text-sm py-1">
              <span className="text-slate-500">Discount</span>
              <span className="font-medium text-emerald-600">-{formatCurrency(invoice.discount)}</span>
            </div>
          ) : null}
          
          {invoice.isGstInvoice ? (
            <div className="space-y-2 py-2 border-y border-slate-100">
              {(invoice.igstTotal && invoice.igstTotal > 0) ? (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">IGST Output</span>
                  <span className="font-medium text-slate-900">{formatCurrency(invoice.igstTotal || 0)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">CGST Output</span>
                    <span className="font-medium text-slate-900">{formatCurrency(invoice.cgstTotal || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">SGST Output</span>
                    <span className="font-medium text-slate-900">{formatCurrency(invoice.sgstTotal || 0)}</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex justify-between text-sm py-1">
              <span className="text-slate-500">Tax ({invoice.taxPercentage || 0}%)</span>
              <span className="font-medium text-slate-900">{formatCurrency(invoice.tax || 0)}</span>
            </div>
          )}

          <div className="flex justify-between text-xl font-black text-indigo-900 py-4 border-t-2 border-indigo-900">
            <span>Total</span>
            <span>{formatCurrency(invoice.total)}</span>
          </div>

          <div className="text-right space-y-1">
             <p className="text-[8px] text-slate-400 uppercase font-black">Amount in Words</p>
             <p className="text-[10px] italic text-slate-600">Rupees Only</p>
          </div>
          
          <div className="mt-12 pt-8 text-center relative">
            <div className="w-full border-t border-slate-200 mt-8 mb-2"></div>
            {profile?.signatureUrl && (
              <div className="absolute bottom-12 right-0 left-0 flex justify-center pointer-events-none">
                <img 
                  src={profile.signatureUrl} 
                  alt="Authorized Signature" 
                  className="h-16 object-contain mix-blend-multiply"
                />
              </div>
            )}
            <p className="text-[10px] font-bold uppercase text-slate-400">Authorized Signatory</p>
            <p className="text-xs font-bold text-indigo-900 mt-1">For {profile?.businessName}</p>
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-12 left-0 right-0 text-center opacity-30 pointer-events-none">
          <p className="text-xs font-bold text-slate-400">Software powered by Quin Quin Billing</p>
      </div>
    </div>
  );
}

