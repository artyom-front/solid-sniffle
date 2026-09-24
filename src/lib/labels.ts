// Общие словари отображения — используются и API (сервер), и UI (клиент).

export const FORMAT_LABELS: Record<string, string> = {
  F11: "Футбол", // большой футбол 11×11 — для зрителя это просто «футбол»
  F8: "8×8",
  F6: "6×6",
  FUTSAL: "Мини-футбол",
};

/** Сколько игроков команда выпускает с первых минут по формату.
 *  FRIENDLY — договорняк без формата: ориентир 11 (большой футбол),
 *  предупреждение, но не блокировка (формат матча неизвестен). */
export const STARTER_LIMITS: Record<string, number> = {
  F11: 11,
  F8: 8,
  F6: 6,
  FUTSAL: 5,
  FRIENDLY: 11,
};

/** Подписи ролей заявки (Registration.role) — сервер и клиент.
 *  Игроки идут в «Стартовые/Запасные», остальные — в группу «Штаб». */
export const REGISTRATION_ROLE_LABELS: Record<string, string> = {
  PLAYER: "Игрок",
  COACH: "Главный тренер",
  ASSISTANT_COACH: "Помощник тренера",
  GOALKEEPER_COACH: "Тренер вратарей",
  FITNESS_COACH: "Тренер по физподготовке",
  PRESS_OFFICER: "Пресс-атташе",
  PRESIDENT: "Президент / председатель",
  GENERAL_MANAGER: "Генеральный менеджер",
  ADMINISTRATOR: "Администратор",
  MASSEUR: "Массажист",
  DOCTOR: "Врач",
};

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Супер-администратор",
  LEAGUE_ADMIN: "Администратор лиги",
  CLUB_ADMIN: "Администратор клуба",
  REFEREE: "Судья",
  PLAYER: "Игрок",
  GUEST: "Гость",
};

export const EVENT_LABELS: Record<string, string> = {
  GOAL: "Гол",
  PENALTY: "Гол с пенальти",
  OWN_GOAL: "Автогол",
  YELLOW_CARD: "Жёлтая карточка",
  RED_CARD: "Красная карточка",
  SUBSTITUTION: "Замена",
  // легаси-пары старых протоколов (читаются, но не создаются)
  SUB_OUT: "Замена (ушёл с поля)",
  SUB_IN: "Замена (вышел на поле)",
  // VAR: видеопомощь — событие о решении, а не о голе
  VAR_GOAL_CONFIRM: "VAR: гол подтверждён",
  VAR_GOAL_CANCEL: "VAR: гол отменён",
  VAR_PENALTY: "VAR: назначен пенальти",
}

/** Короткие подписи для хронологии: только там, где иконка сама по себе
 *  не передаёт деталей (автогол, вердикт VAR).
 *  Гол, пенальти (иконка с «П»), ЖК, КК и замены подписей не имеют —
 *  иконка исчерпывающа. */
export const EVENT_SHORT_LABELS: Record<string, string> = {
  OWN_GOAL: "автогол",
  VAR_GOAL_CONFIRM: "гол подтверждён",
  VAR_GOAL_CANCEL: "гол отменён",
  VAR_PENALTY: "пенальти назначен",
};

export const SOURCE_LABELS: Record<string, string> = {
  AUTO_RED: "Красная карточка (авто)",
  AUTO_YELLOW: "Накопление ЖК (авто)",
  MANUAL: "Решение КДК",
};

export const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Запланирован",
  LIVE: "Идёт",
  COMPLETED: "Завершён",
  WALKOVER: "Тех. поражение",
  POSTPONED: "Перенесён",
};

/** Порог серии: показываем только «настоящие» стрики — 5+ матчей подряд.
 *  Короткая серия (2–4 матча) — шум, а не сигнал для зрителя. */
export const STREAK_MIN = 5;

/** Серии команд для сигналов ленты (код → читаемый текст) */
export const STREAK_LABELS: Record<string, string> = {
  W: "побед",
  D: "ничьих",
  L: "поражений",
  T: "техпоражений",
  w: "техпобед",
};

/** Позиции игроков — полные названия */
export const POSITION_LABELS: Record<string, string> = {
  GK: "Вратарь",
  DF: "Защитник",
  MF: "Полузащитник",
  FW: "Нападающий",
};
