import fs from "fs";

const html = fs.readFileSync("dist/index.html", "utf-8");
const match = html.match(/<div id="root">([\s\S]*?)<\/div>\s*<script>/);
if (match) {
  fs.writeFileSync("prerendered-root.html", match[1].trim(), "utf-8");
  console.log("Saved prerendered-root.html, length:", match[1].trim().length);
} else {
  console.error("No match found");
  process.exit(1);
}
