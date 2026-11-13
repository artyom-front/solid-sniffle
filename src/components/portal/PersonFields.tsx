"use client";

// ============================================================
// v1.0.52 · PersonFields — ЕДИНЫЕ ПОЛЯ СОЗДАНИЯ/РЕДАКТИРОВАНИЯ
// ПЕРСОНЫ (фидбек юзера: «создать игрока можно разным способом в
// админке и надо сделать так, чтобы процесс создания был един»).
//
// Один и тот же блок полей используется:
//   • панель «Люди» (CrudPanels2 · PeoplePanel) — кнопка «Персона»;
//   • карточка команды → «В заявку» (TeamDetailPanel · AddPlayerDialog)
//     — вкладка «Создать нового» + заявка в команду;
// один API (POST/PATCH /api/admin/persons), одинаковые подписи,
// подсказки и обработка дублей. Админ видит ОДИН знакомый интерфейс.
//
// Файл держит и PersonDupesNotice — единый блок предупреждения о
// похожих профилях (409 с кнопкой «всё равно создать» + advisory).
// ============================================================

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, GitMerge, Info, UserPlus } from "lucide-react";
import { Field } from "./CrudPanels";
import { MediaUpload } from "./MediaUpload";
import { SYSTEM_ROLES, ROLE_GROUP_LABELS, CARD_ROLE_CONFLICT_HINT, type RoleDef } from "@/lib/roles";
import { cn } from "@/lib/utils";

export interface PersonFormValue {
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  gender: string;
  position: string;
  photoUrl: string;
  roles: string[];
}

export interface CustomRoleDTO {
  id: string;
  code: string;
  name: string;
}

interface PersonFieldsProps {
  value: PersonFormValue;
  onChange: (next: PersonFormValue) => void;
  customRoles: CustomRoleDTO[];
  /** Показать фото (в компактном диалоге заявки можно скрыть) */
  withPhoto?: boolean;
}

/** Единые поля персоны: ФИО, ДР, пол, позиция, фото, специализации.
 *  Сетка адаптивная: один столбец на телефоне, два — от sm (v1.0.52). */
