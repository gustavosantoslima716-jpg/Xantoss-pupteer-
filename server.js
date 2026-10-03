import express from "express";
import puppeteer from "puppeteer";
import crypto from "crypto";

const app = express();
app.use(express.json());

const sessions = new Map();

const SESSION_TTL = 10 * 60 * 1000;

// ===============================
// CORS
// ===============================

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ===============================
// HOME
// ===============================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "Xantoss Puppeteer"
  });
});

// ===============================
// FECHAR SESSÃO
// ===============================

async function closeSession(sessionId) {
  const session = sessions.get(sessionId);

  if (!session) return;

  sessions.delete(sessionId);

  try {
    clearTimeout(session.timer);
    await session.browser.close();
  } catch {}
}

// ===============================
// INICIAR LOGIN GOOGLE
// ===============================

app.post("/quizit/google/start", async (req, res) => {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ]
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: 1280,
      height: 900
    });

    // Abre login do Quizit
    await page.goto(
      "https://quizit.online/auth/login?next=/services/wayground",
      {
        waitUntil: "networkidle2",
        timeout: 60000
      }
    );

    // Procura botão Google
    const clicked = await page.evaluate(() => {
      const elements = [
        ...document.querySelectorAll(
          "button, a, [role='button']"
        )
      ];

      const googleButton = elements.find(el =>
        (el.innerText || "")
          .trim()
          .toLowerCase()
          .includes("log in with google")
      );

      if (!googleButton) {
        return false;
      }

      googleButton.click();

      return true;
    });

    if (!clicked) {
      throw new Error(
        'Botão "Log in with Google" não encontrado.'
      );
    }

    // Espera Google abrir
    await new Promise(resolve =>
      setTimeout(resolve, 4000)
    );

    const pages = await browser.pages();

    const googlePage = pages.find(p =>
      p.url().includes("accounts.google.com")
    );

    if (!googlePage) {
      throw new Error(
        "Página oficial do Google não foi aberta."
      );
    }

    const googleURL = googlePage.url();

    const sessionId = crypto.randomUUID();

    const timer = setTimeout(() => {
      closeSession(sessionId);
    }, SESSION_TTL);

    sessions.set(sessionId, {
      browser,
      quizitPage: page,
      googlePage,
      createdAt: Date.now(),
      timer
    });

    // browser agora pertence à sessão
    browser = null;

    return res.json({
      success: true,

      sessionId,

      googleDetected: true,

      googleHost: "accounts.google.com",

      // Só para diagnóstico.
      // Não significa que abrir esta URL em outro
      // navegador transfira a sessão para o Puppeteer.
      googleURL,

      expiresInSeconds: 600,

      message:
        "Fluxo Google iniciado no navegador do servidor."
    });

  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===============================
// VER ESTADO DA SESSÃO
// ===============================

app.get("/quizit/google/status/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: "Sessão inexistente ou expirada."
    });
  }

  try {
    const pages = await session.browser.pages();

    const info = [];

    for (const page of pages) {
      info.push({
        url: page.url(),
        title: await page
          .title()
          .catch(() => "")
      });
    }

    const quizitAuthenticated =
      info.some(p =>
        p.url.includes("quizit.online") &&
        !p.url.includes("/auth/login")
      );

    return res.json({
      success: true,

      sessionId,

      quizitAuthenticated,

      pages: info,

      ageSeconds:
        Math.floor(
          (Date.now() - session.createdAt) / 1000
        )
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===============================
// ENCERRAR MANUALMENTE
// ===============================

app.post("/quizit/google/close", async (req, res) => {
  const sessionId =
    String(req.body?.sessionId || "");

  if (!sessions.has(sessionId)) {
    return res.status(404).json({
      success: false,
      error: "Sessão inexistente."
    });
  }

  await closeSession(sessionId);

  return res.json({
    success: true,
    message: "Sessão encerrada."
  });
});

// ===============================
// SERVER
// ===============================

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Xantoss Puppeteer rodando na porta ${PORT}`
  );
});
