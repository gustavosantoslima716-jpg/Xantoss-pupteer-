import express from "express";
import puppeteer from "puppeteer";
import crypto from "crypto";

const app = express();
app.use(express.json());

const sessions = new Map();
const SESSION_TTL = 10 * 60 * 1000;

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "Xantoss Puppeteer"
  });
});

async function closeSession(sessionId) {
  const session = sessions.get(sessionId);

  if (!session) return;

  sessions.delete(sessionId);

  try {
    await session.browser.close();
  } catch {}
}

app.post("/quizit/login/start", async (req, res) => {
  let browser;

  try {
    const email = String(req.body?.email || "").trim();

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        success: false,
        error: "E-mail inválido."
      });
    }

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

    await page.goto(
      "https://quizit.online/auth/login?next=/services/wayground",
      {
        waitUntil: "networkidle2",
        timeout: 60000
      }
    );

    // Localiza o campo de e-mail.
    const emailInput = await page.waitForSelector(
      'input[type="email"], input[placeholder*="example"], input[placeholder*="mail" i]',
      { timeout: 20000 }
    );

    await emailInput.click({ clickCount: 3 });
    await emailInput.type(email);

    // Procura o botão "Send code" pelo texto visível.
    const sendCodeClicked = await page.evaluate(() => {
      const elements = [
        ...document.querySelectorAll("button, [role='button']")
      ];

      const button = elements.find(el =>
        (el.innerText || "")
          .toLowerCase()
          .includes("send code")
      );

      if (!button) return false;

      button.click();
      return true;
    });

    if (!sendCodeClicked) {
      throw new Error('Botão "Send code" não encontrado.');
    }

    // Aguarda a página trocar para a etapa do código.
    await page.waitForFunction(
      () => {
        const text = document.body.innerText.toLowerCase();

        return (
          text.includes("login code") &&
          text.includes("log in")
        );
      },
      { timeout: 30000 }
    );

    const sessionId = crypto.randomUUID();

    const timer = setTimeout(() => {
      closeSession(sessionId);
    }, SESSION_TTL);

    sessions.set(sessionId, {
      browser,
      page,
      email,
      timer,
      createdAt: Date.now()
    });

    // O navegador agora pertence à sessão.
    browser = null;

    return res.json({
      success: true,
      sessionId,
      message: "Código solicitado. Verifique seu e-mail.",
      expiresInSeconds: 600
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

app.post("/quizit/login/verify", async (req, res) => {
  const sessionId = String(req.body?.sessionId || "");
  const code = String(req.body?.code || "")
    .replace(/\D/g, "")
    .slice(0, 6);

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: "sessionId ausente."
    });
  }

  if (code.length !== 6) {
    return res.status(400).json({
      success: false,
      error: "O código precisa ter 6 dígitos."
    });
  }

  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: "Sessão inexistente ou expirada."
    });
  }

  try {
    const { page } = session;

    // Localiza o campo do código.
    const codeInput = await page.waitForSelector(
      'input[inputmode="numeric"], input[autocomplete="one-time-code"], input[type="text"]',
      { timeout: 15000 }
    );

    await codeInput.click({ clickCount: 3 });
    await codeInput.type(code);

    // Clica em Log in.
    const loginClicked = await page.evaluate(() => {
      const elements = [
        ...document.querySelectorAll("button, [role='button']")
      ];

      const button = elements.find(el => {
        const text = (el.innerText || "")
          .trim()
          .toLowerCase();

        return text === "log in";
      });

      if (!button) return false;

      button.click();
      return true;
    });

    if (!loginClicked) {
      throw new Error('Botão "Log in" não encontrado.');
    }

    // Dá tempo para o Quizit validar o código/redirecionar.
    await new Promise(resolve => setTimeout(resolve, 5000));

    const url = page.url();
    const bodyText = await page.evaluate(
      () => document.body.innerText
    );

    const stillOnLogin =
      url.includes("/auth/login") ||
      bodyText.toLowerCase().includes("login code");

    if (stillOnLogin) {
      return res.status(401).json({
        success: false,
        authenticated: false,
        error: "O Quizit não confirmou o login. Confira o código."
      });
    }

    // Mantemos a sessão viva para a próxima etapa:
    // acessar /services/wayground.
    return res.json({
      success: true,
      authenticated: true,
      sessionId,
      urlFinal: url,
      message: "Login no Quizit confirmado."
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      authenticated: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Xantoss Puppeteer rodando na porta ${PORT}`);
});
