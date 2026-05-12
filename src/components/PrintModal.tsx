import { X, Printer, Bluetooth, Usb, FileText, CheckCircle2, Share2, Download, MessageCircle, RefreshCw, Trash2 } from 'lucide-react';
import { formatCurrency, cn, formatPhone } from '../lib/utils';
import { type Invoice, type Profile } from '../db';
import { ThermalPrinterService } from '../services/ThermalPrinterService';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { domToPng } from 'modern-screenshot';

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
  const [printImage, setPrintImage] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
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

  const handleStandardPrint = async () => {
    if (!invoiceRef.current) return;
    setIsPrinting(true);
    
    try {
      // Generate clean image of the invoice using modern-screenshot (handles oklch)
      const dataUrl = await domToPng(invoiceRef.current, {
        scale: 3, 
        backgroundColor: '#ffffff'
      });
      
      setPrintImage(dataUrl);
      
      // Short delay to allow state update and image render in hidden container
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          setPrintImage(null);
          setIsPrinting(false);
        }, 1000);
      }, 500);
    } catch (error) {
      console.error('Print image error:', error);
      // Fallback: Continue with standard print but log error
      // The CSS in index.css will handle the clean print as fallback
      window.print();
      setIsPrinting(false);
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

      // Try to share the image if supported
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${invoice.type === 'quotation' ? 'Quotation' : 'Invoice'} ${invoice.invoiceNumber}`,
          text: `${invoice.type === 'quotation' ? 'Quotation' : 'Invoice'} from ${profile?.businessName || 'Quin'}`
        });
      } else {
        // Fallback to download if sharing is not supported
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${invoice.type === 'quotation' ? 'quotation' : 'invoice'}-${invoice.invoiceNumber}.png`;
        link.click();
      }
    } catch (error) {
      if ((error as any).name !== 'AbortError') {
        console.error('Error sharing image:', error);
        alert('Failed to share image. Your browser might not support sharing files.');
      } else {
        console.log('Share was canceled by user');
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
      if (error && error.message && error.message.includes('User cancelled')) {
        return;
      }
      alert('Bluetooth printing failed. Make sure your printer is on and in pairing mode.');
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
      if (error && error.message && error.message.includes('User cancelled')) {
        return;
      }
      alert('USB printing failed. Make sure your printer is connected via USB.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleTestPrint = async (type: 'bluetooth' | 'usb') => {
    try {
      setIsPrinting(true);
      await ThermalPrinterService.testPrint(type);
      setPrintSuccess(true);
      setTimeout(() => setPrintSuccess(false), 3000);
    } catch (error: any) {
      if (error && error.message && error.message.includes('User cancelled')) {
        return;
      }
      alert('Test print failed. Check connection.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDisconnect = async () => {
    await ThermalPrinterService.disconnect();
    setPrinterStatus({type: null, name: null});
    alert('Printer disconnected');
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 no-print">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row"
        >
          {/* Sidebar Controls */}
          <div className="w-full md:w-80 bg-slate-50 border-r border-slate-200 p-8 space-y-8 overflow-y-auto">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-900">Print Options</h2>
              <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-1 bg-slate-200 rounded-xl">
                <button 
                  onClick={() => { setIsThermalMode(false); if(theme==='tabular') setTheme(profile?.invoiceTheme || 'modern'); }}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                    !isThermalMode && theme !== 'tabular' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  )}
                >
                  Standard (A4)
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
                {invoice.type === 'quotation' && (
                  <button 
                    onClick={() => { setIsThermalMode(false); setTheme('tabular'); }}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                      !isThermalMode && theme === 'tabular' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                    )}
                  >
                    Tabular (OST)
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <button 
                  onClick={handleStandardPrint}
                  disabled={isPrinting}
                  className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50"
                >
                  {isPrinting && !printImage ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : (
                    <Printer size={18} />
                  )}
                  {isPrinting && !printImage ? 'Generating...' : 'System Print'}
                </button>
                
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Direct Thermal (ESC/POS)</p>
                    {printerStatus.type && (
                      <button 
                        onClick={handleDisconnect}
                        className="text-[10px] text-red-500 font-bold hover:underline flex items-center gap-1"
                      >
                        <Trash2 size={10} />
                        Clear
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex gap-2">
                      <button 
                        onClick={handleBluetoothPrint}
                        disabled={isPrinting || !supportStatus.bluetooth}
                        className={cn(
                          "flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 border",
                          printerStatus.type === 'bt' ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-200 text-slate-900 hover:bg-slate-50"
                        )}
                      >
                        <Bluetooth size={18} className={printerStatus.type === 'bt' ? "text-blue-600" : "text-blue-500"} />
                        {!supportStatus.bluetooth ? 'BT Not Supported' : printerStatus.type === 'bt' ? 'Print (BT)' : 'Wireless (BT)'}
                      </button>
                      <button 
                        onClick={() => handleTestPrint('bluetooth')}
                        disabled={!supportStatus.bluetooth}
                        className="px-3 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all disabled:opacity-30"
                        title="Test Print"
                      >
                        <RefreshCw size={16} />
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <button 
                        onClick={handleUSBPrint}
                        disabled={isPrinting || !supportStatus.usb}
                        className={cn(
                          "flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 border",
                          printerStatus.type === 'usb' ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-200 text-slate-900 hover:bg-slate-50"
                        )}
                      >
                        <Usb size={18} className={printerStatus.type === 'usb' ? "text-white" : "text-slate-500"} />
                        {!supportStatus.usb ? 'USB Not Supported' : printerStatus.type === 'usb' ? 'Print (USB)' : 'Wired (USB)'}
                      </button>
                      <button 
                        onClick={() => handleTestPrint('usb')}
                        disabled={!supportStatus.usb}
                        className="px-3 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all disabled:opacity-30"
                        title="Test Print"
                      >
                        <RefreshCw size={16} />
                      </button>
                    </div>
                  </div>
                  {!supportStatus.bluetooth && !supportStatus.usb && (
                    <p className="text-[10px] text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-100">
                      Direct printing is not supported in this browser. Please use "System Print" or try Chrome/Edge.
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Share on WhatsApp</p>
                  <button 
                    onClick={handleShareImage}
                    disabled={isSharing}
                    className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50"
                  >
                    {isSharing ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <WhatsAppIcon size={20} />
                    )}
                    Send on WhatsApp
                  </button>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {printSuccess && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl border border-emerald-100 flex items-center gap-3"
                >
                  <CheckCircle2 size={20} className="text-emerald-500" />
                  <span className="text-sm font-medium">Print command sent!</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="pt-8 text-xs text-slate-400 leading-relaxed">
              <p className="font-bold text-slate-500 mb-1 uppercase tracking-widest">Help</p>
              <p>Use "System Print" for network or standard printers. Use "Wireless/Wired" for direct ESC/POS thermal printers.</p>
            </div>
          </div>

          {/* Preview Area */}
          <div className="flex-1 bg-slate-200 p-8 overflow-y-auto flex justify-center items-start">
            <div 
              id="print-area-internal"
              ref={invoiceRef}
              className={cn(
                "bg-white shadow-2xl transition-all duration-500 origin-top",
                isThermalMode ? "w-[80mm] p-4" : "w-[210mm] min-h-[297mm] p-0"
              )}
            >
              <InvoiceView invoice={invoice} profile={profile} isThermalMode={isThermalMode} theme={theme} />
            </div>
          </div>
        </motion.div>
      </div>

      {createPortal(
        <div className="print-only">
          {printImage ? (
            <div className="flex justify-center w-full">
              <img 
                src={printImage} 
                alt="Invoice" 
                className="w-full h-auto max-w-full"
                style={{ maxHeight: '100vh', objectFit: 'contain' }}
              />
            </div>
          ) : (
            <div className={cn(
              "bg-white mx-auto",
              isThermalMode ? "w-[80mm] p-4" : "w-full p-0"
            )}>
              <InvoiceView invoice={invoice} profile={profile} isThermalMode={isThermalMode} theme={theme} />
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
