// ============================================================
// load-test.ts — нагрузочный тест ключевых эндпоинтов (bun/node).
// Прогоняет параллельные запросы и считает p50/p95/p99.
//
//   bun scripts/load-test.ts [BASE_URL] [CONCURRENCY] [DURATION_SEC]
//   bun scripts/load-test.ts http://localhost:3000 20 15
// ============================================================

const BASE = process.argv[2] ?? "http://localhost:3000";
const CONCURRENCY = Number(process.argv[3] ?? 20);
const DURATION = Number(process.argv[4] ?? 15) * 1000;

// публичные маршруты разных типов: SSR-страница, лента, API, SSR-деталка
const ENDPOINTS = [
  "/",
  "/api/public/overview",
  "/api/public/matches/day?date=all",
  "/api/public/highlights",
  "/api/health",
];

interface Sample {
  endpoint: string;
  ms: number;
  ok: boolean;
}

async function worker(id: number, samples: Sample[], deadline: number, counter: { n: number }) {
  while (Date.now() < deadline) {
    const endpoint = ENDPOINTS[counter.n++ % ENDPOINTS.length];
    const t0 = performance.now();
    let ok = true;
    try {
      const r = await fetch(BASE + endpoint, { cache: "no-store" });
      ok = r.ok;
      await r.text();
    } catch {
      ok = false;
    }
    samples.push({ endpoint, ms: performance.now() - t0, ok });
    if (id === 0) await new Promise((r) => setTimeout(r, 50)); // плавность
  }
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return Math.round(sorted[i]);
}

async function main() {
  console.log(`Нагрузочный тест: ${BASE} · конкурентность ${CONCURRENCY} · длительность ${DURATION / 1000} c`);
  console.log(`Эндпоинты (${ENDPOINTS.length}): ${ENDPOINTS.join(", ")}\n`);

  const samples: Sample[] = [];
  const counter = { n: 0 };
  const deadline = Date.now() + DURATION;
  const t0 = Date.now();

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i, samples, deadline, counter)));

  const total = samples.length;
  const seconds = (Date.now() - t0) / 1000;
  const okCount = samples.filter((s) => s.ok).length;
  const all = samples.map((s) => s.ms).sort((a, b) => a - b);

  console.log("─".repeat(60));
  console.log(`Запросов: ${total} · RPS: ${(total / seconds).toFixed(1)} · ошибок: ${total - okCount} (${((100 * (total - okCount)) / Math.max(1, total)).toFixed(1)}%)`);
  console.log(`Задержка: p50=${quantile(all, 0.5)} мс · p95=${quantile(all, 0.95)} мс · p99=${quantile(all, 0.99)} мс · макс=${Math.round(all[all.length - 1] ?? 0)} мс`);
  console.log("─".repeat(60));

  for (const e of ENDPOINTS) {
    const lat = samples.filter((s) => s.endpoint === e).map((s) => s.ms).sort((a, b) => a - b);
    if (lat.length === 0) continue;
    console.log(
      `  ${e.padEnd(42)} n=${String(lat.length).padStart(4)} p50=${quantile(lat, 0.5)} p95=${quantile(lat, 0.95)} p99=${quantile(lat, 0.99)} мс`
    );
  }

  // критерий здоровья: ошибок 0, p95 публичных API < 500 мс
  const apiLat = samples.filter((s) => s.endpoint.startsWith("/api/")).map((s) => s.ms).sort((a, b) => a - b);
  const p95 = quantile(apiLat, 0.95);
  const healthy = okCount === total && p95 < 500;
  console.log("─".repeat(60));
  console.log(healthy ? "✅ КРИТЕРИЙ ГОТОВНОСТИ ПРОЙДЕН (0 ошибок, API p95 < 500 мс)" : `⚠️  КРИТЕРИЙ НЕ ПРОЙДЕН (ошибок ${total - okCount}, API p95=${p95} мс)`);
  process.exit(healthy ? 0 : 1);
}

main();

// модуль (изолирует BASE от других скриптов в tsc)
export {};
