/**
 * Shared game state — pure data, no system imports.
 * Systems read/write this; UI system renders it.
 */

export type GameMode = 'arcade' | 'balloon-trip' | 'survival';
export type GamePhase = 'menu' | 'playing' | 'phase-complete' | 'game-over' | 'paused' | 'settings' | 'stats';
export type EnemyType = 'basic' | 'chaser' | 'dodger' | 'boss';
export type PowerUpType = 'shield' | 'speed' | 'extra-balloon' | 'lightning-immunity' | 'magnet';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface EnemyData {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  balloons: number;
  maxBalloons: number;
  alive: boolean;
  grounded: boolean;
  groundTimer: number;
  flapCooldown: number;
  aiTimer: number;
  mesh: import('@iwsdk/core').Object3D | null;
  balloonMeshes: import('@iwsdk/core').Object3D[];
}

export interface PowerUpData {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
  z: number;
  timer: number;
  mesh: import('@iwsdk/core').Object3D | null;
  collected: boolean;
}

export interface PlatformData {
  id: number;
  x: number;
  y: number;
  z: number;
  width: number;
  mesh: import('@iwsdk/core').Object3D | null;
}

export interface FishData {
  id: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  active: boolean;
  timer: number;
  mesh: import('@iwsdk/core').Object3D | null;
}

export interface LightningData {
  id: number;
  x: number;
  y: number;
  z: number;
  timer: number;
  active: boolean;
  warningTimer: number;
  mesh: import('@iwsdk/core').Object3D | null;
}

export interface ActivePowerUp {
  type: PowerUpType;
  remaining: number;
}

export interface CareerStats {
  totalGames: number;
  totalScore: number;
  highScore: number;
  totalEnemiesDefeated: number;
  totalBalloonsPopped: number;
  totalFishCaught: number;
  totalPhasesCleared: number;
  bestCombo: number;
  totalPlayTime: number;
  bossesDefeated: number;
  powerUpsCollected: number;
}

const DEFAULT_STATS: CareerStats = {
  totalGames: 0,
  totalScore: 0,
  highScore: 0,
  totalEnemiesDefeated: 0,
  totalBalloonsPopped: 0,
  totalFishCaught: 0,
  totalPhasesCleared: 0,
  bestCombo: 0,
  totalPlayTime: 0,
  bossesDefeated: 0,
  powerUpsCollected: 0,
};

