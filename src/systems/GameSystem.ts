/**
 * GameSystem — Core game loop: player physics, enemy AI, collisions,
 * spawning, arena visuals, particles, and all mesh management.
 */
import {
  createSystem,
  Vector3,
  Color,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  BoxGeometry,
  CylinderGeometry,
  Group,
  Object3D,
  PlaneGeometry,
  PointLight,
  AmbientLight,
  FogExp2,
  MathUtils,
  BufferGeometry,
  Float32BufferAttribute,
  PointsMaterial,
  Points,
  RingGeometry,
  TorusGeometry,
  ConeGeometry,
  DoubleSide,
  AdditiveBlending,
} from '@iwsdk/core';
import {
  state, ARENA,
  type EnemyData, type PowerUpData, type PlatformData,
  type FishData, type LightningData, type PowerUpType,
  type IcicleData, type WindZoneData, type BonusItemData,
  type ScoreDropData, type WhirlpoolData, type FormationType,
} from '../game-state.js';
import { AudioSystem } from './AudioSystem.js';

// Reusable geometry
const sphereGeo = new SphereGeometry(0.5, 12, 8);
const boxGeo = new BoxGeometry(1, 1, 1);
const cylGeo = new CylinderGeometry(0.5, 0.5, 1, 8);
const coneGeo = new ConeGeometry(0.3, 0.6, 6);
const ringGeo = new RingGeometry(0.3, 0.5, 16);
const platformGeo = new BoxGeometry(1, 0.3, 2);
const planeGeo = new PlaneGeometry(1, 1);

// Colors
const NEON_CYAN = new Color(0x00ffff);
const NEON_PINK = new Color(0xff00ff);
const NEON_GREEN = new Color(0x00ff88);
const NEON_YELLOW = new Color(0xffff00);
const NEON_ORANGE = new Color(0xff8800);
const NEON_RED = new Color(0xff3333);
const NEON_BLUE = new Color(0x4488ff);
const NEON_WHITE = new Color(0xffffff);
const WATER_COLOR = new Color(0x003366);

// Balloon colors for enemies
const BALLOON_COLORS = [0xff4444, 0x44ff44, 0x4488ff, 0xff88ff, 0xffaa44];

interface Particle {
  mesh: Mesh;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
}

interface CloudData {
  mesh: Mesh;
  x: number; y: number; z: number;
  speed: number;
  scale: number;
}

interface TrailNode {
  mesh: Mesh;
  life: number;
}

export class GameSystem extends createSystem({}) {
  private arena: Group | null = null;
  private playerGroup: Group | null = null;
  private playerBody: Mesh | null = null;
  private playerBalloonL: Mesh | null = null;
  private playerBalloonR: Mesh | null = null;
  private playerBalloonStrL: Mesh | null = null;
  private playerBalloonStrR: Mesh | null = null;
  private waterPlane: Mesh | null = null;
  private starsGroup: Group | null = null;

  private particles: Particle[] = [];
  private particlePool: Mesh[] = [];

  // Clouds
  private clouds: CloudData[] = [];

  // Neon trail
  private trailNodes: TrailNode[] = [];

  // Shield visual
  private shieldBubble: Mesh | null = null;

  // Icicle + wind zone spawn timers
  private icicleSpawnTimer = 0;
  private windZoneSpawnTimer = 0;

  // Boss special attack timer
  private bossSpecialTimer = 0;

  // Balloon Trip scrolling
  private tripObstacles: { mesh: Object3D; x: number; gapY: number; gapH: number; scored: boolean }[] = [];
  private tripSpawnX = 0;

  // Environment decorations
  private envDecorations: Object3D[] = [];
  private decorationsBuilt = false;

  // Parallax nebulae layers
  private nebulae: { mesh: Mesh; depth: number; baseX: number; baseY: number }[] = [];
  
  // Screen flash effect
  private screenFlashMesh: Mesh | null = null;
  private screenFlashTimer = 0;

  // Input state
  private keysDown = new Set<string>();
  private flapPressed = false;
  private flapCooldown = 0;

  // Camera
  private cameraTarget = new Vector3(0, 8, 0);

  // Phase spawn tracking
  private spawnTimer = 0;
  private enemySpawnQueue = 0;
  private fishSpawnTimer = 0;
  private lightningSpawnTimer = 0;

  // Bonus stage
  private bonusSpawnTimer = 0;
  private bonusSpawnCount = 0;
  private powerUpSpawnTimer = 0;

  // Audio reference
  private audio: AudioSystem | null = null;

  // Score drops
  private scoreDrops: ScoreDropData[] = [];

  // Whirlpool tracking
  private whirlpoolSpawnTimer = 0;

  // Formation spawning
  private nextFormation: FormationType = 'none';

  // Combo flash mesh
  private comboFlashMesh: Mesh | null = null;

  // Coin magnet pull range visual
  private magnetRangeMesh: Mesh | null = null;

  // Phase announcement
  private phaseAnnounceTimer = 0;
  private phaseAnnounceText = '';

  // Platform generation tracking
  private platformsGenerated = false;

  init(): void {
    this.audio = this.world.getSystem(AudioSystem) ?? null;
    this.buildArena();
    this.buildPlayer();
    this.buildClouds();
    this.buildShieldBubble();
    this.buildEnvironment();
    this.buildComboFlash();
    this.buildNebulae();
    this.buildScreenFlash();
    this.setupInput();
  }

