// ============================================================
// Скользящий лимит запросов в памяти процесса (v1.0.28).
//
// Класс защиты из аудита Task 27 (🟡-4): публичные «тяжёлые»
// эндпоинты (глобальный поиск) больше не вызываются без счётчика —
// дешёвый DoS-вектор закрыт на уровне HTTP (429 до запроса к БД).
//
// ОГРАНИЧЕНИЕ (аудит 🟡-9, сознательно отложено): счётчик живёт
// в памяти процесса — рестарт/масштабирование его сбрасывает. Для
// кластера выносится в Redis (см. DEPLOY.md). Логин-брутфорс-лимит
// (login/otp) использует тот же паттерн — единый модуль.
// ============================================================

const buckets = new Map<string, number[]>();

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}

/** true = лимит превышен (запрос отклонить). Окно скользящее:
 *  учитываются только отметки за последние windowMs. */
export function overRate(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  buckets.set(key, arr);
  // защита карты от роста: чистим при >10k ключей (анти-утечка памяти)
  if (buckets.size > 10_000) buckets.clear();
  return arr.length >= max;
}

/** отметить запрос (вызывать ПОСЛЕ прохождения лимита — успешные
 *  запросы тоже расходуют окно, иначе обход перебором ключей) */
export function recordHit(key: string): void {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  buckets.set(key, arr);
}
