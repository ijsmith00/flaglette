# Flaglette 스트릭 & 통계 시스템 사양서

## 목적
데일리 퍼즐 게임의 재방문 엔진 구축. localStorage 기반, 백엔드 없음.

## 핵심 의사결정
- **플레이 스트릭** 단일 (졌어도 플레이만 하면 유지)
- 스트릭 보호권: Phase 2 보류 (이번엔 미구현)
- 날짜 기준: **유저 로컬 시간 자정**
- 게임 시작 시점의 날짜로 기록 (자정 경계 처리)
- 연습모드 통계는 별도 키, 데일리 스트릭에 영향 없음

## 데이터 스키마

### localStorage 키
- `flaglette.stats.v1` — 데일리 게임 통계
- `flaglette.practice.v1` — 연습모드 통계 (이번 작업에선 데일리만)

### 타입 정의

```typescript
interface FlagletteStats {
  schemaVersion: 1;
  currentStreak: number;
  maxStreak: number;
  lastPlayedDate: string | null;    // "YYYY-MM-DD"
  totalPlayed: number;
  totalWon: number;
  guessDistribution: [number, number, number, number, number, number, number];
  // 인덱스: [1회, 2회, 3회, 4회, 5회, 6회, 실패]
  history: Array<{
    date: string;
    won: boolean;
    guesses: number;
    countryCode: string;
    hintsUsed: number;
  }>;
  firstPlayedDate: string | null;
  shareCount: number;
}

const DEFAULT_STATS: FlagletteStats = {
  schemaVersion: 1,
  currentStreak: 0,
  maxStreak: 0,
  lastPlayedDate: null,
  totalPlayed: 0,
  totalWon: 0,
  guessDistribution: [0, 0, 0, 0, 0, 0, 0],
  history: [],
  firstPlayedDate: null,
  shareCount: 0,
};
```

## 스트릭 규칙

| 상황 | currentStreak |
|---|---|
| 첫 플레이 (lastPlayedDate === null) | 1 |
| lastPlayedDate가 어제 | +1 |
| lastPlayedDate가 오늘 (재방문) | 변화 없음 (이미 기록함) |
| lastPlayedDate가 그저께 이전 | 1로 리셋 |
| lastPlayedDate가 미래 (시간대 이상) | 변화 없음 |

**중요**: 승패 무관. 플레이만 하면 스트릭 유지.

## 함수 명세

### `utils/date.ts`

```typescript
export function getLocalDateString(date?: Date): string;
// 로컬 시간 기준 "YYYY-MM-DD"

export function daysBetween(date1: string, date2: string): number;
// date2 - date1 (일수)

export function isYesterday(prevDate: string, today: string): boolean;
// prevDate가 today의 어제인지

export function msUntilMidnight(): number;
// 다음 자정까지 ms

export function formatCountdown(ms: number): string;
// "HH:MM:SS"
```

### `lib/stats.ts`

```typescript
export function loadStats(): FlagletteStats;
// localStorage 로드. 없거나 손상되면 DEFAULT_STATS 반환.

export function saveStats(stats: FlagletteStats): void;
// localStorage 저장. try/catch 처리.

export function recordGameResult(params: {
  won: boolean;
  guesses: number;          // 1~6, 실패면 6
  countryCode: string;
  hintsUsed: number;
  gameStartedAt?: number;   // ms timestamp
}): {
  stats: FlagletteStats;
  streakIncreased: boolean;
  newMilestone: number | null;  // 7, 30, 100 달성 순간만
};

export function resetStats(): void;
export function exportStats(): string;
export function importStats(json: string): boolean;
export function incrementShareCount(): void;
export function getWinRate(stats: FlagletteStats): number;  // 0~100
```

### `recordGameResult` 의사코드

```
1. loadStats()
2. today = gameStartedAt 기준 로컬 날짜 (없으면 now)
3. lastPlayedDate === today 이면 무시하고 return
4. previousStreak 저장
5. 스트릭 계산:
   - lastPlayedDate === null → currentStreak = 1
   - isYesterday(lastPlayedDate, today) → currentStreak += 1
   - daysBetween > 1 → currentStreak = 1
   - 미래 날짜 → 변화 없음
6. maxStreak = max(maxStreak, currentStreak)
7. lastPlayedDate = today
8. totalPlayed += 1
9. won이면 totalWon += 1
10. 시도 분포 인덱스 업데이트:
    - won: index = guesses - 1 (0~5)
    - !won: index = 6
11. history push, 60일 초과분 제거
12. firstPlayedDate가 null이면 today
13. saveStats
14. newMilestone 계산: [7, 30, 100] 중 currentStreak === m && previousStreak < m
15. return { stats, streakIncreased, newMilestone }
```

