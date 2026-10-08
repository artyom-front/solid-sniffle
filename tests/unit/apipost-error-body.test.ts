// v1.0.49 (Task 56): регресс-тест apiPost — тело ошибки больше не
// выбрасывается. 409-ответы API несут машинночитаемую нагрузку
// (duplicates — антидубли персон; code/dependencies/cascadeAllowed —
// SmartDelete), и UI-диалоги «создать всё равно» / «удалить вместе с
// заявками» зависят от res.data при !res.ok. До фикса data при ошибке
// был всегда undefined — все структурированные 409 деградировали в toast.

import { describe, test, expect, mock, afterEach } from "bun:test";
import { apiPost } from "../../src/components/portal/hooks";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetchOnce(status: number, body: unknown) {
  globalThis.fetch = mock(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  ) as unknown as typeof fetch;
}

describe("apiPost · тело ошибки доезжает до UI (v1.0.49)", () => {
  test("409 с duplicates: data.duplicates доступен при !ok", async () => {
    mockFetchOnce(409, {
      error: "Найдена похожая персона: Артемьев Демьян. Проверьте — возможно, это тот же человек (дубль)",
      duplicates: [{ id: "p1", name: "Артемьев Демьян", birthDate: null, roles: ["PLAYER"], teams: ["Заря"] }],
    });
    const res = await apiPost<{ duplicates?: unknown[] }>("/api/admin/persons", { lastName: "Артемьев", firstName: "Демьян" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Найдена похожая персона");
    expect(res.data?.duplicates).toBeArrayOfSize(1);
    expect((res.data!.duplicates as { name: string }[])[0].name).toBe("Артемьев Демьян");
  });

  test("409 SmartDelete: code/dependencies/cascadeAllowed доступны при !ok", async () => {
    mockFetchOnce(409, {
      error: "У профиля есть турнирная история (событий 3).",
      code: "PERSON_HAS_HISTORY",
      dependencies: { events: 3, registrations: 2 },
      cascadeAllowed: false,
    });
    const res = await apiPost<{ code?: string; dependencies?: Record<string, number>; cascadeAllowed?: boolean }>("/api/admin/persons/x", {}, "DELETE");
    expect(res.ok).toBe(false);
    expect(res.data?.code).toBe("PERSON_HAS_HISTORY");
    expect(res.data?.dependencies?.events).toBe(3);
    expect(res.data?.cascadeAllowed).toBe(false);
  });

  test("успешный ответ: data как раньше, ok=true", async () => {
    mockFetchOnce(200, { ok: true, person: { id: "p2" } });
    const res = await apiPost<{ person?: { id: string } }>("/api/admin/persons", { lastName: "Иванов" });
    expect(res.ok).toBe(true);
    expect(res.data?.person?.id).toBe("p2");
    expect(res.error).toBeUndefined();
  });

  test("ответ без JSON: data = {}, error = код статуса", async () => {
    globalThis.fetch = mock(async () =>
      new Response("<html>Bad Gateway</html>", { status: 502 })
    ) as unknown as typeof fetch;
    const res = await apiPost("/api/admin/matches", {});
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Ошибка 502");
    expect(res.data).toEqual({});
  });

  test("сетевой сбой: ok=false без data", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const res = await apiPost("/api/admin/teams", {});
    expect(res.ok).toBe(false);
    expect(res.error).toBe("network down");
    expect(res.data).toBeUndefined();
  });
});
