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
} from '../game-state.js';

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
  private powerUpSpawnTimer = 0;

  // Platform generation tracking
  private platformsGenerated = false;

  init(): void {
    this.buildArena();
    this.buildPlayer();
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

    // Water surface
    const waterMat = new MeshStandardMaterial({
      color: WATER_COLOR, emissive: new Color(0x001133),
      emissiveIntensity: 0.5, transparent: true, opacity: 0.8,
      metalness: 0.8, roughness: 0.2,
    });
    this.waterPlane = new Mesh(new PlaneGeometry(ARENA.WIDTH + 4, ARENA.DEPTH + 2), waterMat);
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
      this.updatePlayer(sDt, time);
      this.updateEnemies(sDt, time);
      this.updateCollisions(sDt);
      this.updatePlatforms(sDt, time);
      this.updateFish(sDt, time);
      this.updateLightning(sDt, time);
      this.updatePowerUps(sDt, time);
      this.updateActivePowerUps(sDt);
      this.updateCombo(dt);
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

    // Water wave animation
    if (this.waterPlane) {
      this.waterPlane.position.y = ARENA.WATER_Y + Math.sin(time * 1.5) * 0.05;
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
  }

  private playerPlatformCollision(): void {
    if (state.playerVY > 0) return;
    for (const plat of state.platforms) {
      const px = plat.x;
      const py = plat.y;
      const hw = plat.width / 2;
      if (state.playerX > px - hw && state.playerX < px + hw
          && state.playerY > py && state.playerY < py + 0.6
          && state.playerVY < 0) {
        state.playerY = py + 0.5;
        state.playerVY = 0;
      }
    }
  }

  private playerDie(): void {
    state.playerAlive = false;
    state.lives--;
    this.spawnBurst(state.playerX, state.playerY, 0xff4444, 15);
    state.shakeTimer = 0.3;
    state.shakeIntensity = 0.3;

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

  private spawnEnemy(type: 'basic' | 'chaser' | 'dodger' | 'boss'): void {
    const side = Math.random() > 0.5 ? 1 : -1;
    const balloons = type === 'boss' ? 4 : type === 'chaser' ? 2 : type === 'dodger' ? 1 : 2;

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

    // Body
    const bodyColor = e.type === 'boss' ? 0x880044 :
                      e.type === 'chaser' ? 0x884400 :
                      e.type === 'dodger' ? 0x008844 : 0x664444;
    const emissiveColor = e.type === 'boss' ? NEON_RED :
                          e.type === 'chaser' ? NEON_ORANGE :
                          e.type === 'dodger' ? NEON_GREEN : new Color(0x884444);

    const bodyMat = new MeshStandardMaterial({
      color: bodyColor, emissive: emissiveColor, emissiveIntensity: 0.3,
    });
    const body = new Mesh(new SphereGeometry(0.3 * bodyScale, 8, 6), bodyMat);
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

    // Spawn queue
    if (this.enemySpawnQueue > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.enemySpawnQueue--;
        this.spawnTimer = 1.5;

        if (state.isBossPhase() && !state.bossActive) {
          this.spawnEnemy('boss');
          state.bossActive = true;
        } else {
          const r = Math.random();
          const type = r < 0.15 ? 'dodger' : r < 0.4 ? 'chaser' : 'basic';
          this.spawnEnemy(type);
        }
      }
    }

    for (const e of state.enemies) {
      if (!e.alive) continue;

      const speed = (e.type === 'chaser' ? 4 : e.type === 'dodger' ? 5 : e.type === 'boss' ? 2.5 : 3) * diffMult;

      if (e.balloons > 0) {
        // Flying AI
        const gravity = -3;
        const buoyancy = 2 * e.balloons;
        e.vy += (gravity + buoyancy) * dt;

        // AI behavior
        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          e.aiTimer = 0.5 + Math.random() * 1.5;

          if (e.type === 'chaser') {
            // Chase player
            const dx = state.playerX - e.x;
            const dy = state.playerY - e.y;
            e.vx += Math.sign(dx) * speed * 0.3;
            if (dy > 0.5) e.vy += 3;
          } else if (e.type === 'dodger') {
            // Erratic movement
            e.vx += (Math.random() - 0.5) * speed;
            e.vy += (Math.random() - 0.3) * 3;
          } else if (e.type === 'boss') {
            // Boss: slow chase with periodic lunges
            const dx = state.playerX - e.x;
            e.vx += Math.sign(dx) * speed * 0.2;
            if (Math.random() < 0.2) e.vy += 4; // lunge up
          } else {
            // Basic: wander
            e.vx += (Math.random() - 0.5) * speed * 0.5;
            if (Math.random() < 0.3) e.vy += 2;
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
        this.defeatEnemy(e);
      }

      // Update mesh
      if (e.mesh) {
        e.mesh.position.set(e.x, e.y, e.z);
        (e.mesh as Group).rotation.y = e.vx > 0 ? 0 : Math.PI;

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

    const points = e.type === 'boss' ? 2000 : e.type === 'chaser' ? 500 : e.type === 'dodger' ? 300 : 200;
    state.addScore(points);

    if (e.type === 'boss') {
      state.bossActive = false;
      state.sessionBossesDefeated++;
      state.slowMoTimer = 0.8;
      state.slowMoFactor = 0.3;
      state.shakeTimer = 0.5;
      state.shakeIntensity = 0.5;
      this.spawnBurst(e.x, e.y, 0xffff00, 30);
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
      return;
    }

    state.playerBalloons--;
    state.playerInvincible = 1.5;
    this.createPlayerBalloons();
    state.shakeTimer = 0.2;
    state.shakeIntensity = 0.2;

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

      const plat: PlatformData = {
        id: state.getId(),
        x, y, z: 0,
        width: w,
        mesh: null,
      };

      // Create mesh
      const mat = new MeshStandardMaterial({
        color: 0x112233,
        emissive: NEON_CYAN,
        emissiveIntensity: 0.2 + Math.random() * 0.2,
      });
      const mesh = new Mesh(new BoxGeometry(w, 0.25, 1.5), mat);
      mesh.position.set(x, y, 0);
      this.world.scene.add(mesh);
      plat.mesh = mesh;

      // Edge glow
      const edgeMat = new MeshStandardMaterial({
        color: 0x000000, emissive: NEON_CYAN, emissiveIntensity: 0.6,
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
    // Subtle glow animation
    for (const p of state.platforms) {
      if (p.mesh) {
        const mat = (p.mesh as Mesh).material as MeshStandardMaterial;
        mat.emissiveIntensity = 0.2 + Math.sin(time * 2 + p.id) * 0.1;
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
    const types: PowerUpType[] = ['shield', 'speed', 'extra-balloon', 'lightning-immunity', 'magnet'];
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

    group.position.set(x, y, 0);
    this.world.scene.add(group);
    pu.mesh = group;
    state.powerUps.push(pu);
  }

  private collectPowerUp(p: PowerUpData): void {
    p.collected = true;
    state.sessionPowerUps++;
    state.addScore(150);

    if (p.type === 'extra-balloon' && state.playerBalloons < 3) {
      state.playerBalloons++;
      if (state.playerBalloons > state.playerMaxBalloons) {
        state.playerMaxBalloons = state.playerBalloons;
      }
      this.createPlayerBalloons();
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

    if (mode === 'survival') {
      // Survival: continuous spawning with escalating difficulty
      this.enemySpawnQueue = 3;
      this.spawnTimer = 1;
      state.phaseEnemiesTotal = 999; // Never ends naturally
    } else if (mode === 'balloon-trip') {
      // Balloon Trip: horizontal scrolling with obstacles
      this.enemySpawnQueue = 0;
      state.phaseEnemiesTotal = 999;
      this.spawnBalloonTripObstacles();
    } else {
      this.spawnPhaseEnemies();
    }
  }

  private spawnPhaseEnemies(): void {
    const count = state.getEnemyCountForPhase();
    state.phaseEnemiesTotal = count;
    state.phaseEnemiesDefeated = 0;
    this.enemySpawnQueue = count;
    this.spawnTimer = 0.5;
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

    const aliveEnemies = state.enemies.filter(e => e.alive).length;
    if (aliveEnemies === 0 && this.enemySpawnQueue === 0 && state.phaseEnemiesTotal > 0) {
      state.phase = 'phase-complete';
      state.phaseTransitionTimer = 3;
      state.addScore(state.currentPhase * 500);
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
    state.activePowerUps = [];

    this.generatePlatforms();
    this.spawnPhaseEnemies();
    this.fishSpawnTimer = 3;
    this.lightningSpawnTimer = Math.max(8 - state.currentPhase * 0.5, 3);
    this.powerUpSpawnTimer = 8;
  }

  // === VISUALS ===

  private updateVisuals(dt: number, time: number): void {
    // Water shimmer
    if (this.waterPlane) {
      const mat = this.waterPlane.material as MeshStandardMaterial;
      mat.emissiveIntensity = 0.4 + Math.sin(time * 2) * 0.1;
    }
  }

  // === XR INPUT ===

  private handleXRInput(dt: number): void {
    const xr = this.world.input?.xr;
    if (!xr) return;

    const right = xr.gamepads?.right;
    const left = xr.gamepads?.left;

    if (right) {
      // Trigger = flap
      if (right.getButtonDown?.('xr-standard-trigger')) {
        if (state.playerBalloons > 0 && this.flapCooldown <= 0) {
          state.playerVY = Math.min(state.playerVY + 4, 8);
          this.flapCooldown = 0.15;
          this.animateFlap();
        }
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

    state.phase = 'menu';
    this.platformsGenerated = false;
  }
}
