// HTTP-ошибки доменного слоя (не зависят от next/headers — используются и в seed)

export class HttpError extends Error {
  status: number;
  /** Машиночитаемая полезная нагрузка ошибки (код, счётчики зависимостей) —
   *  отдаётся в JSON рядом с error, чтобы UI мог предложить действие
   *  (каскадное удаление, переход к карточке) вместо тупика «нельзя удалить». */
  extra?: Record<string, unknown>;
  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message, ...(e.extra ?? {}) }, { status: e.status });
  }
  console.error("[api]", e);
  return Response.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
}
