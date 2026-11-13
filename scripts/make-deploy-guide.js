// Гайд «Git-бандл → GitHub → автодеплой» (docx, скилл docx)
// Обложка: R1 (Pure Paragraph Left) + палитра DS-1 (Deep Sea) —
// общий технический отчёт. Схема: 3 секции (обложка / TOC-римские /
// тело-арабские), TOC + refresh hint + PageBreak, пост-обработка футеров.
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  PageBreak, Header, Footer, PageNumber, NumberFormat, SectionType,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
  TableLayoutType, TableOfContents,
} = require("docx");
const fs = require("fs");

// ---------- палитра DS-1 (Deep Sea) ----------
const P = {
  bg: "0B1C2C", accent: "529286",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078" },
  table: { headerBg: "529286", headerText: "FFFFFF", accentLine: "529286", innerLine: "BECFCC", surface: "E8ECEB" },
  primary: "1A5276", body: "000000", secondary: "506070",
};

const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { ...noBorders, insideHorizontal: NB, insideVertical: NB };

// ---------- calcTitleLayout / splitTitleLines / calcCoverSpacing (design-system) ----------
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([..."，。、；：！？", ..."的与和及之在于为", ..."-_—–·/", ..." \t"]);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += last;
  }
  return lines;
}

function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / (pt * 20));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    lines = splitTitleLines(title, charsPerLine(minPt));
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838 } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const safeRemaining = Math.max(usableHeight - contentHeight, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  return { topSpacing, bottomSpacing };
}

// ---------- обложка R1 ----------
function buildCoverR1(config) {
  const C = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: C.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: C.accent,
        font: { ascii: "Calibri", eastAsia: "SimHei" }, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titlePt * 2, bold: true,
        color: C.cover.titleColor, font: { eastAsia: "SimHei", ascii: "Arial" } })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: C.cover.subtitleColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: C.cover.metaColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: C.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: C.cover.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: C.cover.footerColor, font: { ascii: "Arial" } }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: C.bg }, borders: noBorders,
        verticalAlign: "top",
        children,
      })],
    })],
  })];
}

// ---------- строительные блоки тела ----------
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, size: 32, color: P.primary,
      font: { eastAsia: "SimHei", ascii: "Times New Roman" } })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140, line: 312 },
    children: [new TextRun({ text, bold: true, size: 28, color: P.primary,
      font: { eastAsia: "SimHei", ascii: "Times New Roman" } })],
  });
}
function body(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 480 },
    spacing: { line: 312, after: 80 },
    children: [new TextRun({ text, size: 24, color: P.body,
      font: { eastAsia: "SimSun", ascii: "Times New Roman" }, ...opts })],
  });
}
/** абзац из кусочков (для кода в тексте) */
function bodyRuns(runs) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 480 },
    spacing: { line: 312, after: 80 },
    children: runs.map(r => new TextRun({ size: 24, color: P.body,
      font: { eastAsia: "SimSun", ascii: "Times New Roman" }, ...r })),
  });
}
/** моноширинный блок кода: без отступа первой строки, шрифт Consolas */
function code(lines) {
  return lines.map((ln, i) => new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: 276, before: i === 0 ? 120 : 0, after: i === lines.length - 1 ? 160 : 0 },
    shading: { type: ShadingType.CLEAR, fill: "F4F6F8" },
    indent: { left: 360, right: 360 },
    children: [new TextRun({ text: ln.length ? ln : " ", size: 19, color: "1C2A3D",
      font: { ascii: "Consolas", eastAsia: "SimSun" } })],
  }));
}
/** таблица Horizontal-Only (business default); widths — проценты колонок */
function tbl(headerCells, rows, widths) {
  const mk = (text, isHeader, w) => new TableCell({
    width: { size: w, type: WidthType.PERCENTAGE },
    children: [new Paragraph({
      spacing: { line: 276 },
      children: [new TextRun({ text, size: 21, bold: !!isHeader,
        color: isHeader ? P.table.headerText : P.body,
        font: { eastAsia: isHeader ? "SimHei" : "SimSun", ascii: "Times New Roman" } })],
    })],
    shading: isHeader ? { type: ShadingType.CLEAR, fill: P.table.headerBg } : undefined,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: P.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: P.table.accentLine },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "D0D0D0" },
      insideVertical: NB,
    },
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headerCells.map((t, i) => mk(t, true, widths[i])) }),
      ...rows.map(r => new TableRow({ cantSplit: true, children: r.map((t, i) => mk(t, false, widths[i])) })),
    ],
  });
}
function tableTitle(text) {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 160, after: 80, line: 312 },
    children: [new TextRun({ text, bold: true, size: 21, color: P.secondary,
      font: { eastAsia: "SimHei", ascii: "Times New Roman" } })],
  });
}

