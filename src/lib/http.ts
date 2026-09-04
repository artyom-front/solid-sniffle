// HTTP-ошибки доменного слоя (не зависят от next/headers — используются и в seed)

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  console.error("[api]", e);
  return Response.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
}