export function PersonFields({ value, onChange, customRoles, withPhoto = true }: PersonFieldsProps) {
  const set = <K extends keyof PersonFormValue>(key: K, v: PersonFormValue[K]) =>
    onChange({ ...value, [key]: v });

  const toggleRole = (code: string) => {
    const has = value.roles.includes(code);
    const roles = has ? value.roles.filter((r) => r !== code) : [...value.roles, code];
    onChange({ ...value, roles, position: has && code === "PLAYER" ? "" : value.position });
  };

  const isPlayer = value.roles.includes("PLAYER");

  const groups: { group: RoleDef["group"]; roles: { code: string; name: string }[] }[] = (
    ["team", "officials", "medicine"] as const
  ).map((group) => ({
    group,
    roles: SYSTEM_ROLES.filter((r) => r.group === group).map((r) => ({ code: r.code, name: r.name })),
  }));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Фамилия"><Input value={value.lastName} onChange={(e) => set("lastName", e.target.value)} autoComplete="off" /></Field>
      <Field label="Имя"><Input value={value.firstName} onChange={(e) => set("firstName", e.target.value)} autoComplete="off" /></Field>
      <Field label="Отчество"><Input value={value.middleName} onChange={(e) => set("middleName", e.target.value)} autoComplete="off" /></Field>
      <Field label="Дата рождения" hint="Тёзки (одинаковые Ф+И) создаются свободно; точное совпадение ФИО+даты попросит подтверждения">
        <Input type="date" value={value.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
      </Field>
      <Field label="Пол">
        <select value={value.gender} onChange={(e) => set("gender", e.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
          <option value="">— не указан —</option>
          <option value="MALE">Мужской</option>
          <option value="FEMALE">Женский</option>
        </select>
      </Field>
      {isPlayer && (
        <Field label="Позиция (для роли «Игрок»)">
          <select value={value.position} onChange={(e) => set("position", e.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
            <option value="">— не указана —</option>
            <option value="GK">Вратарь</option>
            <option value="DF">Защитник</option>
            <option value="MF">Полузащитник</option>
            <option value="FW">Нападающий</option>
          </select>
        </Field>
      )}
      {withPhoto && (
        <div className="col-span-1 sm:col-span-2">
          <MediaUpload value={value.photoUrl} onChange={(url) => set("photoUrl", url)} label="Фото персоны" hint="Квадрат от 300×300 — показывается кружком; JPG/PNG/WebP до 8 МБ, сожмётся автоматически" round />
        </div>
      )}

      <div className="col-span-1 space-y-2 sm:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <label className="text-xs font-semibold text-zinc-600">Специализации (можно несколько)</label>
          <span className="hidden text-[11px] text-zinc-400 sm:inline">свои роли добавляются в панели «Люди»</span>
        </div>
        <p className="text-[11px] leading-snug text-zinc-400">
          «Судья (судейский корпус)» — единая роль: главный, помощник, инспектор, делегат — это ДОЛЖНОСТИ, назначаемые в матче.
          Игрок совместим с любой ролью: играет в одной лиге, судит другую. Стать тренером/директором позже — просто добавьте роль и заявку.
        </p>
        {groups.map((g) => (
          <div key={g.group}>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{ROLE_GROUP_LABELS[g.group]}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.roles.map((r) => {
                const active = value.roles.includes(r.code);
                return (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => toggleRole(r.code)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                      active ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    )}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {customRoles.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Свои роли</p>
            <div className="flex flex-wrap gap-1.5">
              {customRoles.map((r) => {
                const active = value.roles.includes(r.code);
                return (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => toggleRole(r.code)}
                    className={cn(
                      "rounded-full border border-dashed px-2.5 py-1 text-xs font-medium transition-colors",
                      active ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
                    )}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* игрок + судья — нормально, подсказка */}
      {isPlayer && value.roles.includes("REFEREE") && (
        <div className="col-span-1 space-y-1.5 rounded-lg border border-sky-200 bg-sky-50 p-3 sm:col-span-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-sky-800">
            <Info className="h-3.5 w-3.5" /> Игрок и судья одновременно — это нормально
          </p>
          <p className="text-xs text-sky-700">{CARD_ROLE_CONFLICT_HINT}</p>
        </div>
      )}
    </div>
  );
}

export interface PersonDuplicate {
  id: string;
  name: string;
  birthDate: string | null;
  roles?: string[];
  teams?: string[];
}

interface DupesNoticeProps {
  dupes: PersonDuplicate[];
  busy: boolean;
  onForce: () => void;
  onOpenPerson?: (personId: string) => void;
  /** Текст кнопки подтверждения (контекст завки/панели) */
  forceLabel?: string;
}

/** Единый блок предупреждения о похожих профилях: 409 (точное совпадение
 *  ФИО+ДР) с кнопкой «всё равно создать» + напоминание про Merge. */
export function PersonDupesNotice({ dupes, busy, onForce, onOpenPerson, forceLabel = "Это другой человек — создать всё равно" }: DupesNoticeProps) {
  if (dupes.length === 0) return null;
  const roleNameOf = (code: string) => SYSTEM_ROLES.find((r) => r.code === code)?.name ?? code;
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5" /> Точно такие же ФИО и дата рождения уже есть:
      </p>
      {dupes.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-amber-700">
            {d.name}{d.birthDate ? ` · ${d.birthDate}` : ""}
            {d.teams?.length ? ` · ${d.teams.join(", ")}` : ""}
            {d.roles?.length ? ` · ${d.roles.map(roleNameOf).join(", ")}` : ""}
          </p>
          {onOpenPerson && (
            <Button
              size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-amber-800 hover:bg-amber-100"
              onClick={() => onOpenPerson(d.id)}
              title="Открыть карточку похожей персоны и решить на месте"
            >
              Открыть карточку
            </Button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 border-amber-300 bg-white text-xs text-amber-800 hover:bg-amber-100" disabled={busy} onClick={onForce}>
          <UserPlus className="mr-1 h-3 w-3" /> {forceLabel}
        </Button>
        <p className="flex items-center gap-1 text-[11px] text-amber-600">
          <GitMerge className="h-3 w-3 shrink-0" />
          Создали дубль случайно? Объедините профили позже в разделе «Merge профилей».
        </p>
      </div>
    </div>
  );
}

/** Создать «пустую» персону для формы (по умолчанию — игрок) */
export const emptyPersonForm = (): PersonFormValue => ({
  lastName: "",
  firstName: "",
  middleName: "",
  birthDate: "",
  gender: "",
  position: "",
  photoUrl: "",
  roles: ["PLAYER"],
});