const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

function pageNumFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: P.secondary })],
    })],
  });
}
function docHeader() {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: P.table.innerLine, space: 4 } },
      children: [new TextRun({ text: "Доставка кода через git-бандл · инструкция", size: 16, color: P.secondary,
        font: { ascii: "Times New Roman", eastAsia: "SimSun" } })],
    })],
  });
}

// ============================================================
// ТЕЛО ДОКУМЕНТА
// ============================================================
const bodyChildren = [];

// ---------- 1. Резюме ----------
bodyChildren.push(h1("1. Резюме"));
bodyChildren.push(body("Этот документ описывает, как перенести на любой другой проект схему доставки кода, отработанную на проекте SCORESBOX: ассистент завершает работу и прикладывает git-бандл (один файл со всей историей репозитория или одним снимком), вы скачиваете его, заливаете в репозиторий GitHub одним пушем, а сервер при получении новых коммитов сам собирает и разворачивает приложение. Ручных операций на сервере нет: ни scp, ни ручного npm install, ни правки файлов поверх боевой копии."));
bodyChildren.push(body("Схема состоит из четырёх независимых частей: (1) сборка бандла на стороне ассистента; (2) перенос бандла в ваш репозиторий — GitHub, GitLab или любой другой хостинг git; (3) автоматический запуск пайплайна при пуше — GitHub Actions или webhook; (4) сам деплой на сервер — по SSH или через серверный git-хук. Каждая часть описана в отдельном разделе, выбирается под ваш стек и заменяется независимо от остальных. Документ рассчитан на одного-двух человек, сопровождающих небольшой проект: всё описано без Kubernetes и облачной специфики, на обычном VPS."));

// ---------- 2. Как это работает сегодня ----------
bodyChildren.push(h1("2. Как устроена текущая поставка через бандл"));
bodyChildren.push(body("Git-бандл — это стандартный формат git: файл, внутрь которого упакованы объекты и ссылки репозитория. Файл ведёт себя как «клон на диске»: из него можно клонировать репозиторий, делать из него fetch в существующий клон и проверять его целостность командой git bundle verify. Ассистент заканчивает работу, собирает бандл командой git bundle create и прикладывает его к сообщению вместе с кратким README поставки: что изменилось, какие миграции базы данных применятся, что проверить после деплоя."));
bodyChildren.push(body("На стороне SCORESBOX используется два вида бандлов. Полный (git bundle create bundle.git-bundle --all) содержит всю историю и подходит для клонирования с нуля — он крупный, десятки мегабайт. Однофайловый «сквош»-бандл содержит один коммит-снимок актуального состояния: маленький (порядка 10–15 МБ), применяется к ЛЮБОМУ репозиторию этого проекта и не тянет за собой песочную историю. Для переноса схемы на другой проект достаточно однофайлового варианта: он не зависит от того, что было в репозитории раньше."));
bodyChildren.push(body("Ключевое свойство, ради которого всё затевается: бандл — это атомарный снимок кода, прошедший проверки (компиляция, линтер, тесты) ещё ДО того, как он попал к вам. Вы применяете его одной командой и пушите; дальше весь путь до боевого сервера автоматизирован. Точка передачи ровно одна — файл бандла, — поэтому между «ассистент закончил» и «код на проде» нет ручных шагов, в которых обычно теряются правки."));

