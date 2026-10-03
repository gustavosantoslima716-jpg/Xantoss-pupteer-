import express from "express";
import puppeteer from "puppeteer";

const app = express();

app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ========================================
// HOME
// ========================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Xantoss Puppeteer",
    status: "online"
  });
});

// ========================================
// TESTE DO CHROMIUM
// ========================================

app.get("/browser-test", async (req, res) => {
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

    await page.goto("https://example.com", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    res.json({
      success: true,
      chromium: "Funcionando",
      title: await page.title()
    });
  } catch (error) {
    res.status(500).json({
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
// WAYGROUND INSPECT
// ========================================

app.post("/wayground/inspect", async (req, res) => {
  const { url } = req.body || {};

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
      width: 1365,
      height: 768
    });

    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0.0.0 Safari/537.36"
    );

    const networkResponses = [];
    const jsonResponses = [];

    // ========================================
    // CAPTURA RESPOSTAS
    // ========================================

    page.on("response", async (response) => {
      try {
        const request = response.request();

        const responseUrl = response.url();
        const type = request.resourceType();
        const status = response.status();

        const headers = response.headers();
        const contentType = headers["content-type"] || "";

        // Só interessa rede relacionada ao app/API
        const interesting =
          type === "xhr" ||
          type === "fetch" ||
          responseUrl.includes("_gameapi") ||
          responseUrl.includes("/_api/") ||
          responseUrl.includes("play-api");

        if (!interesting) {
          return;
        }

        networkResponses.push({
          status,
          method: request.method(),
          type,
          url: responseUrl,
          contentType
        });

        // ========================================
        // TENTA LER CORPO JSON
        // ========================================

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
              body = text.slice(0, 20000);
            }

            jsonResponses.push({
              status,
              method: request.method(),
              type,
              url: responseUrl,

              // Não retornamos headers/cookies/tokens.
              body
            });
          } catch (error) {
            jsonResponses.push({
              status,
              method: request.method(),
              type,
              url: responseUrl,
              readError: error.message
            });
          }
        }
      } catch (error) {
        console.log(
          "Erro ao analisar response:",
          error.message
        );
      }
    });

    // ========================================
    // ABRE WAYGROUND
    // ========================================

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 12000);
    });

    // ========================================
    // INFORMAÇÕES DA PÁGINA
    // ========================================

    const pageInfo = await page.evaluate(() => {
      const text = document.body?.innerText || "";

      return {
        title: document.title,
        url: location.href,
        bodyText: text.slice(0, 10000),
        bodyLength: text.length,
        htmlLength:
          document.documentElement?.outerHTML?.length || 0
      };
    });

    // ========================================
    // DESTACA RESPOSTAS IMPORTANTES
    // ========================================

    const importantResponses = jsonResponses.filter((item) => {
      return (
        item.status >= 400 ||
        item.url.includes("/rejoin") ||
        item.url.includes("_gameapi") ||
        item.url.includes("/_api/main/user")
      );
    });

    // ========================================
    // RESULTADO
    // ========================================

    return res.json({
      success: true,

      finalUrl: page.url(),

      page: pageInfo,

      diagnostic: {
        networkCount: networkResponses.length,
        jsonCount: jsonResponses.length,

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
      "Wayground inspect error:",
      error
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

// ========================================
// START
// ========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Xantoss Puppeteer rodando na porta ${PORT}`
  );
});
