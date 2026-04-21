import express from "express";
import cron from "node-cron";
import twilio from "twilio";
import path from "path";
import { existsSync } from "fs";
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
          console.log("Initializing Firebase Admin with Service Account...");
          try {
            // Fix potential newline issues in private key if passed as a string
            let cert;
            if (serviceAccount.startsWith('{')) {
              cert = JSON.parse(serviceAccount);
            } else {
              // Assume it's a base64 encoded JSON or something else? 
              // Usually it's raw JSON in ENV.
              cert = JSON.parse(serviceAccount);
            }
            
            if (cert.private_key) {
              cert.private_key = cert.private_key.replace(/\\n/g, '\n');
            }

            admin.initializeApp({
              credential: admin.credential.cert(cert),
            });
            console.log("Firebase Admin initialized successfully.");
          } catch (parseError) {
            console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT. Ensure it is a valid JSON string.");
            throw parseError;
          }
        } else {
          console.log("Initializing Firebase Admin with Default Credentials...");
          admin.initializeApp({
            credential: admin.credential.applicationDefault(),
          });
        }
      }
      db = admin.firestore();
    } catch (error) {
      console.warn("Firebase Admin failed to initialize.");
      console.error(error);
    }
  }
  return db;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

console.log("Starting server in mode:", process.env.NODE_ENV || "development");
console.log("Vercel environment:", process.env.VERCEL === "1" ? "Yes" : "No");

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

// --- Middleware Setup ---
const distPath = path.join(__dirname, '..', 'dist');

if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
  console.log("Serving production assets from:", distPath);
  console.log("Dist directory exists:", existsSync(distPath));
  if (existsSync(distPath)) {
    console.log("Contents of dist:", (await import("fs")).readdirSync(distPath));
  }
  
  // Serve static files in production
  app.use(express.static(distPath));
  
  // SPA fallback - MUST be the last route
  app.get('*', (req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error("Error sending index.html:", err);
        res.status(500).send("Internal Server Error: Index file missing or inaccessible.");
      }
    });
  });
} else {
  // Development mode with Vite hmr
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
  
  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Development server running on http://localhost:${PORT}`);
  });
}

export default app;
