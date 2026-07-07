import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "dist");
const PRERENDERED_FILE = path.resolve(__dirname, "..", "prerendered-root.html");

const indexPath = path.join(DIST_DIR, "index.html");
const prerenderedContent = fs.readFileSync(PRERENDERED_FILE, "utf-8");

let html = fs.readFileSync(indexPath, "utf-8");

html = html.replace(
  '<div id="root"></div>',
  `<div id="root">${prerenderedContent}</div>`
);

if (!html.includes("<noscript>")) {
  html = html.replace(
    "</body>",
    `<noscript><p>BienCuidar conecta familias con enfermeras profesionales verificadas en El Salvador. Solicita cuidado a domicilio o regístrate como enfermera independiente. Visita biencuidar.agtisa.com</p></noscript>\n</body>`
  );
}

fs.writeFileSync(indexPath, html, "utf-8");
console.log("✅ Prerender aplicado desde prerendered-root.html");