// ---------- 3. Шаг 1: бандл ----------
bodyChildren.push(h1("3. Шаг 1. Сборка бандла на стороне ассистента"));
bodyChildren.push(body("Если в другом проекте ассистент работает в том же чате с песочницей, попросите его в конце каждой задачи собирать однофайловый бандл и прикладывать ссылку на скачивание. Типовой сценарий такой: изменения коммитятся в рабочую копию, затем создаётся временный orphan-коммит (снимок текущего состояния без истории) и упаковывается в бандл. Имя файла включает дату и номер правки, чтобы отличать актуальный бандл от скачанных ранее."));
bodyChildren.push(tableTitle("Команды сборки однофайлового бандла"));
bodyChildren.push(...code([
  "# в корне проекта после коммитов:",
  "git bundle create app-full.git-bundle --all",
  "",
  "# однофайловый снимок (orphan-коммит, без истории песочницы):",
  "git checkout --orphan snapshot",
  "git commit -m \"APP 2026-11-13: краткое описание поставки\"",
  "git bundle create app-2026-11-13.git-bundle snapshot",
  "git checkout main            # вернуться в рабочую ветку",
  "git branch -D snapshot       # удалить временную ветку",
  "",
  "# проверка целостности перед отправкой:",
  "git bundle verify app-2026-11-13.git-bundle",
]));
bodyChildren.push(body("Дальше ассистент прикладывает файл или прямую ссылку на него и короткий README: что вошло в поставку, применятся ли миграции базы данных, какой командой проверить здоровье сервиса после деплоя (для SCORESBOX это GET /api/health, который возвращает номер версии — универсальный приём, стоит завести такой эндпоинт и в новом проекте)."));

// ---------- 4. Шаг 2: репозиторий ----------
bodyChildren.push(h1("4. Шаг 2. Перенос бандла в репозиторий"));
bodyChildren.push(body("Скачанный бандл применяется к вашему локальному клону репозитория за одну команду: git fetch принимает бандл так же, как удалённый репозиторий. После fetch стоит убедиться, что в вашем main нет коммитов, которых нет в бандле (git log FETCH_HEAD..main должен быть пуст) — тогда перезапись ветки безопасна. Если непусто, спрячьте свои коммиты в резервную ветку."));
bodyChildren.push(tableTitle("Применение бандла (Windows PowerShell, то же самое на Linux/macOS)"));
bodyChildren.push(...code([
  "cd C:\\projects\\app            # ваш клон репозитория",
  "git fetch \"$HOME\\Downloads\\app-2026-11-13.git-bundle\" main",
  "git log --oneline -1 FETCH_HEAD   # убедиться: тот же коммит, что в README",
  "git log FETCH_HEAD..main          # ПУСТО = терять нечего",
  "",
  "git reset --hard FETCH_HEAD",
  "git push --force origin main",
  "git tag v1.0.56 && git push origin v1.0.56   # тег — точка отката",
]));
bodyChildren.push(body("Команда push --force здесь осознанна: бандл-снимок не имеет общих коммитов с историей репозитория, поэтому обычный push закончится отказом. Если в репозитории работают несколько человек, вместо перезаписи main попросите ассистента присылать полный бандл с историей — тогда применяется обычный merge или fast-forward, и force-push не нужен. Для команды из одного-двух человек перезапись main снимком проще и безопаснее, чем кажется: тег на предыдущее состояние даёт мгновенный откат."));
bodyChildren.push(body("Если репозиторий уже живёт на GitHub, больше ничего настраивать не нужно — пуш в main и есть триггер для следующего шага. Если репозитория ещё нет, создайте пустой приватный репозиторий и запушьте бандл с нуля:"));
bodyChildren.push(tableTitle("Первый пуш из бандла в новый репозиторий"));
bodyChildren.push(...code([
  "git clone -b main app-2026-11-13.git-bundle app   # -b обязателен",
  "cd app",
  "git remote add origin git@github.com:you/app.git",
  "git push -u origin main",
]));

