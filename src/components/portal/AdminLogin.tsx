"use client";

// ============================================================
// Вход для сотрудников ФФЧ — единственная точка аутентификации
// (публичный сайт кнопок входа не содержит).
// Шаг 1: email + пароль. Шаг 2 (если включена 2FA): 6-значный
// код из приложения-аутентификатора или резервный код.
// ============================================================

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { KeyRound, Info, ShieldCheck, Smartphone, ArrowLeft, LifeBuoy } from "lucide-react";
import { apiPost, useFetch } from "./hooks";
import type { SessionUserDTO } from "./types";
import { BRAND } from "./brand";

const DEMO_ACCOUNTS = [
  { email: "admin@ff21.ru", password: "admin123", role: "Супер-администратор", desc: "Merge профилей, КДК, аудит, все права" },
  { email: "liga@ff21.ru", password: "liga123", role: "Администратор лиги", desc: "Расписание, протоколы, дисциплины" },
  { email: "sudya@ff21.ru", password: "sudya123", role: "Судья", desc: "Ввод протоколов своих матчей" },
  { email: "club@ff21.ru", password: "club123", role: "Администратор клуба", desc: "Заявки и трансферы игроков" },
];

interface Props {
  onLoggedIn: (u: SessionUserDTO) => void;
}

