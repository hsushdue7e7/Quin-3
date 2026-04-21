import express from "express";
import { createServer as createViteServer } from "vite";
import cron from "node-cron";
import twilio from "twilio";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";

// Initialize Firebase Admin lazily
let db: admin.firestore.Firestore | null = null;

function getDb() {
  if (!db) {
    try {
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
        });
      }
      db = admin.firestore();
    } catch (error) {
      console.warn("Firebase Admin failed to initialize. Some backend features like cron jobs may not work without proper GOOGLE_APPLICATION_CREDENTIALS.");
    }
  }
  return db;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Cron job for reminders
  // Runs daily at 9:00 AM
  cron.schedule("0 9 * * *", async () => {
    console.log("Running credit recovery check...");
    const firestore = getDb();
    if (!firestore) {
      console.error("Skipping cron job: Firebase Admin not initialized.");
      return;
    }

    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      
      if (!accountSid || !authToken) {
        console.error("Skipping cron job: Twilio credentials missing.");
        return;
      }

      const twilioClient = twilio(accountSid, authToken);
      const invoicesSnapshot = await firestore.collection("invoices").get();
      const now = Date.now();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;

      for (const doc of invoicesSnapshot.docs) {
        const inv = doc.data();
        if (inv.creditAmount <= 0 || !inv.customerMobile) continue;

        const dueDate = inv.date + thirtyDays;
        const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));

        let message = "";
        if (daysOverdue === 3) { // 3 days overdue
          message = `Hi ${inv.customerName}, your payment of ${inv.creditAmount} is 3 days overdue. Please clear it.`;
        } else if (daysOverdue === 7) { // 7 days overdue
          message = `Hi ${inv.customerName}, your payment of ${inv.creditAmount} is 7 days overdue. Please clear it immediately.`;
        } else if (daysOverdue === 10) { // 10 days overdue
          message = `Hi ${inv.customerName}, your payment of ${inv.creditAmount} is 10 days overdue. Please clear it immediately.`;
        } else if (daysOverdue > 10) { // Daily
          message = `Hi ${inv.customerName}, your payment of ${inv.creditAmount} is overdue. Please clear it immediately.`;
        }

        if (message) {
          await twilioClient.messages.create({
            body: message,
            from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
            to: `whatsapp:${inv.customerMobile}`
          });
          console.log(`Reminder sent to ${inv.customerName}`);
        }
      }
    } catch (error) {
      console.error("Error running credit recovery check:", error);
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
