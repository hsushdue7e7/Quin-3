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
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (serviceAccount) {
          admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(serviceAccount)),
          });
        } else {
          admin.initializeApp({
            credential: admin.credential.applicationDefault(),
          });
        }
      }
      db = admin.firestore();
    } catch (error) {
      console.warn("Firebase Admin failed to initialize. Some backend features like cron jobs may not work without proper credentials.");
      console.error(error);
    }
  }
  return db;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// --- Synchronous Route Definitions ---
// API routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// API route for cron reminders (compatible with Vercel Cron)
app.get("/api/cron/reminders", async (req, res) => {
  console.log("Running credit recovery check via API...");
  const firestore = getDb();
  if (!firestore) {
    return res.status(500).json({ error: "Firebase Admin not initialized" });
  }

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (!accountSid || !authToken) {
      return res.status(500).json({ error: "Twilio credentials missing" });
    }

    const twilioClient = twilio(accountSid, authToken);
    const invoicesSnapshot = await firestore.collection("invoices").get();
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    let count = 0;

    for (const doc of invoicesSnapshot.docs) {
      const inv = doc.data();
      if (inv.creditAmount <= 0 || !inv.customerMobile) continue;

      const dueDate = inv.date + thirtyDays;
      const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));

      let message = "";
      if (daysOverdue === 3) message = `Hi ${inv.customerName}, your payment of ${inv.creditAmount} is 3 days overdue. Please clear it.`;
      else if (daysOverdue === 7) message = `Hi ${inv.customerName}, your payment of ${inv.creditAmount} is 7 days overdue. Please clear it immediately.`;
      else if (daysOverdue === 10) message = `Hi ${inv.customerName}, your payment of ${inv.creditAmount} is 10 days overdue. Please clear it immediately.`;
      else if (daysOverdue > 10) message = `Hi ${inv.customerName}, your payment of ${inv.creditAmount} is overdue. Please clear it immediately.`;

      if (message) {
        await twilioClient.messages.create({
          body: message,
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
          to: `whatsapp:${inv.customerMobile}`
        });
        console.log(`Reminder sent to ${inv.customerName}`);
        count++;
      }
    }
    res.json({ status: "ok", remindersSent: count });
  } catch (error) {
    console.error("Error running credit recovery check:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Cron job for reminders (kept for non-Vercel environments)
if (process.env.VERCEL !== "1") {
  cron.schedule("0 9 * * *", async () => {
    console.log("Local cron scheduled for 9 AM");
  });
}

// --- Development/Production Middleware ---
async function setupMiddlewares() {
  const PORT = 3000;

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

  if (process.env.NODE_ENV !== "production" || process.env.VERCEL !== "1") {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

setupMiddlewares();

export default app;