  private buildArena(): void {
    const scene = this.world.scene;

    // Ambient light
    const ambient = new AmbientLight(0x112244, 0.6);
    scene.add(ambient);

    // Point lights
    const light1 = new PointLight(0x00ffff, 2, 50);
    light1.position.set(-8, 14, 0);
    scene.add(light1);
    const light2 = new PointLight(0xff00ff, 1.5, 50);
    light2.position.set(8, 14, 0);
    scene.add(light2);
    const light3 = new PointLight(0x4488ff, 1, 40);
    light3.position.set(0, 3, -3);
    scene.add(light3);

    // Fog
    scene.fog = new FogExp2(0x000822, 0.015);
    scene.background = new Color(0x000411);

    this.arena = new Group();
    scene.add(this.arena);

    // Water surface (high-segment plane for vertex ripple animation)
    const waterMat = new MeshStandardMaterial({
      color: WATER_COLOR, emissive: new Color(0x001133),
      emissiveIntensity: 0.5, transparent: true, opacity: 0.8,
      metalness: 0.8, roughness: 0.2,
    });
    this.waterPlane = new Mesh(new PlaneGeometry(ARENA.WIDTH + 4, ARENA.DEPTH + 2, 32, 8), waterMat);
    this.waterPlane.rotation.x = -Math.PI / 2;
    this.waterPlane.position.set(0, ARENA.WATER_Y, 0);
    this.arena.add(this.waterPlane);

    // Side walls (neon borders)
    const wallMat = new MeshStandardMaterial({
      color: 0x000000, emissive: NEON_CYAN, emissiveIntensity: 0.3,
      transparent: true, opacity: 0.15,
    });
    const wallGeo = new PlaneGeometry(0.1, ARENA.HEIGHT);
    const leftWall = new Mesh(wallGeo, wallMat);
    leftWall.position.set(ARENA.MIN_X, ARENA.HEIGHT / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    this.arena.add(leftWall);
    const rightWall = new Mesh(wallGeo, wallMat.clone());
    (rightWall.material as MeshStandardMaterial).emissive = NEON_PINK;
    rightWall.position.set(ARENA.MAX_X, ARENA.HEIGHT / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    this.arena.add(rightWall);

    // Ceiling line
    const ceilMat = new MeshStandardMaterial({
      color: 0x000000, emissive: NEON_YELLOW, emissiveIntensity: 0.4,
      transparent: true, opacity: 0.3,
    });
    const ceilLine = new Mesh(new BoxGeometry(ARENA.WIDTH + 4, 0.05, ARENA.DEPTH + 2), ceilMat);
    ceilLine.position.set(0, ARENA.MAX_Y, 0);
    this.arena.add(ceilLine);

    // Starfield
    this.starsGroup = new Group();
    const starsCount = 200;
    const starPositions = new Float32Array(starsCount * 3);
    for (let i = 0; i < starsCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 60;
      starPositions[i * 3 + 1] = Math.random() * 30 + 5;
      starPositions[i * 3 + 2] = -15 - Math.random() * 20;
    }
    const starBufGeo = new BufferGeometry();
    starBufGeo.setAttribute('position', new Float32BufferAttribute(starPositions, 3));
    const starMat = new PointsMaterial({
      color: 0xffffff, size: 0.15, transparent: true, opacity: 0.7,
      blending: AdditiveBlending,
    });
    const stars = new Points(starBufGeo, starMat);
    this.starsGroup.add(stars);
    scene.add(this.starsGroup);

    // Grid floor (below water, subtle)
    const gridMat = new MeshStandardMaterial({
      color: 0x000000, emissive: new Color(0x003355), emissiveIntensity: 0.2,
      transparent: true, opacity: 0.3, wireframe: true,
    });
    const gridMesh = new Mesh(new PlaneGeometry(ARENA.WIDTH + 8, ARENA.DEPTH + 4, 24, 8), gridMat);
    gridMesh.rotation.x = -Math.PI / 2;
    gridMesh.position.set(0, ARENA.WATER_Y - 0.5, 0);
    this.arena.add(gridMesh);
  }

  private buildPlayer(): void {
    this.playerGroup = new Group();

    // Body
    const bodyMat = new MeshStandardMaterial({
      color: 0x224488, emissive: NEON_BLUE, emissiveIntensity: 0.3,
    });
    this.playerBody = new Mesh(new SphereGeometry(0.35, 10, 8), bodyMat);
    this.playerGroup.add(this.playerBody);

    // Head
    const headMat = new MeshStandardMaterial({
      color: 0xffcc88, emissive: new Color(0x332200), emissiveIntensity: 0.2,
    });
    const head = new Mesh(new SphereGeometry(0.22, 8, 6), headMat);
    head.position.set(0, 0.45, 0);
    this.playerGroup.add(head);

    // Eyes
    const eyeMat = new MeshStandardMaterial({ color: 0xffffff, emissive: NEON_WHITE, emissiveIntensity: 0.5 });
    const eyeL = new Mesh(new SphereGeometry(0.05, 6, 4), eyeMat);
    eyeL.position.set(-0.1, 0.5, 0.18);
    this.playerGroup.add(eyeL);
    const eyeR = new Mesh(new SphereGeometry(0.05, 6, 4), eyeMat);
    eyeR.position.set(0.1, 0.5, 0.18);
    this.playerGroup.add(eyeR);

    // Arms
    const armMat = new MeshStandardMaterial({ color: 0x224488, emissive: NEON_BLUE, emissiveIntensity: 0.2 });
    const armL = new Mesh(new BoxGeometry(0.12, 0.35, 0.12), armMat);
    armL.position.set(-0.4, 0.05, 0);
    armL.rotation.z = 0.4;
    this.playerGroup.add(armL);
    const armR = new Mesh(new BoxGeometry(0.12, 0.35, 0.12), armMat.clone());
    armR.position.set(0.4, 0.05, 0);
    armR.rotation.z = -0.4;
    this.playerGroup.add(armR);

    // Feet
    const footMat = new MeshStandardMaterial({ color: 0x222222 });
    const footL = new Mesh(new BoxGeometry(0.15, 0.1, 0.2), footMat);
    footL.position.set(-0.15, -0.4, 0.05);
    this.playerGroup.add(footL);
    const footR = new Mesh(new BoxGeometry(0.15, 0.1, 0.2), footMat);
    footR.position.set(0.15, -0.4, 0.05);
    this.playerGroup.add(footR);

    // Helmet
    const helmetMat = new MeshStandardMaterial({
      color: 0x333388, emissive: NEON_CYAN, emissiveIntensity: 0.15,
      transparent: true, opacity: 0.6,
    });
    const helmet = new Mesh(new SphereGeometry(0.26, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), helmetMat);
    helmet.position.set(0, 0.45, 0);
    this.playerGroup.add(helmet);

    // Balloons
    this.createPlayerBalloons();

    this.playerGroup.position.set(state.playerX, state.playerY, state.playerZ);
    this.world.scene.add(this.playerGroup);
  }

  private createPlayerBalloons(): void {
    if (!this.playerGroup) return;

    // Remove old
    if (this.playerBalloonL) { this.playerGroup.remove(this.playerBalloonL); this.playerBalloonL = null; }
    if (this.playerBalloonR) { this.playerGroup.remove(this.playerBalloonR); this.playerBalloonR = null; }
    if (this.playerBalloonStrL) { this.playerGroup.remove(this.playerBalloonStrL); this.playerBalloonStrL = null; }
    if (this.playerBalloonStrR) { this.playerGroup.remove(this.playerBalloonStrR); this.playerBalloonStrR = null; }

    const mat1 = new MeshStandardMaterial({ color: 0xff4488, emissive: NEON_PINK, emissiveIntensity: 0.6 });
    const mat2 = new MeshStandardMaterial({ color: 0x44ff88, emissive: NEON_GREEN, emissiveIntensity: 0.6 });
    const strMat = new MeshStandardMaterial({ color: 0xaaaaaa });

    if (state.playerBalloons >= 1) {
      this.playerBalloonL = new Mesh(new SphereGeometry(0.28, 8, 6), mat1);
      this.playerBalloonL.position.set(-0.25, 1.0, 0);
      this.playerBalloonL.scale.set(1, 1.3, 1);
      this.playerGroup.add(this.playerBalloonL);

      this.playerBalloonStrL = new Mesh(new CylinderGeometry(0.01, 0.01, 0.3, 4), strMat);
      this.playerBalloonStrL.position.set(-0.25, 0.72, 0);
      this.playerGroup.add(this.playerBalloonStrL);
    }

    if (state.playerBalloons >= 2) {
      this.playerBalloonR = new Mesh(new SphereGeometry(0.28, 8, 6), mat2);
      this.playerBalloonR.position.set(0.25, 1.05, 0);
      this.playerBalloonR.scale.set(1, 1.3, 1);
      this.playerGroup.add(this.playerBalloonR);

      this.playerBalloonStrR = new Mesh(new CylinderGeometry(0.01, 0.01, 0.3, 4), strMat);
      this.playerBalloonStrR.position.set(0.25, 0.75, 0);
      this.playerGroup.add(this.playerBalloonStrR);
    }
  }

  private setupInput(): void {
    window.addEventListener('keydown', (e) => {
      this.keysDown.add(e.code);
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        this.flapPressed = true;
      }
      // Dash on E or Shift
      if ((e.code === 'KeyE' || e.code === 'ShiftLeft' || e.code === 'ShiftRight')
          && state.phase === 'playing' && state.dashCooldown <= 0) {
        this.triggerDash();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });
  }

  update(delta: number, time: number): void {
    // Clamp delta
    const dt = Math.min(delta, 0.05);

    // Apply slow-mo
    if (state.slowMoTimer > 0) {
      state.slowMoTimer -= delta;
      state.slowMoFactor = 0.3;
      if (state.slowMoTimer <= 0) state.slowMoFactor = 1;
    }
    const sDt = dt * state.slowMoFactor;

    if (state.phase === 'playing') {
      state.gameTime += dt;
      this.updateFreeze(dt);
      this.updatePlayer(sDt, time);
      this.updateEnemies(sDt, time);
      this.updateCollisions(sDt);
      this.updatePlatforms(sDt, time);
      this.updateFish(sDt, time);
      this.updateLightning(sDt, time);
      this.updatePowerUps(sDt, time);
      this.updateActivePowerUps(sDt);
      this.updateCombo(dt);
      this.updateIcicles(sDt);
      this.updateWindZones(sDt);
      this.updateBossAttacks(sDt);
      this.updatePhaseTimer(sDt);
      this.updateTrail(sDt);
      this.updateBonusItems(sDt, time);
      this.updateScoreDrops(sDt, time);
      this.updateWhirlpools(sDt, time);
      this.updateDash(sDt);
      this.checkPhaseComplete();
      this.handleXRInput(sDt);
    }

    if (state.phase === 'phase-complete') {
      state.phaseTransitionTimer -= dt;
      if (state.phaseTransitionTimer <= 0) {
        this.startNextPhase();
      }
    }

    this.updateVisuals(dt, time);
    this.updateParticles(dt);
    this.updateCamera(dt);
    this.updateClouds(dt);
    this.updateShieldBubble(time);
    this.updateEnvironmentDecorations(time);
    this.updateComboFlash(dt);
    this.updateNebulae(time);
    this.updateScreenFlash(dt);

    if (state.mode === 'balloon-trip') {
      this.updateBalloonTrip(dt);
    }

    // Water ripple animation (vertex-based wave)
    if (this.waterPlane) {
      const geo = this.waterPlane.geometry as BufferGeometry;
      const posAttr = geo.getAttribute('position');
      if (posAttr) {
        const arr = posAttr.array as Float32Array;
        const count = posAttr.count;
        for (let i = 0; i < count; i++) {
          const ix = i * 3;
          const x = arr[ix];
          const y = arr[ix + 1];
          // Combine two sine waves for a natural ripple pattern
          arr[ix + 2] = Math.sin(x * 0.6 + time * 2) * 0.08
                       + Math.sin(y * 1.2 + time * 3) * 0.04
                       + Math.sin((x + y) * 0.4 + time * 1.5) * 0.05;
        }
        posAttr.needsUpdate = true;
      }
    }

    // Player visibility
    if (this.playerGroup) {
      this.playerGroup.visible = state.phase === 'playing' || state.phase === 'phase-complete';
    }

    // Balloon bob
    if (this.playerBalloonL) {
      this.playerBalloonL.position.y = 1.0 + Math.sin(time * 3) * 0.05;
    }
    if (this.playerBalloonR) {
      this.playerBalloonR.position.y = 1.05 + Math.sin(time * 3 + 1) * 0.05;
    }

    // Screen shake
    if (state.shakeTimer > 0) {
      state.shakeTimer -= dt;
      const cam = this.world.camera;
      const s = state.shakeIntensity * (state.shakeTimer / 0.3);
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
  }

  // === PLAYER ===

  private updatePlayer(dt: number, time: number): void {
    if (!state.playerAlive) return;

    // Gravity (reduced when balloons attached)
    const gravity = state.playerBalloons > 0 ? -4 : -12;
    const buoyancy = state.playerBalloons > 0 ? 2.5 * state.playerBalloons : 0;
    state.playerVY += (gravity + buoyancy) * dt;

    // Speed boost power-up
    const speedMult = state.activePowerUps.some(p => p.type === 'speed') ? 1.5 : 1;

    // Keyboard horizontal
    let moveX = 0;
    if (this.keysDown.has('ArrowLeft') || this.keysDown.has('KeyA')) moveX -= 1;
    if (this.keysDown.has('ArrowRight') || this.keysDown.has('KeyD')) moveX += 1;
    state.playerVX += moveX * 15 * speedMult * dt;

    // Flap
    if (this.flapPressed && state.playerBalloons > 0) {
      this.flapPressed = false;
      if (this.flapCooldown <= 0) {
        state.playerVY = Math.min(state.playerVY + 4, 8);
        this.flapCooldown = 0.12;
        // Arm flap animation
        this.animateFlap();
      }
    }
    this.flapPressed = false;
    if (this.flapCooldown > 0) this.flapCooldown -= dt;

    // Continuous flap with held key
    if ((this.keysDown.has('Space') || this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp'))
        && state.playerBalloons > 0 && this.flapCooldown <= 0) {
      state.playerVY = Math.min(state.playerVY + 3, 8);
      this.flapCooldown = 0.18;
      this.animateFlap();
    }

    // Friction
    state.playerVX *= (1 - 3 * dt);
    state.playerVY = MathUtils.clamp(state.playerVY, -10, 10);

    // Move
    state.playerX += state.playerVX * dt;
    state.playerY += state.playerVY * dt;

    // Facing direction
    if (Math.abs(state.playerVX) > 0.5) {
      state.playerFacing = state.playerVX > 0 ? 1 : -1;
    }

    // Wrap horizontally
    if (state.playerX < ARENA.MIN_X - 1) state.playerX = ARENA.MAX_X + 1;
    if (state.playerX > ARENA.MAX_X + 1) state.playerX = ARENA.MIN_X - 1;

    // Ceiling
    if (state.playerY > ARENA.MAX_Y - 1) {
      state.playerY = ARENA.MAX_Y - 1;
      state.playerVY = Math.min(state.playerVY, 0);
    }

    // Water death
    if (state.playerY < ARENA.WATER_Y + 0.3) {
      this.waterSplash(state.playerX);
      this.playerDie();
      return;
    }

    // Invincibility timer
    if (state.playerInvincible > 0) {
      state.playerInvincible -= dt;
    }

    // Update mesh
    if (this.playerGroup) {
      this.playerGroup.position.set(state.playerX, state.playerY, state.playerZ);
      this.playerGroup.rotation.y = state.playerFacing > 0 ? 0 : Math.PI;

      // Tilt based on velocity
      this.playerGroup.rotation.z = -state.playerVX * 0.05;

      // Invincibility blink
      if (state.playerInvincible > 0) {
        this.playerGroup.visible = Math.sin(state.playerInvincible * 15) > 0;
      } else {
        this.playerGroup.visible = true;
      }
    }

    // Platform collision
    this.playerPlatformCollision();
  }

  private animateFlap(): void {
    // Simple flap particle
    this.spawnParticle(state.playerX, state.playerY - 0.3, 0, 0, -1, 0, 0.3, 0x88ccff, 0.15);
    this.audio?.playFlap();
  }

  private playerPlatformCollision(): void {
    if (state.playerVY > 0) return;
    for (const plat of state.platforms) {
      // Skip crumbled platforms
      if (plat.crumble && plat.crumbleState === 'crumbled') continue;

      const px = plat.x;
      const py = plat.y;
      const hw = plat.width / 2;
      if (state.playerX > px - hw && state.playerX < px + hw
          && state.playerY > py && state.playerY < py + 0.6
          && state.playerVY < 0) {
        state.playerY = py + 0.5;
        state.playerVY = 0;
        // Carry player with moving platform
        if (plat.speed !== 0) {
          state.playerVX += plat.speed * 0.8;
        }
        // Landing particles
        this.spawnParticle(state.playerX - 0.2, py + 0.15, 0, -0.5, 0.3, 0, 0.25, 0x888888, 0.04);
        this.spawnParticle(state.playerX + 0.2, py + 0.15, 0, 0.5, 0.3, 0, 0.25, 0x888888, 0.04);
        // Trigger crumble on landing
        if (plat.crumble && plat.crumbleState === 'solid') {
          plat.crumbleState = 'shaking';
        }
      }
    }
  }

  private playerDie(): void {
    state.playerAlive = false;
    state.lives--;
    this.spawnBurst(state.playerX, state.playerY, 0xff4444, 15);
    state.shakeTimer = 0.3;
    state.shakeIntensity = 0.3;
    this.audio?.playDeath();

    if (state.lives <= 0) {
      state.phase = 'game-over';
      state.saveCareer();
    } else {
      // Respawn after delay
      setTimeout(() => {
        state.resetPlayerForPhase();
        this.createPlayerBalloons();
      }, 1500);
    }
  }

  // === ENEMIES ===

  private spawnEnemy(type: 'basic' | 'chaser' | 'dodger' | 'boss' | 'bomber' | 'magnet'): void {
    const side = Math.random() > 0.5 ? 1 : -1;
    const balloons = type === 'boss' ? 4 :
                     type === 'magnet' ? 2 :
                     type === 'bomber' ? 2 :
                     type === 'chaser' ? 2 :
                     type === 'dodger' ? 1 : 2;

    const enemy: EnemyData = {
      id: state.getId(),
      type,
      x: side * (ARENA.MAX_X + 1),
      y: ARENA.PLAYER_START_Y + Math.random() * 6,
      z: 0,
      vx: -side * (1 + Math.random()),
      vy: 0,
      balloons,
      maxBalloons: balloons,
      alive: true,
      grounded: false,
      groundTimer: 0,
      flapCooldown: 0,
      aiTimer: Math.random() * 2,
      mesh: null,
      balloonMeshes: [],
    };

    this.createEnemyMesh(enemy);
    state.enemies.push(enemy);
  }

  private createEnemyMesh(e: EnemyData): void {
    const group = new Group();
    const isBoss = e.type === 'boss';
    const bodyScale = isBoss ? 1.5 : 1;

    // Body — unique shapes per enemy type
    const bodyColor = e.type === 'boss' ? 0x880044 :
                      e.type === 'bomber' ? 0x884488 :
                      e.type === 'chaser' ? 0x884400 :
                      e.type === 'dodger' ? 0x008844 :
                      e.type === 'magnet' ? 0x444488 : 0x664444;
    const emissiveColor = e.type === 'boss' ? NEON_RED :
                          e.type === 'bomber' ? NEON_PINK :
                          e.type === 'chaser' ? NEON_ORANGE :
                          e.type === 'dodger' ? NEON_GREEN :
                          e.type === 'magnet' ? NEON_BLUE : new Color(0x884444);

    const bodyMat = new MeshStandardMaterial({
      color: bodyColor, emissive: emissiveColor, emissiveIntensity: 0.3,
    });

    // Each enemy type gets a distinct body mesh
    let body: Mesh;
    if (e.type === 'chaser') {
      // Chaser: pointed, aggressive cone shape
      body = new Mesh(new ConeGeometry(0.28 * bodyScale, 0.7 * bodyScale, 6), bodyMat);
      body.rotation.z = Math.PI; // point forward/down for aggressive look
    } else if (e.type === 'dodger') {
      // Dodger: slim, streamlined capsule (elongated cylinder)
      body = new Mesh(new CylinderGeometry(0.2 * bodyScale, 0.18 * bodyScale, 0.65 * bodyScale, 8), bodyMat);
    } else if (e.type === 'bomber') {
      // Bomber: wide, bulky box body
      body = new Mesh(new BoxGeometry(0.55 * bodyScale, 0.45 * bodyScale, 0.4 * bodyScale), bodyMat);
    } else if (e.type === 'magnet') {
      // Magnet: sphere with orbiting ring — gravity well enemy
      body = new Mesh(new SphereGeometry(0.3 * bodyScale, 10, 8), bodyMat);
      const orbitMat = new MeshStandardMaterial({
        color: 0x222266, emissive: NEON_BLUE, emissiveIntensity: 0.6,
        transparent: true, opacity: 0.7,
      });
      const orbitRing = new Mesh(new TorusGeometry(0.5 * bodyScale, 0.03, 6, 16), orbitMat);
      orbitRing.rotation.x = Math.PI / 4;
      group.add(orbitRing);
      const orbitRing2 = new Mesh(new TorusGeometry(0.5 * bodyScale, 0.03, 6, 16), orbitMat.clone());
      orbitRing2.rotation.x = -Math.PI / 4;
      orbitRing2.rotation.z = Math.PI / 2;
      group.add(orbitRing2);
    } else if (e.type === 'boss') {
      // Boss: large sphere with armored ring
      body = new Mesh(new SphereGeometry(0.35 * bodyScale, 10, 8), bodyMat);
      const armorMat = new MeshStandardMaterial({
        color: 0x440022, emissive: NEON_RED, emissiveIntensity: 0.4,
      });
      const armorRing = new Mesh(new TorusGeometry(0.38 * bodyScale, 0.06, 6, 12), armorMat);
      armorRing.rotation.x = Math.PI / 2;
      group.add(armorRing);
    } else {
      // Basic: standard sphere
      body = new Mesh(new SphereGeometry(0.3 * bodyScale, 8, 6), bodyMat);
    }
    group.add(body);

    // Head
    const headMat = new MeshStandardMaterial({ color: 0xddaa88, emissive: new Color(0x221100), emissiveIntensity: 0.15 });
    const head = new Mesh(new SphereGeometry(0.18 * bodyScale, 6, 5), headMat);
    head.position.set(0, 0.38 * bodyScale, 0);
    group.add(head);

    // Eyes (angry)
    const eyeColor = e.type === 'boss' ? 0xff0000 : 0xff4444;
    const eyeMat = new MeshStandardMaterial({ color: eyeColor, emissive: new Color(eyeColor), emissiveIntensity: 0.8 });
    const eyeL = new Mesh(new SphereGeometry(0.04 * bodyScale, 4, 3), eyeMat);
    eyeL.position.set(-0.08 * bodyScale, 0.42 * bodyScale, 0.14 * bodyScale);
    group.add(eyeL);
    const eyeR = eyeL.clone();
    eyeR.position.set(0.08 * bodyScale, 0.42 * bodyScale, 0.14 * bodyScale);
    group.add(eyeR);

    // Boss crown
    if (isBoss) {
      const crownMat = new MeshStandardMaterial({ color: 0xffcc00, emissive: NEON_YELLOW, emissiveIntensity: 0.5 });
      const crown = new Mesh(new CylinderGeometry(0.15, 0.2, 0.15, 5), crownMat);
      crown.position.set(0, 0.65, 0);
      group.add(crown);
    }

    // Bomber wings
    if (e.type === 'bomber') {
      const wingMat = new MeshStandardMaterial({ color: 0x553355, emissive: NEON_PINK, emissiveIntensity: 0.25 });
      const wingL = new Mesh(new BoxGeometry(0.35, 0.06, 0.25), wingMat);
      wingL.position.set(-0.4, 0, 0);
      wingL.rotation.z = -0.2;
      group.add(wingL);
      const wingR = new Mesh(new BoxGeometry(0.35, 0.06, 0.25), wingMat);
      wingR.position.set(0.4, 0, 0);
      wingR.rotation.z = 0.2;
      group.add(wingR);
    }

    // Dodger fins
    if (e.type === 'dodger') {
      const finMat = new MeshStandardMaterial({ color: 0x005533, emissive: NEON_GREEN, emissiveIntensity: 0.3 });
      const finTop = new Mesh(new ConeGeometry(0.08, 0.3, 4), finMat);
      finTop.position.set(0, 0.28, -0.12);
      group.add(finTop);
      const finL = new Mesh(new ConeGeometry(0.06, 0.2, 4), finMat);
      finL.position.set(-0.18, -0.05, -0.08);
      finL.rotation.z = 0.5;
      group.add(finL);
      const finR = new Mesh(new ConeGeometry(0.06, 0.2, 4), finMat);
      finR.position.set(0.18, -0.05, -0.08);
      finR.rotation.z = -0.5;
      group.add(finR);
    }

    // Chaser spike accent
    if (e.type === 'chaser') {
      const spikeMat = new MeshStandardMaterial({ color: 0x553300, emissive: NEON_ORANGE, emissiveIntensity: 0.4 });
      const spike = new Mesh(new ConeGeometry(0.06, 0.25, 4), spikeMat);
      spike.position.set(0, -0.35, 0.15);
      spike.rotation.x = -0.3;
      group.add(spike);
    }

    // Feet
    const footMat = new MeshStandardMaterial({ color: 0x222222 });
    const fl = new Mesh(new BoxGeometry(0.12 * bodyScale, 0.08, 0.16), footMat);
    fl.position.set(-0.12 * bodyScale, -0.35 * bodyScale, 0.03);
    group.add(fl);
    const fr = fl.clone();
    fr.position.set(0.12 * bodyScale, -0.35 * bodyScale, 0.03);
    group.add(fr);

    // Balloons
    e.balloonMeshes = [];
    this.updateEnemyBalloons(e, group);

    group.position.set(e.x, e.y, e.z);
    this.world.scene.add(group);
    e.mesh = group;
  }

  private updateEnemyBalloons(e: EnemyData, group?: Group): void {
    const g = group || e.mesh as Group;
    if (!g) return;

    // Remove old balloon meshes
    for (const bm of e.balloonMeshes) {
      g.remove(bm);
    }
    e.balloonMeshes = [];

    const isBoss = e.type === 'boss';
    const scale = isBoss ? 1.4 : 1;

    for (let i = 0; i < e.balloons; i++) {
      const colorIdx = (e.id + i) % BALLOON_COLORS.length;
      const bMat = new MeshStandardMaterial({
        color: BALLOON_COLORS[colorIdx],
        emissive: new Color(BALLOON_COLORS[colorIdx]),
        emissiveIntensity: 0.5,
      });
      const balloon = new Mesh(new SphereGeometry(0.22 * scale, 6, 5), bMat);
      balloon.scale.set(1, 1.3, 1);

      // Position balloons in an arc
      const angle = (i / Math.max(e.balloons, 1) - 0.5) * Math.PI * 0.6;
      balloon.position.set(Math.sin(angle) * 0.3 * scale, 0.85 * scale + Math.cos(angle) * 0.1, 0);
      g.add(balloon);
      e.balloonMeshes.push(balloon);

      // String
      const strMat = new MeshStandardMaterial({ color: 0x888888 });
      const str = new Mesh(new CylinderGeometry(0.008, 0.008, 0.25, 3), strMat);
      str.position.set(balloon.position.x, 0.6 * scale, 0);
      g.add(str);
      e.balloonMeshes.push(str);
    }

    // Parachute if no balloons
    if (e.balloons <= 0 && e.alive) {
      const paraMat = new MeshStandardMaterial({
        color: 0xffffff, emissive: NEON_WHITE, emissiveIntensity: 0.2,
        transparent: true, opacity: 0.6, side: DoubleSide,
      });
      const para = new Mesh(new SphereGeometry(0.4, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), paraMat);
      para.position.set(0, 0.7, 0);
      g.add(para);
      e.balloonMeshes.push(para);
    }
  }

  private updateEnemies(dt: number, time: number): void {
    const diffMult = state.getDifficultyMultiplier();
    const frozen = state.freezeTimer > 0;

    // Spawn queue (still spawns during freeze)
    if (this.enemySpawnQueue > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 1.5;

        if (state.isBossPhase() && !state.bossActive) {
          this.spawnEnemy('boss');
          state.bossActive = true;
          state.bossMaxHP = 4;
          state.bossCurrentHP = 4;
          // Boss entrance: dramatic effects
          state.shakeTimer = 0.5;
          state.shakeIntensity = 0.25;
          state.slowMoTimer = 0.4;
          state.slowMoFactor = 0.5;
          this.audio?.playBossAttack();
          // Spawn warning particles around arena
          for (let i = 0; i < 24; i++) {
            const angle = (i / 24) * Math.PI * 2;
            this.spawnParticle(
              Math.cos(angle) * 6, 8 + Math.sin(angle) * 5, 0,
              -Math.cos(angle) * 2, -Math.sin(angle) * 2, 0,
              1.2, 0xff4444, 0.1,
            );
          }
          this.enemySpawnQueue--;
        } else if (this.nextFormation !== 'none' && this.enemySpawnQueue >= 3) {
          // Formation spawn: spawn multiple enemies in pattern
          this.spawnFormation(this.nextFormation);
          this.nextFormation = 'none'; // Only one formation per phase
        } else {
          this.enemySpawnQueue--;

          const r = Math.random();
          // Bomber appears from Phase 4+, more likely on Hard
          const bomberChance = state.currentPhase >= 4 ?
            (state.difficulty === 'hard' ? 0.2 : 0.1) : 0;
          // Magnet appears from Phase 5+
          const magnetChance = state.currentPhase >= 5 ?
            (state.difficulty === 'hard' ? 0.15 : 0.08) : 0;
          const type = r < bomberChance ? 'bomber' :
                       r < bomberChance + magnetChance ? 'magnet' :
                       r < bomberChance + magnetChance + 0.15 ? 'dodger' :
                       r < bomberChance + magnetChance + 0.4 ? 'chaser' : 'basic';
          this.spawnEnemy(type);
        }
      }
    }

    for (const e of state.enemies) {
      if (!e.alive) continue;

      // Frozen: enemies don't move, just tint blue
      if (frozen) {
        if (e.mesh) {
          const s = 1 + Math.sin(time * 8) * 0.03;
          e.mesh.scale.set(s, s, s);
        }
        continue;
      }

      const speed = (e.type === 'chaser' ? 4 : e.type === 'dodger' ? 5 : e.type === 'bomber' ? 3.5 : e.type === 'magnet' ? 3 : e.type === 'boss' ? 2.5 : 3) * diffMult;

      if (e.balloons > 0) {
        // Flying AI
        const gravity = -3;
        const buoyancy = 2 * e.balloons;
        e.vy += (gravity + buoyancy) * dt;

        // AI behavior
        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          // Hard mode: faster AI reaction
          const aiInterval = state.difficulty === 'hard' ? 0.3 : 0.5;
          e.aiTimer = aiInterval + Math.random() * 1.5;

          if (e.type === 'chaser') {
            // Chase player
            const dx = state.playerX - e.x;
            const dy = state.playerY - e.y;
            const aggressiveness = state.difficulty === 'hard' ? 0.5 : 0.3;
            e.vx += Math.sign(dx) * speed * aggressiveness;
            if (dy > 0.5) e.vy += 3;
            // Hard: predict player movement
            if (state.difficulty === 'hard') {
              e.vx += state.playerVX * 0.15;
            }
          } else if (e.type === 'dodger') {
            // Erratic movement
            e.vx += (Math.random() - 0.5) * speed;
            e.vy += (Math.random() - 0.3) * 3;
            // Hard: dodge toward player more often
            if (state.difficulty === 'hard' && Math.random() < 0.3) {
              const dx = state.playerX - e.x;
              e.vx += Math.sign(dx) * speed * 0.2;
            }
          } else if (e.type === 'bomber') {
            // Bomber: fly above player and drop bombs (icicle-like projectiles)
            const dx = state.playerX - e.x;
            e.vx += Math.sign(dx) * speed * 0.25;
            // Try to stay above player
            if (e.y < state.playerY + 3) e.vy += 3;
            // Drop bomb when roughly above player
            if (Math.abs(dx) < 2 && e.y > state.playerY + 1 && Math.random() < 0.4) {
              this.bomberDropBomb(e);
            }
          } else if (e.type === 'magnet') {
            // Magnet: maintains distance, pulls player toward it
            const dx = state.playerX - e.x;
            const dy = state.playerY - e.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // Try to keep 4-6 units from player
            if (dist < 3) {
              e.vx -= Math.sign(dx) * speed * 0.3; // move away if too close
            } else if (dist > 7) {
              e.vx += Math.sign(dx) * speed * 0.2; // approach if too far
            }
            // Stay at medium height
            if (e.y < 5) e.vy += 2;
            if (e.y > 12) e.vy -= 1;
            // Gravity pull effect on player
            if (dist < 6 && dist > 0.5 && state.playerAlive && state.playerInvincible <= 0) {
              const pullStr = (3 + (state.difficulty === 'hard' ? 2 : 0)) * (1 - dist / 6);
              state.playerVX -= (dx / dist) * pullStr * 0.016;
              state.playerVY -= (dy / dist) * pullStr * 0.016;
            }
          } else if (e.type === 'boss') {
            // Boss: slow chase with periodic lunges
            const dx = state.playerX - e.x;
            e.vx += Math.sign(dx) * speed * 0.2;
            if (Math.random() < 0.2) e.vy += 4; // lunge up
            // Hard: boss is more aggressive
            if (state.difficulty === 'hard' && Math.random() < 0.15) {
              e.vx += Math.sign(dx) * speed * 0.4;
            }
          } else {
            // Basic: wander
            e.vx += (Math.random() - 0.5) * speed * 0.5;
            if (Math.random() < 0.3) e.vy += 2;
            // Hard: basics occasionally charge at player
            if (state.difficulty === 'hard' && Math.random() < 0.15) {
              const dx = state.playerX - e.x;
              e.vx += Math.sign(dx) * speed * 0.3;
            }
          }
        }

        // Random flapping
        e.flapCooldown -= dt;
        if (e.flapCooldown <= 0 && e.y < ARENA.PLAYER_START_Y + 4) {
          e.vy += 2;
          e.flapCooldown = 0.3 + Math.random() * 0.8;
        }

        // Friction
        e.vx *= (1 - 2 * dt);
        e.vy = MathUtils.clamp(e.vy, -6, 6);
        e.vx = MathUtils.clamp(e.vx, -speed, speed);

      } else {
        // No balloons — falling/parachuting
        e.vy = Math.max(e.vy - 8 * dt, -3); // slow fall with parachute
        e.vx *= (1 - 2 * dt);

        // Check platform landing
        for (const plat of state.platforms) {
          if (plat.crumble && plat.crumbleState === 'crumbled') continue;
          const hw = plat.width / 2;
          if (e.x > plat.x - hw && e.x < plat.x + hw
              && e.y > plat.y && e.y < plat.y + 0.6
              && e.vy < 0) {
            e.y = plat.y + 0.5;
            e.vy = 0;
            e.grounded = true;
            e.groundTimer = 3 + Math.random() * 2; // Time to re-inflate
          }
        }

        // Re-inflate on ground
        if (e.grounded) {
          e.groundTimer -= dt;
          if (e.groundTimer <= 0) {
            e.balloons = e.maxBalloons;
            e.grounded = false;
            this.updateEnemyBalloons(e);
          }
        }
      }

      // Move
      e.x += e.vx * dt;
      e.y += e.vy * dt;

      // Wrap
      if (e.x < ARENA.MIN_X - 2) e.x = ARENA.MAX_X + 2;
      if (e.x > ARENA.MAX_X + 2) e.x = ARENA.MIN_X - 2;

      // Ceiling
      if (e.y > ARENA.MAX_Y - 1) {
        e.y = ARENA.MAX_Y - 1;
        e.vy = Math.min(e.vy, 0);
      }

      // Water death
      if (e.y < ARENA.WATER_Y + 0.3) {
        this.waterSplash(e.x);
        this.defeatEnemy(e);
      }

      // Update mesh
      if (e.mesh) {
        e.mesh.position.set(e.x, e.y, e.z);
        (e.mesh as Group).rotation.y = e.vx > 0 ? 0 : Math.PI;

        // Magnet enemy: orbit ring rotation + pull particle trail
        if (e.type === 'magnet' && !frozen) {
          // Rotate the orbit rings (children 1 and 2 of the group)
          const children = (e.mesh as Group).children;
          for (let c = 0; c < children.length; c++) {
            const child = children[c];
            if (child instanceof Mesh && child.geometry?.type === 'TorusGeometry') {
              child.rotation.z = time * 3 + c * Math.PI;
            }
          }
          // Periodic pull particle toward player
          if (state.playerAlive && Math.random() < 0.15) {
            const dx = state.playerX - e.x;
            const dy = state.playerY - e.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 6 && dist > 1) {
              this.spawnParticle(
                e.x + (Math.random() - 0.5), e.y + (Math.random() - 0.5), 0,
                dx / dist * 2, dy / dist * 2, 0,
                0.3, 0x4488ff, 0.03,
              );
            }
          }
        }

        // Balloon bob
        for (let i = 0; i < e.balloonMeshes.length; i++) {
          const bm = e.balloonMeshes[i];
          if ((bm as Mesh).isMesh && (bm as Mesh).geometry?.type === 'SphereGeometry') {
            bm.position.y += Math.sin(time * 2 + i) * 0.001;
          }
        }
      }
    }
  }

  private defeatEnemy(e: EnemyData): void {
    e.alive = false;
    state.sessionEnemiesDefeated++;
    state.phaseEnemiesDefeated++;
    state.addCombo();

    const points = e.type === 'boss' ? 2000 : e.type === 'magnet' ? 600 : e.type === 'chaser' ? 500 : e.type === 'dodger' ? 300 : 200;
    state.addScore(points);

    // Spawn score drop
    this.spawnScoreDrop(e.x, e.y, e.type === 'boss' ? 200 : 50);

    if (e.type === 'boss') {
      state.bossActive = false;
      state.sessionBossesDefeated++;
      state.slowMoTimer = 0.8;
      state.slowMoFactor = 0.3;
      state.shakeTimer = 0.5;
      state.shakeIntensity = 0.5;
      this.spawnBurst(e.x, e.y, 0xffff00, 30);
      this.audio?.playBossDefeat();
      // Victory confetti
      for (let i = 0; i < 20; i++) {
        const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
        this.spawnParticle(
          e.x + (Math.random() - 0.5) * 2,
          e.y + Math.random() * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 5,
          3 + Math.random() * 5,
          (Math.random() - 0.5) * 3,
          1 + Math.random(),
          colors[Math.floor(Math.random() * colors.length)],
          0.08 + Math.random() * 0.06,
        );
      }
    } else {
      this.spawnBurst(e.x, e.y, 0xff8844, 10);
      this.audio?.playEnemyDefeat();
    }

    // Score popup particle (larger, slower fade)
    this.spawnParticle(e.x, e.y + 1, 0.5, 0, 2, 0, 1.2, 0xffff88, 0.15);

    // Remove mesh
    if (e.mesh) {
      this.world.scene.remove(e.mesh);
      e.mesh = null;
    }
  }

  // === COLLISIONS ===

  private updateCollisions(dt: number): void {
    if (!state.playerAlive) return;

    for (const e of state.enemies) {
      if (!e.alive) continue;

      const dx = state.playerX - e.x;
      const dy = state.playerY - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const hitDist = e.type === 'boss' ? 1.2 : 0.7;

      if (dist < hitDist) {
        // Check who is above
        if (dy > 0.2 && state.playerVY < 0) {
          // Player above enemy — pop balloon
          this.popEnemyBalloon(e);
          state.playerVY = 4; // Bounce up
          this.audio?.playPop();
        } else if (dy < -0.2 && state.playerInvincible <= 0) {
          // Enemy above player — player loses balloon
          this.popPlayerBalloon();
        } else if (state.playerInvincible <= 0) {
          // Side collision — push apart
          state.playerVX += Math.sign(dx) * 5;
          e.vx -= Math.sign(dx) * 5;
        }
      }
    }

    // Player vs bumped grounded enemies (kick them off)
    for (const e of state.enemies) {
      if (!e.alive || !e.grounded) continue;
      const dx = state.playerX - e.x;
      const dy = state.playerY - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.8) {
        e.vx += Math.sign(e.x - state.playerX) * 8;
        e.vy += 3;
        e.grounded = false;
      }
    }
  }

