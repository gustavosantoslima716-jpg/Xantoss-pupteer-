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

app.get("/quizit-test", async (req, res) => {
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

    await page.goto("https://quizit.online/services/wayground", {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    const resultado = await page.evaluate(() => {
      const input = document.querySelector("input");
      const selects = [...document.querySelectorAll("select")];

      return {
        title: document.title,
        url: location.href,
        inputEncontrado: !!input,
        placeholder: input?.placeholder || null,
        selectsEncontrados: selects.length,
        textoPagina: document.body.innerText.slice(0, 1500)
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
    if (browser) {
      await browser.close();
    }
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Xantoss Puppeteer rodando na porta ${PORT}`);
});
