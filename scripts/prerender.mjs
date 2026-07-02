import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "dist");
const PORT = 4173;

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = req.url.split("?")[0];
      let filePath = path.join(DIST_DIR, urlPath);

      if (urlPath === "/" || !path.extname(filePath)) {
        filePath = path.join(DIST_DIR, "index.html");
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function prerender() {
  console.log("Iniciando servidor estático...");
  const server = await startStaticServer();

  console.log("Lanzando Puppeteer...");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  // Otorgar permisos de geolocalización para evitar prompts
  const context = browser.defaultBrowserContext();
  await context.overridePermissions(`http://localhost:${PORT}`, ["geolocation"]);

  console.log("Cargando página...");
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 });

  // Esperar a que React renderice el contenido de la landing
  await page.waitForSelector("h1", { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 2000));

  // Screenshot de debug
  await page.screenshot({ path: "dist/prerender-debug.png", fullPage: false });
  console.log("Screenshot de debug guardado en dist/prerender-debug.png");

  // Expandir sección de FAQs
  console.log("Expandiendo FAQs...");
  const buttons = await page.$$("button");
  for (const btn of buttons) {
    const text = await btn.evaluate((el) => el.textContent || "");
    if (text.includes("Preguntas frecuentes") && !text.includes("Iniciar")) {
      await btn.click();
      await new Promise((r) => setTimeout(r, 300));
      break;
    }
  }

  // Expandir cada pregunta del FAQ (solo botones dentro de contenedores bg-slate-50)
  const faqButtons = await page.$$("div.bg-slate-50 > button");
  for (const btn of faqButtons) {
    const text = await btn.evaluate((el) => el.textContent || "");
    if (text.trim().startsWith("¿") && text.length < 150 && !text.includes("Iniciar") && !text.includes("Regístrate") && !text.includes("cuenta")) {
      await btn.click().catch(() => {});
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  // Expandir cada beneficio (solo los que tienen iconos específicos)
  console.log("Expandiendo beneficios...");
  const benefitItems = await page.$$("div.bg-white > div.cursor-pointer");
  for (const item of benefitItems) {
    const text = await item.evaluate((el) => el.textContent || "");
    if ((text.includes("CSSP") || text.includes("Flexibilidad") || text.includes("Transparencia") ||
        text.includes("Tú decides") || text.includes("Para cualquier") || text.includes("En todo") ||
        text.includes("Sin compromiso") || text.includes("Tú defines") || text.includes("Sabes a quién") ||
        text.includes("Formalidad") || text.includes("Sin renunciar") || text.includes("Verificadas")) &&
        !text.includes("Iniciar") && !text.includes("Regístrate")) {
      await item.click().catch(() => {});
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  await new Promise((r) => setTimeout(r, 500));

  // Extraer el HTML renderizado
  console.log("Extrayendo HTML renderizado...");
  const rootContent = await page.evaluate(() => {
    const root = document.getElementById("root");
    return root ? root.innerHTML : "";
  });

  // Leer el index.html original e inyectar el contenido
  const indexPath = path.join(DIST_DIR, "index.html");
  let html = fs.readFileSync(indexPath, "utf-8");
  html = html.replace(
    '<div id="root"></div>',
    `<div id="root">${rootContent}</div>`
  );

  // Agregar noscript fallback
  if (!html.includes("<noscript>")) {
    html = html.replace(
      "</body>",
      `<noscript><p>BienCuidar conecta familias con enfermeras profesionales verificadas en El Salvador. Solicita cuidado a domicilio o regístrate como enfermera independiente. Visita biencuidar.agtisa.com</p></noscript>\n</body>`
    );
  }

  fs.writeFileSync(indexPath, html, "utf-8");

  console.log("Cerrando navegador...");
  await browser.close();

  console.log("Cerrando servidor...");
  server.close();

  console.log("✅ Prerendering completo - index.html actualizado con contenido renderizado");
}

prerender().catch((err) => {
  console.error("❌ Error en prerendering:", err.message);
  process.exit(1);
});
