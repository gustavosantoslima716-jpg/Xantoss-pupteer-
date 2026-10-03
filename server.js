import express from "express";
import puppeteer from "puppeteer";

const app = express();

app.use(express.json());

// CORS para o teste pelo Hoppscotch
app.use((req, res, next) => {
  res.header(
    "Access-Control-Allow-Origin",
    "https://hoppscotch.io"
  );

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

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "Xantoss Puppeteer"
  });
});

app.post("/wayground-test", async (req, res) => {
  const { link } = req.body;

  if (!link) {
    return res.status(400).json({
      success: false,
      error: "Envie o link da atividade."
    });
  }

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox"
      ]
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: 1365,
      height: 900
    });

    await page.goto(
      "https://quizit.online/services/wayground",
      {
        waitUntil: "networkidle2",
        timeout: 60000
      }
    );

    // =========================
    // 1. CAMPO DO LINK
    // =========================

    const input = await page.$(
      'input[placeholder="Enter pin or link"]'
    );

    if (!input) {
      throw new Error(
        "Campo de link não encontrado."
      );
    }

    await input.click();
    await input.type(link);

    // =========================
    // FUNÇÃO: CLICAR POR TEXTO
    // =========================

    async function clickExactText(text) {
      return await page.evaluate((texto) => {
        const elementos =
          [...document.querySelectorAll("*")];

        const candidatos = elementos.filter((el) => {
          const conteudo =
            el.textContent?.trim();

          const visivel =
            el.offsetWidth > 0 &&
            el.offsetHeight > 0;

          return (
            conteudo === texto &&
            visivel
          );
        });

        // Prefere elemento clicável
        const alvo =
          candidatos.find((el) =>
            el.matches(
              "button, [role='button'], [role='option']"
            )
          ) ||
          candidatos[candidatos.length - 1];

        if (!alvo) {
          return false;
        }

        alvo.click();

        return true;
      }, text);
    }

    // =========================
    // 2. ABRIR ANSWER METHOD
    // =========================

    const abriuMetodo =
      await clickExactText("Standard");

    if (!abriuMetodo) {
      throw new Error(
        "Não foi possível abrir o seletor Standard."
      );
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 1000)
    );

    // =========================
    // 3. UNDETECTABLE (NO BOT)
    // =========================

    const selecionouUndetectable =
      await page.evaluate(() => {
        const elementos =
          [...document.querySelectorAll("*")];

        const candidatos =
          elementos.filter((el) => {
            const texto =
              el.textContent
                ?.trim()
                .replace(/\s+/g, " ");

            const visivel =
              el.offsetWidth > 0 &&
              el.offsetHeight > 0;

            return (
              visivel &&
              texto?.startsWith(
                "Undetectable"
              )
            );
          });

        // Tenta encontrar o elemento mais específico
        const alvo =
          candidatos.find((el) =>
            el.matches(
              "[role='option'], button, [role='button']"
            )
          ) ||
          candidatos[candidatos.length - 1];

        if (!alvo) {
          return false;
        }

        alvo.click();

        return true;
      });

    if (!selecionouUndetectable) {
      throw new Error(
        "Opção Undetectable (no bot) não encontrada."
      );
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 1000)
    );

    // =========================
    // 4. CONFIRMA SE MUDOU
    // =========================

    const metodoSelecionado =
      await page.evaluate(() => {
        const texto =
          document.body.innerText || "";

        return texto.includes(
          "Undetectable (no bot)"
        );
      });

    // =========================
    // 5. GET ANSWERS
    // =========================

    const enviou =
      await clickExactText("Get answers");

    if (!enviou) {
      throw new Error(
        "Botão Get answers não encontrado."
      );
    }

    // Dá tempo para o Quizit processar
    await new Promise((resolve) =>
      setTimeout(resolve, 15000)
    );

    // =========================
    // 6. LER RESULTADO VISÍVEL
    // =========================

    const resultado =
      await page.evaluate(() => {
        const texto =
          document.body.innerText || "";

        return {
          urlFinal: location.href,

          title: document.title,

          encontrouSolutions:
            texto.includes(
              "Your solutions"
            ),

          encontrouMCQ:
            texto.includes("MCQ"),

          encontrouSlide:
            texto.includes("SLIDEV2"),

          encontrouUnlock:
            texto.includes(
              "Unlock answer"
            ),

          textoPagina:
            texto.slice(0, 15000)
        };
      });

    return res.json({
      success: true,

      metodoSelecionado,

      ...resultado
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });

  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Xantoss Puppeteer rodando na porta ${PORT}`
  );
});