// ---------- 5. Шаг 3: пайплайн ----------
bodyChildren.push(h1("5. Шаг 3. Автоматическая сборка при пуше"));
bodyChildren.push(body("ВТОРОЙ вариант — GitHub Actions. Это не требует ничего на сервере, кроме SSH-доступа, и не держит открытых портов. Пайплайн выполняет те же проверки, что проходила поставка (компиляция типов, линтер, тесты), а затем подключается к серверу по SSH и запускает деплой. Ключ пайплайна хранится в секретах репозитория, пароль на сервере никому не нужен."));
bodyChildren.push(tableTitle(".github/workflows/deploy.yml — пайплайн деплоя"));
bodyChildren.push(...code([
  "name: deploy",
  "on:",
  "  push:",
  "    branches: [main]",
  "",
  "jobs:",
  "  build-and-deploy:",
  "    runs-on: ubuntu-latest",
  "    steps:",
  "      - uses: actions/checkout@v4",
  "      - uses: actions/setup-node@v4",
  "        with: { node-version: 20, cache: npm }",
  "      - run: npm ci",
  "      - run: npx tsc --noEmit        # проверка типов = барьер",
  "      - run: npm test",
  "      - name: Deploy over SSH",
  "        uses: appleboy/ssh-action@v1",
  "        with:",
  "          host:     ${{ secrets.DEPLOY_HOST }}",
  "          username: ${{ secrets.DEPLOY_USER }}",
  "          key:      ${{ secrets.DEPLOY_SSH_KEY }}",
  "          script: /opt/app/deploy.sh",
]));
bodyChildren.push(body("Пайплайн настроен так, что деплой запускается только после зелёных проверок: шаг деплоя идёт после tsc и тестов, и любой провал останавливает поставку до того, как она коснётся сервера. Для начала этого достаточно; когда проект подрастёт, сюда же встают сборка Docker-образа и пуш его в реестр, но механика триггера не меняется."));
bodyChildren.push(body("Если репозиторий размещён не на GitHub, та же логика переносится один в один: GitLab CI (.gitlab-ci.yml с секцией deploy и shell-раннером на сервере), Gitea Actions или Woodpecker — везде событие «пуш в main» запускает скрипт. Выберите то, где уже лежит ваш код."));

// ---------- 6. Шаг 4: сервер ----------
bodyChildren.push(h1("6. Шаг 4. Деплой-скрипт на сервере"));
bodyChildren.push(body("Всё, что делает сервер при получении новых коммитов, сведено в один скрипт deploy.sh. Он одинаковый для запуска вручную по SSH и из пайплайна — это важно: деплой можно повторить руками в точно таком же виде, если автоматика недоступна. Скрипт рассчитан на приложение Node.js, запущенное под systemd; для другого стека меняется только секция сборки и рестарта."));
bodyChildren.push(tableTitle("/opt/app/deploy.sh — типовой деплой (Node.js + systemd)"));
bodyChildren.push(...code([
  "#!/usr/bin/env bash",
  "set -euo pipefail",
  "cd /opt/app",
  "",
  "# 1. БЭКАП БД ДО миграций (снимок, из которого можно подняться):",
  "sudo -u postgres pg_dump app | gzip > /var/backups/app-$(date +%F-%H%M).sql.gz",
  "",
  "# 2. свежий код:",
  "git fetch origin main",
  "git reset --hard origin/main",
  "",
  "# 3. зависимости и миграции:",
  "npm ci --omit=dev",
  "npx prisma migrate deploy",
  "",
  "# 4. сборка и рестарт:",
  "npm run build",
  "sudo systemctl restart app",
  "",
  "# 5. здоровье: версия должна совпасть с поставкой:",
  "sleep 3",
  "curl -fsS http://localhost:3000/api/health | grep -o '\"version\":\"[^\"]*\"'",
]));
bodyChildren.push(body("Порядок шагов в скрипте неслучаен и повторяет порядок, отработанный на SCORESBOX: бэкап базы данных всегда делается ДО миграций; версия проверяется ПОСЛЕ рестарта, чтобы строка в логе деплоя доказывала, что встала именно та поставка; set -euo pipefail гарантирует, что любой провал остановит скрипт, не дойдя до рестарта сервиса. Строка про применённую миграцию в логе деплоя — норма, а не ошибка: миграции применяются автоматически и идемпотентно."));
bodyChildren.push(body("Файл даёт права на исполнение (chmod +x /opt/app/deploy.sh) и кладётся В репозиторий — тогда он версионируется вместе с кодом, и изменение процедуры деплоя тоже проходит через пуш. На сервере должен быть настроен доступ к репозиторию: либо ключ deploy key с правами на чтение, либо клон по HTTPS, если репозиторий приватный с токеном."));

// ---------- 7. systemd ----------
bodyChildren.push(h1("7. Юнит systemd и окружение"));
bodyChildren.push(tableTitle("/etc/systemd/system/app.service"));
bodyChildren.push(...code([
  "[Unit]",
  "Description=App",
  "After=network.target postgresql.service",
  "",
  "[Service]",
  "WorkingDirectory=/opt/app",
  "ExecStart=/usr/bin/node .next/standalone/server.js",
  "EnvironmentFile=/opt/app/.env.production",
  "Restart=always",
  "RestartSec=3",
  "User=app",
  "",
  "[Install]",
  "WantedBy=multi-user.target",
]));
bodyChildren.push(body("Секреты (строка подключения к базе, ключи) живут в EnvironmentFile на сервере, а не в репозитории — это единственное, что настраивается руками один раз при развёртывании. Рестарт из деплой-скрипта не трогает файл окружения, поэтому секреты не попадают ни в бандл, ни в git-историю. После создания юнита выполните systemctl daemon-reload и systemctl enable --now app."));

