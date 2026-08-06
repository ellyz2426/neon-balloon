/**
 * UISystem — Panel management, HUD updates, menu interactions
 */
import { createSystem, UIKitMLAsset } from '@iwsdk/core';
import { state } from '../game-state.js';
import { GameSystem } from './GameSystem.js';
import { AudioSystem } from './AudioSystem.js';

export class UISystem extends createSystem({}) {
  private menuPanel: UIKitMLAsset | null = null;
  private hudPanel: UIKitMLAsset | null = null;
  private pausePanel: UIKitMLAsset | null = null;
  private resultsPanel: UIKitMLAsset | null = null;
  private settingsPanel: UIKitMLAsset | null = null;
  private statsPanel: UIKitMLAsset | null = null;

  private wired = false;
  private lastPhase = '';
  private updateTimer = 0;

  init(): void {
    this.menuPanel = this.world.getSceneObject<UIKitMLAsset>('menu-panel') ?? null;
    this.hudPanel = this.world.getSceneObject<UIKitMLAsset>('hud-panel') ?? null;
    this.pausePanel = this.world.getSceneObject<UIKitMLAsset>('pause-panel') ?? null;
    this.resultsPanel = this.world.getSceneObject<UIKitMLAsset>('results-panel') ?? null;
    this.settingsPanel = this.world.getSceneObject<UIKitMLAsset>('settings-panel') ?? null;
    this.statsPanel = this.world.getSceneObject<UIKitMLAsset>('stats-panel') ?? null;

    // Wire up after a short delay to ensure panels are loaded
    setTimeout(() => this.wireButtons(), 500);

    // Keyboard pause
    window.addEventListener('keydown', (e) => {
      if ((e.code === 'Escape' || e.code === 'KeyP') && state.phase === 'playing') {
        state.phase = 'paused';
      } else if ((e.code === 'Escape' || e.code === 'KeyP') && state.phase === 'paused') {
        state.phase = 'playing';
      }
    });
  }

  private wireButtons(): void {
    if (this.wired) return;
    this.wired = true;

    const audio = this.world.getSystem(AudioSystem);
    const game = this.world.getSystem(GameSystem);

    // Menu buttons
    if (this.menuPanel) {
      this.menuPanel.getElementById('btn-arcade')?.addEventListener('click', () => {
        audio?.playMenuSelect();
        game?.startGame('arcade');
      });
      this.menuPanel.getElementById('btn-trip')?.addEventListener('click', () => {
        audio?.playMenuSelect();
        game?.startGame('balloon-trip');
      });
      this.menuPanel.getElementById('btn-survival')?.addEventListener('click', () => {
        audio?.playMenuSelect();
        game?.startGame('survival');
      });
      this.menuPanel.getElementById('btn-settings')?.addEventListener('click', () => {
        audio?.playMenuSelect();
        state.phase = 'settings';
      });
      this.menuPanel.getElementById('btn-stats')?.addEventListener('click', () => {
        audio?.playMenuSelect();
        state.phase = 'stats';
      });
    }

    // Pause buttons
    if (this.pausePanel) {
      this.pausePanel.getElementById('btn-resume')?.addEventListener('click', () => {
        audio?.playMenuSelect();
        state.phase = 'playing';
      });
      this.pausePanel.getElementById('btn-quit')?.addEventListener('click', () => {
        audio?.playMenuSelect();
        state.saveCareer();
        game?.returnToMenu();
      });
    }

    // Results buttons
    if (this.resultsPanel) {
      this.resultsPanel.getElementById('btn-continue')?.addEventListener('click', () => {
        audio?.playMenuSelect();
        if (state.phase === 'game-over') {
          game?.startGame(state.mode);
        } else {
          // Phase complete — continue handled by GameSystem timer
        }
      });
      this.resultsPanel.getElementById('btn-menu')?.addEventListener('click', () => {
        audio?.playMenuSelect();
        state.saveCareer();
        game?.returnToMenu();
      });
    }

    // Settings buttons
    if (this.settingsPanel) {
      this.settingsPanel.getElementById('btn-diff-down')?.addEventListener('click', () => {
        audio?.playMenuSelect();
        if (state.difficulty === 'hard') state.difficulty = 'normal';
        else if (state.difficulty === 'normal') state.difficulty = 'easy';
      });
      this.settingsPanel.getElementById('btn-diff-up')?.addEventListener('click', () => {
        audio?.playMenuSelect();
        if (state.difficulty === 'easy') state.difficulty = 'normal';
        else if (state.difficulty === 'normal') state.difficulty = 'hard';
      });
      this.settingsPanel.getElementById('btn-music-down')?.addEventListener('click', () => {
        state.musicVolume = Math.max(0, state.musicVolume - 0.1);
      });
      this.settingsPanel.getElementById('btn-music-up')?.addEventListener('click', () => {
        state.musicVolume = Math.min(1, state.musicVolume + 0.1);
      });
      this.settingsPanel.getElementById('btn-sfx-down')?.addEventListener('click', () => {
        state.sfxVolume = Math.max(0, state.sfxVolume - 0.1);
      });
      this.settingsPanel.getElementById('btn-sfx-up')?.addEventListener('click', () => {
        state.sfxVolume = Math.min(1, state.sfxVolume + 0.1);
      });
      this.settingsPanel.getElementById('btn-settings-back')?.addEventListener('click', () => {
        audio?.playMenuSelect();
        state.phase = 'menu';
      });
    }

    // Stats buttons
    if (this.statsPanel) {
      this.statsPanel.getElementById('btn-stats-back')?.addEventListener('click', () => {
        audio?.playMenuSelect();
        state.phase = 'menu';
      });
    }
  }

