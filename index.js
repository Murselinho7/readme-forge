#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const process = require("process");

const IGNORE_DIRS = new Set(["node_modules", ".git"]);
const MAX_DEPTH = 6;
const MAX_ENTRIES = 40;

const JS_HINTS = [
  ["next", "Next.js"],
  ["react", "React"],
  ["vue", "Vue"],
  ["svelte", "Svelte"],
  ["express", "Express"],
  ["fastify", "Fastify"],
  ["electron", "Electron"],
  ["typescript", "TypeScript"],
];

const PY_HINTS = [
  ["django", "Django"],
  ["flask", "Flask"],
  ["fastapi", "FastAPI"],
  ["streamlit", "Streamlit"],
  ["pygame", "Pygame"],
];

function fail(message) {
  process.stderr.write(message + "\n");
  process.exit(1);
}

function printHelp() {
  process.stdout.write(
    [
      "Readme Forge",
      "",
      "Detect a project's language and stack, then write README.md and CHANGELOG.md.",
      "",
      "Usage:",
      "  node index.js [directory] [--title \"Name\"] [--desc \"Summary\"]",
      "",
      "Options:",
      "  --title   Heading used in the generated README",
      "  --desc    One-line description under the heading",
      "  --force   Allow writing inside the Readme Forge folder itself",
      "  --help    Show this message",
      "",
      "The directory defaults to the current working directory.",
      "Generated sections include a badge row, a file tree, Kurulum, and Nasıl Çalıştırılır.",
      "",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = {
    title: "",
    desc: "",
    dir: "",
    force: false,
    help: false,
  };
  const positional = [];
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
    } else if (token === "--force") {
      args.force = true;
    } else if (token === "--title" || token === "--desc") {
      const value = argv[i + 1];
      if (!value || value.indexOf("--") === 0) {
        fail("Missing value for " + token);
      }
      args[token.slice(2)] = value;
      i += 1;
    } else if (token.indexOf("--title=") === 0) {
      args.title = token.slice("--title=".length);
    } else if (token.indexOf("--desc=") === 0) {
      args.desc = token.slice("--desc=".length);
    } else if (token.indexOf("--") === 0) {
      fail("Unknown option: " + token);
    } else {
      positional.push(token);
    }
  }
  if (positional.length > 1) {
    fail("Pass one directory, not " + positional.length + ".");
  }
  args.dir = positional.length ? positional[0] : process.cwd();
  return args;
}

function cleanInline(value) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").trim();
}

function humanize(name) {
  const words = String(name || "Project").replace(/[-_]+/g, " ").trim().split(/\s+/);
  return words
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function readText(file) {
  try {
    let text = fs.readFileSync(file, "utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return text;
  } catch (err) {
    return null;
  }
}

function readJson(file) {
  const text = readText(file);
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return { __invalid: true };
  }
}

function walk(root) {
  const files = [];
  const counts = {};
  const tree = {
    name: path.basename(root) || root,
    dir: true,
    children: [],
  };

  function visit(dir, node, depth) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }
    const visible = [];
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (typeof entry.isSymbolicLink === "function" && entry.isSymbolicLink()) continue;
      visible.push(entry);
    }
    visible.sort((a, b) => {
      const ad = a.isDirectory() ? 0 : 1;
      const bd = b.isDirectory() ? 0 : 1;
      if (ad !== bd) return ad - bd;
      return a.name.localeCompare(b.name);
    });
    const shown = visible.slice(0, MAX_ENTRIES);
    for (let i = 0; i < shown.length; i += 1) {
      const entry = shown[i];
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (entry.isDirectory()) {
        const child = { name: entry.name, dir: true, children: [] };
        node.children.push(child);
        if (depth < MAX_DEPTH) visit(full, child, depth + 1);
        else child.children.push({ name: "…", dir: false });
      } else if (entry.isFile()) {
        node.children.push({ name: entry.name, dir: false });
        files.push(rel);
        const ext = path.extname(entry.name).toLowerCase();
        counts[ext] = (counts[ext] || 0) + 1;
      }
    }
    if (visible.length > MAX_ENTRIES) {
      node.children.push({
        name: "… " + (visible.length - MAX_ENTRIES) + " more",
        dir: false,
      });
    }
  }

  visit(root, tree, 1);
  return { files: files, counts: counts, tree: tree };
}

