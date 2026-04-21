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
  
  if (activeTheme === 'tabular' && !isThermalMode) {
    return (
      <div className="w-[800px] bg-white p-8 text-black font-sans mx-auto min-h-[1000px]">
        {/* Header section matching image */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-2">
            {/* Mock Logo / Branding matching OST Painting tools layout */}
            <div className="border border-black px-4 py-2 font-black text-2xl tracking-tighter flex items-center">
               <span className="text-3xl">O</span>
               <span className="text-3xl">S</span>
               <span className="text-3xl">T</span>
            </div>
          </div>
          <div className="text-sm font-medium pt-8 mt-4 flex gap-2">
            <span>Date:</span>
            <span>{new Date(invoice.date).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="text-center font-bold text-sm mb-2 border-b border-black pb-2">
          Party Name : {invoice.customerName}{invoice.customerMobile ? `, ${invoice.customerMobile}` : ''}
        </div>
        
        <div className="text-center font-bold text-md mb-2">
          QUOTATION
        </div>

        {/* Tabular data matching image exactly */}
        <div className="border-t border-l border-r border-black flex flex-col w-full text-xs font-medium">
          {/* Table Header */}
          <div className="grid grid-cols-[40px_1fr_60px_40px_80px_100px] border-b border-black font-bold items-center text-[10px]">
            <div className="border-r border-black p-1 text-center h-full flex items-center justify-center">Sr.</div>
            <div className="border-r border-black p-1 text-center h-full flex items-center justify-center">Items</div>
            <div className="border-r border-black p-1 text-center col-span-2 h-full flex items-center justify-center">Qty.</div>
            <div className="border-r border-black p-1 text-center h-full flex items-center justify-center">Rate</div>
            <div className="p-1 text-center h-full flex items-center justify-center">Amount</div>
          </div>

          {/* Table Rows */}
          {Array.from({ length: Math.max(15, invoice.items.length) }).map((_, i) => {
            const item = invoice.items[i];
            return (
              <div key={i} className="grid grid-cols-[40px_1fr_60px_40px_80px_100px] border-b border-black min-h-[24px]">
                <div className="border-r border-black p-1 text-center flex items-center justify-center">{item ? i + 1 : '\u00A0'}</div>
                <div className="border-r border-black p-1 flex items-center">{item ? item.name : '\u00A0'}</div>
                <div className="p-1 text-center flex items-center justify-center">{item ? item.quantity : '\u00A0'}</div>
                <div className="border-r border-black p-1 text-center text-[9px] flex items-center justify-center">{item ? 'Pcs' : '\u00A0'}</div>
                <div className="border-r border-black p-1 text-center flex items-center justify-center">{item ? item.price : '\u00A0'}</div>
                <div className="p-1 text-center flex items-center justify-center">{item ? formatCurrency(item.total).replace('₹', '') : '\u00A0'}</div>
              </div>
            );
          })}

          {/* Bottom Totals area */}
          <div className="grid grid-cols-[40px_1fr_60px_40px_80px_100px]">
            {/* Blank left sections */}
            <div className="border-r border-black col-span-4 border-b border-black"></div>
            
            {/* Totals Right side text */}
            <div className="border-r border-black border-b border-black p-1 font-bold text-center text-[10px] flex items-center justify-center">Sub Total</div>
            <div className="p-1 text-center border-b border-black font-bold flex items-center justify-center">
              {formatCurrency(invoice.subtotal).replace('₹', '')}
            </div>
            
            <div className="border-r border-black col-span-4 border-b border-black"></div>
            <div className="border-r border-black border-b border-black p-1 font-bold text-center text-[10px] flex items-center justify-center">
              GST {invoice.taxPercentage || 18}%
            </div>
            <div className="p-1 text-center border-b border-black font-bold flex items-center justify-center">
              {formatCurrency(invoice.tax > 0 ? invoice.tax : ((invoice.subtotal * (invoice.taxPercentage || 18)) / 100)).replace('₹', '')}
            </div>

            <div className="border-r border-black col-span-4 border-b border-black"></div>
            <div className="border-r border-black border-b border-black p-1 font-bold text-center text-[10px] flex items-center justify-center">
              ROUND OFF
            </div>
            <div className="p-1 text-center border-b border-black font-bold flex items-center justify-center">
               0.00
            </div>

            <div className="col-span-4 border-r border-black"></div>
            <div className="border-r border-black p-1 font-bold text-center text-[10px] flex items-center justify-center">GRAND TOTAL</div>
            <div className="p-1 text-center font-bold flex items-center justify-center">
              {formatCurrency(invoice.total).replace('₹', '')}
            </div>
          </div>
          <div className="border-t border-black w-full"></div>
        </div>
      </div>
    );
  }

  const getThemeStyles = () => {
    switch (activeTheme) {
      case 'classic':
        return {
          container: "font-serif",
          header: "border-b-4 border-double border-slate-900 pb-6 mb-8",
          title: "text-5xl uppercase tracking-widest",
          accent: "text-slate-900",
          tableHeader: "border-y border-slate-900 bg-slate-50",
          footer: "border-t-4 border-double border-slate-900 mt-12 pt-8"
        };
      case 'minimal':
        return {
          container: "font-sans tracking-tight",
          header: "mb-12",
          title: "text-2xl font-light text-slate-400 uppercase tracking-[0.2em]",
          accent: "text-slate-400",
          tableHeader: "text-slate-400 font-normal border-b border-slate-100",
          footer: "mt-24 pt-8 text-slate-300"
        };
      case 'bold':
        return {
          container: "font-sans",
          header: "bg-slate-900 text-white p-8 -mx-8 -mt-8 mb-8 flex justify-between items-center",
          title: "text-6xl font-black italic",
          accent: "text-emerald-500",
          tableHeader: "bg-slate-900 text-white",
          footer: "bg-slate-900 text-white p-8 -mx-8 -mb-8 mt-12"
        };
      case 'elegant':
        return {
          container: "font-serif italic",
          header: "flex flex-col items-center text-center mb-12 border-b border-amber-200 pb-8",
          title: "text-4xl font-light text-amber-700 mb-4",
          accent: "text-amber-600",
          tableHeader: "border-b border-amber-100 text-amber-800",
          footer: "mt-16 pt-8 border-t border-amber-100 text-amber-400"
        };
      default: // modern
        return {
          container: "font-sans",
          header: "flex justify-between items-start mb-8",
          title: "text-4xl font-bold",
          accent: "text-slate-500",
          tableHeader: "border-b-2 border-slate-900",
          footer: "mt-12 pt-8 border-t border-slate-100"
        };
    }
  };

  const styles = getThemeStyles();

  if (isThermalMode) {
    return (
      <div className="text-black text-[10px] font-mono">
        <div className="text-center mb-4">
          <h1 className="text-lg font-bold">{invoice.type === 'quotation' ? 'QUOTATION' : 'INVOICE'}</h1>
          <p>#{invoice.invoiceNumber}</p>
          <h2 className="text-base font-bold mt-2">{profile?.businessName || 'Quin Inc.'}</h2>
          <p className="whitespace-pre-line">{profile?.address}</p>
          {profile?.phone && <p>{formatPhone(profile.phone)}</p>}
        </div>

        <div className="mb-4 border-t border-b border-dashed py-2">
          <p><strong>Bill To:</strong> {invoice.customerName}</p>
          <p>{formatPhone(invoice.customerMobile || '')}</p>
          <p><strong>Date:</strong> {new Date(invoice.date).toLocaleDateString()}</p>
        </div>

        <table className="w-full mb-4">
          <thead className="border-b border-dashed">
            <tr className="text-left">
              <th className="py-1">Item</th>
              <th className="py-1 text-right">Qty</th>
              <th className="py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dashed divide-slate-200">
            {invoice.items.map((item, i) => (
              <tr key={i}>
                <td className="py-1">{item.name}</td>
                <td className="py-1 text-right">{item.quantity}</td>
                <td className="py-1 text-right">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="space-y-1 border-t border-dashed pt-2">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCurrency(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between font-bold text-sm">
            <span>Total</span>
            <span>{formatCurrency(invoice.total)}</span>
          </div>
          {invoice.receivedAmount > 0 && invoice.type !== 'quotation' && (
            <div className="flex justify-between text-[8px] uppercase">
              <span>Paid via {invoice.paymentMethod}</span>
              <span>{formatCurrency(invoice.receivedAmount)}</span>
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-[8px]">
          Thank you for your business!
        </div>
      </div>
    );
  }

  return (
    <div className={cn("text-black p-8 bg-white min-h-[800px]", styles.container)}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={cn("mb-1", styles.title)}>{invoice.type === 'quotation' ? 'QUOTATION' : 'INVOICE'}</h1>
          <p className={styles.accent}>#{invoice.invoiceNumber}</p>
        </div>
        <div className={activeTheme === 'bold' ? "text-right" : activeTheme === 'elegant' ? "mt-4" : "text-right"}>
          <h2 className={cn("font-bold", activeTheme === 'bold' ? "text-3xl" : "text-xl")}>{profile?.businessName || 'Quin Inc.'}</h2>
          <p className={cn("whitespace-pre-line", styles.accent)}>{profile?.address}</p>
          {profile?.phone && <p className={styles.accent}>{formatPhone(profile.phone)}</p>}
          {profile?.gstin && <p className="font-bold mt-1">GSTIN: {profile.gstin}</p>}
        </div>
      </div>

      {/* Customer Info */}
      <div className={cn("grid gap-8 mb-12", activeTheme === 'elegant' ? "grid-cols-1 text-center" : "grid-cols-2")}>
        <div>
          <h3 className="text-[10px] font-bold uppercase opacity-50 mb-1">Bill To</h3>
          <p className="font-bold text-lg">{invoice.customerName}</p>
          <p className={styles.accent}>{formatPhone(invoice.customerMobile || '')}</p>
          {invoice.customerGstin && <p className="font-bold mt-1">GSTIN: {invoice.customerGstin}</p>}
        </div>
        <div className={activeTheme === 'elegant' ? "" : "text-right"}>
          <h3 className="text-[10px] font-bold uppercase opacity-50 mb-1">Date</h3>
          <p className="font-bold">{new Date(invoice.date).toLocaleDateString()}</p>
          {invoice.isGstInvoice && <p className={cn("mt-1", styles.accent)}>State of Supply: {invoice.stateOfSupply}</p>}
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full mb-12 border-collapse">
        <thead>
          <tr className={cn("text-left uppercase text-[10px] tracking-wider", styles.tableHeader)}>
            <th className="py-4 px-2">Item</th>
            {invoice.isGstInvoice && <th className="py-4 px-2">HSN</th>}
            <th className="py-4 px-2 text-right">Price</th>
            <th className="py-4 px-2 text-right">Qty</th>
            {invoice.isGstInvoice && <th className="py-4 px-2 text-right">GST %</th>}
            <th className="py-4 px-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className={cn("divide-y", activeTheme === 'minimal' ? "divide-slate-50" : "divide-slate-100")}>
          {invoice.items.map((item, i) => (
            <tr key={i} className={activeTheme === 'bold' && i % 2 === 0 ? "bg-slate-50" : ""}>
              <td className="py-4 px-2 font-medium">{item.name}</td>
              {invoice.isGstInvoice && <td className="py-4 px-2 opacity-60">{item.hsnCode || '-'}</td>}
              <td className="py-4 px-2 text-right">{formatCurrency(item.price)}</td>
              <td className="py-4 px-2 text-right">{item.quantity}</td>
              {invoice.isGstInvoice && <td className="py-4 px-2 text-right">{item.gstRate}%</td>}
              <td className="py-4 px-2 text-right font-bold">{formatCurrency(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-72 space-y-2">
          <div className="flex justify-between">
            <span className="opacity-60">Subtotal</span>
            <span>{formatCurrency(invoice.subtotal)}</span>
          </div>
          {invoice.isGstInvoice ? (
            <>
              {invoice.cgstTotal ? (
                <>
                  <div className="flex justify-between">
                    <span className="opacity-60">CGST</span>
                    <span>{formatCurrency(invoice.cgstTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">SGST</span>
                    <span>{formatCurrency(invoice.sgstTotal)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between">
                  <span className="opacity-60">IGST</span>
                  <span>{formatCurrency(invoice.igstTotal || 0)}</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex justify-between">
              <span className="opacity-60">Tax ({invoice.taxPercentage ?? 10}%)</span>
              <span>{formatCurrency(invoice.tax)}</span>
            </div>
          )}
          <div className={cn("flex justify-between font-bold pt-4 border-t-2", activeTheme === 'bold' ? "border-slate-900 text-2xl" : "border-slate-900 text-xl")}>
            <span>Total</span>
            <span className={activeTheme === 'elegant' ? "text-amber-700" : ""}>{formatCurrency(invoice.total)}</span>
          </div>
          {invoice.type !== 'quotation' && (
            <>
              <div className="flex justify-between pt-2 opacity-60">
                <span>Received</span>
                <span>{formatCurrency(invoice.receivedAmount)}</span>
              </div>
              {invoice.receivedAmount > 0 && (
                <div className="flex justify-between pt-1 text-[10px] uppercase font-bold text-slate-400">
                  <span>Method</span>
                  <span>{invoice.paymentMethod}</span>
                </div>
              )}
              {invoice.creditAmount > 0 && (
                <div className="flex justify-between text-red-600 font-bold bg-red-50 px-2 py-1 rounded">
                  <span>Balance Credit</span>
                  <span>{formatCurrency(invoice.creditAmount)}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className={cn("text-center text-xs", styles.footer)}>
        <p className="font-bold mb-1">Thank you for your business!</p>
        <p className="opacity-60">Terms & Conditions apply. This is a computer generated {invoice.type === 'quotation' ? 'quotation' : 'invoice'}.</p>
      </div>
    </div>
  );
}