  update(delta: number): void {
    // Try wiring again if not done
    if (!this.wired) {
      this.wireButtons();
    }

    // Show/hide panels based on phase
    if (state.phase !== this.lastPhase) {
      this.lastPhase = state.phase;
      this.showPanel(state.phase);
    }

    // Update HUD at 10 Hz
    this.updateTimer -= delta;
    if (this.updateTimer <= 0 && state.phase === 'playing') {
      this.updateTimer = 0.1;
      this.updateHUD();
    }

    // Update results
    if (state.phase === 'game-over' || state.phase === 'phase-complete') {
      this.updateResults();
    }

    // Update settings display
    if (state.phase === 'settings') {
      this.updateSettings();
    }

    // Update stats display
    if (state.phase === 'stats') {
      this.updateStats();
    }
  }

  private showPanel(phase: string): void {
    const show = (p: UIKitMLAsset | null, v: boolean) => {
      if (p) p.visible = v;
    };

    show(this.menuPanel, phase === 'menu');
    show(this.hudPanel, phase === 'playing' || phase === 'phase-complete');
    show(this.pausePanel, phase === 'paused');
    show(this.resultsPanel, phase === 'game-over' || phase === 'phase-complete');
    show(this.settingsPanel, phase === 'settings');
    show(this.statsPanel, phase === 'stats');
  }

  private updateHUD(): void {
    if (!this.hudPanel) return;

    this.hudPanel.getElementById('score')?.setProperties({ text: `${state.score}` });
    this.hudPanel.getElementById('phase')?.setProperties({ text: `Phase ${state.currentPhase}` });
    this.hudPanel.getElementById('lives')?.setProperties({ text: `${'♥'.repeat(state.lives)}` });
    this.hudPanel.getElementById('balloons')?.setProperties({
      text: `${'●'.repeat(state.playerBalloons)}`,
    });

    // Combo display
    if (state.combo > 1) {
      this.hudPanel.getElementById('combo')?.setProperties({
        text: `x${state.combo} COMBO`,
      });
    } else {
      this.hudPanel.getElementById('combo')?.setProperties({ text: '' });
    }

    // Active power-ups
    const puText = state.activePowerUps.map(p => {
      const icons: Record<string, string> = {
        'shield': 'SHIELD', 'speed': 'SPEED', 'lightning-immunity': 'IMMUNE',
        'magnet': 'MAGNET', 'extra-balloon': 'EXTRA',
      };
      return `${icons[p.type] || p.type} ${Math.ceil(p.remaining)}s`;
    }).join(' | ');
    this.hudPanel.getElementById('powerup')?.setProperties({ text: puText || '' });

    // Enemies remaining
    const alive = state.enemies.filter(e => e.alive).length;
    const total = state.mode === 'survival' ? `W${state.currentPhase}` : `${state.phaseEnemiesTotal}`;
    this.hudPanel.getElementById('enemies')?.setProperties({
      text: `${alive} / ${total}`,
    });
  }

