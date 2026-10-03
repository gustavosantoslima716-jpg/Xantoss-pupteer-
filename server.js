import express from "express";
import puppeteer from "puppeteer";

const app = express();

app.use(express.json());

// CORS para permitir o teste pelo Hoppscotch
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

    // Localiza o campo do link
    const input = await page.$(
      'input[placeholder="Enter pin or link"]'
    );

    if (!input) {
      throw new Error(
        "Campo de link não encontrado."
      );
    }

    // Coloca o link da atividade
    await input.click();
    await input.type(link);

    // Clica em um elemento pelo texto visível
    async function clickText(text) {
      return await page.evaluate((texto) => {
        const elementos =
          [...document.querySelectorAll("*")];

        const alvo = elementos.find((el) => {
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

        if (!alvo) {
          return false;
        }

        alvo.click();

        return true;
      }, text);
    }

    // Abre o seletor de método
    const abriuMetodo =
      await clickText("Standard");

    if (!abriuMetodo) {
      throw new Error(
        "Seletor de método não encontrado."
      );
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 700)
    );

    // Seleciona Undetectable
    const selecionou =
      await clickText("Undetectable");

    if (!selecionou) {
      throw new Error(
        "Opção Undetectable não encontrada."
      );
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 500)
    );

    // Envia
    const enviou =
      await clickText("Get answers");

    if (!enviou) {
      throw new Error(
        "Botão Get answers não encontrado."
      );
    }

    // Aguarda o processamento
    await new Promise((resolve) =>
      setTimeout(resolve, 12000)
    );

    // Lê apenas o conteúdo que ficou disponível
    // normalmente na página.
    const resultado = await page.evaluate(() => {
      const texto =
        document.body.innerText || "";

      return {
        urlFinal: location.href,

        title: document.title,

        encontrouSolutions:
          texto.includes("Your solutions"),

        encontrouMCQ:
          texto.includes("MCQ"),

        encontrouSlide:
          texto.includes("SLIDEV2"),

        encontrouUnlock:
          texto.includes("Unlock answer"),

        textoPagina:
          texto.slice(0, 12000)
      };
    });

    res.json({
      success: true,
      ...resultado
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
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
