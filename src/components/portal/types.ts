// Общие типы API-контрактов (аналог shared-пакета Monorepo из PRD, инвариант №2)

export interface LeagueDTO {
  id: string;
  name: string;
  shortName: string | null;
  format: string;
  isPinned: boolean;
  priority: number;
  yellowCardLimit: number;
  redCardBanMatches: number;
  walkoverScore: number;
  transferWindowEnd: string | null;
  seasons: { id: string; name: string; startDate: string; isCurrent: boolean }[];
}

export interface MatchDayDTO {
  league: { id: string; name: string; shortName: string | null; format: string; isPinned: boolean; walkoverScore: number };
  season: { id: string; name: string };
  matches: LivescoreMatchDTO[];
}

export interface BannerDTO {
  id: string;
  placement: string;
  title: string;
  imageUrl: string | null;
  linkUrl: string | null;
  text: string | null;
}

export interface OverviewDTO {
  leagues: LeagueDTO[];
  stats: {
    persons: number; teams: number; matches: number; goals: number;
    events: number; activeSuspensions: number; clubs: number; referees: number;
  };
}

export interface StandingRowDTO {
  position: number;
  teamId: string;
  teamName: string;
  clubName: string | null;
  games: number; wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number; goalDiff: number;
  points: number; techLosses: number; techWins: number;
  fairPlay: number; yellowCards: number; redCards: number;
  form: string[];
}

export interface MatchDTO {
  id: string;
  round: number | null;
  kickoff: string;
  status: string;
  walkoverType: string | null;
  homeScore: number | null;
  awayScore: number | null;
  note: string | null;
  homeTeam: { id: string; name: string; clubName: string | null };
  awayTeam: { id: string; name: string; clubName: string | null };
  stadium: { id: string; name: string; city: string | null } | null;
  referee: { id: string; name: string } | null;
  regulationScore: number;
}

// ---------- Сигналы турнира (лента и карточка матча) ----------

export interface StreakDTO {
  /** W | D | L | T (техпоражение) | w (техпобеда) */
  code: string;
  count: number;
}

export interface MatchSignalSideDTO {
  position: number | null;
  points: number | null;
  games: number | null;
  streak: StreakDTO | null;
  topScorer: { personId: string; name: string; goals: number } | null;
  topScorerOut: boolean;
  newCoach: { personId: string; name: string } | null;
}

export interface MatchSignalsDTO {
  home: MatchSignalSideDTO;
  away: MatchSignalSideDTO;
  important: { flag: boolean; reason: string };
  roundsLeft: number | null;
}

/** Матч ленты с сигналами */
export type LivescoreMatchDTO = MatchDTO & { signals?: MatchSignalsDTO };

export interface PlayerStatRowDTO {
  personId: string;
  name: string;
  teamName: string;
  teamId: string;
  position: string | null;
  games: number;
  goals: number;
  penalties: number;
  ownGoals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  cleanSheets: number;
}

export interface ScorersDTO {
  scorers: PlayerStatRowDTO[];
  assisters: PlayerStatRowDTO[];
  goalkeepers: PlayerStatRowDTO[];
  fairPlay: PlayerStatRowDTO[];
}

export interface SuspensionDTO {
  id: string;
  person: { id: string; name: string };
  team: { id: string; name: string } | null;
  league: { name: string };
  source: string;
  reason: string | null;
  matchesTotal: number;
  matchesServed: number;
  isLifetime: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface TeamDTO {
  id: string;
  name: string;
  clubName: string | null;
  city: string | null;
  players: { id: string; name: string; position: string | null; number: number | null; endDate: string | null }[];
}

export interface RefereeStatDTO {
  personId: string;
  name: string;
  matches: number;
  yellowAvg: number;
  redAvg: number;
  penaltyAvg: number;
  avgRating: number | null;
  ratingsCount: number;
}

export interface SessionUserDTO {
  id: string;
  email: string;
  role: "SUPER_ADMIN" | "LEAGUE_ADMIN" | "CLUB_ADMIN" | "REFEREE" | "PLAYER";
  personId: string | null;
  clubId: string | null;
  personName: string | null;
}

// Словари отображения централизованы в src/lib/labels.ts (общие для API и UI)
export { FORMAT_LABELS, ROLE_LABELS, EVENT_LABELS, SOURCE_LABELS, STATUS_LABELS } from "@/lib/labels";
