import express from "express";
import puppeteer from "puppeteer";

const app = express();

app.use(express.json({ limit: "2mb" }));

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ==============================
// HOME
// ==============================

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Xantoss Puppeteer",
    status: "online"
  });
});

// ==============================
// TESTE DO CHROMIUM
// ==============================

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

    const title = await page.title();

    return res.json({
      success: true,
      chromium: "Funcionando",
      title
    });

  } catch (error) {
    console.error("Browser test error:", error);

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

// ==============================
// WAYGROUND INSPECT
// ==============================

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

  // Permite somente Wayground
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

    // User-Agent normal
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0.0.0 Safari/537.36"
    );

    const responses = [];
    const possibleData = [];

    // ==============================
    // OBSERVA RESPOSTAS DE REDE
    // ==============================

    page.on("response", async (response) => {
      try {
        const responseUrl = response.url();

        const request = response.request();

        const resourceType =
          request.resourceType();

        const headers =
          response.headers();

        const contentType =
          headers["content-type"] || "";

        // Guarda XHR / Fetch e requisições relacionadas ao Wayground
        if (
          resourceType !== "xhr" &&
          resourceType !== "fetch" &&
          !responseUrl.includes("wayground")
        ) {
          return;
        }

        responses.push({
          status: response.status(),
          type: resourceType,
          url: responseUrl,
          contentType
        });

        // ==============================
        // PROCURA JSON
        // ==============================

        if (
          contentType.includes("application/json") ||
          contentType.includes("text/json")
        ) {
          try {
            const json =
              await response.json();

            const text =
              JSON.stringify(json);

            const interesting =
              /question|quiz|option|answer|slide|mcq|assessment/i.test(
                text
              );

            if (interesting) {
              possibleData.push({
                url: responseUrl,
                status: response.status(),
                data: json
              });
            }

          } catch {
            // Ignora respostas que não puderem ser lidas
          }
        }

      } catch {
        // Uma resposta individual não derruba a rota
      }
    });

    // ==============================
    // ABRE ATIVIDADE
    // ==============================

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // Aguarda aplicação carregar
    await new Promise((resolve) =>
      setTimeout(resolve, 10000)
    );

    // ==============================
    // ANALISA DOM
    // ==============================

    const pageInfo =
      await page.evaluate(() => {

        const bodyText =
          document.body?.innerText || "";

        const scripts =
          [...document.scripts]
            .map(
              (script) =>
                script.textContent || ""
            )
            .filter(Boolean);

        const interestingScripts =
          scripts
            .filter((text) =>
              /question|quiz|option|answer|slide|mcq|assessment/i.test(
                text
              )
            )
            .slice(0, 10)
            .map((text) =>
              text.slice(0, 15000)
            );

        // Textos de elementos da página
        const elements =
          [...document.querySelectorAll(
            "h1,h2,h3,h4,p,button,label,[role='button']"
          )]
            .map((el) =>
              el.innerText?.trim()
            )
            .filter(Boolean)
            .slice(0, 500);

        return {
          title:
            document.title,

          url:
            location.href,

          bodyText:
            bodyText.slice(
              0,
              30000
            ),

          bodyLength:
            bodyText.length,

          htmlLength:
            document.documentElement
              ?.outerHTML
              ?.length || 0,

          scriptCount:
            document.scripts.length,

          elements,

          interestingScripts
        };
      });

    // ==============================
    // RESULTADO
    // ==============================

    return res.json({
      success: true,

      finalUrl:
        page.url(),

      page:
        pageInfo,

      network: {
        totalCaptured:
          responses.length,

        responses:
          responses.slice(
            0,
            150
          )
      },

      possibleData:
        possibleData.slice(
          0,
          30
        )
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
      await browser
        .close()
        .catch(() => {});
    }
  }
});

// ==============================
// 404
// ==============================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Rota não encontrada"
  });
});

// ==============================
// SERVIDOR
// ==============================

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Xantoss Puppeteer rodando na porta ${PORT}`
  );
});
