import fs from "node:fs";
import path from "node:path";

const roots = ["src", "app"];
const extensions = new Set([".ts", ".tsx", ".css"]);

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const filePath = path.join(dir, name);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      walk(filePath, files);
      continue;
    }

    if (extensions.has(path.extname(filePath))) {
      files.push(filePath);
    }
  }

  return files;
}

function hasSuspiciousKoreanMojibake(line) {
  for (const char of line) {
    const codePoint = char.codePointAt(0);

    if (codePoint === 0xfffd) {
      return true;
    }

    if (codePoint >= 0xf900 && codePoint <= 0xfaff) {
      return true;
    }
  }

  return false;
}

const findings = [];

for (const root of roots) {
  if (!fs.existsSync(root)) continue;

  for (const filePath of walk(root)) {
    const text = fs.readFileSync(filePath, "utf8");

    text.split(/\r?\n/).forEach((line, index) => {
      if (hasSuspiciousKoreanMojibake(line)) {
        findings.push({
          file: filePath,
          line: index + 1,
          text: line.trim(),
        });
      }
    });
  }
}

if (findings.length > 0) {
  console.error("Suspicious Korean mojibake text found:");

  findings.forEach((finding) => {
    console.error(`${finding.file}:${finding.line} ${finding.text}`);
  });

  process.exit(1);
}

console.log("Korean text check passed.");
