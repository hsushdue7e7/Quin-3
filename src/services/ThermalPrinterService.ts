/**
 * Service to handle direct thermal printing via Web Bluetooth and Web USB.
 * Supports ESC/POS commands.
 */

import { formatPhone } from '../lib/utils';

export class ThermalPrinterService {
  private static ESC = 0x1b;
  private static GS = 0x1d;
  private static LF = 0x0a;

  private static bluetoothCharacteristic: any = null;
  private static usbDevice: any = null;

  /**
   * Connect to a Bluetooth thermal printer
   */
  static async connectBluetooth(forceNew = false) {
    if (!forceNew && this.bluetoothCharacteristic) {
      try {
        // Test if still connected
        await this.bluetoothCharacteristic.writeValue(new Uint8Array([this.ESC, 0x40]));
        return this.bluetoothCharacteristic;
      } catch (e) {
        this.bluetoothCharacteristic = null;
      }
    }

    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });

      const server = await device.gatt?.connect();
      const service = await server?.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service?.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

      this.bluetoothCharacteristic = characteristic;
      return characteristic;
    } catch (error) {
      console.error('Bluetooth connection failed:', error);
      throw error;
    }
  }

  /**
   * Connect to a USB thermal printer
   */
  static async connectUSB(forceNew = false) {
    if (!forceNew && this.usbDevice && this.usbDevice.opened) {
      return this.usbDevice;
    }

    try {
      const device = await (navigator as any).usb.requestDevice({
        filters: []
      });

      await device.open();
      await device.selectConfiguration(1);
      await device.claimInterface(0);

      this.usbDevice = device;
      return device;
    } catch (error) {
      console.error('USB connection failed:', error);
      throw error;
    }
  }

  /**
   * Disconnect all printers
   */
  static async disconnect() {
    if (this.bluetoothCharacteristic?.service?.device?.gatt?.connected) {
      this.bluetoothCharacteristic.service.device.gatt.disconnect();
    }
    if (this.usbDevice?.opened) {
      await this.usbDevice.close();
    }
    this.bluetoothCharacteristic = null;
    this.usbDevice = null;
  }

  /**
   * Test print to verify connection
   */
  static async testPrint(type: 'bluetooth' | 'usb') {
    const encoder = new TextEncoder();
    let commands = new Uint8Array([this.ESC, 0x40]); // Init
    
    // Center Align
    const center = new Uint8Array([this.ESC, 0x61, 0x01]);
    const text = encoder.encode('\n\nPRINTER TEST SUCCESSFUL\nQUIN INVOICE SYSTEM\n\n\n\n\n');
    const cut = new Uint8Array([this.GS, 0x56, 0x41, 0x03]);
    
    const fullCommands = new Uint8Array(commands.length + center.length + text.length + cut.length);
    fullCommands.set(commands);
    fullCommands.set(center, commands.length);
    fullCommands.set(text, commands.length + center.length);
    fullCommands.set(cut, commands.length + center.length + text.length);

    if (type === 'bluetooth') {
      const characteristic = await this.connectBluetooth();
      for (let i = 0; i < fullCommands.length; i += 20) {
        await characteristic?.writeValue(fullCommands.slice(i, i + 20));
      }
    } else {
      const device = await this.connectUSB();
      const endpoint = device.configuration?.interfaces[0].alternates[0].endpoints.find((e: any) => e.direction === 'out');
      if (endpoint) {
        await device.transferOut(endpoint.endpointNumber, fullCommands);
      }
    }
  }

  /**
   * Generate ESC/POS commands for an invoice
   */
  static generateEscPos(invoice: any, profile: any) {
    const encoder = new TextEncoder();
    let commands = new Uint8Array();

    const add = (data: Uint8Array) => {
      const newCommands = new Uint8Array(commands.length + data.length);
      newCommands.set(commands);
      newCommands.set(data, commands.length);
      commands = newCommands;
    };

    const addText = (text: string) => add(encoder.encode(text));
    const addLF = () => add(new Uint8Array([this.LF]));
    
    // Initialize
    add(new Uint8Array([this.ESC, 0x40]));
    
    // Center Align
    add(new Uint8Array([this.ESC, 0x61, 0x01]));
    
    // Business Name (Double height/width)
    add(new Uint8Array([this.GS, 0x21, 0x11]));
    addText(profile?.businessName || 'QUIN');
    addLF();
    
    // Normal size
    add(new Uint8Array([this.GS, 0x21, 0x00]));
    addText(profile?.address || '');
    addLF();
    if (profile?.gstin) {
      addText(`GSTIN: ${profile.gstin}`);
      addLF();
    }
    addText(formatPhone(profile?.phone || ''));
    addLF();
    addText('--------------------------------');
    addLF();
    
    // Left Align
    add(new Uint8Array([this.ESC, 0x61, 0x00]));
    addText(`Invoice: ${invoice.invoiceNumber}`);
    addLF();
    addText(`Date: ${new Date(invoice.date).toLocaleDateString()}`);
    addLF();
    addText(`Customer: ${invoice.customerName}`);
    addLF();
    if (invoice.customerGstin) {
      addText(`Cust GSTIN: ${invoice.customerGstin}`);
      addLF();
    }
    if (invoice.isGstInvoice) {
      addText(`State of Supply: ${invoice.stateOfSupply}`);
      addLF();
    }
    addText('--------------------------------');
    addLF();
    
    // Items
    invoice.items.forEach((item: any) => {
      addText(`${item.name.substring(0, 20)}`);
      addLF();
      const qtyPrice = `${item.quantity} x ${item.price.toFixed(2)}`;
      const total = item.total.toFixed(2);
      const spaces = 32 - qtyPrice.length - total.length;
      addText(qtyPrice + ' '.repeat(Math.max(1, spaces)) + total);
      addLF();
      if (invoice.isGstInvoice && item.gstRate) {
        addText(`  HSN: ${item.hsnCode || '-'} GST: ${item.gstRate}%`);
        addLF();
      }
    });
    
    addText('--------------------------------');
    addLF();
    
    // Totals
    add(new Uint8Array([this.ESC, 0x61, 0x02])); // Right align
    addText(`Subtotal: ${invoice.subtotal.toFixed(2)}`);
    addLF();
    
    if (invoice.isGstInvoice) {
      if (invoice.cgstTotal) {
        addText(`CGST: ${invoice.cgstTotal.toFixed(2)}`);
        addLF();
        addText(`SGST: ${invoice.sgstTotal.toFixed(2)}`);
        addLF();
      } else if (invoice.igstTotal) {
        addText(`IGST: ${invoice.igstTotal.toFixed(2)}`);
        addLF();
      }
    } else {
      addText(`Tax (${invoice.taxPercentage}%): ${invoice.tax.toFixed(2)}`);
      addLF();
    }
    
    // Total (Bold)
    add(new Uint8Array([this.ESC, 0x45, 0x01]));
    addText(`TOTAL: ${invoice.total.toFixed(2)}`);
    add(new Uint8Array([this.ESC, 0x45, 0x00]));
    addLF();
    
    addText(`Received: ${invoice.receivedAmount.toFixed(2)}`);
    addLF();
    if (invoice.receivedAmount > 0) {
      addText(`Method: ${invoice.paymentMethod || 'cash'}`);
      addLF();
    }
    if (invoice.creditAmount > 0) {
      addText(`Credit: ${invoice.creditAmount.toFixed(2)}`);
      addLF();
    }
    
    addLF();
    add(new Uint8Array([this.ESC, 0x61, 0x01])); // Center
    addText('Thank you for your business!');
    addLF();
    addLF();
    addLF();
    addLF();
    addLF();
    
    // Cut paper
    add(new Uint8Array([this.GS, 0x56, 0x41, 0x03]));

    return commands;
  }

  static async printBluetooth(invoice: any, profile: any) {
    const characteristic = await this.connectBluetooth();
    const commands = this.generateEscPos(invoice, profile);
    
    // Send in chunks of 20 bytes (BLE limit)
    for (let i = 0; i < commands.length; i += 20) {
      await characteristic?.writeValue(commands.slice(i, i + 20));
    }
  }

  static async printUSB(invoice: any, profile: any) {
    const device = await this.connectUSB();
    const commands = this.generateEscPos(invoice, profile);
    
    // Find the bulk out endpoint
    const endpoint = device.configuration?.interfaces[0].alternates[0].endpoints.find(e => e.direction === 'out');
    if (endpoint) {
      await device.transferOut(endpoint.endpointNumber, commands);
    }
  }
}