  private updateResults(): void {
    if (!this.resultsPanel) return;

    const mins = Math.floor(state.gameTime / 60);
    const secs = Math.floor(state.gameTime % 60);

    if (state.phase === 'game-over') {
      this.resultsPanel.getElementById('result-title')?.setProperties({ text: 'GAME OVER' });
      this.resultsPanel.getElementById('result-subtitle')?.setProperties({ text: `Reached Phase ${state.currentPhase}` });
      this.resultsPanel.getElementById('result-score')?.setProperties({ text: `${state.score}` });
      this.resultsPanel.getElementById('result-enemies')?.setProperties({ text: `${state.sessionEnemiesDefeated}` });
      this.resultsPanel.getElementById('result-balloons')?.setProperties({ text: `${state.sessionBalloonsPopped}` });
      this.resultsPanel.getElementById('result-combo')?.setProperties({ text: `${state.bestCombo}` });
      this.resultsPanel.getElementById('result-fish')?.setProperties({ text: `${state.sessionFishCaught}` });
      this.resultsPanel.getElementById('result-time')?.setProperties({ text: `${mins}:${secs.toString().padStart(2, '0')}` });
      this.resultsPanel.getElementById('btn-continue-text')?.setProperties({ text: 'RETRY' });
    } else if (state.phase === 'phase-complete') {
      this.resultsPanel.getElementById('result-title')?.setProperties({ text: 'PHASE CLEAR!' });
      this.resultsPanel.getElementById('result-subtitle')?.setProperties({ text: `Phase ${state.currentPhase} Complete` });
      this.resultsPanel.getElementById('result-score')?.setProperties({ text: `${state.score} (+${state.phaseScore})` });
      this.resultsPanel.getElementById('result-enemies')?.setProperties({ text: `${state.phaseEnemiesDefeated}` });
      this.resultsPanel.getElementById('result-balloons')?.setProperties({ text: `${state.sessionBalloonsPopped}` });
      this.resultsPanel.getElementById('result-combo')?.setProperties({ text: `${state.bestCombo}` });
      this.resultsPanel.getElementById('result-fish')?.setProperties({ text: `${state.sessionFishCaught}` });
      this.resultsPanel.getElementById('result-time')?.setProperties({ text: `${mins}:${secs.toString().padStart(2, '0')}` });
      this.resultsPanel.getElementById('btn-continue-text')?.setProperties({ text: 'NEXT PHASE' });
    }
  }

  private updateSettings(): void {
    if (!this.settingsPanel) return;

    this.settingsPanel.getElementById('difficulty-val')?.setProperties({
      text: state.difficulty.toUpperCase(),
    });
    this.settingsPanel.getElementById('music-val')?.setProperties({
      text: `${Math.round(state.musicVolume * 100)}%`,
    });
    this.settingsPanel.getElementById('sfx-val')?.setProperties({
      text: `${Math.round(state.sfxVolume * 100)}%`,
    });
  }

  private updateStats(): void {
    if (!this.statsPanel) return;
    const c = state.career;

    this.statsPanel.getElementById('stat-games')?.setProperties({ text: `${c.totalGames}` });
    this.statsPanel.getElementById('stat-highscore')?.setProperties({ text: `${c.highScore}` });
    this.statsPanel.getElementById('stat-totalscore')?.setProperties({ text: `${c.totalScore}` });
    this.statsPanel.getElementById('stat-enemies')?.setProperties({ text: `${c.totalEnemiesDefeated}` });
    this.statsPanel.getElementById('stat-balloons')?.setProperties({ text: `${c.totalBalloonsPopped}` });
    this.statsPanel.getElementById('stat-fish')?.setProperties({ text: `${c.totalFishCaught}` });
    this.statsPanel.getElementById('stat-phases')?.setProperties({ text: `${c.totalPhasesCleared}` });
    this.statsPanel.getElementById('stat-bestcombo')?.setProperties({ text: `${c.bestCombo}` });
    this.statsPanel.getElementById('stat-bosses')?.setProperties({ text: `${c.bossesDefeated}` });
    this.statsPanel.getElementById('stat-powerups')?.setProperties({ text: `${c.powerUpsCollected}` });

    const hrs = Math.floor(c.totalPlayTime / 3600);
    const mins = Math.floor((c.totalPlayTime % 3600) / 60);
    this.statsPanel.getElementById('stat-playtime')?.setProperties({ text: `${hrs}h ${mins}m` });
  }
}
