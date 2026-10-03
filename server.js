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

app.get("/browser-test", async (req, res) => {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.goto("https://example.com", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    const title = await page.title();

    res.json({
      success: true,
      chromium: "Funcionando",
      title
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