  private popEnemyBalloon(e: EnemyData): void {
    if (e.balloons <= 0) return;
    e.balloons--;
    state.sessionBalloonsPopped++;
    state.addScore(100);
    state.addCombo();
    this.audio?.playPop();

    // Track boss HP
    if (e.type === 'boss') {
      state.bossCurrentHP = e.balloons;
    }

    // Pop particle at balloon position
    this.spawnBurst(e.x, e.y + 0.8, BALLOON_COLORS[(e.id + e.balloons) % BALLOON_COLORS.length], 8);

    if (e.balloons <= 0) {
      this.updateEnemyBalloons(e);
      state.addScore(200); // Extra for losing all balloons
    } else {
      this.updateEnemyBalloons(e);
    }

    state.shakeTimer = 0.1;
    state.shakeIntensity = 0.1;
  }

  private popPlayerBalloon(): void {
    if (state.playerInvincible > 0) return;

    // Shield check
    const shieldIdx = state.activePowerUps.findIndex(p => p.type === 'shield');
    if (shieldIdx >= 0) {
      state.activePowerUps.splice(shieldIdx, 1);
      state.playerInvincible = 1;
      this.spawnBurst(state.playerX, state.playerY, 0x00ffff, 12);
      this.audio?.playShieldBreak();
      return;
    }

    state.playerBalloons--;
    state.playerInvincible = 1.5;
    this.createPlayerBalloons();
    state.shakeTimer = 0.2;
    state.shakeIntensity = 0.2;
    this.audio?.playHurt();

    if (state.playerBalloons <= 0) {
      this.playerDie();
    }

    this.spawnBurst(state.playerX, state.playerY + 0.8, 0xff4488, 10);
  }

  // === PLATFORMS ===

