# CommandDeck

Dark-mode Electron launcher for Flutter projects and general terminal commands, for Windows.

## Installation

**Download the latest version: [github.com/redubbledd1-ops/CommandDeck/releases](https://github.com/redubbledd1-ops/CommandDeck/releases)**

1. Open the [latest release](https://github.com/redubbledd1-ops/CommandDeck/releases/latest) and download `CommandDeck-Setup-<version>.exe`
2. Run the setup and choose:
   - the install folder
   - a **desktop shortcut** (on by default)
   - pin to the taskbar (off by default)
3. Done. CommandDeck starts after the install and updates itself from then on.

Prefer no installer? Download `CommandDeck.exe` from the same release. It is the
portable version (handy on a USB stick), but it starts slower because it unpacks
itself on every launch.

Requires Windows 10 or 11 (64-bit). Git and the GitHub CLI are optional: when
you use a feature that needs them and they are missing, CommandDeck offers to
install them for you through winget. For Flutter projects you need the
[Flutter SDK](https://docs.flutter.dev/get-started/install/windows).

## Run from source

1. Install [Node.js](https://nodejs.org/) 22 or newer, and [Git](https://git-scm.com/download/win)
2. Clone and start:

```bash
git clone https://github.com/redubbledd1-ops/CommandDeck.git
cd CommandDeck
npm install
npm start
```

Run the tests with `npm test`.

## Building

```bash
npm run build
```

Creates in `dist/`:

| File | What |
| --- | --- |
| `CommandDeck-Setup-<version>.exe` | NSIS installer with desktop and start menu options |
| `CommandDeck.exe` | Portable (self-extracting) |

Only the installer, or only the portable version:

```bash
npm run build:installer
npm run build:portable
```

## Releasing a new version

Installed copies of CommandDeck compare their version with the newest
[GitHub release](https://github.com/redubbledd1-ops/CommandDeck/releases), so a
new version only reaches users once it is published there.

1. Bump `version` in `package.json` (`1.0.0` → `1.0.1` for fixes, `1.1.0` for new features)
2. Commit and push to `main`
3. `npm run release`

The script refuses to run with uncommitted changes, when `main` is not in sync
with GitHub, or when `v<version>` is already published. It uses the token from
your `gh` login (or `GH_TOKEN` when set), creates and pushes the tag
`v<version>`, builds the setup and the portable version, creates the release and
uploads `latest.yml`, the file the updater looks at. If an earlier attempt
stopped halfway (a release without `latest.yml`), it simply finishes it.

## Features

- Projects with multiple **locations**, switchable from a dropdown
- **Choose folder** with a folder picker, or clone a GitHub repository straight into a new project
- Flutter commands: run android / windows / web, pub get, clean, doctor, build apk / web / windows
- Live terminal output inside the app, plus a real terminal for interactive programs
- Git built in: status, commit, push, pull, linking to GitHub. Missing Git or GitHub CLI is installed on request
- Open a project in your editor: VS Code, Cursor, JetBrains IDEs, Android Studio and more are detected automatically
- Projects and settings live in `%APPDATA%\commanddeck\` and survive updates
- Available in 30 languages; the first start follows your Windows language
- When Flutter is missing from `PATH`, a Flutter action shows clear install help in the terminal

> Tip: if you previously installed **Flutter Launcher**, your old projects and settings are taken over automatically.

## AI services in the output window

Besides Claude Code (which runs as its own program in a real terminal),
CommandDeck can talk to an AI service itself. That happens in the same output
window: you type in the command bar and the answer appears above it.

### Usage

| Command | What |
| --- | --- |
| `/use claude` | start a conversation with Claude (`/use claude:opus` picks a model right away) |
| `/ai <question>` | ask one question without switching modes |
| `/model`, `/models [live]` | switch model, or list them (`live` = ask the service itself) |
| `/providers` | which services exist and whether they are ready |
| `/key <key>` | save an API key (empty = remove) |
| `/system <text>` | your own system prompt |
| `/new` | clear the conversation |
| `/stop` | stop the running answer |
| `/shell` | leave conversation mode |
| `!<command>` | run a normal command anyway, in the middle of a conversation |

As soon as a service is ready, a button appears: under **run** for a project,
and among the **shortcuts** in the cmd section. One click starts a conversation,
another click on the same button takes you back to the shell. Hide it with
`/buttons off`.

Every project (and the separate cmd section) has its own conversation. Switch
project and you switch conversation; what you typed but did not send yet stays
per view.

All of the above is also in the dictionary under the theme **ai**, so you do not
have to remember it. Create your own categories with `theme <name>`, and
`theme <name> <command>` adds a command to it right away, from the cmd section
or from a project.

The key can also come from the environment: when `ANTHROPIC_API_KEY` is already
set, it is used automatically.

### Which services

| Service | `/use` | Key from | Free? |
| --- | --- | --- | --- |
| Claude | `claude` | `ANTHROPIC_API_KEY` | no |
| ChatGPT | `openai` | `OPENAI_API_KEY` | no |
| Gemini | `gemini` | `GEMINI_API_KEY` | yes, AI Studio, no card needed |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | yes, models ending in `:free` |
| Groq | `groq` | `GROQ_API_KEY` | yes |
| Cerebras | `cerebras` | `CEREBRAS_API_KEY` | yes |
| Mistral | `mistral` | `MISTRAL_API_KEY` | yes, "Experiment" tier |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` | no |
| Grok | `grok` | `XAI_API_KEY` | no |
| Ollama | `ollama` | — | yes, runs locally |
| LM Studio | `lmstudio` | — | yes, runs locally |
| Your own server | `eigen` | optional | — |

The model lists in the code are a starting point. `/models live` (or the
**Fetch** button in the settings) asks the service itself for the real list, and
you can type any model name that is not in it.

Keys are **not** stored in `settings.json` but in `ai-keys.json` in
`%APPDATA%\commanddeck\`, encrypted with the Windows keychain. They only travel
from the renderer to the main process, never back.

### Adding a service

Add one object to `src/ai-providers.js` with: the address, which key belongs to
it, the models, what a request looks like, and how to get a piece of text out of
one stream event. The rest of the app does not need to change, since it only
knows those fields. At the top of `src/ai-providers.js` is a worked example for
an OpenAI-compatible server (which also covers Ollama, LM Studio and vLLM).

## Project layout

| Path | What |
| --- | --- |
| `src/main.js` | Electron main process: commands, git, settings, updates |
| `src/renderer.js`, `src/index.html`, `src/style.css` | the window |
| `src/preload.js` | the bridge between the two |
| `src/*.js` | modules with pure logic (git, web, AI, editors, …), tested without Electron |
| `src/locales/` | translations |
| `src/assets/` | icons and fonts |
| `test/` | tests, `npm test` runs them all |
| `scripts/release.js` | publishes a release (`npm run release`) |
| `build/` | installer customisation |
| `docs/` | development notes and to-do lists |
