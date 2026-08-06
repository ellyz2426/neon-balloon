/**
 * Shared game state — pure data, no system imports.
 * Systems read/write this; UI system renders it.
 */

export type GameMode = 'arcade' | 'balloon-trip' | 'survival';
export type GamePhase = 'menu' | 'playing' | 'phase-complete' | 'game-over' | 'paused' | 'settings' | 'stats' | 'tutorial';
export type EnemyType = 'basic' | 'chaser' | 'dodger' | 'boss' | 'bomber' | 'magnet';
export type PowerUpType = 'shield' | 'speed' | 'extra-balloon' | 'lightning-immunity' | 'magnet' | 'freeze';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type ColorTheme = 'neon-cyan' | 'neon-pink' | 'neon-green' | 'neon-gold';
export type FormationType = 'v-shape' | 'line' | 'circle' | 'none';

export interface WhirlpoolData {
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  strength: number;
  timer: number;
  active: boolean;
  mesh: import('@iwsdk/core').Object3D | null;
}

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
  speed: number; // horizontal speed (0 = static)
  originX: number;
  range: number; // how far it moves from origin
  crumble: boolean; // whether this platform crumbles when stood on
  crumbleTimer: number; // time remaining before crumble (starts at 2.0s)
  crumbleState: 'solid' | 'shaking' | 'crumbled'; // current visual state
  respawnTimer: number; // time until platform respawns after crumble
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

export interface IcicleData {
  id: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  active: boolean;
  mesh: import('@iwsdk/core').Object3D | null;
}

export interface WindZoneData {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  forceX: number;
  forceY: number;
  timer: number;
  active: boolean;
  mesh: import('@iwsdk/core').Object3D | null;
}

export interface BonusItemData {
  id: number;
  type: 'coin' | 'gem' | 'star';
  x: number;
  y: number;
  z: number;
  vy: number;
  points: number;
  collected: boolean;
  mesh: import('@iwsdk/core').Object3D | null;
}

export interface ScoreDropData {
  id: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  points: number;
  collected: boolean;
  timer: number;
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
  arcadeHighScore: number;
  survivalHighScore: number;
  tripHighScore: number;
  totalEnemiesDefeated: number;
  totalBalloonsPopped: number;
  totalFishCaught: number;
  totalPhasesCleared: number;
  bestCombo: number;
  totalPlayTime: number;
  bossesDefeated: number;
  powerUpsCollected: number;
  longestSurvival: number;
  bestTripDistance: number;
}

