import { X, Printer, Bluetooth, Usb, FileText, CheckCircle2, Share2, Download, MessageCircle, RefreshCw, Trash2, FileDown } from 'lucide-react';
import { formatCurrency, cn, formatPhone } from '../lib/utils';
import { type Invoice, type Profile } from '../db';
import { ThermalPrinterService } from '../services/ThermalPrinterService';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { domToPng } from 'modern-screenshot';
import { jsPDF } from 'jspdf';

import { InvoiceView, type InvoiceTheme } from './InvoiceView';
import { WhatsAppIcon } from './WhatsAppIcon';

export function PrintModal({ 
  invoice, 
  profile, 
  onClose,
  autoPrint = false
}: { 
  invoice: Invoice; 
  profile: Profile | undefined; 
  onClose: () => void;
  autoPrint?: boolean;
}) {
  const [isThermalMode, setIsThermalMode] = useState(false);
  const [theme, setTheme] = useState<InvoiceTheme>(invoice.type === 'quotation' ? 'tabular' : (profile?.invoiceTheme || 'modern'));
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);
  const [printerStatus, setPrinterStatus] = useState<{type: 'bt' | 'usb' | null, name: string | null}>({type: null, name: null});
  const [supportStatus, setSupportStatus] = useState({ bluetooth: true, usb: true });
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSupportStatus({
      bluetooth: 'bluetooth' in navigator,
      usb: 'usb' in navigator
    });
  }, []);

  const handleStandardPrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 200);
  };

  const handleDownloadPDF = async () => {
    if (!invoiceRef.current) return;
    setIsDownloading(true);
    try {
      const dataUrl = await domToPng(invoiceRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        width: 800
      });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${invoice.type === 'quotation' ? 'Quotation' : 'Invoice'}-${invoice.invoiceNumber}.pdf`);
      
      setPrintSuccess(true);
      setTimeout(() => setPrintSuccess(false), 3000);
    } catch (error) {
      console.error('PDF export error:', error);
      alert('Failed to generate PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    if (autoPrint) {
      handleStandardPrint();
    }
  }, [autoPrint]);

  const handleShareImage = async () => {
    if (!invoiceRef.current) return;
    setIsSharing(true);
    
    try {
      const dataUrl = await domToPng(invoiceRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        width: isThermalMode ? 400 : 800
      });
      
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `${invoice.type === 'quotation' ? 'quotation' : 'invoice'}-${invoice.invoiceNumber}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${invoice.type === 'quotation' ? 'Quotation' : 'Invoice'} ${invoice.invoiceNumber}`,
          text: `${invoice.type === 'quotation' ? 'Quotation' : 'Invoice'} from ${profile?.businessName || 'Quin'}`
        });
      } else {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${invoice.type === 'quotation' ? 'quotation' : 'invoice'}-${invoice.invoiceNumber}.png`;
        link.click();
      }
    } catch (error) {
      if ((error as any).name !== 'AbortError') {
        console.error('Error sharing image:', error);
        alert('Failed to share image. Your browser might not support sharing files.');
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handleBluetoothPrint = async () => {
    try {
      setIsPrinting(true);
      await ThermalPrinterService.printBluetooth(invoice, profile);
      setPrintSuccess(true);
      setPrinterStatus({type: 'bt', name: 'Bluetooth Printer'});
      setTimeout(() => setPrintSuccess(false), 3000);
    } catch (error: any) {
      console.error('BT Print error:', error);
      if (error && error.message && error.message.includes('User cancelled')) return;
      alert('Bluetooth printing failed.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleUSBPrint = async () => {
    try {
      setIsPrinting(true);
      await ThermalPrinterService.printUSB(invoice, profile);
      setPrintSuccess(true);
      setPrinterStatus({type: 'usb', name: 'USB Printer'});
      setTimeout(() => setPrintSuccess(false), 3000);
    } catch (error: any) {
      console.error('USB Print error:', error);
      if (error && error.message && error.message.includes('User cancelled')) return;
      alert('USB printing failed.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDisconnect = async () => {
    await ThermalPrinterService.disconnect();
    setPrinterStatus({type: null, name: null});
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 no-print">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row"
        >
          {/* Sidebar Controls */}
          <div className="w-full md:w-80 bg-slate-50 border-r border-slate-200 p-8 space-y-6 overflow-y-auto">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-900">
                {invoice.type === 'quotation' ? 'Quotation Preview' : 'Invoice Preview'}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Output Format Toggle */}
              <div className="p-1 bg-slate-200 rounded-xl flex gap-1">
                <button 
                  onClick={() => setIsThermalMode(false)}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                    !isThermalMode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  )}
                >
                  Document (A4)
                </button>
                <button 
                  onClick={() => setIsThermalMode(true)}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                    isThermalMode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  )}
                >
                  Thermal
                </button>
              </div>

              {/* Main Actions */}
              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={handleStandardPrint}
                  disabled={isPrinting}
                  className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50"
                >
                  <Printer size={18} />
                  {isPrinting ? 'Printing...' : 'System Print'}
                </button>

                {!isThermalMode && (
                  <button 
                    onClick={handleDownloadPDF}
                    disabled={isDownloading}
                    className="w-full bg-white text-slate-900 border border-slate-200 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"
                  >
                    {isDownloading ? (
                      <RefreshCw size={18} className="animate-spin text-indigo-600" />
                    ) : (
                      <FileDown size={18} className="text-indigo-600" />
                    )}
                    {isDownloading ? 'Generating PDF...' : 'Download PDF'}
                  </button>
                )}

                <button 
                  onClick={handleShareImage}
                  disabled={isSharing}
                  className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50"
                >
                  {isSharing ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : (
                    <WhatsAppIcon size={20} />
                  )}
                  Share on WhatsApp
                </button>
              </div>

              {/* Thermal Section */}
              {isThermalMode && (
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ESC/POS Printer</p>
                    {printerStatus.type && (
                      <button onClick={handleDisconnect} className="text-[10px] text-red-500 font-bold hover:underline">Disconnect</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={handleBluetoothPrint} 
                      disabled={!supportStatus.bluetooth}
                      className={cn("py-3 rounded-xl font-bold text-[10px] flex flex-col items-center gap-1 border transition-all", 
                        printerStatus.type === 'bt' ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-200 text-slate-600")}
                    >
                      <Bluetooth size={16} />
                      Bluetooth
                    </button>
                    <button 
                      onClick={handleUSBPrint} 
                      disabled={!supportStatus.usb}
                      className={cn("py-3 rounded-xl font-bold text-[10px] flex flex-col items-center gap-1 border transition-all", 
                        printerStatus.type === 'usb' ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-200 text-slate-600")}
                    >
                      <Usb size={16} />
                      USB Wired
                    </button>
                  </div>
                </div>
              )}
            </div>

            <AnimatePresence>
              {printSuccess && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl border border-emerald-100 flex items-center gap-3"
                >
                  <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
                  <span className="text-xs font-bold">Successfully generated!</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Document Display Area */}
          <div className="flex-1 bg-slate-100 p-4 md:p-12 overflow-y-auto flex flex-col items-center">
            <div className="w-full flex justify-end mb-4 animate-pulse">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Final Document Preview</span>
            </div>
            <div 
              ref={invoiceRef}
              className={cn(
                "bg-white shadow-2xl transition-all duration-300 origin-top",
                isThermalMode ? "w-[72mm] min-h-[100mm]" : "w-full max-w-[210mm] min-h-[297mm]"
              )}
            >
              <InvoiceView invoice={invoice} profile={profile} isThermalMode={isThermalMode} theme={theme} />
            </div>
          </div>
        </motion.div>
      </div>

      {createPortal(
        <div className="print-only">
          <div className={cn(
            "bg-white mx-auto invoice-container",
            isThermalMode ? "w-[72mm]" : "w-full"
          )}>
            <InvoiceView invoice={invoice} profile={profile} isThermalMode={isThermalMode} theme={theme} />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
