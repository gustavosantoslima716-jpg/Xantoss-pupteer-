import express from "express";
import puppeteer from "puppeteer";

const app = express();

app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ]
  });
}

// ========================================
// HOME
// ========================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Xantoss Puppeteer",
    status: "online",
    waygroundCredentialsConfigured: Boolean(
      process.env.WAYGROUND_EMAIL &&
      process.env.WAYGROUND_PASSWORD
    )
  });
});

// ========================================
// BROWSER TEST
// ========================================

app.get("/browser-test", async (req, res) => {
  let browser;

  try {
    browser = await launchBrowser();

    const page = await browser.newPage();

    await page.goto("https://example.com", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    return res.json({
      success: true,
      chromium: "Funcionando",
      title: await page.title()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});

// ========================================
// LOGIN + INSPEÇÃO WAYGROUND
// ========================================

app.post("/wayground/login-inspect", async (req, res) => {
  const { url } = req.body || {};

  const email = process.env.WAYGROUND_EMAIL;
  const password = process.env.WAYGROUND_PASSWORD;

  if (!email || !password) {
    return res.status(500).json({
      success: false,
      error: "WAYGROUND_EMAIL ou WAYGROUND_PASSWORD não configurado"
    });
  }

  if (!url) {
    return res.status(400).json({
      success: false,
      error: "Envie o campo url"
    });
  }

  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({
      success: false,
      error: "URL inválida"
    });
  }

  if (
    parsed.hostname !== "wayground.com" &&
    !parsed.hostname.endsWith(".wayground.com")
  ) {
    return res.status(400).json({
      success: false,
      error: "Somente links do Wayground são permitidos"
    });
  }

  let browser;

  try {
    browser = await launchBrowser();

    const page = await browser.newPage();

    await page.setViewport({
      width: 1365,
      height: 768
    });

    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0.0.0 Safari/537.36"
    );

    // ========================================
    // 1. ABRE LOGIN
    // ========================================

    await page.goto(
      "https://wayground.com/login",
      {
        waitUntil: "domcontentloaded",
        timeout: 60000
      }
    );

    await sleep(3000);

    // ========================================
    // 2. CLICA "CONTINUAR COM EMAIL"
    // ========================================

    const clickedEmail = await page.evaluate(() => {
      const candidates = [
        ...document.querySelectorAll(
          "button,a,[role='button']"
        )
      ];

      const target = candidates.find((el) => {
        const text =
          (el.innerText || el.textContent || "")
            .trim()
            .toLowerCase();

        return (
          text.includes("continue with email") ||
          text.includes("continuar com email")
        );
      });

      if (!target) return false;

      target.click();
      return true;
    });

    if (!clickedEmail) {
      return res.status(500).json({
        success: false,
        step: "open-email-login",
        error: "Botão Continuar com Email não encontrado",
        currentUrl: page.url()
      });
    }

    await sleep(2500);

    // ========================================
    // 3. DIGITA EMAIL
    // ========================================

    const emailInput = await page.$(
      'input[type="email"], input[name="email"], input[autocomplete="email"], input[type="text"]'
    );

    if (!emailInput) {
      return res.status(500).json({
        success: false,
        step: "email",
        error: "Campo de email não encontrado",
        currentUrl: page.url()
      });
    }

    await emailInput.click({ clickCount: 3 });
    await emailInput.type(email, {
      delay: 25
    });

    // Procura botão para avançar
    const advanced = await page.evaluate(() => {
      const buttons = [
        ...document.querySelectorAll(
          "button,[role='button']"
        )
      ];

      const target = buttons.find((el) => {
        const text =
          (el.innerText || el.textContent || "")
            .trim()
            .toLowerCase();

        return (
          text.includes("continue") ||
          text.includes("continuar") ||
          text.includes("next") ||
          text.includes("próximo")
        );
      });

      if (!target) return false;

      target.click();
      return true;
    });

    if (!advanced) {
      // Alguns formulários avançam com Enter
      await emailInput.press("Enter");
    }

    await sleep(3000);

    // ========================================
    // 4. PROCURA CAMPO DE SENHA
    // ========================================

    let passwordInput =
      await page.$('input[type="password"]');

    // Às vezes email e senha já aparecem juntos
    if (!passwordInput) {
      await sleep(2000);

      passwordInput =
        await page.$('input[type="password"]');
    }

    if (!passwordInput) {
      return res.status(500).json({
        success: false,
        step: "password",
        error: "Campo de senha não encontrado",
        currentUrl: page.url(),
        title: await page.title()
      });
    }

    await passwordInput.click({
      clickCount: 3
    });

    await passwordInput.type(password, {
      delay: 25
    });

    // ========================================
    // 5. ENVIA LOGIN
    // ========================================

    const submitted = await page.evaluate(() => {
      const buttons = [
        ...document.querySelectorAll(
          "button,[role='button']"
        )
      ];

      const target = buttons.find((el) => {
        const text =
          (el.innerText || el.textContent || "")
            .trim()
            .toLowerCase();

        return (
          text === "continue" ||
          text === "continuar" ||
          text === "login" ||
          text === "log in" ||
          text === "entrar"
        );
      });

      if (!target) return false;

      target.click();
      return true;
    });

    if (!submitted) {
      await passwordInput.press("Enter");
    }

    await sleep(6000);

    // ========================================
    // 6. CONFIRMA LOGIN
    // ========================================

    const authCheck = await page.evaluate(async () => {
      try {
        const response = await fetch(
          "/_api/main/user?subscriptionData=true",
          {
            credentials: "include"
          }
        );

        return {
          status: response.status,
          ok: response.ok
        };
      } catch (error) {
        return {
          status: 0,
          ok: false,
          error: error.message
        };
      }
    });

    if (!authCheck.ok) {
      const visibleText = await page.evaluate(() =>
        (document.body?.innerText || "")
          .slice(0, 2000)
      );

      return res.status(401).json({
        success: false,
        step: "auth-check",
        error: "Wayground não confirmou a sessão",
        authStatus: authCheck.status,
        currentUrl: page.url(),
        pageText: visibleText
      });
    }

    // ========================================
    // LOGIN FUNCIONOU
    // COMEÇA CAPTURA DA ATIVIDADE
    // ========================================

    const networkResponses = [];
    const jsonResponses = [];

    page.on("response", async (response) => {
      try {
        const request = response.request();

        const responseUrl = response.url();
        const status = response.status();
        const type = request.resourceType();

        const contentType =
          response.headers()["content-type"] || "";

        const interesting =
          type === "xhr" ||
          type === "fetch" ||
          responseUrl.includes("_gameapi") ||
          responseUrl.includes("play-api");

        if (!interesting) return;

        networkResponses.push({
          status,
          method: request.method(),
          type,
          url: responseUrl,
          contentType
        });

        if (
          contentType.includes("application/json") ||
          contentType.includes("text/json")
        ) {
          try {
            const text = await response.text();

            let body;

            try {
              body = JSON.parse(text);
            } catch {
              body = text.slice(0, 30000);
            }

            jsonResponses.push({
              status,
              method: request.method(),
              type,
              url: responseUrl,
              body
            });
          } catch {
            // ignora resposta não legível
          }
        }
      } catch {
        // não derruba o teste
      }
    });

    // ========================================
    // 7. ABRE ATIVIDADE LOGADO
    // ========================================

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await sleep(12000);

    const pageInfo = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      bodyText:
        (document.body?.innerText || "")
          .slice(0, 10000)
    }));

    const importantResponses =
      jsonResponses.filter((item) => {
        const text = JSON.stringify(item.body);

        return (
          item.url.includes("_gameapi") ||
          item.url.includes("/rejoin") ||
          /question|options|quiz|slide|assessment|game/i.test(
            text
          )
        );
      });

    return res.json({
      success: true,

      login: {
        authenticated: true,
        authStatus: authCheck.status
      },

      activity: pageInfo,

      diagnostic: {
        networkCount:
          networkResponses.length,

        jsonCount:
          jsonResponses.length,

        importantResponses:
          importantResponses.slice(0, 30)
      },

      networkResponses:
        networkResponses.slice(0, 100),

      jsonResponses:
        jsonResponses.slice(0, 50)
    });

  } catch (error) {
    console.error(
      "Wayground login inspect error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});

// ========================================
// 404
// ========================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Rota não encontrada"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Xantoss Puppeteer rodando na porta ${PORT}`
  );
});