// ---------- 8. Порядок внедрения ----------
bodyChildren.push(h1("8. Порядок внедрения с нуля"));
bodyChildren.push(body("Ниже минимальный план на вечер. Всё делается последовательно, каждый шаг проверяется отдельно, и только потом добавляется следующий. Такой порядок исключает ситуацию «деплой упал, а непонятно, в какой из частей проблема»."));
bodyChildren.push(tableTitle("Чек-лист внедрения"));
bodyChildren.push(tbl(
  ["Шаг", "Действие", "Проверка"],
  [
    ["1", "Создать пустой приватный репозиторий на GitHub", "страница репозитория открывается"],
    ["2", "Применить бандл и запушить main", "git log в репозитории показывает коммит поставки"],
    ["3", "Настроить сервер: клон в /opt/app, .env.production, systemd-юнит", "curl http://localhost:3000/api/health отвечает"],
    ["4", "Прописать deploy.sh, сделать chmod +x, выполнить вручную", "повторный прогон проходит без ошибок"],
    ["5", "Добавить секреты DEPLOY_HOST/USER/KEY в GitHub", "работает ssh -i ключ user@host из консоли"],
    ["6", "Закоммитить .github/workflows/deploy.yml", "в Actions виден зелёный прогон"],
    ["7", "Тестовая поставка: любая правка, пуш", "версия в /api/health изменилась после деплоя"],
  ],
  [8, 62, 30]
));
bodyChildren.push(body("Тестовую поставку удобно делать изменением, которое видно без знания доменной логики: поднять номер версии в package.json и убедиться, что /api/health на сервере стал отвечать новым номером. Это сквозная проверка всей цепочки: бандл собран, пуш принят, пайплайн отработал, деплой-скрипт выполнился, сервис перезапустился."));

// ---------- 9. Откат ----------
bodyChildren.push(h1("9. Откат проблемной поставки"));
bodyChildren.push(body("Схема без rollbacks не считается схемой. Откат — это те же два шага, что и поставка, в обратном порядке: вернуть код и применить обратную миграцию при необходимости. Потому что бандлы и теги сохраняются, точки отката всегда материальны."));
bodyChildren.push(tableTitle("Откат к предыдущей версии"));
bodyChildren.push(...code([
  "git tag                          # посмотреть точки отката",
  "git checkout v1.0.55",
  "git push --force origin HEAD:main   # вернуть main на тег",
  "",
  "# на сервере (или дождаться автодеплоя):",
  "cd /opt/app && git reset --hard origin/main",
  "npm ci --omit=dev && npm run build",
  "sudo systemctl restart app",
]));
bodyChildren.push(body("Откат базы данных требуется редко: миграции пишутся обратимыми или additive (новая колонка вместо переименования старой), и проще всего откатить код, оставив схему — старый код с новой additive-колонкой совместим. Бэкап из шага 1 деплой-скрипта остаётся страховкой на самый тяжёлый случай: восстановление gzip -d ... | psql занимает минуты, а не часы, потому что снимок сделан автоматически перед каждой миграцией."));

// ---------- 10. Грабли ----------
bodyChildren.push(h1("10. Типовые проблемы и их причины"));
bodyChildren.push(tableTitle("Симптом → причина → действие"));
bodyChildren.push(tbl(
  ["Симптом", "Причина", "Действие"],
  [
    ["push отклонён (non-fast-forward)", "бандл-снимок без общих коммитов", "это норма для снимка: git push --force origin main"],
    ["пустой чекаут после git clone бандла", "бандл содержит не main, а другую ветку", "клонировать с -b main, либо посмотреть git bundle list-heads"],
    ["деплой прошёл, версия старая", "кеширующий прокси перед приложением", "проверить /api/health с параметром-антике­шем или напрямую curl с сервера"],
    ["пайплайн зелёный, сайт не обновился", "деплой-скрипт упал после рестарта", "логи Actions и journalctl -u app смотрят разные шаги; проверять оба"],
    ["миграция не применилась", "деплой запущен не из /opt/app", "set -euo pipefail в скрипте + cd в начале"],
    ["SSH из Actions не подключается", "ключ не добавлен в секреты или authorized_keys", "сначала проверить ssh -i ключ вручную с той же машины"],
  ],
  [30, 34, 36]
));
bodyChildren.push(body("Большинство отказов цепочки локализуются одной командой: журнал пайплайна показывает, дошёл ли он до сервера, а journalctl -u app --since \"10 min ago\" — что происходило с сервисом. Держите оба под рукой при первой поставке."));

