import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "Xantoss Puppeteer"
  });
});

app.get("/google-test", async (req, res) => {
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

    // Abre diretamente o login do Quizit
    await page.goto(
      "https://quizit.online/auth/login?next=/services/wayground",
      {
        waitUntil: "networkidle2",
        timeout: 60000
      }
    );

    // Procura "Log in with Google"
    const encontrouGoogle = await page.evaluate(() => {
      const elementos = [
        ...document.querySelectorAll(
          "button, a, [role='button']"
        )
      ];

      const alvo = elementos.find(el =>
        (el.innerText || "")
          .trim()
          .toLowerCase()
          .includes("log in with google")
      );

      if (!alvo) return false;

      alvo.click();
      return true;
    });

    if (!encontrouGoogle) {
      throw new Error(
        'Botão "Log in with Google" não encontrado.'
      );
    }

    // Espera o redirecionamento/popup
    await new Promise(resolve =>
      setTimeout(resolve, 7000)
    );

    // Pode ter aberto uma nova aba/popup
    const pages = await browser.pages();

    const paginas = [];

    for (const p of pages) {
      paginas.push({
        url: p.url(),
        title: await p.title().catch(() => "")
      });
    }

    const paginaAtual =
      pages[pages.length - 1];

    const texto = await paginaAtual
      .evaluate(() =>
        document.body?.innerText?.slice(0, 2000) || ""
      )
      .catch(() => "");

    return res.json({
      success: true,

      encontrouGoogle: true,

      quantidadePaginas: pages.length,

      paginas,

      paginaFinal: {
        url: paginaAtual.url(),
        title: await paginaAtual
          .title()
          .catch(() => ""),
        texto
      }
    });

  } catch (error) {
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
