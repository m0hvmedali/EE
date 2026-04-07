import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/google/callback`
);

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Google Auth URL
app.get("/api/auth/google/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/documents"
    ],
  });
  res.json({ url });
});

// Google Auth Callback
app.get("/api/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    // In a real app, you'd save this to a database or session
    // For this demo, we'll send it back to the client via a script
    res.send(`
      <script>
        window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
        window.close();
      </script>
    `);
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).send("Authentication failed");
  }
});

// Save to Google Docs
app.post("/api/google-docs/save", async (req, res) => {
  const { tokens, title, content } = req.body;
  
  if (!tokens) {
    return res.status(401).json({ error: "No tokens provided" });
  }

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials(tokens);
    const docs = google.docs({ version: "v1", auth });

    const doc = await docs.documents.create({
      requestBody: { title }
    });

    const documentId = doc.data.documentId;

    await docs.documents.batchUpdate({
      documentId: documentId!,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: content
            }
          }
        ]
      }
    });

    res.json({ success: true, url: `https://docs.google.com/document/d/${documentId}/edit` });
  } catch (error: any) {
    console.error("Save error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