## UI 사양

### 통계 모달 레이아웃 (모바일 우선)

```
┌─────────────────────────────────────┐
│  ✕                       Statistics │
├─────────────────────────────────────┤
│   42      38     91%      12 🔥    │
│  Played   Won   Win Rate   Streak   │
├─────────────────────────────────────┤
│  Guess Distribution                 │
│  1 │█▌ 2                            │
│  2 │█████ 8                         │
│  3 │████████████ 15  ← 오늘 강조    │
│  4 │███████ 9                       │
│  5 │██▌ 3                           │
│  6 │█ 1                             │
│  X │██▌ 4                           │
├─────────────────────────────────────┤
│  Max Streak: 27                     │
├─────────────────────────────────────┤
│       Next Flaglette in             │
│        04:23:17                     │
│  [    📤 Share Result    ]          │
└─────────────────────────────────────┘
```

### 4개 핵심 숫자
- **Played**: totalPlayed
- **Won**: totalWon
- **Win Rate**: getWinRate() — 0회면 "—" 표시
- **Streak**: currentStreak + 이모지
  - 7+: 🔥
  - 30+: 🔥🔥
  - 100+: 🔥🔥🔥

숫자 카운트업 애니메이션 (0 → 실제값, 400ms ease-out).

### 시도 분포 그래프
- 가장 큰 값을 100%로 정규화
- 막대 색상: 일반 회색 (`#787c7e`), 오늘 결과는 강조색 (`#6aaa64` 또는 브랜드 컬러)
- 값 0인 행도 표시 (1px 회색 막대)
- 마지막 행은 `X` 라벨 (실패)

### 카운트다운
- 1초마다 갱신
- 0 도달 시 페이지 새로고침 또는 상태 초기화

### 모달 진입 시점
- 게임 완료 직후: **1200ms 딜레이** 후 자동 오픈
- 헤더 📊 아이콘: 즉시 오픈
- 이미 완료한 날 재방문: 자동 노출

### 빈 상태 (totalPlayed === 0)
- 0/0/0/0 노출 금지
- "Your stats will appear after your first Flaglette." 메시지 + 플레이 버튼

## 공유 텍스트 통합

### 포맷
```
🌍 Flaglette #87 — 3/6
🟩🟩🟩
🔥 Streak: 12

flaglette.com
```

### 스트릭 라인 규칙
- `currentStreak >= 2` → 라인 포함
- `currentStreak < 2` → 라인 생략

### 패배 시 포맷
```
🌍 Flaglette #87 — X/6
⬛⬛⬛⬛⬛⬛
🔥 Streak: 12

flaglette.com
```
플레이 스트릭이라 패배해도 스트릭 라인 노출.

## GA4 이벤트

```typescript
gtag('event', 'game_completed', {
  won: boolean,
  guesses: number,
  hints_used: number,
  current_streak: number,
});

gtag('event', 'streak_milestone', {
  streak_days: number,  // 7, 30, 100
});

gtag('event', 'stats_modal_opened', {
  trigger: 'auto' | 'manual',
  current_streak: number,
});

gtag('event', 'share_clicked', {
  result: 'win' | 'loss',
  guesses: number,
  current_streak: number,
});
```

## 개발 헬퍼 (개발 환경 전용)

```typescript
if (process.env.NODE_ENV === 'development') {
  (window as any).__flaglette = {
    stats: () => loadStats(),
    reset: () => resetStats(),
    setStreak: (n: number) => { /* ... */ },
    fakeYesterday: () => { /* lastPlayedDate를 어제로 */ },
  };
}
```

콘솔에서 `__flaglette.fakeYesterday()` 후 게임 완료 → 스트릭 +1 검증.

## 흔한 함정
1. `new Date()` 직접 비교 금지 — 반드시 `getLocalDateString()`으로 정규화
2. localStorage 쓰기는 게임 완료 시점 1회만
3. JSON.parse try/catch 필수
4. 시도 분포 인덱스 오프바이원 ("1회 만에" = 인덱스 0)
5. 모달 자동 오픈은 1200ms 딜레이
6. 카운트다운 0 도달 시 새로고침/리셋 처리