// Bekende editors en IDE's, zodat de app ze zelf kan opsporen.
//
// Per editor kun je drie dingen opgeven; alle drie mogen weg als ze niet van
// toepassing zijn:
//
//   paden     relatieve paden onder een installatiemap. Die worden op elke
//             schijf geprobeerd onder Program Files, Program Files (x86) en
//             onder de gebruikersmappen.
//   versieMap voor programma's die in een map met versienummer landen, zoals
//             JetBrains: "JetBrains\IntelliJ IDEA 2024.1\bin\idea64.exe".
//             We kijken dan welke mappen er staan en pakken de nieuwste.
//   cli       de naam waarmee het in PATH staat.
//   startMenu waar de snelkoppeling in het startmenu op lijkt. Dat vangt
//             installaties op plekken die we niet kennen.
//
// Uitbreiden is een kwestie van een regel toevoegen.

const EDITORS = [
  // ── Moderne code-editors ──────────────────────────────────────────────────
  { id: 'vscode', label: 'Visual Studio Code', cli: 'code',
    paden: ['Microsoft VS Code\\Code.exe'],
    gebruiker: ['Programs\\Microsoft VS Code\\Code.exe'],
    startMenu: /^visual studio code$/i },

  { id: 'vscode-insiders', label: 'VS Code Insiders',
    paden: ['Microsoft VS Code Insiders\\Code - Insiders.exe'],
    gebruiker: ['Programs\\Microsoft VS Code Insiders\\Code - Insiders.exe'],
    startMenu: /visual studio code insiders/i },

  { id: 'vscodium', label: 'VSCodium', cli: 'codium',
    paden: ['VSCodium\\VSCodium.exe'],
    gebruiker: ['Programs\\VSCodium\\VSCodium.exe'],
    startMenu: /^vscodium/i },

  { id: 'cursor', label: 'Cursor', cli: 'cursor',
    paden: ['Cursor\\Cursor.exe'],
    gebruiker: ['Programs\\Cursor\\Cursor.exe'],
    startMenu: /^cursor$/i },

  { id: 'windsurf', label: 'Windsurf', cli: 'windsurf',
    paden: ['Windsurf\\Windsurf.exe'],
    gebruiker: ['Programs\\Windsurf\\Windsurf.exe'],
    startMenu: /^windsurf/i },

  { id: 'trae', label: 'Trae',
    paden: ['Trae\\Trae.exe'],
    gebruiker: ['Programs\\Trae\\Trae.exe'],
    startMenu: /^trae$/i },

  { id: 'zed', label: 'Zed', cli: 'zed',
    paden: ['Zed\\Zed.exe'],
    gebruiker: ['Programs\\Zed\\Zed.exe'],
    startMenu: /^zed$/i },

  { id: 'sublime', label: 'Sublime Text', cli: 'subl',
    paden: ['Sublime Text\\sublime_text.exe', 'Sublime Text 3\\sublime_text.exe', 'Sublime Text 4\\sublime_text.exe'],
    startMenu: /^sublime text/i },

  { id: 'notepadpp', label: 'Notepad++',
    paden: ['Notepad++\\notepad++.exe'],
    startMenu: /^notepad\+\+/i },

  { id: 'pulsar', label: 'Pulsar',
    paden: ['Pulsar\\Pulsar.exe'],
    gebruiker: ['Programs\\Pulsar\\Pulsar.exe'],
    startMenu: /^pulsar$/i },

  { id: 'lapce', label: 'Lapce',
    paden: ['Lapce\\lapce.exe'],
    gebruiker: ['Programs\\Lapce\\lapce.exe'],
    startMenu: /^lapce$/i },

  // ── JetBrains ─────────────────────────────────────────────────────────────
  { id: 'idea',      label: 'IntelliJ IDEA',  versieMap: { onder: 'JetBrains', patroon: /^IntelliJ IDEA/i, exe: 'bin\\idea64.exe' },     startMenu: /^intellij idea/i },
  { id: 'webstorm',  label: 'WebStorm',       versieMap: { onder: 'JetBrains', patroon: /^WebStorm/i,      exe: 'bin\\webstorm64.exe' }, startMenu: /^webstorm/i },
  { id: 'pycharm',   label: 'PyCharm',        versieMap: { onder: 'JetBrains', patroon: /^PyCharm/i,       exe: 'bin\\pycharm64.exe' },  startMenu: /^pycharm/i },
  { id: 'phpstorm',  label: 'PhpStorm',       versieMap: { onder: 'JetBrains', patroon: /^PhpStorm/i,      exe: 'bin\\phpstorm64.exe' }, startMenu: /^phpstorm/i },
  { id: 'rider',     label: 'Rider',          versieMap: { onder: 'JetBrains', patroon: /^JetBrains Rider/i, exe: 'bin\\rider64.exe' },  startMenu: /rider/i },
  { id: 'clion',     label: 'CLion',          versieMap: { onder: 'JetBrains', patroon: /^CLion/i,         exe: 'bin\\clion64.exe' },    startMenu: /^clion/i },
  { id: 'goland',    label: 'GoLand',         versieMap: { onder: 'JetBrains', patroon: /^GoLand/i,        exe: 'bin\\goland64.exe' },   startMenu: /^goland/i },
  { id: 'rubymine',  label: 'RubyMine',       versieMap: { onder: 'JetBrains', patroon: /^RubyMine/i,      exe: 'bin\\rubymine64.exe' }, startMenu: /^rubymine/i },
  { id: 'datagrip',  label: 'DataGrip',       versieMap: { onder: 'JetBrains', patroon: /^DataGrip/i,      exe: 'bin\\datagrip64.exe' }, startMenu: /^datagrip/i },
  { id: 'androidstudio', label: 'Android Studio',
    paden: ['Android\\Android Studio\\bin\\studio64.exe', 'Android Studio\\bin\\studio64.exe'],
    startMenu: /^android studio/i },

  // ── Grote IDE's ───────────────────────────────────────────────────────────
  { id: 'visualstudio', label: 'Visual Studio',
    versieMap: { onder: 'Microsoft Visual Studio', patroon: /^\d{4}$/, exe: 'Community\\Common7\\IDE\\devenv.exe' },
    paden: [
      'Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\devenv.exe',
      'Microsoft Visual Studio\\2022\\Professional\\Common7\\IDE\\devenv.exe',
      'Microsoft Visual Studio\\2022\\Enterprise\\Common7\\IDE\\devenv.exe',
      'Microsoft Visual Studio\\2019\\Community\\Common7\\IDE\\devenv.exe',
    ],
    startMenu: /^visual studio 20/i },

  { id: 'eclipse', label: 'Eclipse', paden: ['Eclipse\\eclipse.exe', 'eclipse\\eclipse.exe'], startMenu: /^eclipse/i },
  { id: 'netbeans', label: 'NetBeans',
    versieMap: { onder: '', patroon: /^NetBeans/i, exe: 'bin\\netbeans64.exe' },
    startMenu: /^apache netbeans/i },
  { id: 'codeblocks', label: 'Code::Blocks', paden: ['CodeBlocks\\codeblocks.exe'], startMenu: /code::blocks/i },
  { id: 'devcpp', label: 'Dev-C++', paden: ['Dev-Cpp\\devcpp.exe'], startMenu: /^dev-c\+\+/i },
  { id: 'arduino', label: 'Arduino IDE',
    paden: ['Arduino IDE\\Arduino IDE.exe', 'Arduino\\arduino.exe'],
    gebruiker: ['Programs\\Arduino IDE\\Arduino IDE.exe'],
    startMenu: /^arduino/i },
  { id: 'godot', label: 'Godot', paden: ['Godot\\Godot.exe'], startMenu: /^godot/i },
  { id: 'unity', label: 'Unity',
    versieMap: { onder: 'Unity\\Hub\\Editor', patroon: /^\d/, exe: 'Editor\\Unity.exe' },
    startMenu: /^unity \d/i },

  // ── Claude ──────────────────────────────────────────────────────────
  // Claude Code is een opdrachtregelprogramma. Meestal staat het als `claude`
  // in PATH (npm zet er een .cmd neer); het eigen installatieprogramma zet een
  // losse exe onder de gebruikersmap. Beide wegen staan hier, want zonder
  // catalogus-regel vindt de scan hem niet en verschijnt de knop niet.
  { id: 'claudeCode', label: 'Claude Code', cli: 'claude',
    paden: ['Claude Code\\claude.exe'],
    gebruiker: [
      'Programs\\claude\\claude.exe',
      'Programs\\Claude Code\\claude.exe',
      'npm\\claude.cmd',
      '..\\..\\.local\\bin\\claude.exe',
      '..\\..\\.claude\\local\\claude.exe',
    ],
    startMenu: /^claude code$/i },

  // De desktop-app. Die opent geen map, maar krijgt het project mee via zijn
  // eigen claude://-koppeling (zie cmd:openClaudeDesktop in main.js).
  { id: 'claudeDesktop', label: 'Claude (desktop)',
    paden: ['Claude\\Claude.exe'],
    gebruiker: [
      'AnthropicClaude\\claude.exe',
      'AnthropicClaude\\Claude.exe',
      'Programs\\Claude\\Claude.exe',
    ],
    startMenu: /^claude$/i },

  // ── AI op de opdrachtregel ────────────────────────────────────────────────
  // Net als Claude Code: opdrachtregelprogramma's die een eigen scherm tekenen.
  // npm zet ze als .cmd in PATH; sommige hebben een eigen installatieprogramma.
  { id: 'codex', label: 'Codex CLI', cli: 'codex',
    gebruiker: ['npm\\codex.cmd', 'Programs\\codex\\codex.exe'],
    startMenu: /^codex/i },

  { id: 'geminiCli', label: 'Gemini CLI', cli: 'gemini',
    gebruiker: ['npm\\gemini.cmd'],
    startMenu: /^gemini cli$/i },

  { id: 'opencode', label: 'OpenCode', cli: 'opencode',
    gebruiker: ['npm\\opencode.cmd'] },

  { id: 'aider', label: 'Aider', cli: 'aider',
    gebruiker: ['Programs\\Python\\Scripts\\aider.exe', '..\\..\\.local\\bin\\aider.exe'] },

  // ── Tekstbewerkers ────────────────────────────────────────────────────────
  { id: 'gvim', label: 'gVim', paden: ['Vim\\vim91\\gvim.exe', 'Vim\\vim90\\gvim.exe', 'Vim\\vim82\\gvim.exe'], cli: 'gvim', startMenu: /^gvim/i },
  { id: 'neovim', label: 'Neovim', paden: ['Neovim\\bin\\nvim-qt.exe'], cli: 'nvim', startMenu: /^neovim/i },
  { id: 'emacs', label: 'Emacs', versieMap: { onder: '', patroon: /^[Ee]macs/i, exe: 'bin\\runemacs.exe' }, cli: 'runemacs', startMenu: /^emacs/i },
  { id: 'geany', label: 'Geany', paden: ['Geany\\bin\\geany.exe'], startMenu: /^geany/i },
  { id: 'ultraedit', label: 'UltraEdit', paden: ['IDM Computer Solutions\\UltraEdit\\uedit64.exe'], startMenu: /^ultraedit/i },
  { id: 'editplus', label: 'EditPlus', paden: ['EditPlus 5\\editplus.exe', 'EditPlus\\editplus.exe'], startMenu: /^editplus/i },
  { id: 'pspad', label: 'PSPad', paden: ['PSPad editor\\PSPad.exe'], startMenu: /^pspad/i },
  { id: 'kate', label: 'Kate', paden: ['KDE\\bin\\kate.exe'], startMenu: /^kate$/i },
  { id: 'atom', label: 'Atom', gebruiker: ['..\\Local\\atom\\atom.exe'], startMenu: /^atom$/i },
]

module.exports = { EDITORS }
