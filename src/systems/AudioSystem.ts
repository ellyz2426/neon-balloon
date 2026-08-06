/**
 * AudioSystem — Procedural sound effects and dynamic music
 */
import {
  createSystem,
} from '@iwsdk/core';
import { state } from '../game-state.js';

export class AudioSystem extends createSystem({}) {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicOscillators: OscillatorNode[] = [];
  private musicPlaying = false;
  private musicTimer = 0;
  private noteIndex = 0;

  // Music sequences (frequencies)
  private readonly menuNotes = [261, 329, 392, 523, 392, 329, 261, 196];
  private readonly gameNotes = [330, 392, 440, 523, 587, 523, 440, 392, 330, 262];
  private readonly bossNotes = [196, 233, 262, 196, 175, 196, 233, 262];

  init(): void {
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = state.musicVolume * 0.15;
      this.musicGain.connect(this.masterGain);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = state.sfxVolume;
      this.sfxGain.connect(this.masterGain);
    } catch {
      // Audio not available
    }
  }

  update(delta: number): void {
    if (!this.ctx || !this.musicGain || !this.sfxGain) return;

    this.musicGain.gain.value = state.musicVolume * 0.15;
    this.sfxGain.gain.value = state.sfxVolume;

    if (state.phase === 'playing' || state.phase === 'menu') {
      this.musicTimer -= delta;
      if (this.musicTimer <= 0) {
        this.playMusicNote();
        this.musicTimer = state.bossActive ? 0.18 : 0.3;
      }
    }
  }

  private playMusicNote(): void {
    if (!this.ctx || !this.musicGain) return;
    const notes = state.phase === 'menu' ? this.menuNotes :
                  state.bossActive ? this.bossNotes : this.gameNotes;
    const freq = notes[this.noteIndex % notes.length];
    this.noteIndex++;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = state.bossActive ? 'sawtooth' : 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  playFlap(): void {
    this.playSfx(280, 'sine', 0.08, 0.06);
    this.playSfx(420, 'sine', 0.05, 0.08);
  }

  playPop(): void {
    this.playNoise(0.12, 0.06);
    this.playSfx(800, 'square', 0.1, 0.05);
  }

  playEnemyDefeat(): void {
    this.playSfx(523, 'square', 0.12, 0.05);
    this.playSfx(659, 'square', 0.1, 0.08);
    this.playSfx(784, 'square', 0.08, 0.12);
  }

  playPowerUp(): void {
    this.playSfx(440, 'sine', 0.1, 0.05);
    this.playSfx(660, 'sine', 0.08, 0.1);
    this.playSfx(880, 'sine', 0.06, 0.15);
  }

  playLightning(): void {
    this.playNoise(0.3, 0.15);
    this.playSfx(100, 'sawtooth', 0.15, 0.1);
  }

  playFishCatch(): void {
    this.playSfx(600, 'sine', 0.1, 0.03);
    this.playSfx(900, 'sine', 0.08, 0.08);
  }

  playHurt(): void {
    this.playSfx(200, 'sawtooth', 0.15, 0.05);
    this.playSfx(150, 'sawtooth', 0.12, 0.1);
  }

  playDeath(): void {
    this.playSfx(400, 'sawtooth', 0.15, 0.0);
    this.playSfx(300, 'sawtooth', 0.12, 0.1);
    this.playSfx(200, 'sawtooth', 0.1, 0.2);
    this.playSfx(100, 'sawtooth', 0.08, 0.3);
  }

  playPhaseComplete(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.playSfx(f, 'sine', 0.1, i * 0.12));
  }

  playBossDefeat(): void {
    const notes = [262, 330, 392, 523, 659, 784, 1047];
    notes.forEach((f, i) => this.playSfx(f, 'triangle', 0.12, i * 0.08));
  }

  playMenuSelect(): void {
    this.playSfx(600, 'sine', 0.08, 0.0);
  }

  playWindGust(): void {
    this.playNoise(0.4, 0.08);
    this.playSfx(120, 'sine', 0.06, 0.1);
    this.playSfx(180, 'sine', 0.04, 0.2);
  }

  playIcicle(): void {
    this.playSfx(1200, 'sine', 0.06, 0.0);
    this.playSfx(900, 'sine', 0.05, 0.05);
    this.playNoise(0.1, 0.04);
  }

  playBossAttack(): void {
    this.playSfx(120, 'sawtooth', 0.15, 0.0);
    this.playSfx(80, 'sawtooth', 0.12, 0.08);
    this.playNoise(0.2, 0.1);
  }

  playShieldBreak(): void {
    this.playSfx(1000, 'square', 0.1, 0.0);
    this.playSfx(700, 'square', 0.08, 0.05);
    this.playSfx(400, 'square', 0.06, 0.1);
  }

  playSplash(): void {
    this.playNoise(0.15, 0.06);
    this.playSfx(300, 'sine', 0.06, 0.03);
    this.playSfx(200, 'sine', 0.04, 0.08);
  }

  private playSfx(freq: number, type: OscillatorType, vol: number, delay: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = this.ctx.currentTime + delay;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private playNoise(duration: number, vol: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * vol;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    source.connect(gain);
    gain.connect(this.sfxGain);
    source.start();
  }
}