  private generatePlatforms(): void {
    // Clear old
    for (const p of state.platforms) {
      if (p.mesh) this.world.scene.remove(p.mesh);
    }
    state.platforms = [];

    const count = 5 + Math.min(Math.floor(state.currentPhase / 2), 5);

    for (let i = 0; i < count; i++) {
      const w = 2 + Math.random() * 3;
      const x = (Math.random() - 0.5) * (ARENA.WIDTH - w);
      const y = 1 + (i / count) * (ARENA.HEIGHT - 4);

      const isMoving = i > 1 && Math.random() < 0.3 + state.currentPhase * 0.05;
      const isCrumble = !isMoving && state.currentPhase >= 3 && Math.random() < 0.25 + state.currentPhase * 0.02;
      const plat: PlatformData = {
        id: state.getId(),
        x, y, z: 0,
        width: w,
        speed: isMoving ?
          (Math.random() > 0.5 ? 1 : -1) * (1 + Math.random() * 1.5) : 0,
        originX: x,
        range: 2 + Math.random() * 3,
        crumble: isCrumble,
        crumbleTimer: 2.0,
        crumbleState: 'solid',
        respawnTimer: 0,
        mesh: null,
      };

      // Create mesh
      const tc = state.getThemeColors();
      const platColor = plat.crumble ? 0x332211 : 0x112233;
      const platEmissive = plat.crumble ? new Color(0xff8844) : new Color(tc.primary);
      const mat = new MeshStandardMaterial({
        color: platColor,
        emissive: platEmissive,
        emissiveIntensity: 0.2 + Math.random() * 0.2,
      });
      const mesh = new Mesh(new BoxGeometry(w, 0.25, 1.5), mat);
      mesh.position.set(x, y, 0);
      this.world.scene.add(mesh);
      plat.mesh = mesh;

      // Edge glow
      const edgeEmissive = plat.crumble ? new Color(0xff6622) : new Color(tc.accent);
      const edgeMat = new MeshStandardMaterial({
        color: 0x000000, emissive: edgeEmissive,
        emissiveIntensity: 0.6,
        transparent: true, opacity: 0.8,
      });
      const edge = new Mesh(new BoxGeometry(w + 0.1, 0.05, 1.6), edgeMat);
      edge.position.set(x, y + 0.13, 0);
      this.world.scene.add(edge);

      state.platforms.push(plat);
    }

    this.platformsGenerated = true;
  }