function renderTree(node) {
  const lines = [node.name + "/"];
  function visit(children, prefix) {
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      const last = i === children.length - 1;
      const branch = last ? "└── " : "├── ";
      const next = prefix + (last ? "    " : "│   ");
      lines.push(prefix + branch + child.name + (child.dir ? "/" : ""));
      if (child.children && child.children.length) visit(child.children, next);
    }
  }
  visit(node.children || [], "");
  return lines.join("\n").split("```").join("'''");
}

function hasFile(files, name) {
  const suffix = "/" + name;
  for (let i = 0; i < files.length; i += 1) {
    if (files[i] === name || files[i].slice(-suffix.length) === suffix) return true;
  }
  return false;
}

function pickFile(files, names) {
  for (let n = 0; n < names.length; n += 1) {
    const base = names[n];
    for (let i = 0; i < files.length; i += 1) {
      if (files[i] === base || files[i].slice(-(base.length + 1)) === "/" + base) {
        return files[i];
      }
    }
  }
  return "";
}

function requirementNames(text) {
  if (!text) return [];
  const names = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i].split("#")[0].trim();
    if (!raw || raw.charAt(0) === "-") continue;
    const name = raw.split(/[=<>;\s\[]/)[0].trim().toLowerCase();
    if (name) names.push(name);
  }
  return names;
}

function detect(root, scanned) {
  const files = scanned.files;
  const counts = scanned.counts;
  const rootPackagePath = path.join(root, "package.json");
  const requirementsPath = path.join(root, "requirements.txt");
  const cargoPath = path.join(root, "Cargo.toml");
  const pkg = fs.existsSync(rootPackagePath) ? readJson(rootPackagePath) : null;
  const requirements = fs.existsSync(requirementsPath) ? readText(requirementsPath) : null;
  const cargo = fs.existsSync(cargoPath) ? readText(cargoPath) : null;

  const stack = [];
  function add(label) {
    if (label && stack.indexOf(label) === -1) stack.push(label);
  }

  const ecosystems = {
    node: false,
    python: false,
    rust: false,
    dotnet: false,
    go: false,
    java: false,
    html: false,
  };

  if (pkg) {
    ecosystems.node = true;
    add("Node.js");
    if (!pkg.__invalid) {
      const deps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
      const keys = Object.keys(deps);
      for (let h = 0; h < JS_HINTS.length; h += 1) {
        if (Object.prototype.hasOwnProperty.call(deps, JS_HINTS[h][0])) add(JS_HINTS[h][1]);
      }
      if (keys.length === 0 && !pkg.dependencies && !pkg.devDependencies) {
        // Manifest exists even when it lists no packages.
      }
    }
  } else if ((counts[".js"] || 0) + (counts[".mjs"] || 0) + (counts[".cjs"] || 0) > 0) {
    ecosystems.node = true;
    add("JavaScript");
  }

  if ((counts[".js"] || 0) + (counts[".mjs"] || 0) + (counts[".cjs"] || 0) > 0 && stack.indexOf("JavaScript") === -1 && stack.indexOf("Node.js") === -1) {
    add("JavaScript");
  }
  if ((counts[".js"] || 0) > 0 && stack.indexOf("Node.js") !== -1 && stack.indexOf("JavaScript") === -1) {
    add("JavaScript");
  }

  if (requirements != null || (counts[".py"] || 0) > 0) {
    ecosystems.python = true;
    add("Python");
    const names = requirementNames(requirements);
    for (let h = 0; h < PY_HINTS.length; h += 1) {
      if (names.indexOf(PY_HINTS[h][0]) !== -1) add(PY_HINTS[h][1]);
    }
  }

  if (cargo != null || (counts[".rs"] || 0) > 0) {
    ecosystems.rust = true;
    add("Rust");
  }

  if (hasFile(files, "go.mod") || (counts[".go"] || 0) > 0) {
    ecosystems.go = true;
    add("Go");
  }

  if (hasFile(files, "pom.xml") || (counts[".java"] || 0) > 0) {
    ecosystems.java = true;
    add("Java");
  }

  const csproj = files.some((file) => file.slice(-7) === ".csproj" || file.slice(-4) === ".sln");
  if (csproj || (counts[".cs"] || 0) > 0) {
    ecosystems.dotnet = true;
    add("C#");
  }

  if ((counts[".html"] || 0) > 0) {
    ecosystems.html = true;
    add("HTML");
  }
  if ((counts[".css"] || 0) > 0) add("CSS");

  return {
    stack: stack,
    ecosystems: ecosystems,
    packageJson: pkg && !pkg.__invalid ? pkg : null,
    packageInvalid: !!(pkg && pkg.__invalid),
    hasRequirements: requirements != null,
    files: files,
  };
}