export default function AdminLogin({ onLoggedIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // 2FA-шаг: подписанный челлендж из логина
  const [challenge, setChallenge] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  // демо-входы скрыты на проде: SHOW_DEMO_ACCOUNTS=0 (см. DEPLOY.md)
  const { data: siteConfig } = useFetch<{ demoAccounts: boolean }>("/api/public/site-config");
  const showDemo = siteConfig?.demoAccounts ?? false;

  const finishLogin = (data: SessionUserDTO) => {
    toast.success(`Добро пожаловать, ${data.personName ?? data.email}!`);
    onLoggedIn(data);
  };

  const login = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    const body = creds ?? { email, password };
    setLoading(true);
    const res = await apiPost<SessionUserDTO | { otpRequired: true; challenge: string }>("/api/auth/login", body);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const data = res.data!;
    if ("otpRequired" in data && data.otpRequired) {
      // шаг 2: код подтверждения
      setChallenge(data.challenge);
      toast.info("Введите код из приложения-аутентификатора");
      return;
    }
    finishLogin(data as SessionUserDTO);
  };

  const verifyOtp = async (code?: string) => {
    if (!challenge) return;
    const useCode = code ?? (recoveryMode ? undefined : otp);
    if (!useCode && !recoveryCode) {
      toast.error("Введите 6-значный код");
      return;
    }
    setLoading(true);
    const res = await apiPost<SessionUserDTO>("/api/auth/otp", {
      challenge,
      ...(recoveryMode ? { recoveryCode: recoveryCode.trim().toUpperCase() } : { code: useCode }),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      setOtp("");
      return;
    }
    finishLogin(res.data!);
  };

  // ---------- Шаг 2: OTP ----------
  if (challenge) {
    return (
      <div className="theme-dark flex min-h-screen items-center justify-center bg-s0 p-4 text-ink">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-sline bg-s1">
          <div className="stadium-glow flex items-center gap-2.5 px-5 py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold font-mono text-base font-black text-goldink">
              {BRAND.mark}
            </span>
            <div>
              <p className="text-sm font-bold text-ink">Подтверждение входа</p>
              <p className="text-xs text-ink3">Двухфакторная защита аккаунта</p>
            </div>
          </div>

          <div className="space-y-5 p-5">
            {recoveryMode ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="recovery" className="text-ink2">Резервный код</Label>
                  <Input
                    id="recovery"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                    placeholder="XXXX-XXXX"
                    className="border-sline bg-s1 font-mono text-ink placeholder:text-ink3"
                    autoComplete="one-time-code"
                  />
                  <p className="text-xs text-ink3">Код одноразовый: после входа он списывается</p>
                </div>
                <Button onClick={() => void verifyOtp()} disabled={loading} className="w-full bg-gold text-goldink hover:bg-gold/85">
                  <LifeBuoy className="mr-1 h-4 w-4" /> Войти по резервному коду
                </Button>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center gap-2">
                  <Smartphone className="h-8 w-8 text-gold" />
                  <p className="text-center text-sm text-ink2">
                    Откройте приложение-аутентификатор и введите текущий код для <span className="font-semibold text-ink">{email}</span>
                  </p>
                </div>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otp} onChange={(v) => setOtp(v)} autoFocus>
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
                </div>
                <Button onClick={() => void verifyOtp()} disabled={loading || otp.length < 6} className="w-full bg-gold text-goldink hover:bg-gold/85">
                  <KeyRound className="mr-1 h-4 w-4" /> Подтвердить и войти
                </Button>
                <button onClick={() => setRecoveryMode(true)} className="w-full text-center text-xs text-ink3 underline-offset-2 hover:text-ink2 hover:underline">
                  Нет доступа к телефону? Использовать резервный код
                </button>
              </>
            )}

            <Button
              variant="ghost"
              className="w-full text-ink3 hover:text-ink"
              onClick={() => { setChallenge(null); setOtp(""); setRecoveryMode(false); setRecoveryCode(""); }}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Войти под другим аккаунтом
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Шаг 1: пароль ----------
  return (
    <div className="theme-dark flex min-h-screen items-center justify-center bg-s0 p-4 text-ink">
      <div className="grid w-full max-w-3xl gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-sline bg-s1">
          <div className="stadium-glow flex items-center gap-2.5 px-5 py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold font-mono text-base font-black text-goldink">{BRAND.mark}</span>
            <div>
              <p className="text-sm font-bold text-ink">Вход для сотрудников ФФЧ</p>
              <p className="text-xs text-ink3">{BRAND.name} · панель управления</p>
            </div>
          </div>
          <form onSubmit={login} className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-ink2">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@ff21.ru" required className="border-sline bg-s1 text-ink placeholder:text-ink3" autoComplete="username" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-ink2">Пароль</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className="border-sline bg-s1 text-ink placeholder:text-ink3" autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full bg-gold text-goldink hover:bg-gold/85" disabled={loading}>
              <KeyRound className="mr-1 h-4 w-4" /> Войти
            </Button>
          </form>
        </div>

        {showDemo ? (
          <div className="overflow-hidden rounded-2xl border border-sline bg-s1">
            <div className="flex items-center gap-2 border-b border-sline/60 bg-s2/50 px-5 py-4">
              <Info className="h-4 w-4 text-gold" />
              <p className="text-sm font-bold text-ink">Демо-аккаунты (RBAC)</p>
            </div>
            <div className="space-y-2 p-4">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  onClick={() => login(undefined, { email: a.email, password: a.password })}
                  className="w-full rounded-xl border border-sline/60 bg-s2/40 p-3 text-left transition-colors hover:border-gold/50 hover:bg-s2/80"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-sm font-semibold text-gold">{a.role}</span>
                    <span className="text-xs text-ink3">{a.email} / {a.password}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink2">{a.desc}</p>
                </button>
              ))}
              <p className="pt-1 text-xs text-ink3">
                Клик по аккаунту — мгновенный вход. Пароли демо-стенда; на проде вход защищён 2FA (TOTP).
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-sline bg-s1">
            <div className="flex items-center gap-2 border-b border-sline/60 bg-s2/50 px-5 py-4">
              <ShieldCheck className="h-4 w-4 text-ok" />
              <p className="text-sm font-bold text-ink">Защищённый доступ</p>
            </div>
            <div className="space-y-3 p-5 text-xs text-ink2">
              <p>Учётные данные выдаёт администратор федерации. Для аккаунтов с включённой двухфакторной защитой после пароля запрашивается код из приложения-аутентификатора.</p>
              <p className="text-ink3">Пароли хранятся в виде scrypt-хэшей; вход ограничен по числу попыток и журналируется.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