  private updatePlatforms(dt: number, time: number): void {
    for (const p of state.platforms) {
      // Crumbled platform respawn logic
      if (p.crumble && p.crumbleState === 'crumbled') {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          p.crumbleState = 'solid';
          p.crumbleTimer = 2.0;
          if (p.mesh) {
            p.mesh.visible = true;
            p.mesh.scale.set(1, 1, 1);
            p.mesh.position.y = p.y;
            // Respawn sparkle
            this.spawnBurst(p.x, p.y, 0xff8844, 6);
          }
        }
        continue;
      }

      // Moving platform logic
      if (p.speed !== 0) {
        p.x += p.speed * dt;
        // Reverse at range bounds
        if (p.x > p.originX + p.range) {
          p.x = p.originX + p.range;
          p.speed = -Math.abs(p.speed);
        } else if (p.x < p.originX - p.range) {
          p.x = p.originX - p.range;
          p.speed = Math.abs(p.speed);
        }
      }

      // Crumble platform shaking/collapsing
      if (p.crumble && p.crumbleState === 'shaking') {
        p.crumbleTimer -= dt;
        if (p.mesh) {
          // Shake effect
          const shakeAmt = 0.03 * (1 - p.crumbleTimer / 2.0);
          p.mesh.position.x = p.x + (Math.random() - 0.5) * shakeAmt;
          p.mesh.position.y = p.y + (Math.random() - 0.5) * shakeAmt;
          // Blink opacity
          const mat = (p.mesh as Mesh).material as MeshStandardMaterial;
          mat.opacity = 0.5 + Math.sin(time * 20) * 0.3;
          mat.transparent = true;
        }
        if (p.crumbleTimer <= 0) {
          // Crumble!
          p.crumbleState = 'crumbled';
          p.respawnTimer = 5 + Math.random() * 3; // Respawn after 5-8 seconds
          if (p.mesh) {
            p.mesh.visible = false;
          }
          this.spawnBurst(p.x, p.y, 0xff6622, 10);
          this.audio?.playIcicle(); // Reuse crumble-like sound
        }
      }

      if (p.mesh && p.crumbleState !== 'crumbled') {
        p.mesh.position.x = p.x;
        // Subtle glow animation
        const mat = (p.mesh as Mesh).material as MeshStandardMaterial;
        mat.emissiveIntensity = 0.2 + Math.sin(time * 2 + p.id) * 0.1;

        // Moving platform indicator: brighter glow
        if (p.speed !== 0) {
          mat.emissiveIntensity += 0.1;
        }

        // Crumble platform warning glow
        if (p.crumble && p.crumbleState === 'solid') {
          mat.emissiveIntensity += Math.sin(time * 1.5) * 0.05;
        }
      }
    }
  }

  // === FISH ===

  private updateFish(dt: number, time: number): void {
    this.fishSpawnTimer -= dt;
    if (this.fishSpawnTimer <= 0 && state.fish.length < 3) {
      this.fishSpawnTimer = 4 + Math.random() * 6;
      this.spawnFish();
    }

    for (const f of state.fish) {
      if (!f.active) continue;

      f.timer -= dt;
      if (f.timer <= 0) {
        f.active = false;
        if (f.mesh) { this.world.scene.remove(f.mesh); f.mesh = null; }
        continue;
      }

      // Fish jumps from water
      f.y += f.vy * dt;
      f.vy -= 6 * dt;

      if (f.y < ARENA.WATER_Y) {
        f.active = false;
        if (f.mesh) { this.world.scene.remove(f.mesh); f.mesh = null; }
        continue;
      }

      // Player catch
      const dx = state.playerX - f.x;
      const dy = state.playerY - f.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const magnetRange = state.activePowerUps.some(p => p.type === 'magnet') ? 3 : 0.8;
      if (dist < magnetRange) {
        if (dist < 0.8) {
          // Caught!
          f.active = false;
          if (f.mesh) { this.world.scene.remove(f.mesh); f.mesh = null; }
          state.addScore(500);
          state.sessionFishCaught++;
          state.addCombo();
          this.spawnBurst(f.x, f.y, 0x00ff88, 8);
          this.audio?.playFishCatch();
        } else {
          // Magnet pull
          f.x += Math.sign(dx) * 3 * dt;
          f.y += Math.sign(dy) * 3 * dt;
        }
      }

      if (f.mesh) {
        f.mesh.position.set(f.x, f.y, f.z);
        f.mesh.rotation.z = Math.atan2(f.vy, 2);
      }
    }

    // Clean up
    state.fish = state.fish.filter(f => f.active);
  }

  private spawnFish(): void {
    const x = (Math.random() - 0.5) * ARENA.WIDTH;
    const fish: FishData = {
      id: state.getId(),
      x, y: ARENA.WATER_Y + 0.2, z: 0,
      vy: 5 + Math.random() * 4,
      active: true,
      timer: 3,
      mesh: null,
    };

    // Fish mesh
    const group = new Group();
    const bodyMat = new MeshStandardMaterial({
      color: 0x44ffaa, emissive: NEON_GREEN, emissiveIntensity: 0.5,
    });
    const body = new Mesh(new SphereGeometry(0.2, 6, 4), bodyMat);
    body.scale.set(1.5, 0.8, 0.8);
    group.add(body);

    // Tail
    const tailMat = new MeshStandardMaterial({
      color: 0x44ffaa, emissive: NEON_GREEN, emissiveIntensity: 0.4,
    });
    const tail = new Mesh(new ConeGeometry(0.15, 0.25, 3), tailMat);
    tail.position.set(-0.3, 0, 0);
    tail.rotation.z = Math.PI / 2;
    group.add(tail);

    // Eye
    const eyeMat = new MeshStandardMaterial({ color: 0xffffff, emissive: NEON_WHITE, emissiveIntensity: 0.5 });
    const eye = new Mesh(new SphereGeometry(0.04, 4, 3), eyeMat);
    eye.position.set(0.15, 0.05, 0.12);
    group.add(eye);

    group.position.set(x, ARENA.WATER_Y + 0.2, 0);
    this.world.scene.add(group);
    fish.mesh = group;
    state.fish.push(fish);

    // Splash particles
    this.spawnBurst(x, ARENA.WATER_Y + 0.3, 0x4488ff, 6);
  }

  // === LIGHTNING ===

  private updateLightning(dt: number, time: number): void {
    // Spawn lightning more frequently at higher phases
    const interval = Math.max(8 - state.currentPhase * 0.5, 3);
    this.lightningSpawnTimer -= dt;
    if (this.lightningSpawnTimer <= 0 && state.lightning.length < 2 && state.currentPhase >= 3) {
      this.lightningSpawnTimer = interval + Math.random() * 4;
      this.spawnLightning();
    }

    for (const l of state.lightning) {
      if (!l.active) continue;

      l.warningTimer -= dt;
      if (l.warningTimer > 0) {
        // Warning phase — blink the cloud
        if (l.mesh) {
          l.mesh.visible = Math.sin(time * 20) > 0;
        }
        continue;
      }

      l.timer -= dt;
      if (l.timer <= 0) {
        l.active = false;
        if (l.mesh) { this.world.scene.remove(l.mesh); l.mesh = null; }
        continue;
      }

      // Check player hit
      if (state.playerAlive && state.playerInvincible <= 0) {
        const hasImmunity = state.activePowerUps.some(p => p.type === 'lightning-immunity');
        if (!hasImmunity) {
          const dx = state.playerX - l.x;
          if (Math.abs(dx) < 1) {
            // Hit!
            this.popPlayerBalloon();
            state.shakeTimer = 0.3;
            state.shakeIntensity = 0.4;
            this.audio?.playLightning();
          }
        }
      }

      // Animate lightning bolt
      if (l.mesh) {
        l.mesh.visible = true;
        // Pulse effect
        const scale = 1 + Math.sin(time * 30) * 0.2;
        l.mesh.scale.set(scale, 1, scale);
      }
    }

    state.lightning = state.lightning.filter(l => l.active);
  }

  private spawnLightning(): void {
    const x = (Math.random() - 0.5) * ARENA.WIDTH * 0.8;
    const l: LightningData = {
      id: state.getId(),
      x, y: ARENA.MAX_Y - 2, z: 0,
      timer: 0.8,
      active: true,
      warningTimer: 1.5,
      mesh: null,
    };

    // Lightning visual: cloud + bolt
    const group = new Group();

    // Cloud
    const cloudMat = new MeshStandardMaterial({
      color: 0x444466, emissive: NEON_YELLOW, emissiveIntensity: 0.3,
      transparent: true, opacity: 0.7,
    });
    const cloud = new Mesh(new SphereGeometry(1, 8, 4), cloudMat);
    cloud.scale.set(2, 0.6, 1);
    cloud.position.set(0, 0, 0);
    group.add(cloud);

    // Bolt segments
    const boltMat = new MeshStandardMaterial({
      color: 0xffff44, emissive: NEON_YELLOW, emissiveIntensity: 1,
    });
    let by = -0.5;
    for (let i = 0; i < 5; i++) {
      const seg = new Mesh(new BoxGeometry(0.15, 2, 0.15), boltMat);
      seg.position.set((Math.random() - 0.5) * 0.5, by, 0);
      seg.rotation.z = (Math.random() - 0.5) * 0.3;
      group.add(seg);
      by -= 2;
    }

    group.position.set(x, ARENA.MAX_Y - 2, 0);
    this.world.scene.add(group);
    l.mesh = group;
    state.lightning.push(l);
  }

  // === POWER-UPS ===

  private updatePowerUps(dt: number, time: number): void {
    this.powerUpSpawnTimer -= dt;
    if (this.powerUpSpawnTimer <= 0 && state.powerUps.length < 2) {
      this.powerUpSpawnTimer = 8 + Math.random() * 12;
      this.spawnPowerUp();
    }

    for (const p of state.powerUps) {
      if (p.collected) continue;

      p.timer -= dt;
      if (p.timer <= 0) {
        p.collected = true;
        if (p.mesh) { this.world.scene.remove(p.mesh); p.mesh = null; }
        continue;
      }

      // Bob
      if (p.mesh) {
        p.mesh.position.y = p.y + Math.sin(time * 3) * 0.2;
        p.mesh.rotation.y += dt * 2;
      }

      // Player collect
      const dx = state.playerX - p.x;
      const dy = state.playerY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) {
        this.collectPowerUp(p);
      }
    }

    state.powerUps = state.powerUps.filter(p => !p.collected);
  }

  private spawnPowerUp(): void {
    const types: PowerUpType[] = ['shield', 'speed', 'extra-balloon', 'lightning-immunity', 'magnet', 'freeze'];
    const type = types[Math.floor(Math.random() * types.length)];
    const x = (Math.random() - 0.5) * ARENA.WIDTH * 0.7;
    const y = 3 + Math.random() * (ARENA.HEIGHT - 6);

    const pu: PowerUpData = {
      id: state.getId(),
      type, x, y, z: 0,
      timer: 12,
      mesh: null,
      collected: false,
    };

    // Power-up mesh
    const group = new Group();
    const colors: Record<PowerUpType, number> = {
      'shield': 0x00ffff,
      'speed': 0xffff00,
      'extra-balloon': 0xff88ff,
      'lightning-immunity': 0x44ff44,
      'magnet': 0xff8844,
      'freeze': 0x88ddff,
    };
    const c = colors[type];
    const mat = new MeshStandardMaterial({
      color: c, emissive: new Color(c), emissiveIntensity: 0.7,
    });

    if (type === 'shield') {
      const ring = new Mesh(new TorusGeometry(0.3, 0.08, 8, 12), mat);
      group.add(ring);
    } else if (type === 'extra-balloon') {
      const balloon = new Mesh(new SphereGeometry(0.25, 8, 6), mat);
      balloon.scale.set(1, 1.3, 1);
      group.add(balloon);
    } else {
      const box = new Mesh(new BoxGeometry(0.35, 0.35, 0.35), mat);
      group.add(box);
    }

    // Outer glow ring
    const glowMat = new MeshStandardMaterial({
      color: 0x000000, emissive: new Color(c), emissiveIntensity: 0.4,
      transparent: true, opacity: 0.3, side: DoubleSide,
    });
    const glow = new Mesh(new RingGeometry(0.4, 0.55, 16), glowMat);
    group.add(glow);

    // Power-up type indicator icon floating above
    const indicatorMat = new MeshStandardMaterial({
      color: c, emissive: new Color(c), emissiveIntensity: 0.6,
      transparent: true, opacity: 0.85,
    });
    let indicator: Mesh;
    if (type === 'shield') {
      // Shield: torus ring icon
      indicator = new Mesh(new TorusGeometry(0.12, 0.03, 6, 8), indicatorMat);
    } else if (type === 'speed') {
      // Speed: arrow/cone pointing right
      indicator = new Mesh(new ConeGeometry(0.1, 0.22, 4), indicatorMat);
      indicator.rotation.z = -Math.PI / 2;
    } else if (type === 'extra-balloon') {
      // Extra balloon: small sphere
      indicator = new Mesh(new SphereGeometry(0.1, 6, 4), indicatorMat);
      indicator.scale.set(1, 1.3, 1);
    } else if (type === 'lightning-immunity') {
      // Lightning immunity: diamond shape (rotated box)
      indicator = new Mesh(new BoxGeometry(0.12, 0.12, 0.12), indicatorMat);
      indicator.rotation.z = Math.PI / 4;
    } else {
      // Magnet or freeze: wide flat cylinder
      indicator = new Mesh(new CylinderGeometry(0.1, 0.1, 0.06, 8), indicatorMat);
    }
    indicator.position.set(0, 0.7, 0);
    group.add(indicator);

    group.position.set(x, y, 0);
    this.world.scene.add(group);
    pu.mesh = group;
    state.powerUps.push(pu);
  }

  private collectPowerUp(p: PowerUpData): void {
    p.collected = true;
    state.sessionPowerUps++;
    state.addScore(150);
    this.audio?.playPowerUp();

    if (p.type === 'extra-balloon' && state.playerBalloons < 3) {
      state.playerBalloons++;
      if (state.playerBalloons > state.playerMaxBalloons) {
        state.playerMaxBalloons = state.playerBalloons;
      }
      this.createPlayerBalloons();
    } else if (p.type === 'freeze') {
      // Freeze all enemies for 3 seconds
      state.freezeTimer = 3;
      this.spawnBurst(state.playerX, state.playerY, 0x88ddff, 20);
      // Visual freeze flash on all enemies
      for (const e of state.enemies) {
        if (e.alive && e.mesh) {
          this.spawnBurst(e.x, e.y, 0x88ddff, 6);
        }
      }
    } else {
      // Timed power-up
      const duration = p.type === 'shield' ? 15 : 8;
      state.activePowerUps.push({ type: p.type, remaining: duration });
    }

    this.spawnBurst(p.x, p.y, 0xffffff, 12);
    if (p.mesh) { this.world.scene.remove(p.mesh); p.mesh = null; }
  }

  private updateActivePowerUps(dt: number): void {
    for (let i = state.activePowerUps.length - 1; i >= 0; i--) {
      state.activePowerUps[i].remaining -= dt;
      if (state.activePowerUps[i].remaining <= 0) {
        state.activePowerUps.splice(i, 1);
      }
    }
  }

  // === COMBO ===

  private updateCombo(dt: number): void {
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
      }
    }
  }

  // === BONUS STAGE ===

  private startBonusPhase(): void {
    state.bonusPhaseActive = true;
    state.bonusItemsCollected = 0;
    const total = 10 + Math.floor(state.currentPhase / 10) * 3; // More items at higher levels
    state.bonusItemsTotal = total;
    this.bonusSpawnCount = total;
    this.bonusSpawnTimer = 0.5;
    this.enemySpawnQueue = 0;
    state.phaseEnemiesTotal = 0;
    state.phaseTimeLimit = 30 + total * 1.5; // Time limit for bonus
    state.phaseTimer = state.phaseTimeLimit;
  }

  private spawnBonusItem(): void {
    const types: Array<'coin' | 'gem' | 'star'> = ['coin', 'coin', 'coin', 'gem', 'gem', 'star'];
    const type = types[Math.floor(Math.random() * types.length)];
    const points = type === 'star' ? 500 : type === 'gem' ? 300 : 100;
    const x = (Math.random() - 0.5) * ARENA.WIDTH * 0.8;
    const y = ARENA.MAX_Y - 1;

    const item: BonusItemData = {
      id: state.getId(), type, x, y, z: 0,
      vy: -(1 + Math.random() * 1.5),
      points, collected: false, mesh: null,
    };

    const group = new Group();
    const colors = { coin: 0xffcc00, gem: 0x44ffff, star: 0xff88ff };
    const emissives = { coin: NEON_YELLOW, gem: NEON_CYAN, star: NEON_PINK };
    const mat = new MeshStandardMaterial({
      color: colors[type], emissive: emissives[type], emissiveIntensity: 0.7,
    });

    if (type === 'coin') {
      const coin = new Mesh(new CylinderGeometry(0.2, 0.2, 0.05, 12), mat);
      coin.rotation.x = Math.PI / 2;
      group.add(coin);
    } else if (type === 'gem') {
      const top = new Mesh(new ConeGeometry(0.18, 0.22, 6), mat);
      top.position.y = 0.11;
      group.add(top);
      const bot = new Mesh(new ConeGeometry(0.18, 0.15, 6), mat);
      bot.rotation.z = Math.PI;
      bot.position.y = -0.075;
      group.add(bot);
    } else {
      // Star: use two intersecting flat boxes
      const arm1 = new Mesh(new BoxGeometry(0.35, 0.1, 0.08), mat);
      group.add(arm1);
      const arm2 = new Mesh(new BoxGeometry(0.35, 0.1, 0.08), mat);
      arm2.rotation.z = Math.PI / 2;
      group.add(arm2);
      const arm3 = new Mesh(new BoxGeometry(0.35, 0.1, 0.08), mat);
      arm3.rotation.z = Math.PI / 4;
      group.add(arm3);
    }

    // Glow ring
    const glowMat = new MeshStandardMaterial({
      color: 0x000000, emissive: emissives[type], emissiveIntensity: 0.5,
      transparent: true, opacity: 0.3, side: DoubleSide,
    });
    const glow = new Mesh(new RingGeometry(0.3, 0.4, 12), glowMat);
    group.add(glow);

    group.position.set(x, y, 0);
    this.world.scene.add(group);
    item.mesh = group;
    state.bonusItems.push(item);
  }

  private updateBonusItems(dt: number, time: number): void {
    if (!state.bonusPhaseActive) return;

    // Spawn items
    if (this.bonusSpawnCount > 0) {
      this.bonusSpawnTimer -= dt;
      if (this.bonusSpawnTimer <= 0) {
        this.spawnBonusItem();
        this.bonusSpawnCount--;
        this.bonusSpawnTimer = 0.6 + Math.random() * 0.4;
      }
    }

    // Update items
    for (const item of state.bonusItems) {
      if (item.collected) continue;

      item.y += item.vy * dt;

      // Spin and bob
      if (item.mesh) {
        item.mesh.position.set(item.x, item.y, item.z);
        item.mesh.rotation.y = time * 3;
      }

      // Water = missed
      if (item.y < ARENA.WATER_Y + 0.5) {
        item.collected = true;
        if (item.mesh) { this.world.scene.remove(item.mesh); item.mesh = null; }
        continue;
      }

      // Player collection
      const dx = state.playerX - item.x;
      const dy = state.playerY - item.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Magnet power-up: attract nearby items
      const hasMagnet = state.activePowerUps.some(p => p.type === 'magnet');
      if (hasMagnet && dist < 3) {
        item.x += dx * 3 * dt;
        if (item.mesh) item.mesh.position.x = item.x;
      }
      if (dist < 0.8) {
        item.collected = true;
        state.bonusItemsCollected++;
        state.addScore(item.points);
        this.spawnBurst(item.x, item.y, item.type === 'star' ? 0xff88ff : item.type === 'gem' ? 0x44ffff : 0xffcc00, 8);
        if (item.mesh) { this.world.scene.remove(item.mesh); item.mesh = null; }
      }
    }

    // Check bonus phase complete
    const remaining = state.bonusItems.filter(i => !i.collected).length;
    if (remaining === 0 && this.bonusSpawnCount === 0) {
      this.endBonusPhase();
    }
  }

  private endBonusPhase(): void {
    // Clean up remaining items
    for (const item of state.bonusItems) {
      if (item.mesh) { this.world.scene.remove(item.mesh); item.mesh = null; }
    }
    state.bonusItems = [];
    state.bonusPhaseActive = false;
    // Bonus score for collecting everything
    if (state.bonusItemsCollected === state.bonusItemsTotal) {
      state.addScore(2000); // Perfect bonus
    }
    state.phase = 'phase-complete';
    state.phaseTransitionTimer = 3;
    state.addScore(state.currentPhase * 500);
  }

  // === CLOUDS ===

  private buildClouds(): void {
    const cloudMat = new MeshStandardMaterial({
      color: 0x223355, emissive: new Color(0x112244),
      emissiveIntensity: 0.2, transparent: true, opacity: 0.25,
    });
    for (let i = 0; i < 12; i++) {
      const scale = 1.5 + Math.random() * 2.5;
      const cloud = new Mesh(new SphereGeometry(1, 6, 4), cloudMat.clone());
      cloud.scale.set(scale * 2, scale * 0.5, scale);
      const x = (Math.random() - 0.5) * ARENA.WIDTH * 2;
      const y = ARENA.MAX_Y - 3 + Math.random() * 4;
      const z = -4 - Math.random() * 6;
      cloud.position.set(x, y, z);

      // Add cloud puffs for shape
      const puff1 = new Mesh(new SphereGeometry(0.6, 5, 3), cloudMat.clone());
      puff1.position.set(scale * 0.6, scale * 0.15, 0);
      cloud.add(puff1);
      const puff2 = new Mesh(new SphereGeometry(0.5, 5, 3), cloudMat.clone());
      puff2.position.set(-scale * 0.5, scale * 0.1, 0);
      cloud.add(puff2);

      this.world.scene.add(cloud);
      this.clouds.push({
        mesh: cloud, x, y, z,
        speed: 0.2 + Math.random() * 0.4,
        scale,
      });
    }
  }

  private updateClouds(dt: number): void {
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > ARENA.MAX_X + 15) c.x = ARENA.MIN_X - 15;
      c.mesh.position.x = c.x;
      // Subtle vertical drift
      c.mesh.position.y = c.y + Math.sin(c.x * 0.3) * 0.3;
    }
  }

  // === SHIELD VISUAL ===

  private buildShieldBubble(): void {
    const mat = new MeshStandardMaterial({
      color: 0x00ffff, emissive: NEON_CYAN, emissiveIntensity: 0.3,
      transparent: true, opacity: 0.15, side: DoubleSide,
    });
    this.shieldBubble = new Mesh(new SphereGeometry(0.8, 12, 8), mat);
    this.shieldBubble.visible = false;
    this.world.scene.add(this.shieldBubble);
  }

  private updateShieldBubble(time: number): void {
    if (!this.shieldBubble) return;
    const hasShield = state.activePowerUps.some(p => p.type === 'shield');
    this.shieldBubble.visible = hasShield && state.phase === 'playing';
    if (hasShield) {
      this.shieldBubble.position.set(state.playerX, state.playerY, state.playerZ);
      const pulse = 0.8 + Math.sin(time * 4) * 0.08;
      this.shieldBubble.scale.setScalar(pulse);
      const mat = this.shieldBubble.material as MeshStandardMaterial;
      mat.opacity = 0.12 + Math.sin(time * 6) * 0.05;
    }
  }

  // === NEON TRAIL ===

  private updateTrail(dt: number): void {
    if (state.phase !== 'playing' || !state.playerAlive) return;

    const speed = Math.sqrt(state.playerVX * state.playerVX + state.playerVY * state.playerVY);
    state.trailTimer -= dt;

    // Only emit trail when moving fast
    if (speed > 3 && state.trailTimer <= 0) {
      state.trailTimer = 0.04;
      const tc = state.getThemeColors();
      const trailMat = new MeshStandardMaterial({
        color: tc.primary, emissive: new Color(tc.primary), emissiveIntensity: 0.7,
        transparent: true, opacity: 0.6,
      });
      const trailMesh = new Mesh(new SphereGeometry(0.06, 4, 3), trailMat);
      trailMesh.position.set(state.playerX, state.playerY, state.playerZ);
      this.world.scene.add(trailMesh);
      this.trailNodes.push({ mesh: trailMesh, life: 0.4 });
    }

    // Update trail nodes
    for (let i = this.trailNodes.length - 1; i >= 0; i--) {
      const t = this.trailNodes[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.world.scene.remove(t.mesh);
        this.trailNodes.splice(i, 1);
      } else {
        const alpha = t.life / 0.4;
        (t.mesh.material as MeshStandardMaterial).opacity = alpha * 0.6;
        t.mesh.scale.setScalar(alpha * 0.12);
      }
    }

    // Cap
    while (this.trailNodes.length > 30) {
      const t = this.trailNodes.shift()!;
      this.world.scene.remove(t.mesh);
    }
  }

  // === ICICLE HAZARDS (Phase 5+) ===

  private updateIcicles(dt: number): void {
    if (state.currentPhase < 5) return;

    // Spawn icicles from ceiling
    this.icicleSpawnTimer -= dt;
    const interval = Math.max(5 - state.currentPhase * 0.3, 1.5);
    if (this.icicleSpawnTimer <= 0 && state.icicles.length < 4) {
      this.icicleSpawnTimer = interval + Math.random() * 3;
      this.spawnIcicle();
    }

    for (const ice of state.icicles) {
      if (!ice.active) continue;

      // Warning phase: hang at ceiling for 1.5s before dropping
      if (ice.vy === 0) {
        ice.y -= 0; // stationary
        // After a delay, start falling
        ice.vy = -0.01; // trigger mark
      } else if (ice.vy < -0.01) {
        ice.y += ice.vy * dt;
        ice.vy -= 12 * dt; // accelerate downward
      } else {
        // Transition from warning to falling
        ice.vy = -2;
      }

      // Player collision
      if (state.playerAlive && state.playerInvincible <= 0 && ice.vy < -1) {
        const dx = state.playerX - ice.x;
        const dy = state.playerY - ice.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.6) {
          this.popPlayerBalloon();
          ice.active = false;
          if (ice.mesh) { this.world.scene.remove(ice.mesh); ice.mesh = null; }
          this.spawnBurst(ice.x, ice.y, 0x88ccff, 8);
          state.shakeTimer = 0.15;
          state.shakeIntensity = 0.15;
          this.audio?.playIcicle();
          continue;
        }
      }

      // Hit water or floor
      if (ice.y < ARENA.WATER_Y + 0.5) {
        ice.active = false;
        if (ice.mesh) { this.world.scene.remove(ice.mesh); ice.mesh = null; }
        this.spawnBurst(ice.x, ARENA.WATER_Y + 0.5, 0x88ccff, 6);
        continue;
      }

      // Update mesh
      if (ice.mesh) {
        ice.mesh.position.set(ice.x, ice.y, ice.z);
        // Shimmer effect
        const mat = (ice.mesh as Mesh).material as MeshStandardMaterial;
        if (mat && ice.vy < -1) {
          mat.emissiveIntensity = 0.5 + Math.random() * 0.3;
        }
      }
    }

    state.icicles = state.icicles.filter(i => i.active);
  }

  private spawnIcicle(): void {
    const x = (Math.random() - 0.5) * ARENA.WIDTH * 0.8;
    const icicle: IcicleData = {
      id: state.getId(), x, y: ARENA.MAX_Y - 0.5, z: 0,
      vy: 0, active: true, mesh: null,
    };

    const mat = new MeshStandardMaterial({
      color: 0x88ccff, emissive: new Color(0x44aaff),
      emissiveIntensity: 0.4, transparent: true, opacity: 0.85,
    });
    const mesh = new Mesh(coneGeo, mat);
    mesh.scale.set(0.6, 1.8, 0.6);
    mesh.rotation.x = Math.PI; // Point downward
    mesh.position.set(x, ARENA.MAX_Y - 0.5, 0);
    this.world.scene.add(mesh);
    icicle.mesh = mesh;

    // Warning indicator: small glow at spawn point
    this.spawnParticle(x, ARENA.MAX_Y - 1, 0, 0, -0.5, 0, 1.2, 0x88ccff, 0.1);

    state.icicles.push(icicle);
  }

  // === WIND ZONES (Phase 4+) ===

  private updateWindZones(dt: number): void {
    if (state.currentPhase < 4) return;

    this.windZoneSpawnTimer -= dt;
    const interval = Math.max(12 - state.currentPhase * 0.5, 5);
    if (this.windZoneSpawnTimer <= 0 && state.windZones.length < 2) {
      this.windZoneSpawnTimer = interval + Math.random() * 6;
      this.spawnWindZone();
    }

    for (const w of state.windZones) {
      if (!w.active) continue;

      w.timer -= dt;
      if (w.timer <= 0) {
        w.active = false;
        if (w.mesh) { this.world.scene.remove(w.mesh); w.mesh = null; }
        continue;
      }

      // Apply force to player if inside
      if (state.playerAlive) {
        const inX = state.playerX > w.x - w.width / 2 && state.playerX < w.x + w.width / 2;
        const inY = state.playerY > w.y - w.height / 2 && state.playerY < w.y + w.height / 2;
        if (inX && inY) {
          state.playerVX += w.forceX * dt;
          state.playerVY += w.forceY * dt;
        }
      }

      // Apply force to enemies inside
      for (const e of state.enemies) {
        if (!e.alive) continue;
        const inX = e.x > w.x - w.width / 2 && e.x < w.x + w.width / 2;
        const inY = e.y > w.y - w.height / 2 && e.y < w.y + w.height / 2;
        if (inX && inY) {
          e.vx += w.forceX * dt * 0.5;
          e.vy += w.forceY * dt * 0.5;
        }
      }

      // Visual animation — particles flowing in wind direction
      if (w.mesh) {
        const mat = (w.mesh as Mesh).material as MeshStandardMaterial;
        mat.opacity = 0.08 + Math.sin(w.timer * 4) * 0.03;
      }

      // Spawn wind particle every few frames
      if (Math.random() < dt * 5) {
        const px = w.x + (Math.random() - 0.5) * w.width;
        const py = w.y + (Math.random() - 0.5) * w.height;
        this.spawnParticle(px, py, 0, w.forceX * 0.3, w.forceY * 0.3, 0, 0.5, 0x88aacc, 0.04);
      }
    }

    state.windZones = state.windZones.filter(w => w.active);
  }

  private spawnWindZone(): void {
    const x = (Math.random() - 0.5) * ARENA.WIDTH * 0.6;
    const y = 3 + Math.random() * (ARENA.HEIGHT - 6);
    const isHorizontal = Math.random() > 0.4;
    const forceDir = Math.random() > 0.5 ? 1 : -1;

    const wind: WindZoneData = {
      id: state.getId(), x, y,
      width: isHorizontal ? 6 + Math.random() * 4 : 3,
      height: isHorizontal ? 3 : 5 + Math.random() * 3,
      forceX: isHorizontal ? forceDir * (6 + Math.random() * 4) : 0,
      forceY: isHorizontal ? 0 : forceDir * (4 + Math.random() * 3),
      timer: 6 + Math.random() * 6,
      active: true, mesh: null,
    };

    // Wind zone visual: transparent colored rectangle
    const mat = new MeshStandardMaterial({
      color: isHorizontal ? 0x4488aa : 0x44aa88,
      emissive: isHorizontal ? new Color(0x224466) : new Color(0x226644),
      emissiveIntensity: 0.3, transparent: true, opacity: 0.1,
      side: DoubleSide,
    });
    const mesh = new Mesh(new PlaneGeometry(wind.width, wind.height), mat);
    mesh.position.set(x, y, 0.1);
    this.world.scene.add(mesh);
    wind.mesh = mesh;
    state.windZones.push(wind);
  }

  // === BOSS SPECIAL ATTACKS ===

  private bomberDropBomb(bomber: EnemyData): void {
    // Drop an icicle-like projectile from bomber position
    const bomb: IcicleData = {
      id: state.getId(),
      x: bomber.x, y: bomber.y - 0.5, z: 0,
      vy: -6, active: true, mesh: null,
    };

    const mat = new MeshStandardMaterial({
      color: 0xff44ff, emissive: NEON_PINK, emissiveIntensity: 0.6,
      transparent: true, opacity: 0.9,
    });
    const mesh = new Mesh(new SphereGeometry(0.15, 6, 4), mat);
    mesh.position.set(bomber.x, bomber.y - 0.5, 0);
    this.world.scene.add(mesh);
    bomb.mesh = mesh;
    state.icicles.push(bomb); // Reuse icicle collision logic
    this.spawnParticle(bomber.x, bomber.y - 0.3, 0, 0, -1, 0, 0.3, 0xff44ff, 0.08);
  }

  // === ENVIRONMENT DECORATIONS ===

  private buildEnvironment(): void {
    if (this.decorationsBuilt) return;
    this.decorationsBuilt = true;

    const scene = this.world.scene;

    // Neon columns along arena edges
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1;
      const idx = i % 3;
      const x = side * (ARENA.MAX_X + 1.5);
      const y = (idx + 1) * (ARENA.HEIGHT / 4);

      const colMat = new MeshStandardMaterial({
        color: 0x000000,
        emissive: i % 2 === 0 ? NEON_CYAN : NEON_PINK,
        emissiveIntensity: 0.25,
        transparent: true, opacity: 0.4,
      });
      const col = new Mesh(new CylinderGeometry(0.15, 0.15, ARENA.HEIGHT, 6), colMat);
      col.position.set(x, ARENA.HEIGHT / 2, -2);
      scene.add(col);
      this.envDecorations.push(col);

      // Ring accent on column
      const ringMat = new MeshStandardMaterial({
        color: 0x000000,
        emissive: i % 2 === 0 ? NEON_PINK : NEON_CYAN,
        emissiveIntensity: 0.5,
        transparent: true, opacity: 0.6,
      });
      const ring = new Mesh(new TorusGeometry(0.25, 0.04, 6, 12), ringMat);
      ring.position.set(x, y, -2);
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);
      this.envDecorations.push(ring);
    }

    // Bottom pipe/rail along water edge
    const pipeMat = new MeshStandardMaterial({
      color: 0x112233, emissive: NEON_BLUE, emissiveIntensity: 0.2,
      transparent: true, opacity: 0.5,
    });
    const pipe = new Mesh(new CylinderGeometry(0.08, 0.08, ARENA.WIDTH + 4, 8), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, ARENA.WATER_Y + 0.05, 1);
    scene.add(pipe);
    this.envDecorations.push(pipe);

    // Floating neon rings in background (decorative)
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 8;
      const y = 5 + Math.random() * 8;
      const nMat = new MeshStandardMaterial({
        color: 0x000000,
        emissive: [NEON_CYAN, NEON_PINK, NEON_GREEN, NEON_YELLOW][i],
        emissiveIntensity: 0.2,
        transparent: true, opacity: 0.2,
      });
      const nRing = new Mesh(new TorusGeometry(1 + Math.random(), 0.05, 8, 24), nMat);
      nRing.position.set(x, y, -5 - Math.random() * 3);
      nRing.rotation.x = Math.random() * Math.PI;
      nRing.rotation.y = Math.random() * Math.PI;
      scene.add(nRing);
      this.envDecorations.push(nRing);
    }

    // Starfield enhancement — brighter stars with varying sizes
    const starGeo = new BufferGeometry();
    const starPositions: number[] = [];
    const starSizes: number[] = [];
    for (let i = 0; i < 200; i++) {
      starPositions.push(
        (Math.random() - 0.5) * 60,
        Math.random() * 30,
        -8 - Math.random() * 15,
      );
      starSizes.push(0.5 + Math.random() * 2);
    }
    starGeo.setAttribute('position', new Float32BufferAttribute(starPositions, 3));
    starGeo.setAttribute('size', new Float32BufferAttribute(starSizes, 1));
    const starMat = new PointsMaterial({
      color: 0xffffff, size: 0.1,
      transparent: true, opacity: 0.6,
      blending: AdditiveBlending,
    });
    const stars = new Points(starGeo, starMat);
    scene.add(stars);
    this.envDecorations.push(stars as unknown as Object3D);
  }

  private updateEnvironmentDecorations(time: number): void {
    // Animate neon rings in background
    for (let i = 0; i < this.envDecorations.length; i++) {
      const d = this.envDecorations[i];
      if (d instanceof Mesh && d.geometry?.type === 'TorusGeometry') {
        d.rotation.z = time * 0.3 + i * 0.5;
        const mat = d.material as MeshStandardMaterial;
        if (mat.emissiveIntensity !== undefined) {
          mat.emissiveIntensity = 0.15 + Math.sin(time * 1.5 + i * 2) * 0.08;
        }
      }
    }
  }

  // === BALLOON TRIP SCROLLING ===

  private initBalloonTripScrolling(): void {
    // Clear old static obstacles
    this.tripObstacles = [];
    this.tripSpawnX = 15;

    // Spawn initial set of obstacles ahead
    for (let i = 0; i < 6; i++) {
      this.spawnTripObstacle(15 + i * 8);
    }
  }

  private spawnTripObstacle(xPos: number): void {
    const gapY = 3 + Math.random() * 9;
    const gapH = Math.max(3.5 - state.currentPhase * 0.1, 2.2);

    const group = new Group();
    const mat = new MeshStandardMaterial({
      color: 0x000000, emissive: NEON_YELLOW, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.6,
    });

    // Upper column
    const upperH = ARENA.MAX_Y - gapY - gapH / 2;
    if (upperH > 0.5) {
      const upper = new Mesh(new BoxGeometry(0.4, upperH, 0.4), mat.clone());
      upper.position.set(0, gapY + gapH / 2 + upperH / 2, 0);
      group.add(upper);

      // Spark at tip
      const sparkMat = new MeshStandardMaterial({
        color: 0xffff00, emissive: NEON_YELLOW, emissiveIntensity: 1,
      });
      const spark = new Mesh(new SphereGeometry(0.12, 4, 3), sparkMat);
      spark.position.set(0, gapY + gapH / 2, 0);
      group.add(spark);
    }

    // Lower column
    const lowerH = gapY - gapH / 2 - ARENA.WATER_Y;
    if (lowerH > 0.5) {
      const lower = new Mesh(new BoxGeometry(0.4, lowerH, 0.4), mat.clone());
      lower.position.set(0, ARENA.WATER_Y + lowerH / 2, 0);
      group.add(lower);

      const sparkMat2 = new MeshStandardMaterial({
        color: 0xffff00, emissive: NEON_YELLOW, emissiveIntensity: 1,
      });
      const spark2 = new Mesh(new SphereGeometry(0.12, 4, 3), sparkMat2);
      spark2.position.set(0, gapY - gapH / 2, 0);
      group.add(spark2);
    }

    group.position.set(xPos, 0, 0);
    this.world.scene.add(group);
    this.tripObstacles.push({
      mesh: group, x: xPos, gapY, gapH, scored: false,
    });
    this.tripSpawnX = xPos;

    // Spawn bonus coins in the gap (Balloon Trip reward)
    if (Math.random() < 0.6) {
      const coinCount = 2 + Math.floor(Math.random() * 3);
      for (let c = 0; c < coinCount; c++) {
        const coinY = gapY + (c - coinCount / 2) * 0.8;
        const coinItem: BonusItemData = {
          id: state.getId(),
          type: 'coin',
          x: xPos + (Math.random() - 0.5) * 0.5,
          y: coinY,
          z: 0,
          vy: 0,
          points: 50,
          collected: false,
          mesh: null,
        };
        const coinMat = new MeshStandardMaterial({
          color: 0xffcc00, emissive: NEON_YELLOW, emissiveIntensity: 0.7,
        });
        const coinMesh = new Mesh(new CylinderGeometry(0.12, 0.12, 0.03, 8), coinMat);
        coinMesh.rotation.x = Math.PI / 2;
        coinMesh.position.set(coinItem.x, coinItem.y, 0);
        this.world.scene.add(coinMesh);
        coinItem.mesh = coinMesh;
        state.bonusItems.push(coinItem);
      }
    }
  }

  private updateBalloonTrip(dt: number): void {
    if (state.mode !== 'balloon-trip' || state.phase !== 'playing') return;

    const speed = state.tripSpeed + state.tripDistance * 0.003;
    state.tripDistance += speed * dt;

    // Scroll obstacles toward player
    for (let i = this.tripObstacles.length - 1; i >= 0; i--) {
      const obs = this.tripObstacles[i];
      obs.x -= speed * dt;
      obs.mesh.position.x = obs.x;

      // Score when passing
      if (!obs.scored && obs.x < state.playerX - 1) {
        obs.scored = true;
        state.addScore(100);
        state.addCombo();
      }

      // Collision check
      if (state.playerAlive && state.playerInvincible <= 0) {
        const dx = state.playerX - obs.x;
        if (Math.abs(dx) < 0.6) {
          // Check if player is in the gap
          const inGap = state.playerY > obs.gapY - obs.gapH / 2 + 0.3
                     && state.playerY < obs.gapY + obs.gapH / 2 - 0.3;
          if (!inGap) {
            this.popPlayerBalloon();
            state.shakeTimer = 0.15;
            state.shakeIntensity = 0.2;
          }
        }
      }

      // Remove off-screen
      if (obs.x < ARENA.MIN_X - 5) {
        this.world.scene.remove(obs.mesh);
        this.tripObstacles.splice(i, 1);
      }
    }

    // Spawn new obstacles ahead
    const farthest = this.tripObstacles.length > 0 ?
      Math.max(...this.tripObstacles.map(o => o.x)) : state.playerX;
    if (farthest < state.playerX + 40) {
      this.spawnTripObstacle(farthest + 6 + Math.random() * 4);
    }

    // Update HUD with trip distance
    state.currentPhase = Math.floor(state.tripDistance / 50) + 1;

    // Scroll and collect trip coins (bonus items in Balloon Trip mode)
    for (let i = state.bonusItems.length - 1; i >= 0; i--) {
      const item = state.bonusItems[i];
      if (item.collected) continue;

      // Scroll with the world
      item.x -= speed * dt;
      if (item.mesh) {
        item.mesh.position.x = item.x;
        item.mesh.rotation.y += dt * 4; // Spin
      }

      // Player collection
      const dx = state.playerX - item.x;
      const dy = state.playerY - item.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.8) {
        item.collected = true;
        state.addScore(item.points);
        this.spawnBurst(item.x, item.y, 0xffcc00, 4);
        if (item.mesh) {
          this.world.scene.remove(item.mesh);
          item.mesh = null;
        }
        state.bonusItems.splice(i, 1);
        continue;
      }

      // Remove off-screen
      if (item.x < ARENA.MIN_X - 5) {
        if (item.mesh) {
          this.world.scene.remove(item.mesh);
          item.mesh = null;
        }
        state.bonusItems.splice(i, 1);
      }
    }
  }

  private updateBossAttacks(dt: number): void {
    if (!state.bossActive) return;

    state.bossAttackCooldown -= dt;
    if (state.bossAttackCooldown > 0) return;

    const boss = state.enemies.find(e => e.type === 'boss' && e.alive);
    if (!boss) return;

    state.bossAttackCooldown = 4 + Math.random() * 3;
    const diffMult = state.getDifficultyMultiplier();

    // Pick random attack
    const attackRoll = Math.random();

    if (attackRoll < 0.35) {
      // Lightning call — spawn lightning at player position
      this.bossLightningCall(boss);
    } else if (attackRoll < 0.65) {
      // Shockwave — push player away from boss
      this.bossShockwave(boss);
    } else {
      // Minion spawn — summon 1-2 basic enemies
      this.bossSpawnMinions(boss, Math.ceil(diffMult));
    }
  }

  private bossLightningCall(boss: EnemyData): void {
    this.audio?.playBossAttack();
    // Spawn a lightning bolt aimed at the player's current X
    const l: LightningData = {
      id: state.getId(),
      x: state.playerX, y: ARENA.MAX_Y - 2, z: 0,
      timer: 0.8, active: true, warningTimer: 1.2,
      mesh: null,
    };

    const group = new Group();
    const cloudMat = new MeshStandardMaterial({
      color: 0x664444, emissive: NEON_RED, emissiveIntensity: 0.4,
      transparent: true, opacity: 0.7,
    });
    const cloud = new Mesh(new SphereGeometry(0.8, 6, 4), cloudMat);
    cloud.scale.set(1.5, 0.5, 1);
    group.add(cloud);

    const boltMat = new MeshStandardMaterial({
      color: 0xff4444, emissive: NEON_RED, emissiveIntensity: 1,
    });
    let by = -0.5;
    for (let i = 0; i < 5; i++) {
      const seg = new Mesh(new BoxGeometry(0.18, 2, 0.18), boltMat);
      seg.position.set((Math.random() - 0.5) * 0.4, by, 0);
      seg.rotation.z = (Math.random() - 0.5) * 0.4;
      group.add(seg);
      by -= 2;
    }

    group.position.set(state.playerX, ARENA.MAX_Y - 2, 0);
    this.world.scene.add(group);
    l.mesh = group;
    state.lightning.push(l);

    // Visual indicator on boss
    this.spawnBurst(boss.x, boss.y + 1, 0xff4444, 6);
  }

  private bossShockwave(boss: EnemyData): void {
    this.audio?.playBossAttack();
    // Push player away from boss
    const dx = state.playerX - boss.x;
    const dy = state.playerY - boss.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.5);
    const force = 12 / dist;

    if (dist < 8) {
      state.playerVX += (dx / dist) * force;
      state.playerVY += (dy / dist) * force * 0.5;
      state.shakeTimer = 0.2;
      state.shakeIntensity = 0.2;
    }

    // Shockwave visual ring
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      this.spawnParticle(
        boss.x + Math.cos(angle) * 0.5,
        boss.y + Math.sin(angle) * 0.5,
        0,
        Math.cos(angle) * 6,
        Math.sin(angle) * 6,
        0,
        0.6,
        0xff6644,
        0.08,
      );
    }
  }

  private bossSpawnMinions(boss: EnemyData, count: number): void {
    const minions = Math.min(count, 2);
    for (let i = 0; i < minions; i++) {
      const e: EnemyData = {
        id: state.getId(),
        type: 'basic',
        x: boss.x + (i === 0 ? -2 : 2),
        y: boss.y,
        z: 0,
        vx: (i === 0 ? -2 : 2),
        vy: 1,
        balloons: 1,
        maxBalloons: 1,
        alive: true,
        grounded: false,
        groundTimer: 0,
        flapCooldown: 0,
        aiTimer: Math.random(),
        mesh: null,
        balloonMeshes: [],
      };
      this.createEnemyMesh(e);
      state.enemies.push(e);
    }
    this.spawnBurst(boss.x, boss.y, 0xff8844, 10);
  }

  // === PHASE TIMER ===

  private updatePhaseTimer(dt: number): void {
    if (state.mode !== 'arcade' || state.phaseTimeLimit <= 0) return;

    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      state.phaseTimer = 0;

      // Bonus phase timeout
      if (state.bonusPhaseActive) {
        this.endBonusPhase();
        return;
      }

      // Time's up — bonus score if enemies remain, phase still progresses
      // Damage remaining enemies (pop one balloon each)
      for (const e of state.enemies) {
        if (e.alive && e.balloons > 0) {
          e.balloons--;
          if (e.balloons <= 0) {
            this.defeatEnemy(e);
          } else {
            this.updateEnemyBalloons(e);
          }
        }
      }
    }
  }

  // === PHASE MANAGEMENT ===

  startGame(mode: 'arcade' | 'balloon-trip' | 'survival'): void {
    state.mode = mode;
    state.resetForGame();
    state.phase = 'playing';
    this.generatePlatforms();
    this.createPlayerBalloons();
    this.fishSpawnTimer = 3;
    this.lightningSpawnTimer = 10;
    this.powerUpSpawnTimer = 8;
    this.icicleSpawnTimer = 8;
    this.windZoneSpawnTimer = 12;
    this.bossSpecialTimer = 5;

    if (mode === 'survival') {
      this.enemySpawnQueue = 3;
      this.spawnTimer = 1;
      state.phaseEnemiesTotal = 999;
      state.phaseTimeLimit = 0;
    } else if (mode === 'balloon-trip') {
      this.enemySpawnQueue = 0;
      state.phaseEnemiesTotal = 999;
      state.phaseTimeLimit = 0;
      this.initBalloonTripScrolling();
    } else {
      // Arcade: set phase timer (generous time limit)
      state.phaseTimeLimit = 60 + state.currentPhase * 10;
      state.phaseTimer = state.phaseTimeLimit;
      this.spawnPhaseEnemies();
    }
  }

  private spawnPhaseEnemies(): void {
    const count = state.getEnemyCountForPhase();
    state.phaseEnemiesTotal = count;
    state.phaseEnemiesDefeated = 0;
    this.enemySpawnQueue = count;
    this.spawnTimer = 0.5;

    // Decide formation for this phase (higher phases get formations more often)
    if (state.currentPhase >= 3 && Math.random() < 0.4 + state.currentPhase * 0.03) {
      const formations: FormationType[] = ['v-shape', 'line', 'circle'];
      this.nextFormation = formations[Math.floor(Math.random() * formations.length)];
    } else {
      this.nextFormation = 'none';
    }
  }

  private checkPhaseComplete(): void {
    if (state.mode === 'survival') {
      // Survival: continuously spawn more enemies
      const alive = state.enemies.filter(e => e.alive).length;
      if (alive < 2 && this.enemySpawnQueue === 0) {
        state.currentPhase++;
        const count = Math.min(3 + Math.floor(state.currentPhase * 0.5), 8);
        this.enemySpawnQueue = count;
        this.spawnTimer = 0.5;
        state.addScore(state.currentPhase * 200);
        // Spawn bonus power-up every 3 waves
        if (state.currentPhase % 3 === 0) {
          this.powerUpSpawnTimer = 0.5;
        }
      }
      return;
    }

    if (state.mode === 'balloon-trip') {
      // Balloon Trip doesn't end from enemies
      return;
    }

    // Bonus phase completion is handled by updateBonusItems
    if (state.bonusPhaseActive) return;

    const aliveEnemies = state.enemies.filter(e => e.alive).length;
    if (aliveEnemies === 0 && this.enemySpawnQueue === 0 && state.phaseEnemiesTotal > 0) {
      state.phase = 'phase-complete';
      state.phaseTransitionTimer = 3;
      state.addScore(state.currentPhase * 500);
      this.audio?.playPhaseComplete();
      this.triggerScreenFlash(0x00ffff, 0.4);
    }
  }

  private startNextPhase(): void {
    state.currentPhase++;
    state.phase = 'playing';
    state.resetPlayerForPhase();
    this.createPlayerBalloons();

    // Clean up old enemies
    for (const e of state.enemies) {
      if (e.mesh) this.world.scene.remove(e.mesh);
    }
    state.enemies = [];
    for (const f of state.fish) {
      if (f.mesh) this.world.scene.remove(f.mesh);
    }
    state.fish = [];
    for (const l of state.lightning) {
      if (l.mesh) this.world.scene.remove(l.mesh);
    }
    state.lightning = [];
    for (const p of state.powerUps) {
      if (p.mesh) this.world.scene.remove(p.mesh);
    }
    state.powerUps = [];
    for (const ice of state.icicles) {
      if (ice.mesh) this.world.scene.remove(ice.mesh);
    }
    state.icicles = [];
    for (const w of state.windZones) {
      if (w.mesh) this.world.scene.remove(w.mesh);
    }
    state.windZones = [];
    state.activePowerUps = [];
    // Clean bonus items
    for (const item of state.bonusItems) {
      if (item.mesh) this.world.scene.remove(item.mesh);
    }
    state.bonusItems = [];
    state.bonusPhaseActive = false;
    // Clean score drops
    for (const d of state.scoreDrops) {
      if (d.mesh) this.world.scene.remove(d.mesh);
    }
    state.scoreDrops = [];
    // Clean whirlpools
    for (const wp of state.whirlpools) {
      if (wp.mesh) this.world.scene.remove(wp.mesh);
    }
    state.whirlpools = [];
    state.freezeTimer = 0;
    state.dashCooldown = 0;
    state.dashTimer = 0;

    this.generatePlatforms();

    // Check if this is a bonus phase (every 10th phase)
    if (state.mode === 'arcade' && state.isBonusPhase()) {
      this.startBonusPhase();
    } else {
      this.spawnPhaseEnemies();
      // Phase timer for arcade
      if (state.mode === 'arcade') {
        state.phaseTimeLimit = 60 + state.currentPhase * 10;
        state.phaseTimer = state.phaseTimeLimit;
      }
    }

    this.fishSpawnTimer = 3;
    this.lightningSpawnTimer = Math.max(8 - state.currentPhase * 0.5, 3);
    this.powerUpSpawnTimer = 8;
    this.icicleSpawnTimer = 6;
    this.windZoneSpawnTimer = 10;
  }

  // === VISUALS ===

  private updateVisuals(dt: number, time: number): void {
    // Water shimmer
    if (this.waterPlane) {
      const mat = this.waterPlane.material as MeshStandardMaterial;
      mat.emissiveIntensity = 0.4 + Math.sin(time * 2) * 0.1;
    }

    // Phase-based background color evolution
    const scene = this.world.scene;
    if (state.phase === 'playing' || state.phase === 'phase-complete') {
      const phaseGroup = Math.floor((state.currentPhase - 1) / 5);
      const bgColors = [
        0x000411, // Phase 1-5: deep midnight blue
        0x110411, // Phase 6-10: dark purple
        0x041104, // Phase 11-15: deep forest
        0x110800, // Phase 16-20: warm dark
        0x040411, // Phase 21+: deep indigo
      ];
      const targetColor = new Color(bgColors[phaseGroup % bgColors.length]);
      if (scene.background instanceof Color) {
        scene.background.lerp(targetColor, dt * 0.5);
      }
    }
  }

  // === XR INPUT ===

  private handleXRInput(dt: number): void {
    const xr = this.world.input?.xr;
    if (!xr) return;

    const right = xr.gamepads?.right;
    const left = xr.gamepads?.left;

    // Grip button for pause (either hand)
    if (right?.getButtonDown?.('xr-standard-squeeze') || left?.getButtonDown?.('xr-standard-squeeze')) {
      if (state.phase === 'playing') {
        state.phase = 'paused';
        return;
      }
    }

    if (right) {
      // Trigger = flap
      if (right.getButtonDown?.('xr-standard-trigger')) {
        if (state.playerBalloons > 0 && this.flapCooldown <= 0) {
          state.playerVY = Math.min(state.playerVY + 4, 8);
          this.flapCooldown = 0.15;
          this.animateFlap();
        }
      }

      // A button = dash
      if (right.getButtonDown?.('a-button')) {
        this.triggerDash();
      }

      // Thumbstick = move
      const axes = right.getAxesValues?.('xr-standard-thumbstick');
      if (axes) {
        const speedMult = state.activePowerUps.some(p => p.type === 'speed') ? 1.5 : 1;
        state.playerVX += (axes.x ?? 0) * 12 * speedMult * dt;
      }
    }

    if (left) {
      // Left thumbstick = also move
      const axes = left.getAxesValues?.('xr-standard-thumbstick');
      if (axes) {
        const speedMult = state.activePowerUps.some(p => p.type === 'speed') ? 1.5 : 1;
        state.playerVX += (axes.x ?? 0) * 12 * speedMult * dt;
      }

      // Left trigger = also flap
      if (left.getButtonDown?.('xr-standard-trigger')) {
        if (state.playerBalloons > 0 && this.flapCooldown <= 0) {
          state.playerVY = Math.min(state.playerVY + 4, 8);
          this.flapCooldown = 0.15;
          this.animateFlap();
        }
      }

      // X button = dash (left hand)
      if (left.getButtonDown?.('x-button')) {
        this.triggerDash();
      }
    }
  }

  // === PARTICLES ===

  private spawnParticle(x: number, y: number, z: number, vx: number, vy: number, vz: number,
                        life: number, color: number, size: number): void {
    let mesh: Mesh;
    if (this.particlePool.length > 0) {
      mesh = this.particlePool.pop()!;
      (mesh.material as MeshStandardMaterial).color.setHex(color);
      (mesh.material as MeshStandardMaterial).emissive.setHex(color);
      mesh.scale.setScalar(size);
    } else {
      const mat = new MeshStandardMaterial({
        color, emissive: new Color(color), emissiveIntensity: 0.8,
        transparent: true, opacity: 1,
      });
      mesh = new Mesh(new BoxGeometry(1, 1, 1), mat);
      mesh.scale.setScalar(size);
    }
    mesh.position.set(x, y, z);
    mesh.visible = true;
    this.world.scene.add(mesh);
    this.particles.push({ mesh, vx, vy, vz, life, maxLife: life });
  }

  private waterSplash(x: number): void {
    this.audio?.playSplash();
    // Upward splash particles
    for (let i = 0; i < 12; i++) {
      const angle = Math.PI * 0.1 + (i / 12) * Math.PI * 0.8; // Upward arc
      const speed = 2 + Math.random() * 3;
      this.spawnParticle(
        x + (Math.random() - 0.5) * 0.5,
        ARENA.WATER_Y + 0.3,
        (Math.random() - 0.5) * 0.5,
        Math.cos(angle) * speed * 0.5,
        Math.sin(angle) * speed,
        (Math.random() - 0.5),
        0.6 + Math.random() * 0.4,
        0x4488ff,
        0.04 + Math.random() * 0.04,
      );
    }
    // Water ring ripple particles
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      this.spawnParticle(
        x + Math.cos(angle) * 0.5,
        ARENA.WATER_Y + 0.15,
        Math.sin(angle) * 0.3,
        Math.cos(angle) * 2,
        0.2,
        Math.sin(angle) * 0.5,
        0.4,
        0x2266aa,
        0.06,
      );
    }
  }

  private spawnBurst(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 2 + Math.random() * 3;
      this.spawnParticle(
        x, y, 0,
        Math.cos(angle) * speed, Math.sin(angle) * speed, (Math.random() - 0.5) * 2,
        0.5 + Math.random() * 0.5,
        color,
        0.05 + Math.random() * 0.08,
      );
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        p.mesh.visible = false;
        this.world.scene.remove(p.mesh);
        this.particlePool.push(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }

      p.vy -= 5 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 3;
      p.mesh.rotation.y += dt * 2;

      const alpha = p.life / p.maxLife;
      (p.mesh.material as MeshStandardMaterial).opacity = alpha;
      p.mesh.scale.setScalar(p.mesh.scale.x * (1 - dt * 0.5));
    }

    // Cap particles
    while (this.particles.length > 100) {
      const p = this.particles.shift()!;
      p.mesh.visible = false;
      this.world.scene.remove(p.mesh);
      this.particlePool.push(p.mesh);
    }
  }

  // === FREEZE MECHANIC ===

  private updateFreeze(dt: number): void {
    if (state.freezeTimer > 0) {
      state.freezeTimer -= dt;
      // Frozen enemies don't move — handled in updateEnemies by checking freezeTimer
    }
  }

  // === SCORE DROPS ===

  private spawnScoreDrop(x: number, y: number, points: number): void {
    const drop: ScoreDropData = {
      id: state.getId(), x, y, z: 0,
      vy: 2 + Math.random() * 2,
      points, collected: false,
      timer: 5, mesh: null,
    };

    const mat = new MeshStandardMaterial({
      color: 0xffcc00, emissive: NEON_YELLOW, emissiveIntensity: 0.8,
      transparent: true, opacity: 0.9,
    });
    const mesh = new Mesh(new CylinderGeometry(0.12, 0.12, 0.04, 8), mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, 0);
    this.world.scene.add(mesh);
    drop.mesh = mesh;
    state.scoreDrops.push(drop);
  }

  private updateScoreDrops(dt: number, time: number): void {
    for (let i = state.scoreDrops.length - 1; i >= 0; i--) {
      const d = state.scoreDrops[i];
      if (d.collected) continue;

      d.timer -= dt;
      if (d.timer <= 0) {
        if (d.mesh) { this.world.scene.remove(d.mesh); d.mesh = null; }
        state.scoreDrops.splice(i, 1);
        continue;
      }

      // Float up briefly then drift down
      d.vy -= 6 * dt;
      d.y += d.vy * dt;

      // Collect on contact
      const dx = state.playerX - d.x;
      const dy = state.playerY - d.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hasMagnet = state.activePowerUps.some(p => p.type === 'magnet');
      if (hasMagnet && dist < 3) {
        d.x += dx * 3 * dt;
      }
      if (dist < 0.8) {
        d.collected = true;
        state.addScore(d.points);
        this.spawnBurst(d.x, d.y, 0xffcc00, 4);
        if (d.mesh) { this.world.scene.remove(d.mesh); d.mesh = null; }
        state.scoreDrops.splice(i, 1);
        continue;
      }

      // Hit water = gone
      if (d.y < ARENA.WATER_Y + 0.3) {
        if (d.mesh) { this.world.scene.remove(d.mesh); d.mesh = null; }
        state.scoreDrops.splice(i, 1);
        continue;
      }

      // Update mesh
      if (d.mesh) {
        d.mesh.position.set(d.x, d.y, d.z);
        d.mesh.rotation.y = time * 5;
        // Blink when about to expire
        if (d.timer < 1.5) {
          d.mesh.visible = Math.sin(d.timer * 15) > 0;
        }
      }
    }
  }

  // === CAMERA ===

  private updateCamera(dt: number): void {
    const cam = this.world.camera;

    if (state.phase === 'playing' || state.phase === 'phase-complete') {
      // Follow player with smooth tracking
      this.cameraTarget.set(
        MathUtils.clamp(state.playerX * 0.3, -4, 4),
        MathUtils.clamp(state.playerY * 0.4 + 4, 3, 12),
        0,
      );
    } else {
      this.cameraTarget.set(0, 8, 0);
    }

    cam.position.x += (this.cameraTarget.x - cam.position.x) * dt * 2;
    cam.position.y += (this.cameraTarget.y + 2 - cam.position.y) * dt * 2;
    cam.position.z = 18;
    cam.lookAt(this.cameraTarget.x, this.cameraTarget.y, 0);
  }

  private spawnBalloonTripObstacles(): void {
    // Balloon Trip: spawn static lightning columns as obstacles
    for (let i = 0; i < 8; i++) {
      const x = (i - 4) * 3 + (Math.random() - 0.5) * 2;
      const y = 2 + Math.random() * 10;
      const gap = 3 + Math.random() * 2;

      // Upper obstacle
      const upperMat = new MeshStandardMaterial({
        color: 0x000000, emissive: NEON_YELLOW, emissiveIntensity: 0.5,
        transparent: true, opacity: 0.6,
      });
      const upper = new Mesh(new BoxGeometry(0.3, ARENA.MAX_Y - y - gap / 2, 0.3), upperMat);
      upper.position.set(x, y + gap / 2 + (ARENA.MAX_Y - y - gap / 2) / 2, 0);
      this.world.scene.add(upper);

      // Lower obstacle
      const lower = new Mesh(new BoxGeometry(0.3, y - gap / 2 - ARENA.WATER_Y, 0.3), upperMat.clone());
      lower.position.set(x, ARENA.WATER_Y + (y - gap / 2 - ARENA.WATER_Y) / 2, 0);
      this.world.scene.add(lower);
    }
  }

  // === COMBO FLASH VISUAL ===

  private buildComboFlash(): void {
    const mat = new MeshStandardMaterial({
      color: 0xffff00, emissive: NEON_YELLOW, emissiveIntensity: 1,
      transparent: true, opacity: 0,
    });
    this.comboFlashMesh = new Mesh(new RingGeometry(0.8, 1.2, 16), mat);
    this.comboFlashMesh.visible = false;
    this.world.scene.add(this.comboFlashMesh);
  }

  private updateComboFlash(dt: number): void {
    if (!this.comboFlashMesh) return;

    if (state.comboFlashTimer > 0) {
      state.comboFlashTimer -= dt;
      this.comboFlashMesh.visible = true;
      this.comboFlashMesh.position.set(state.playerX, state.playerY + 1.2, 0.2);

      const progress = 1 - state.comboFlashTimer / 0.5;
      const scale = 0.5 + progress * 1.5;
      this.comboFlashMesh.scale.setScalar(scale);

      const mat = this.comboFlashMesh.material as MeshStandardMaterial;
      mat.opacity = (1 - progress) * 0.6;

      // Color based on combo level
      if (state.combo >= 10) {
        mat.color.setHex(0xff00ff);
        mat.emissive.setHex(0xff00ff);
      } else if (state.combo >= 5) {
        mat.color.setHex(0xff8800);
        mat.emissive.setHex(0xff8800);
      } else {
        mat.color.setHex(0xffff00);
        mat.emissive.setHex(0xffff00);
      }
    } else {
      this.comboFlashMesh.visible = false;
    }
  }

  // === PLAYER DASH ===

  private triggerDash(): void {
    if (state.dashCooldown > 0 || !state.playerAlive || state.phase !== 'playing') return;

    // Determine dash direction from input
    let dx = 0;
    let dy = 0;
    if (this.keysDown.has('ArrowLeft') || this.keysDown.has('KeyA')) dx -= 1;
    if (this.keysDown.has('ArrowRight') || this.keysDown.has('KeyD')) dx += 1;
    if (this.keysDown.has('ArrowUp') || this.keysDown.has('KeyW')) dy += 1;
    if (this.keysDown.has('ArrowDown') || this.keysDown.has('KeyS')) dy -= 1;

    // Default dash direction = facing direction
    if (dx === 0 && dy === 0) {
      dx = state.playerFacing;
    }

    // Normalize
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }

    state.dashDirX = dx;
    state.dashDirY = dy;
    state.dashTimer = 0.15;
    state.dashCooldown = 1.5;
    state.playerInvincible = Math.max(state.playerInvincible, 0.2);

    // Dash trail burst
    const tc = state.getThemeColors();
    for (let i = 0; i < 6; i++) {
      this.spawnParticle(
        state.playerX - dx * i * 0.3,
        state.playerY - dy * i * 0.3,
        0,
        -dx * 2 + (Math.random() - 0.5),
        -dy * 2 + (Math.random() - 0.5),
        (Math.random() - 0.5),
        0.3,
        tc.accent,
        0.06,
      );
    }

    this.audio?.playDash();
  }

  private updateDash(dt: number): void {
    if (state.dashCooldown > 0) state.dashCooldown -= dt;

    if (state.dashTimer > 0) {
      state.dashTimer -= dt;
      const dashSpeed = 25;
      state.playerVX = state.dashDirX * dashSpeed;
      state.playerVY = state.dashDirY * dashSpeed;
    }
  }

  // === FORMATION SPAWNING ===

  private spawnFormation(type: FormationType): void {
    const count = Math.min(this.enemySpawnQueue, 4);
    this.enemySpawnQueue -= count;

    const side = Math.random() > 0.5 ? 1 : -1;
    const startX = side * (ARENA.MAX_X + 2);
    const centerY = 5 + Math.random() * 6;

    for (let i = 0; i < count; i++) {
      let x = startX;
      let y = centerY;

      if (type === 'v-shape') {
        // V-formation: leader in front, wings spread behind
        const row = i === 0 ? 0 : Math.ceil(i / 2);
        const wingSide = i % 2 === 0 ? 1 : -1;
        x = startX + side * row * -2;
        y = centerY + (i === 0 ? 0 : wingSide * row * 1.5);
      } else if (type === 'line') {
        // Horizontal line
        y = centerY + (i - count / 2) * 2;
      } else if (type === 'circle') {
        // Circle pattern arriving from one side
        const angle = (i / count) * Math.PI * 2;
        x = startX;
        y = centerY + Math.sin(angle) * 2.5;
      }

      const enemyType = i === 0 && Math.random() < 0.3 ? 'chaser' : 'basic';
      const balloons = enemyType === 'chaser' ? 2 : 2;

      const enemy: EnemyData = {
        id: state.getId(),
        type: enemyType,
        x, y, z: 0,
        vx: -side * (2 + Math.random()),
        vy: 0,
        balloons,
        maxBalloons: balloons,
        alive: true,
        grounded: false,
        groundTimer: 0,
        flapCooldown: 0,
        aiTimer: 0.5 + i * 0.3,
        mesh: null,
        balloonMeshes: [],
      };

      this.createEnemyMesh(enemy);
      state.enemies.push(enemy);
    }

    // Formation spawn particles
    for (let i = 0; i < 12; i++) {
      this.spawnParticle(
        startX, centerY + (Math.random() - 0.5) * 4, 0,
        -side * 3, (Math.random() - 0.5) * 2, 0,
        0.8, 0xff4444, 0.06,
      );
    }
  }

  // === WHIRLPOOL WATER HAZARD ===

  private updateWhirlpools(dt: number, time: number): void {
    if (state.currentPhase < 6) return;

    this.whirlpoolSpawnTimer -= dt;
    const interval = Math.max(15 - state.currentPhase * 0.5, 6);
    if (this.whirlpoolSpawnTimer <= 0 && state.whirlpools.length < 2) {
      this.whirlpoolSpawnTimer = interval + Math.random() * 8;
      this.spawnWhirlpool();
    }

    for (const wp of state.whirlpools) {
      if (!wp.active) continue;

      wp.timer -= dt;
      if (wp.timer <= 0) {
        wp.active = false;
        if (wp.mesh) { this.world.scene.remove(wp.mesh); wp.mesh = null; }
        continue;
      }

      // Suck nearby entities toward center and down
      if (state.playerAlive) {
        const dx = wp.x - state.playerX;
        const dy = wp.y - state.playerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < wp.radius && dist > 0.3) {
          const pull = wp.strength * (1 - dist / wp.radius);
          state.playerVX += (dx / dist) * pull * dt;
          state.playerVY += (dy / dist) * pull * dt - 2 * dt;
        }
      }

      // Also affect enemies
      for (const e of state.enemies) {
        if (!e.alive) continue;
        const dx = wp.x - e.x;
        const dy = wp.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < wp.radius && dist > 0.3) {
          const pull = wp.strength * 0.5 * (1 - dist / wp.radius);
          e.vx += (dx / dist) * pull * dt;
          e.vy += (dy / dist) * pull * dt - 1 * dt;
        }
      }

      // Visual: spinning particles
      if (Math.random() < dt * 8) {
        const angle = time * 3 + Math.random() * Math.PI * 2;
        const r = wp.radius * (0.3 + Math.random() * 0.7);
        this.spawnParticle(
          wp.x + Math.cos(angle) * r,
          wp.y + Math.sin(angle) * r * 0.3,
          0,
          -Math.sin(angle) * 3,
          -1 - Math.random(),
          0,
          0.5,
          0x2266aa,
          0.04,
        );
      }

      // Animate mesh
      if (wp.mesh) {
        wp.mesh.rotation.y = time * 4;
        const scale = 1 + Math.sin(time * 3) * 0.1;
        wp.mesh.scale.set(scale, 1, scale);
        const mat = (wp.mesh as Mesh).material as MeshStandardMaterial;
        mat.opacity = 0.15 + Math.sin(time * 5) * 0.05;
      }
    }

    state.whirlpools = state.whirlpools.filter(w => w.active);
  }

  private spawnWhirlpool(): void {
    const x = (Math.random() - 0.5) * ARENA.WIDTH * 0.6;
    const wp: WhirlpoolData = {
      id: state.getId(),
      x, y: ARENA.WATER_Y + 0.3, z: 0,
      radius: 3 + Math.random() * 2,
      strength: 6 + Math.random() * 4,
      timer: 8 + Math.random() * 6,
      active: true, mesh: null,
    };

    // Whirlpool visual: rotating torus at water surface
    const mat = new MeshStandardMaterial({
      color: 0x003366, emissive: new Color(0x0066aa),
      emissiveIntensity: 0.5, transparent: true, opacity: 0.2,
      side: DoubleSide,
    });
    const mesh = new Mesh(new TorusGeometry(wp.radius * 0.6, 0.15, 8, 24), mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, ARENA.WATER_Y + 0.2, 0);
    this.world.scene.add(mesh);
    wp.mesh = mesh;
    state.whirlpools.push(wp);

    // Spawn warning splash
    this.spawnBurst(x, ARENA.WATER_Y + 0.3, 0x2266aa, 10);
    this.audio?.playWhirlpool();
  }

  // === PARALLAX NEBULAE ===

  private buildNebulae(): void {
    const nebulaColors = [0x330066, 0x003366, 0x330033, 0x003333, 0x332200];
    for (let i = 0; i < 5; i++) {
      const depth = -12 - i * 4;
      const scale = 4 + Math.random() * 6;
      const mat = new MeshStandardMaterial({
        color: 0x000000,
        emissive: new Color(nebulaColors[i % nebulaColors.length]),
        emissiveIntensity: 0.12 + Math.random() * 0.08,
        transparent: true,
        opacity: 0.08 + Math.random() * 0.06,
        side: DoubleSide,
      });
      const mesh = new Mesh(new SphereGeometry(scale, 8, 6), mat);
      const baseX = (Math.random() - 0.5) * 30;
      const baseY = 5 + Math.random() * 10;
      mesh.position.set(baseX, baseY, depth);
      mesh.scale.set(1.5 + Math.random(), 0.8 + Math.random() * 0.4, 1);
      this.world.scene.add(mesh);
      this.nebulae.push({ mesh, depth, baseX, baseY });
    }
  }

  private updateNebulae(time: number): void {
    for (const n of this.nebulae) {
      // Subtle parallax drift based on camera position
      const cam = this.world.camera;
      const parallaxFactor = 0.05 * (-n.depth / 20);
      n.mesh.position.x = n.baseX + cam.position.x * parallaxFactor + Math.sin(time * 0.2 + n.depth) * 0.5;
      n.mesh.position.y = n.baseY + cam.position.y * parallaxFactor * 0.5;
      // Gentle pulsing
      const mat = n.mesh.material as MeshStandardMaterial;
      mat.emissiveIntensity = 0.1 + Math.sin(time * 0.5 + n.depth * 0.3) * 0.04;
    }
  }

  // === SCREEN FLASH EFFECT ===

  private buildScreenFlash(): void {
    const mat = new MeshStandardMaterial({
      color: 0xffffff,
      emissive: NEON_WHITE,
      emissiveIntensity: 1,
      transparent: true,
      opacity: 0,
      side: DoubleSide,
      depthTest: false,
    });
    this.screenFlashMesh = new Mesh(new PlaneGeometry(50, 50), mat);
    this.screenFlashMesh.renderOrder = 999;
    this.screenFlashMesh.position.set(0, 8, 16);
    this.screenFlashMesh.visible = false;
    this.world.scene.add(this.screenFlashMesh);
  }

  triggerScreenFlash(color: number = 0xffffff, duration: number = 0.3): void {
    this.screenFlashTimer = duration;
    if (this.screenFlashMesh) {
      const mat = this.screenFlashMesh.material as MeshStandardMaterial;
      mat.color.setHex(color);
      mat.emissive.setHex(color);
      mat.opacity = 0.35;
      this.screenFlashMesh.visible = true;
    }
  }

  private updateScreenFlash(dt: number): void {
    if (this.screenFlashTimer > 0) {
      this.screenFlashTimer -= dt;
      if (this.screenFlashMesh) {
        const mat = this.screenFlashMesh.material as MeshStandardMaterial;
        mat.opacity = Math.max(0, this.screenFlashTimer / 0.3 * 0.35);
        this.screenFlashMesh.position.set(
          this.world.camera.position.x,
          this.world.camera.position.y,
          this.world.camera.position.z - 2,
        );
        if (this.screenFlashTimer <= 0) {
          this.screenFlashMesh.visible = false;
        }
      }
    }
  }

  // === PUBLIC METHODS (for UISystem) ===

  returnToMenu(): void {
    // Clean up everything
    for (const e of state.enemies) {
      if (e.mesh) this.world.scene.remove(e.mesh);
    }
    state.enemies = [];
    for (const f of state.fish) {
      if (f.mesh) this.world.scene.remove(f.mesh);
    }
    state.fish = [];
    for (const l of state.lightning) {
      if (l.mesh) this.world.scene.remove(l.mesh);
    }
    state.lightning = [];
    for (const p of state.powerUps) {
      if (p.mesh) this.world.scene.remove(p.mesh);
    }
    state.powerUps = [];
    for (const p of state.platforms) {
      if (p.mesh) this.world.scene.remove(p.mesh);
    }
    state.platforms = [];
    for (const ice of state.icicles) {
      if (ice.mesh) this.world.scene.remove(ice.mesh);
    }
    state.icicles = [];
    for (const w of state.windZones) {
      if (w.mesh) this.world.scene.remove(w.mesh);
    }
    state.windZones = [];
    // Clean score drops
    for (const d of state.scoreDrops) {
      if (d.mesh) this.world.scene.remove(d.mesh);
    }
    state.scoreDrops = [];
    // Clean whirlpools
    for (const wp of state.whirlpools) {
      if (wp.mesh) this.world.scene.remove(wp.mesh);
    }
    state.whirlpools = [];
    state.freezeTimer = 0;
    state.dashCooldown = 0;
    state.dashTimer = 0;
    state.comboFlashTimer = 0;
    // Clean trail
    for (const t of this.trailNodes) {
      this.world.scene.remove(t.mesh);
    }
    this.trailNodes = [];
    // Clean trip obstacles
    for (const obs of this.tripObstacles) {
      this.world.scene.remove(obs.mesh);
    }
    this.tripObstacles = [];

    state.phase = 'menu';
    this.platformsGenerated = false;
  }
}