function loadStats(): CareerStats {
  try {
    const raw = localStorage.getItem('neon-balloon-stats');
    if (raw) return { ...DEFAULT_STATS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_STATS };
}

function saveStats(s: CareerStats): void {
  try {
    localStorage.setItem('neon-balloon-stats', JSON.stringify(s));
  } catch { /* ignore */ }
}

// Arena bounds
export const ARENA = {
  WIDTH: 24,
  HEIGHT: 18,
  DEPTH: 8,
  WATER_Y: -1,
  MIN_X: -12,
  MAX_X: 12,
  MIN_Y: -1,
  MAX_Y: 17,
  PLAYER_START_Y: 5,
};

class GameState {
  // Core state
  phase: GamePhase = 'menu';
  mode: GameMode = 'arcade';
  difficulty: Difficulty = 'normal';

  // Player
  playerX = 0;
  playerY = ARENA.PLAYER_START_Y;
  playerZ = 0;
  playerVX = 0;
  playerVY = 0;
  playerBalloons = 2;
  playerMaxBalloons = 2;
  playerAlive = true;
  playerInvincible = 0;
  playerFacing = 1; // 1 = right, -1 = left

  // Score / progression
  score = 0;
  combo = 0;
  comboTimer = 0;
  bestCombo = 0;
  lives = 3;
  currentPhase = 1;
  phaseEnemiesTotal = 0;
  phaseEnemiesDefeated = 0;
  phaseScore = 0;
  gameTime = 0;

  // Balloon Trip mode
  tripDistance = 0;
  tripSpeed = 3;

  // Entities
  enemies: EnemyData[] = [];
  powerUps: PowerUpData[] = [];
  platforms: PlatformData[] = [];
  fish: FishData[] = [];
  lightning: LightningData[] = [];
  activePowerUps: ActivePowerUp[] = [];

  // Counters for unique IDs
  nextId = 1;

  // Session stats
  sessionEnemiesDefeated = 0;
  sessionBalloonsPopped = 0;
  sessionFishCaught = 0;
  sessionPowerUps = 0;
  sessionBossesDefeated = 0;

  // Settings
  musicVolume = 0.5;
  sfxVolume = 0.7;
  neonIntensity = 1;

  // Career stats
  career: CareerStats = loadStats();

  // Flags
  bossActive = false;
  phaseTransitionTimer = 0;
  shakeTimer = 0;
  shakeIntensity = 0;
  slowMoTimer = 0;
  slowMoFactor = 1;

  getId(): number {
    return this.nextId++;
  }

  resetForGame(): void {
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;
    this.lives = 3;
    this.currentPhase = 1;
    this.phaseScore = 0;
    this.gameTime = 0;
    this.tripDistance = 0;
    this.tripSpeed = 3;
    this.playerBalloons = 2;
    this.playerMaxBalloons = 2;
    this.playerAlive = true;
    this.playerInvincible = 0;
    this.playerVX = 0;
    this.playerVY = 0;
    this.playerX = 0;
    this.playerY = ARENA.PLAYER_START_Y;
    this.playerZ = 0;
    this.bossActive = false;
    this.sessionEnemiesDefeated = 0;
    this.sessionBalloonsPopped = 0;
    this.sessionFishCaught = 0;
    this.sessionPowerUps = 0;
    this.sessionBossesDefeated = 0;
    this.enemies = [];
    this.powerUps = [];
    this.fish = [];
    this.lightning = [];
    this.activePowerUps = [];
    this.phaseTransitionTimer = 0;
    this.shakeTimer = 0;
    this.slowMoTimer = 0;
    this.slowMoFactor = 1;
  }

  resetPlayerForPhase(): void {
    this.playerBalloons = this.playerMaxBalloons;
    this.playerAlive = true;
    this.playerInvincible = 2;
    this.playerVX = 0;
    this.playerVY = 0;
    this.playerX = 0;
    this.playerY = ARENA.PLAYER_START_Y;
    this.phaseScore = 0;
    this.phaseEnemiesDefeated = 0;
  }

  addCombo(): void {
    this.combo++;
    this.comboTimer = 3;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
  }

  addScore(points: number): void {
    const multiplier = 1 + Math.floor(this.combo / 3) * 0.5;
    const total = Math.floor(points * multiplier);
    this.score += total;
    this.phaseScore += total;
  }

  saveCareer(): void {
    this.career.totalGames++;
    this.career.totalScore += this.score;
    if (this.score > this.career.highScore) this.career.highScore = this.score;
    this.career.totalEnemiesDefeated += this.sessionEnemiesDefeated;
    this.career.totalBalloonsPopped += this.sessionBalloonsPopped;
    this.career.totalFishCaught += this.sessionFishCaught;
    this.career.totalPhasesCleared += this.currentPhase - 1;
    if (this.bestCombo > this.career.bestCombo) this.career.bestCombo = this.bestCombo;
    this.career.totalPlayTime += this.gameTime;
    this.career.bossesDefeated += this.sessionBossesDefeated;
    this.career.powerUpsCollected += this.sessionPowerUps;
    saveStats(this.career);
  }

  getDifficultyMultiplier(): number {
    switch (this.difficulty) {
      case 'easy': return 0.7;
      case 'hard': return 1.4;
      default: return 1;
    }
  }

  getEnemyCountForPhase(): number {
    const base = Math.min(2 + Math.floor(this.currentPhase * 0.8), 8);
    return Math.ceil(base * this.getDifficultyMultiplier());
  }

  isBossPhase(): boolean {
    return this.currentPhase % 5 === 0;
  }
}

export const state = new GameState();