function shield(label, message, color) {
  function enc(value) {
    return encodeURIComponent(String(value)).replace(/-/g, "--").replace(/%20/g, "_");
  }
  return "https://img.shields.io/badge/" + enc(label) + "-" + enc(message) + "-" + color;
}

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return now.getFullYear() + "-" + month + "-" + day;
}

function codeBlock(lang, body) {
  return "```" + lang + "\n" + body.replace(/\s+$/, "") + "\n```";
}

function installSections(info) {
  const eco = info.ecosystems;
  const files = info.files;
  const pkg = info.packageJson;
  const blocks = [];

  if (eco.python) {
    const lines = ["### Python", ""];
    if (info.hasRequirements) {
      lines.push("Sanal ortam açıp bağımlılıkları kurun.", "");
      lines.push(codeBlock("bash", "python -m venv .venv\n.venv\\Scripts\\activate\npip install -r requirements.txt"));
      lines.push("");
      lines.push("macOS ve Linux üzerinde aktivasyon komutu `source .venv/bin/activate` şeklindedir.");
    } else {
      lines.push("Üçüncü parti bir paket listesi yok. Python 3 yeterlidir.");
    }
    blocks.push(lines.join("\n"));
  }

  if (eco.node) {
    const lines = ["### Node.js", ""];
    if (pkg) {
      lines.push(codeBlock("bash", "npm install"));
    } else if (info.packageInvalid) {
      lines.push("`package.json` okunamadı. Dosyayı düzelttikten sonra `npm install` çalıştırın.");
    } else {
      lines.push("Harici bir npm paketi gerekmiyor. Node.js 16 veya daha yeni bir sürüm yeterlidir.");
    }
    blocks.push(lines.join("\n"));
  }

  if (eco.rust) {
    blocks.push("### Rust\n\n" + codeBlock("bash", "cargo build"));
  }
  if (eco.dotnet) {
    blocks.push("### .NET\n\n" + codeBlock("bash", "dotnet restore"));
  }
  if (eco.go) {
    blocks.push("### Go\n\n" + codeBlock("bash", "go mod download"));
  }
  if (eco.java && !eco.dotnet) {
    blocks.push("### Java\n\nProje bir Maven dosyası içeriyorsa `mvn compile` kullanın.");
  }
  if (eco.html && !eco.node && !eco.python && !eco.rust && !eco.dotnet && !eco.go && !eco.java) {
    blocks.push("Kurulum gerekmez. Sayfa statik HTML, CSS ve JavaScript dosyalarından oluşur.");
  }
  if (!blocks.length) {
    blocks.push("Bu klasörde bilinen bir paket dosyası bulunamadı. İlgili dilin çalışma zamanını kurmanız yeterlidir.");
  }
  return blocks.join("\n\n");
}

function runSections(info) {
  const eco = info.ecosystems;
  const files = info.files;
  const pkg = info.packageJson;
  const blocks = [];

  if (eco.python) {
    const entry = pickFile(files, ["main.py", "app.py", "demo.py", "scanner.py", "limiter.py"]) ||
      files.filter((file) => file.slice(-3) === ".py")[0] ||
      "main.py";
    blocks.push("### Python\n\n" + codeBlock("bash", "python " + entry));
  }

  if (eco.node) {
    let command = "node index.js";
    const entry = pickFile(files, ["index.js", "server.js", "main.js", "app.js"]);
    if (pkg && pkg.scripts && pkg.scripts.start) command = "npm start";
    else if (entry) command = "node " + entry;
    blocks.push("### Node.js\n\n" + codeBlock("bash", command));
  }

  if (eco.rust) blocks.push("### Rust\n\n" + codeBlock("bash", "cargo run"));
  if (eco.dotnet) blocks.push("### .NET\n\n" + codeBlock("bash", "dotnet run"));
  if (eco.go) blocks.push("### Go\n\n" + codeBlock("bash", "go run ."));

  if (eco.html) {
    const page = pickFile(files, ["index.html"]) || files.filter((file) => file.slice(-5) === ".html")[0] || "index.html";
    blocks.push("### Tarayıcı\n\n`" + page + "` dosyasını çift tıklayarak açın. Ek bir derleme adımı yoktur.");
  }

  if (!blocks.length) {
    blocks.push("Çalıştırılacak bir giriş dosyası otomatik seçilemedi. Projenin ana dosyasını elle çalıştırın.");
  }
  return blocks.join("\n\n");
}