// ---------- 11. Что положить в проект заранее ----------
bodyChildren.push(h1("11. Что попросить у ассистента в новом проекте"));
bodyChildren.push(body("Чтобы схема заработала в другом месте без импровизации, в проекте с самого начала должны быть четыре вещи. Все они уже есть в SCORESBOX — и именно они делают поставку «скачал файл → запушил → забыл»."));
bodyChildren.push(body("Первое — эндпоинт здоровья, отдающий номер версии из package.json: он превращает проверку «встала ли поставка» в один curl. Второе — deploy.sh в репозитории: процедура деплоя версионируется тем же пушем, что и код. Третье — additive-миграции и автоматический бэкап до их применения: это то, что позволяет деплоить не задумываясь. Четвёртое — README поставки к каждому бандлу: что вошло, какие миграции, что проверить. Формулируйте эти четыре требования в первой же задаче ассистенту — они дешёвые на старте и дорогие задним числом."));
bodyChildren.push(body("Дальше цепочка масштабируется сама: когда появится Docker, deploy.sh сменит реализацию, но не интерфейс; когда появятся серверы, пайплайн будет запускать его несколько раз. Схема «бандл → пуш → автодеплой» потому и выбрана как базовая: каждая из четырёх частей заменяется независимо, не трогая остальные."));

// ============================================================
// СБОРКА ДОКУМЕНТА
// ============================================================
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Times New Roman", eastAsia: "SimSun" }, size: 24, color: P.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: { ascii: "Times New Roman", eastAsia: "SimHei" }, size: 32, bold: true, color: P.primary },
        paragraph: { spacing: { before: 360, after: 160 } },
      },
      heading2: {
        run: { font: { ascii: "Times New Roman", eastAsia: "SimHei" }, size: 28, bold: true, color: P.primary },
        paragraph: { spacing: { before: 280, after: 140 } },
      },
    },
  },
  sections: [
    // Секция 1: обложка — без номеров страниц, поля 0
    {
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1({
        title: "Доставка кода через git-бандл",
        subtitle: "бандл → репозиторий → автодеплой на сервер: перенос схемы на новый проект",
        englishLabel: "DELIVERY PIPELINE GUIDE",
        metaLines: [
          "Формат: git bundle → push → CI → SSH deploy",
          "Стек: GitHub Actions · systemd · Node.js",
          "Дата: 13 ноября 2026 г.",
        ],
        footerLeft: "по мотивам поставок SCORESBOX",
        footerRight: "v1.0",
        palette: P,
      }),
    },
    // Секция 2: содержание — римские номера
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: { default: pageNumFooter() },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 480, after: 360 },
          children: [new TextRun({ text: "Содержание", bold: true, size: 32,
            font: { eastAsia: "SimHei", ascii: "Times New Roman" }, color: P.primary })],
        }),
        new TableOfContents("TOC", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({
          spacing: { before: 200 },
          children: [new TextRun({
            text: "Примечание: содержание построено на кодах полей. После правок документа щёлкните по нему правой кнопкой и выберите «Обновить поле», чтобы номера страниц пересчитались.",
            italics: true, size: 18, color: "888888",
            font: { ascii: "Times New Roman", eastAsia: "SimSun" },
          })],
        }),
        // PageBreak НЕ ставим: следующая секция type NEXT_PAGE сама
        // начинает новую страницу (двойной разрыв = пустая страница)
      ],
    },
    // Секция 3: тело — арабские с 1
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: docHeader() },
      footers: { default: pageNumFooter() },
      children: bodyChildren,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("/home/z/my-project/download/git-bundle-autodeploy-guide.docx", buf);
  console.log("OK:", buf.length, "bytes");
});
