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
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: 1365,
      height: 900
    });

    await page.goto("https://quizit.online/services/wayground", {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    // Preenche o link
    const input = await page.$('input[placeholder="Enter pin or link"]');

    if (!input) {
      throw new Error("Campo de link não encontrado.");
    }

    await input.click();
    await input.type(link);

    // Procura elementos clicáveis pelo texto visível
    async function clickText(text) {
      const encontrou = await page.evaluate((texto) => {
        const elementos = [...document.querySelectorAll("*")];

        const alvo = elementos.find(el => {
          const t = el.textContent?.trim();
          const visivel =
            el.offsetWidth > 0 &&
            el.offsetHeight > 0;

          return t === texto && visivel;
        });

        if (!alvo) return false;

        alvo.click();
        return true;
      }, text);

      return encontrou;
    }

    // Abre o seletor "Standard"
    const abriuMetodo = await clickText("Standard");

    if (!abriuMetodo) {
      throw new Error("Seletor de método não encontrado.");
    }

    await new Promise(r => setTimeout(r, 700));

    // Seleciona Undetectable
    const selecionou = await clickText("Undetectable");

    if (!selecionou) {
      throw new Error("Opção Undetectable não encontrada.");
    }

    await new Promise(r => setTimeout(r, 500));

    // Clica em Get answers
    const enviou = await clickText("Get answers");

    if (!enviou) {
      throw new Error("Botão Get answers não encontrado.");
    }

    // Espera a navegação/processamento
    await new Promise(r => setTimeout(r, 12000));

    const resultado = await page.evaluate(() => {
      const texto = document.body.innerText;

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

        textoPagina: texto.slice(0, 12000)
      };
    });

    res.json({
      success: true,
      ...resultado
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });

  } finally {
    if (browser) await browser.close();
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Xantoss Puppeteer rodando na porta ${PORT}`);
});
