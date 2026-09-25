import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const releasesDir = path.join(rootDir, "releases");
const unpackedDir = path.join(releasesDir, "unpacked");
const zipFile = path.join(releasesDir, "chrome-ext-ai-sidepanel.zip");

console.log("📦 Packaging Chrome/Edge AI Sidepanel...");

// 1. Check dist
if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, "manifest.json"))) {
  console.log("🔨 Running build first...");
  execSync("npm run build", { cwd: rootDir, stdio: "inherit" });
}

// 2. Prepare releases/unpacked
if (fs.existsSync(unpackedDir)) {
  fs.rmSync(unpackedDir, { recursive: true, force: true });
}
fs.mkdirSync(unpackedDir, { recursive: true });

function copyRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyRecursive(distDir, unpackedDir);
console.log("✅ Unpacked extension copied to: releases/unpacked");

// 3. Create zip file
if (fs.existsSync(zipFile)) {
  fs.unlinkSync(zipFile);
}

try {
  execSync(`cd "${unpackedDir}" && zip -r "${zipFile}" .`, { stdio: "ignore" });
  const stat = fs.statSync(zipFile);
  console.log(`✅ ZIP archive created: releases/chrome-ext-ai-sidepanel.zip (${(stat.size / 1024).toFixed(1)} KB)`);
} catch (err) {
  console.warn("⚠️ Could not generate zip automatically:", err.message);
}

console.log("🎉 Packaging completed! Users can load releases/unpacked directly in chrome://extensions.");