const DEFAULT_STATS: CareerStats = {
  totalGames: 0,
  totalScore: 0,
  highScore: 0,
  arcadeHighScore: 0,
  survivalHighScore: 0,
  tripHighScore: 0,
  totalEnemiesDefeated: 0,
  totalBalloonsPopped: 0,
  totalFishCaught: 0,
  totalPhasesCleared: 0,
  bestCombo: 0,
  totalPlayTime: 0,
  bossesDefeated: 0,
  powerUpsCollected: 0,
  longestSurvival: 0,
  bestTripDistance: 0,
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

function loadSettings(): { musicVolume: number; sfxVolume: number; difficulty: Difficulty; colorTheme: ColorTheme } {
  try {
    const raw = localStorage.getItem('neon-balloon-settings');
    if (raw) {
      const s = JSON.parse(raw);
      return {
        musicVolume: s.musicVolume ?? 0.5,
        sfxVolume: s.sfxVolume ?? 0.7,
        difficulty: s.difficulty ?? 'normal',
        colorTheme: s.colorTheme ?? 'neon-cyan',
      };
    }
  } catch { /* ignore */ }
  return { musicVolume: 0.5, sfxVolume: 0.7, difficulty: 'normal', colorTheme: 'neon-cyan' };
}

function saveSettings(musicVolume: number, sfxVolume: number, difficulty: Difficulty, colorTheme: ColorTheme): void {
  try {
    localStorage.setItem('neon-balloon-settings', JSON.stringify({
      musicVolume, sfxVolume, difficulty, colorTheme,
    }));
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
  icicles: IcicleData[] = [];
  windZones: WindZoneData[] = [];
  bonusItems: BonusItemData[] = [];

  // Score drops from defeated enemies
  scoreDrops: ScoreDropData[] = [];

  // Whirlpool hazards
  whirlpools: WhirlpoolData[] = [];

  // Player dash
  dashCooldown = 0;
  dashTimer = 0;
  dashDirX = 0;
  dashDirY = 0;

  // Combo flash
  comboFlashTimer = 0;

  // Freeze state
  freezeTimer = 0;

  // Bonus phase state
  bonusPhaseActive = false;
  bonusItemsCollected = 0;
  bonusItemsTotal = 0;

  // Counters for unique IDs
  nextId = 1;

  // Session stats
  sessionEnemiesDefeated = 0;
  sessionBalloonsPopped = 0;
  sessionFishCaught = 0;
  sessionPowerUps = 0;
  sessionBossesDefeated = 0;

  // Settings
  musicVolume: number;
  sfxVolume: number;
  neonIntensity = 1;
  colorTheme: ColorTheme;

  constructor() {
    const saved = loadSettings();
    this.musicVolume = saved.musicVolume;
    this.sfxVolume = saved.sfxVolume;
    this.difficulty = saved.difficulty;
    this.colorTheme = saved.colorTheme;
  }

  // Boss health tracking
  bossMaxHP = 0;
  bossCurrentHP = 0;

  // Career stats
  career: CareerStats = loadStats();

  // Flags
  bossActive = false;
  phaseTransitionTimer = 0;
  shakeTimer = 0;
  shakeIntensity = 0;
  slowMoTimer = 0;
  slowMoFactor = 1;

  // Boss attack state
  bossAttackTimer = 0;
  bossAttackCooldown = 0;

  // Phase timer
  phaseTimeLimit = 0;
  phaseTimer = 0;

  // Trail tracking
  trailTimer = 0;

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
    this.icicles = [];
    this.windZones = [];
    this.bonusItems = [];
    this.bonusPhaseActive = false;
    this.bonusItemsCollected = 0;
    this.bonusItemsTotal = 0;
    this.scoreDrops = [];
    this.whirlpools = [];
    this.freezeTimer = 0;
    this.dashCooldown = 0;
    this.dashTimer = 0;
    this.dashDirX = 0;
    this.dashDirY = 0;
    this.comboFlashTimer = 0;
    this.phaseTransitionTimer = 0;
    this.shakeTimer = 0;
    this.slowMoTimer = 0;
    this.slowMoFactor = 1;
    this.bossAttackTimer = 0;
    this.bossAttackCooldown = 0;
    this.phaseTimeLimit = 0;
    this.phaseTimer = 0;
    this.trailTimer = 0;
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
    this.comboFlashTimer = 0.5;
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
    // Per-mode high scores
    if (this.mode === 'arcade' && this.score > this.career.arcadeHighScore) {
      this.career.arcadeHighScore = this.score;
    }
    if (this.mode === 'survival' && this.score > this.career.survivalHighScore) {
      this.career.survivalHighScore = this.score;
    }
    if (this.mode === 'balloon-trip' && this.score > this.career.tripHighScore) {
      this.career.tripHighScore = this.score;
    }
    // Longest survival time
    if (this.mode === 'survival' && this.gameTime > this.career.longestSurvival) {
      this.career.longestSurvival = this.gameTime;
    }
    // Best trip distance
    if (this.mode === 'balloon-trip' && this.tripDistance > this.career.bestTripDistance) {
      this.career.bestTripDistance = this.tripDistance;
    }
    this.career.totalEnemiesDefeated += this.sessionEnemiesDefeated;
    this.career.totalBalloonsPopped += this.sessionBalloonsPopped;
    this.career.totalFishCaught += this.sessionFishCaught;
    this.career.totalPhasesCleared += this.currentPhase - 1;
    if (this.bestCombo > this.career.bestCombo) this.career.bestCombo = this.bestCombo;
    this.career.totalPlayTime += this.gameTime;
    this.career.bossesDefeated += this.sessionBossesDefeated;
    this.career.powerUpsCollected += this.sessionPowerUps;
    saveStats(this.career);
    saveSettings(this.musicVolume, this.sfxVolume, this.difficulty, this.colorTheme);
  }

  getDifficultyMultiplier(): number {
    switch (this.difficulty) {
      case 'easy': return 0.7;
      case 'hard': return 1.4;
      default: return 1;
    }
  }

  getThemeColors(): { primary: number; secondary: number; accent: number } {
    switch (this.colorTheme) {
      case 'neon-pink':
        return { primary: 0xff00ff, secondary: 0xff88aa, accent: 0xff44aa };
      case 'neon-green':
        return { primary: 0x00ff88, secondary: 0x88ff44, accent: 0x44ff88 };
      case 'neon-gold':
        return { primary: 0xffaa00, secondary: 0xffcc44, accent: 0xffdd66 };
      default: // neon-cyan
        return { primary: 0x00ffff, secondary: 0x00e5ff, accent: 0x44ccff };
    }
  }

  getEnemyCountForPhase(): number {
    const base = Math.min(2 + Math.floor(this.currentPhase * 0.8), 8);
    return Math.ceil(base * this.getDifficultyMultiplier());
  }

  isBossPhase(): boolean {
    return this.currentPhase % 5 === 0 && !this.isBonusPhase();
  }

  isBonusPhase(): boolean {
    return this.currentPhase % 10 === 0;
  }
}

export const state = new GameState();
