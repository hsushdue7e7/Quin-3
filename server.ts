import express from "express";
import path from "path";
import { existsSync, readdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import twilio from "twilio";

// Initialize Firebase Admin lazily
let db: admin.firestore.Firestore | null = null;
function getDb() {
  if (db) return db;
  try {
    if (admin.apps.length === 0) {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (serviceAccount) {
        const cert = JSON.parse(serviceAccount);
        if (cert.private_key) cert.private_key = cert.private_key.replace(/\\n/g, '\n');
        admin.initializeApp({ credential: admin.credential.cert(cert) });
      } else {
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
      }
    }
    
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    let databaseId = "(default)";
    if (existsSync(configPath)) {
      const firebaseConfig = JSON.parse(readFileSync(configPath, 'utf8'));
      if (firebaseConfig.firestoreDatabaseId) {
        databaseId = firebaseConfig.firestoreDatabaseId;
      }
    }
    
    db = getFirestore(admin.apps[0], databaseId) as unknown as admin.firestore.Firestore;
    return db;
  } catch (error) {
    console.error("Firebase Admin Error:", error);
    return null;
  }
}

const app = express();
app.use(express.json());
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Gemini Setup
import { GoogleGenAI, Modality } from "@google/genai";
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// API Routes
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.post("/api/assistant/chat", async (req, res) => {
  try {
    const { message, systemInstruction } = req.body;
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: message }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json"
      }
    });
    res.json({ text: response.text });
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/assistant/tts", async (req, res) => {
  try {
    const { text } = req.body;
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Say in a friendly Indian shopkeeper tone: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    res.json({ 
      audio: audioPart?.data,
      mimeType: audioPart?.mimeType || 'audio/mp3'
    });
  } catch (error) {
    console.error("Gemini TTS Error:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok", env: process.env.NODE_ENV }));

app.get("/api/cron/reminders", async (req, res) => {
  const secret = req.query.secret || req.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "DB Error" });
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) return res.status(500).json({ error: "Twilio Error" });

    const twilioClient = twilio(accountSid, authToken);
    const invoicesSnapshot = await firestore.collection("invoices").where("creditAmount", ">", 0).get();
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    let count = 0;

    for (const doc of invoicesSnapshot.docs) {
      const inv = doc.data();
      if (inv.creditAmount <= 0 || !inv.customerMobile) continue;
      const dueDate = inv.date + thirtyDays;
      const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
      let message = "";
      if (daysOverdue === 3) message = `Hi ${inv.customerName}, payment of ${inv.creditAmount} is 3 days overdue.`;
      else if (daysOverdue === 7) message = `Hi ${inv.customerName}, payment of ${inv.creditAmount} is 7 days overdue.`;
      else if (daysOverdue === 10) message = `Hi ${inv.customerName}, payment of ${inv.creditAmount} is 10 days overdue.`;
      else if (daysOverdue > 10) message = `Hi ${inv.customerName}, payment of ${inv.creditAmount} is overdue.`;

      if (message) {
        await twilioClient.messages.create({
          body: message,
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
          to: `whatsapp:${inv.customerMobile}`
        });
        count++;
      }
    }
    res.json({ status: "ok", count });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Serving Static Files
const distPath = path.join(process.cwd(), 'dist');

async function startServer() {
  const isVercel = process.env.VERCEL === "1";
  
  if (process.env.NODE_ENV === "production" || isVercel) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("App not built correctly (dist/index.html missing)");
      }
    });
    
    // In Vercel serverless environment, Vercel handles the listener.
    // If not on Vercel (e.g. running locally or on AI Studio in production), we must listen.
    const PORT = 3000;
    if (!isVercel) {
      app.listen(PORT, "0.0.0.0", () => console.log(`Production server: http://localhost:${PORT}`));
    }
  } else {
    // Development mode
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => console.log(`Dev server: http://localhost:${PORT}`));
  }
}

startServer();

export default app;
