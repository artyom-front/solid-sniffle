# tools/docs — генераторы деливери-документации

Папка **не входит** в CI-скан `scripts/check-deps.py` (он сканирует только
`src/`, `tests/`, `scripts/`, `prisma/`) и не участвует в `tsc`/`eslint`
проекта. Сюда вынесены утилиты, которые генерируют docx/pdf-гайды для
поставки и тянут зависимости, не объявленные в `package.json` приложения
(например, `docx`).

Инцидент v1.0.57 (2026-11-18): `make-deploy-guide.mjs` лежал в
`scripts/` и импортировал `docx` — гейт «Аудит deps» в CI упал
(MISSING docx). Правило: генераторы документации живут здесь.

Запуск (если нужно перегенерировать гайд):

```bash
cd tools/docs
bun add docx               # временный node_modules ТОЛЬКО в этой папке
node make-deploy-guide.mjs
python3 patch-deploy-guide-footers.py ../../public/download/git-bundle-autodeploy-guide.docx
```
