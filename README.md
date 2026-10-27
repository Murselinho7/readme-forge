# Readme Forge

![Node](https://img.shields.io/badge/node-%3E%3D16-339933?logo=node.js&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-zero-success)
![License](https://img.shields.io/badge/license-MIT-blue)

Readme Forge inspects a project folder and writes two files into that folder:

- `README.md` — title, badges, detected stack, a file tree, **Kurulum**, and **Nasıl Çalıştırılır**
- `CHANGELOG.md` — a Keep a Changelog template dated today

It uses only Node's `fs`, `path`, and `process` modules. There is no `npm install` step.

## What it detects

| Signal | Stack it records |
| --- | --- |
| `package.json` | Node.js, plus React, Next.js, Vue, Svelte, Express, Fastify, Electron, or TypeScript when those names appear in dependencies |
| `requirements.txt` | Python, plus Django, Flask, FastAPI, Streamlit, or Pygame |
| `Cargo.toml` or `.rs` files | Rust |
| `.py`, `.js`, `.cs`, `.html` | Python, JavaScript, C#, HTML |
| `.csproj` / `.sln` | C# |
| `go.mod`, `pom.xml` | Go, Java |

The file tree skips `node_modules` and `.git`. A directory is capped at 40 entries and 6 levels so a huge checkout cannot produce an unreadable README.

## Usage

```bash
node index.js --help

node index.js C:\path\to\project --title "My App" --desc "Short summary of what it does"

node index.js . --title "Demo"
```

`--title` and `--desc` also accept the `--title=Name` form. With no directory, Forge uses the current working directory. With no title, it humanizes the folder name.

Running it inside this folder is refused, because that would replace this usage guide. Point it at another project, or pass `--force` if you really want to overwrite these files.

```bash
node index.js ..\some-other-project --title "Some Other Project" --desc "A small demo."
```

From `package.json`:

```bash
npm start
npm run forge -- ..\some-other-project --title "Some Other Project"
```

Both commands still run `node index.js`. npm does not need to install anything.

## Generated README

The Turkish section headings are fixed so every project gets the same shape:

1. Title and description
2. `## Rozetler` — language, file count, and a Readme Forge badge
3. `## Teknoloji Yığını`
4. `## Mimari Ağacı` — indented tree in a text block
5. `## Kurulum` — venv and pip, `npm install`, `cargo build`, or a note that a static site needs nothing
6. `## Nasıl Çalıştırılır` — `python …`, `npm start` or `node …`, `cargo run`, `dotnet run`, or “open the HTML file”
7. `## Lisans`

`CHANGELOG.md` starts at `0.1.0` with today's date and an empty `Unreleased` section. Forge replaces both files on every run.

## Requirements

Node.js 16 or newer. Check with `node --version`.

## License

Released under the MIT License.
