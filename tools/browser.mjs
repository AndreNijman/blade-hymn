import puppeteer from "puppeteer-core";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

export const ROOT = resolve(process.env.BLADE_HYMN_ROOT || fileURLToPath(new URL("../", import.meta.url)));
export async function openGame({ realtime = false } = {}) {
  const mime = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".tmx": "text/xml", ".tsx": "text/xml", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ttf": "font/ttf" };
  const server = http.createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      if (path.endsWith("/")) path += "index.html";
      path = resolve(ROOT, "." + path);
      if (!path.startsWith(ROOT + sep)) throw new Error("Outside root");
      const body = await readFile(path);
      res.writeHead(200, { "Content-Type": mime[extname(path)] || "application/octet-stream" });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_BIN || `${homedir()}/.cache/chrome-devtools-mcp/chrome-for-testing/152.0.7977.82/chrome-linux64/chrome`,
      headless: true,
      args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    // Stop the production scheduler BEFORE boot; tests own every simulation tick.
    if (!realtime) await page.evaluateOnNewDocument(() => { window.requestAnimationFrame = () => 0; });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => document.getElementById("loading").hidden, { timeout: 120000, polling: 100 });
    return { page, errors, url: `http://127.0.0.1:${server.address().port}/`, close: async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); } };
  } catch (error) {
    await browser?.close();
    server.close();
    throw error;
  }
}
