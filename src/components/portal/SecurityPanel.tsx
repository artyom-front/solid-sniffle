"use client";

// ============================================================
// Раздел админки «Безопасность»: управление 2FA (TOTP).
// Включение: QR/секрет → код подтверждения → резервные коды
// (показываются один раз, скачиваются файлом). Выключение —
// кодом или паролем. Перегенерация резервных кодов — паролем.
// ============================================================

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, Smartphone, QrCode, KeyRound, Download, RefreshCw, ShieldAlert, LifeBuoy, Copy, Check } from "lucide-react";
import { apiPost, useFetch } from "./hooks";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";

interface Status {
  enabled: boolean;
  hasSecret: boolean;
  recoveryLeft: number;
}

type Stage = "idle" | "pairing" | "recovery";

export default function SecurityPanel() {
  const [version, setVersion] = useState(0);
  const { data: status } = useFetch<Status>("/api/admin/totp", version);

  const [stage, setStage] = useState<Stage>("idle");
  const [pairing, setPairing] = useState<{ secret: string; otpauth: string; qr: string } | null>(null);
  const [otp, setOtp] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [regenPassword, setRegenPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const call = async (body: Record<string, unknown>) => apiPost<Record<string, unknown>>("/api/admin/totp", body);

  const startSetup = async () => {
    setBusy(true);
    const res = await call({ action: "setup" });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setPairing({ secret: res.data!.secret as string, otpauth: res.data!.otpauth as string, qr: res.data!.qr as string });
    setStage("pairing");
    setOtp("");
    setRecoveryCodes(null);
  };

  const confirmEnable = async () => {
    if (!pairing) return;
    setBusy(true);
    const res = await call({ action: "enable", code: otp });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setRecoveryCodes(res.data!.recoveryCodes as string[]);
    setStage("recovery");
    setVersion((v) => v + 1);
    toast.success("Двухфакторная защита включена");
  };

  const disable = async () => {
    setBusy(true);
    const res = await call({ action: "disable", code: disableCode || undefined, password: disablePassword || undefined });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setDisableCode("");
    setDisablePassword("");
    setVersion((v) => v + 1);
    setStage("idle");
    toast.success("Двухфакторная защита выключена");
  };

  const regen = async () => {
    setBusy(true);
    const res = await call({ action: "recovery", password: regenPassword });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setRegenPassword("");
    setRecoveryCodes(res.data!.recoveryCodes as string[]);
    setStage("recovery");
    toast.success("Новые резервные коды созданы — старые больше не работают");
  };

  const downloadCodes = () => {
    if (!recoveryCodes) return;
    const text = `SCORESBOX — резервные коды входа\nКаждый код одноразовый. Храните файл в надёжном месте.\n\n${recoveryCodes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "scoresbox-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyCodes = async () => {
    if (!recoveryCodes) return;
    await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ---------- Статус 2FA ---------- */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-2.5 text-sm font-bold text-zinc-700">
          <ShieldCheck className="h-4 w-4 text-emerald-600" /> Двухфакторная аутентификация
        </div>
        <div className="space-y-4 p-4">
          <div className={`rounded-lg border p-4 ${status?.enabled ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <p className={`text-sm font-bold ${status?.enabled ? "text-emerald-800" : "text-amber-800"}`}>
              {status?.enabled ? "2FA включена — аккаунт защищён" : "2FA не включена — рекомендуем включить"}
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              {status?.enabled
                ? `Осталось резервных кодов: ${status.recoveryLeft} из 8. При входе запрашивается код из приложения-аутентификатора.`
                : "После включения при входе будет запрашиваться 6-значный код из приложения (Google Authenticator, Яндекс.Ключ, 1Password)."}
            </p>
          </div>

          {!status?.enabled && stage !== "pairing" && (
            <Button onClick={startSetup} disabled={busy} className="bg-emerald-600 text-white hover:bg-emerald-700">
              <Smartphone className="mr-1 h-4 w-4" /> Включить 2FA
            </Button>
          )}

          {/* ---------- Пейринг: QR + код ---------- */}
          {stage === "pairing" && pairing && (
            <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm font-semibold text-zinc-800">Шаг 1. Добавьте аккаунт в приложение</p>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                {/* <img> для data-URL QR — next/image тут не нужен */}
                <img src={pairing.qr} alt="QR-код для приложения-аутентификатора" width={160} height={160} className="rounded-lg border border-zinc-200 bg-white p-1" />
                <div className="min-w-0 flex-1 space-y-2 text-xs text-zinc-600">
                  <p>Отсканируйте QR камерой в приложении-аутентификаторе или введите секрет вручную:</p>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-white px-2 py-1 font-mono text-sm tracking-wider text-zinc-800">{pairing.secret}</code>
                    <button
                      onClick={() => { void navigator.clipboard.writeText(pairing.secret); toast.success("Секрет скопирован"); }}
                      className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-500 hover:text-zinc-800"
                      aria-label="Скопировать секрет"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-zinc-400">Тип: TOTP · SHA1 · 6 цифр · шаг 30 с</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-zinc-800">Шаг 2. Введите текущий код из приложения</p>
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
                <div className="flex gap-2">
                  <Button onClick={confirmEnable} disabled={busy || otp.length < 6} className="bg-emerald-600 text-white hover:bg-emerald-700">
                    <KeyRound className="mr-1 h-4 w-4" /> Подтвердить
                  </Button>
                  <Button variant="outline" onClick={() => { setStage("idle"); setPairing(null); }} className="border-zinc-200">
                    Отмена
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ---------- Резервные коды ---------- */}
          {stage === "recovery" && recoveryCodes && (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                <LifeBuoy className="h-4 w-4" /> Резервные коды — сохраните сейчас
              </p>
              <p className="text-xs text-zinc-600">
                Каждый код работает один раз, если телефон недоступен. Показываются только сейчас — после выхода их не восстановить (только перегенерация).
              </p>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm text-zinc-800 sm:grid-cols-4">
                {recoveryCodes.map((c) => (
                  <span key={c} className="rounded bg-white px-2 py-1 text-center tracking-wider">{c}</span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={downloadCodes} className="bg-emerald-600 text-white hover:bg-emerald-700">
                  <Download className="mr-1 h-3.5 w-3.5" /> Скачать .txt
                </Button>
                <Button size="sm" variant="outline" onClick={copyCodes} className="border-emerald-200 bg-white">
                  {copied ? <Check className="mr-1 h-3.5 w-3.5 text-emerald-600" /> : <Copy className="mr-1 h-3.5 w-3.5" />} {copied ? "Скопировано" : "Скопировать"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setStage("idle")} className="border-zinc-200 bg-white">
                  Готово
                </Button>
              </div>
            </div>
          )}

          {/* ---------- Выключение ---------- */}
          {status?.enabled && (
            <details className="rounded-xl border border-zinc-200">
              <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:text-zinc-900">
                Выключить 2FA (код или пароль)
              </summary>
              <div className="space-y-3 border-t border-zinc-100 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-zinc-500">Код из приложения</Label>
                    <Input value={disableCode} onChange={(e) => setDisableCode(e.target.value)} maxLength={6} className="border-zinc-200 font-mono" placeholder="123456" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-500">или пароль</Label>
                    <Input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} className="border-zinc-200" placeholder="••••••••" />
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={disable} disabled={busy || (!disableCode && !disablePassword)} className="border-red-200 text-red-600 hover:bg-red-50">
                  <ShieldAlert className="mr-1 h-3.5 w-3.5" /> Выключить защиту
                </Button>
              </div>
            </details>
          )}
        </div>
      </div>

      {/* ---------- Резервные коды + правила ---------- */}
      <div className="space-y-4">
        {status?.enabled && (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-2.5 text-sm font-bold text-zinc-700">
              <RefreshCw className="h-4 w-4 text-emerald-600" /> Резервные коды
            </div>
            <div className="space-y-3 p-4">
              <p className="text-xs text-zinc-500">
                Доступно: <span className="font-bold text-zinc-800">{status.recoveryLeft}</span> из 8. Потеряли телефон или израсходовали коды — создайте новый набор (старые аннулируются).
              </p>
              <div className="space-y-1.5">
                <Label className="text-zinc-500">Подтвердите паролем</Label>
                <Input type="password" value={regenPassword} onChange={(e) => setRegenPassword(e.target.value)} className="border-zinc-200" placeholder="••••••••" />
              </div>
              <Button size="sm" onClick={regen} disabled={busy || !regenPassword} className="bg-emerald-600 text-white hover:bg-emerald-700">
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Создать новый набор
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-2.5 text-sm font-bold text-zinc-700">
            <QrCode className="h-4 w-4 text-emerald-600" /> Как это работает
          </div>
          <ul className="space-y-2.5 p-4 text-xs leading-relaxed text-zinc-600">
            <li>• Код генерирует ваше приложение по стандарту RFC 6238 (TOTP): 6 цифр, обновление каждые 30 секунд, сервер проверяет окно ±30 с.</li>
            <li>• Секрет хранится только на сервере и в вашем приложении; по сети коды не передаются повторно, повторно введённый код отклоняется.</li>
            <li>• Пароль остаётся обязательным: код — второй фактор, а не замена. Вход ограничен 10 попытками в минуту, все входы журналируются.</li>
            <li>• При потере телефона используйте резервный код и сразу перегенерируйте набор. Совсем нет доступа — обратитесь к супер-администратору.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