function buildReadme(info) {
  const stack = info.stack.length ? info.stack : ["Belirsiz"];
  const primary = stack[0];
  const badges = [
    "![" + primary + "](" + shield("language", primary, "0F766E") + ")",
    "![Files](" + shield("files", String(info.files.length), "1D4ED8") + ")",
    "![Readme Forge](" + shield("docs", "Readme_Forge", "444444") + ")",
  ];
  const stackList = stack.map((item) => "- " + item).join("\n");
  const licenseFile = ["LICENSE", "LICENSE.md", "COPYING"].filter((name) => hasFile(info.files, name))[0];
  const licenseLine = licenseFile
    ? "Bu depo `" + licenseFile + "` dosyasını içerir."
    : "Henüz bir lisans dosyası yok. Yayına almadan önce bir lisans ekleyin.";

  return [
    "# " + info.title,
    "",
    info.desc,
    "",
    "## Rozetler",
    "",
    badges.join(" "),
    "",
    "## Teknoloji Yığını",
    "",
    stackList,
    "",
    "## Mimari Ağacı",
    "",
    "Ağaç, `node_modules` ve `.git` klasörleri hariç, üretim anındaki dosyaları gösterir. Çok geniş klasörler kısaltılır.",
    "",
    codeBlock("text", renderTree(info.tree)),
    "",
    "## Kurulum",
    "",
    installSections(info),
    "",
    "## Nasıl Çalıştırılır",
    "",
    runSections(info),
    "",
    "## Lisans",
    "",
    licenseLine,
    "",
  ].join("\n");
}

function buildChangelog(title) {
  return [
    "# Değişiklik Günlüğü",
    "",
    title + " için değişiklik kaydı. Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) önerisine uyar.",
    "",
    "## [Unreleased]",
    "",
    "### Added",
    "",
    "-",
    "",
    "### Changed",
    "",
    "-",
    "",
    "### Fixed",
    "",
    "-",
    "",
    "## [0.1.0] - " + today(),
    "",
    "### Added",
    "",
    "- İlk proje iskeleti.",
    "- Readme Forge ile üretilen README ve değişiklik günlüğü.",
    "",
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const target = path.resolve(args.dir);
  let stat = null;
  try {
    stat = fs.statSync(target);
  } catch (err) {
    fail("Directory not found: " + target);
  }
  if (!stat.isDirectory()) fail("Not a directory: " + target);

  const selfRoot = path.resolve(__dirname);
  if (target.toLowerCase() === selfRoot.toLowerCase() && !args.force) {
    fail(
      "This is the Readme Forge project. Pass another directory, or pass --force to replace this README."
    );
  }

  const scanned = walk(target);
  const detected = detect(target, scanned);
  const title = cleanInline(args.title) || humanize(path.basename(target));
  const desc = cleanInline(args.desc) ||
    (detected.stack.length
      ? detected.stack.slice(0, 4).join(", ") + " ile geliştirilmiş bir proje."
      : "Bu proje Readme Forge tarafından belgelendi.");

  const info = {
    title: title,
    desc: desc,
    stack: detected.stack,
    ecosystems: detected.ecosystems,
    packageJson: detected.packageJson,
    packageInvalid: detected.packageInvalid,
    hasRequirements: detected.hasRequirements,
    files: detected.files,
    tree: scanned.tree,
  };

  const readmePath = path.join(target, "README.md");
  const changelogPath = path.join(target, "CHANGELOG.md");
  fs.writeFileSync(readmePath, buildReadme(info), "utf8");
  fs.writeFileSync(changelogPath, buildChangelog(title), "utf8");

  process.stdout.write("Stack: " + (info.stack.join(", ") || "unknown") + "\n");
  process.stdout.write("Wrote " + readmePath + "\n");
  process.stdout.write("Wrote " + changelogPath + "\n");
}

main();
