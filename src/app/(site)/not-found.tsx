import Link from "next/link";
import { BRAND } from "@/components/portal/brand";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10 font-mono text-3xl font-black text-gold">
        404
      </span>
      <div>
        <h1 className="text-2xl font-black tracking-tight text-ink">Страница не найдена</h1>
        <p className="mt-2 max-w-md text-sm text-ink2">
          Возможно, матч или профиль был удалён, а ссылка осталась. Проверьте адрес или начните с главной — там живая лента всех турниров {BRAND.region}.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-goldink transition-colors hover:bg-gold/85"
      >
        На главную
      </Link>
    </div>
  );
}
