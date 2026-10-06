"use client";

// ============================================================
// SCORESBOX · ProtocolFinishTab — вкладка «Завершение» редактора
// протокола (выделена из ProtocolEditor в v1.0.30).
//  • «Завершить матч»: фиксирует счёт из событий, пересчёт
//    таблицы, автоматические дисквалификации (инвариант PRD §4 —
//    главный судья обязателен);
//  • «Вернуть в работу» (SUPER_ADMIN): откат дисциплины;
//  • техническое поражение (WO): неявка хозяев/гостей/обеих.
// ============================================================

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "./hooks";
import { CardIcon } from "./EventIcons";
import { isProtocolLocked, WO_LABEL, type ProtocolTabProps } from "./protocol-shared";

interface Props extends ProtocolTabProps {
  /** SUPER_ADMIN видит «Вернуть в работу» */
  userRole: string;
}

export default function ProtocolFinishTab({ matchId, data, userRole, onReload }: Props) {
  const m = data.match;
  const isLocked = isProtocolLocked(m.status);

  // форма WO
  const [woType, setWoType] = useState("HOME");
  const [woNote, setWoNote] = useState("");

  const [busy, setBusy] = useState(false);

  async function completeMatch() {
    if (!m.referee) {
      toast.error("Матч не может быть завершён без назначенного главного судьи (инвариант PRD §4)");
      return;
    }
    setBusy(true);
    const res = await apiPost<{ score: { home: number; away: number } }>(`/api/admin/matches/${matchId}`, { action: "complete" });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error, { duration: 7000 });
      return;
    }
    toast.success(`Матч завершён. Итоговый счёт ${res.data?.score.home}:${res.data?.score.away}. Таблица пересчитана.`);
    onReload();
  }

  async function assignWalkover() {
    setBusy(true);
    const res = await apiPost(`/api/admin/matches/${matchId}`, { action: "walkover", walkoverType: woType, note: woNote || undefined });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Техническое поражение оформлено");
    onReload();
  }

  async function resetMatch() {
    setBusy(true);
    const res = await apiPost(`/api/admin/matches/${matchId}`, { action: "reset" });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Матч возвращён в работу, дисциплинарные последствия откачены");
    onReload();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-zinc-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Завершение матча</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-zinc-500">
            Итоговый счёт рассчитывается из событий протокола: <b>{m.homeTeam.name} {m.homeScore ?? 0} : {m.awayScore ?? 0} {m.awayTeam.name}</b>.
            После завершения: пересчёт таблицы, автоматические дисквалификации (КК и накопление ЖК), отсиживание банов.
          </p>
          {!isLocked ? (
            <>
              {!m.referee && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">Назначьте главного судью — без него завершение запрещено.</p>}
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={busy || !m.referee} onClick={completeMatch}>
                Завершить матч
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Матч завершён</Badge>
              {userRole === "SUPER_ADMIN" && (
                <Button variant="outline" className="w-full border-red-200 text-red-600 hover:bg-red-50" disabled={busy} onClick={resetMatch}>
                  <RotateCcw className="mr-1 h-4 w-4" /> Вернуть в работу (откат дисциплины)
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-amber-700"><CardIcon kind="yellow" className="h-4 w-4" /> Техническое поражение (WO)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isLocked ? (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Причина</Label>
                <Select value={woType} onValueChange={setWoType}>
                  <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOME">Неявка хозяев (0:{m.league.walkoverScore})</SelectItem>
                    <SelectItem value="AWAY">Неявка гостей ({m.league.walkoverScore}:0)</SelectItem>
                    <SelectItem value="BOTH">Обе неявки (0:0, обеим 0 очков)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Комментарий (в протокол)</Label>
                <Textarea value={woNote} onChange={(e) => setWoNote(e.target.value)} rows={2} placeholder="Неявка команды на стадион, акт судьи..." />
              </div>
              <Button variant="outline" className="w-full border-amber-300 text-amber-700 hover:bg-amber-50" disabled={busy} onClick={assignWalkover}>
                Оформить техпоражение
              </Button>
              <p className="text-xs text-zinc-400">События и составы WO-матча будут удалены; индивидуальная статистика не затрагивается.</p>
            </>
          ) : (
            m.status === "WALKOVER" ? (
              <p className="text-sm text-amber-700">Уже оформлено: {WO_LABEL[m.walkoverType ?? ""]} {m.note ? `— ${m.note}` : ""}</p>
            ) : (
              <p className="text-sm text-zinc-400">Матч уже завершён.</p>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
