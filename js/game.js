(function () {
  "use strict";

  const TILE_SIZE = 32;
  const GRAVITY = 0.0019;
  const MOVE_SPEED = 0.33;
  const AIR_CONTROL = 0.82;
  const JUMP_SPEED = -0.7;
  const MAX_FALL = 1.25;
  const PLAYER_W = 20;
  const PLAYER_H = 28;
  const PARTICLE_GRAVITY = 0.0017;
  const PLAYER_RESPAWN_DELAY = 520;
  const GRAVITY_SWITCH_FREEZE = 56;
  const GRAVITY_SWITCH_VISUAL = 90;
  const GRAVITY_FLIP_PUSH = 0.22;
  const LEVEL_CLEAR_LINES = [
    { title: "你居然过了？", message: "这一跳居然没出事，运气和手感都在线。", tip: "下一关可没这么简单", buttonText: "下一关" },
    { title: "这都能过？", message: "看着像乱跳，结果还真给你跳过去了。", tip: "别太得意", buttonText: "继续挑战" },
    { title: "还行，有点东西", message: "操作不算离谱，至少机关这次没笑出声。", tip: "后面更难", buttonText: "下一关" },
    { title: "差点就不行了", message: "再慢半拍，门和你都要一起出事。", tip: "准备好了吗？", buttonText: "继续挑战" },
    { title: "这只是开始", message: "先别急着庆祝，后面的坑比这关还熟练。", tip: "后面更难", buttonText: "下一关" }
  ];

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
    //11111
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  ///hhhh
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function pointInRect(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  class CrazyPrimitiveGame {
    constructor(options) {
      this.canvas = options.canvas;
      this.ctx = this.canvas.getContext("2d");
      this.ui = options.ui;
      this.levels = deepClone(options.levels || []);
      this.messages = options.messages || [];

      this.state = {
        running: false,
        completed: false,
        levelIndex: 0,
        totalDeaths: 0,
        lastTime: 0,
        bannerTimer: 0,
        bannerText: "",
        cameraX: 0,
        goalMoving: false,
        goalDestroyed: false,
        playerDying: false,
        respawnPending: false,
        switchFreezeTimer: 0,
        respawnTimer: 0
      };

      this.input = {
        moveAxis: 0,
        jumpPressed: false,
        jumpQueued: false
      };

      this.player = this.createPlayer();
      this.currentLevel = null;
      this.currentMap = [];
      this.traps = [];
      this.spawn = { x: 2, y: 8 };
      this.goalRect = { x: 0, y: 0, w: 1, h: 2 };
      this.particles = [];
      this.snapMarks = [];

      this.resize();
    }

    createPlayer() {
      return {
        x: 0,
        y: 0,
        w: PLAYER_W,
        h: PLAYER_H,
        vx: 0,
        vy: 0,
        onGround: false,
        justLanded: false,
        facing: 1,
        gravityDir: 1,
        snapVisualOffsetY: 0,
        switchStretchTimer: 0
      };
    }

    resize() {
      const parent = this.canvas.parentElement;
      const width = parent ? parent.clientWidth : window.innerWidth;
      const height = parent ? parent.clientHeight : window.innerHeight;
      this.viewportWidth = width;
      this.viewportHeight = height;
    }

    setInputAxis(axis) {
      this.input.moveAxis = clamp(axis, -1, 1);
    }

    queueJump() {
      this.input.jumpQueued = true;
      this.input.jumpPressed = true;
    }

    releaseJump() {
      this.input.jumpPressed = false;
    }

    start() {
      this.state.running = true;
      this.state.completed = false;
      this.state.levelIndex = 0;
      this.state.totalDeaths = 0;
      this.loadLevel(0);
      this.ui.setGameVisibility(true);
      this.ui.showBanner("欢迎来到会记仇的地板世界。", 1800);
      this.ui.updateDeaths(0);
    }

    loadLevel(index) {
      this.state.levelIndex = index;
      this.currentLevel = deepClone(this.levels[index]);
      this.currentMap = this.currentLevel.tiles.map((row) => row.split(""));
      this.traps = this.currentLevel.traps.map((trap) => this.instantiateTrap(trap));
      this.spawn = { x: this.currentLevel.start.x, y: this.currentLevel.start.y };
      this.goalRect = {
        x: this.currentLevel.goal.x,
        y: this.currentLevel.goal.y,
        w: 1.2,
        h: 2
      };
      this.state.goalMoving = false;
      this.state.goalDestroyed = false;
      this.respawn(false);
      this.ui.updateLevel(index + 1, this.levels.length);
      this.ui.showBanner(this.currentLevel.intro || "别眨眼。", 1800);
    }

    instantiateTrap(config) {
      const trap = Object.assign({
        active: false,
        triggered: false,
        timer: 0,
        initialActive: false,
        initialTriggered: false
      }, config);
      trap.initialActive = trap.active;
      trap.initialTriggered = trap.triggered;
      return trap;
    }

    respawn(countDeath) {
      if (countDeath) {
        this.state.totalDeaths += 1;
        this.ui.updateDeaths(this.state.totalDeaths);
        this.ui.showBanner(this.randomDeathMessage(), 1400);
      }

      this.player = this.createPlayer();
      this.player.x = this.spawn.x * TILE_SIZE + 6;
      this.player.y = this.spawn.y * TILE_SIZE - this.player.h;
      this.state.cameraX = 0;
      this.state.playerDying = false;
      this.state.respawnPending = false;
      this.state.switchFreezeTimer = 0;
      this.state.respawnTimer = 0;
      this.particles = [];
      this.snapMarks = [];

      this.traps.forEach((trap) => {
        trap.active = Boolean(trap.initialActive);
        trap.triggered = Boolean(trap.initialTriggered);
        trap.timer = 0;
      });

      if (this.currentLevel.movingGoal) {
        this.goalRect.x = this.currentLevel.goal.x;
        this.state.goalMoving = false;
        this.state.goalDestroyed = false;
      }

      this.player.gravityDir = this.currentLevel.initialGravityDir || 1;
    }

    randomDeathMessage() {
      if (!this.messages.length) {
        return "你又相信机关了。";
      }
      return this.messages[Math.floor(Math.random() * this.messages.length)];
    }

    randomLevelClearMessage() {
      return LEVEL_CLEAR_LINES[Math.floor(Math.random() * LEVEL_CLEAR_LINES.length)];
    }

    update(delta) {
      this.updateEffects(delta);

      if (!this.state.running || this.state.completed || this.state.playerDying) {
        return;
      }

      const player = this.player;
      player.justLanded = false;

      const axis = this.input.moveAxis;
      const control = player.onGround ? 1 : AIR_CONTROL;
      player.vx = axis * MOVE_SPEED * control;
      if (axis !== 0) {
        player.facing = axis > 0 ? 1 : -1;
      }

      if (this.input.jumpQueued) {
        if (this.currentLevel.gravityFlip) {
          this.trySwitchGravity();
        } else if (player.onGround) {
          player.vy = JUMP_SPEED;
          player.onGround = false;
        }
      }
      this.input.jumpQueued = false;

      if (this.state.switchFreezeTimer > 0) {
        this.updateCamera();
        this.checkGoal();
        return;
      }

      player.vy = clamp(player.vy + GRAVITY * player.gravityDir * delta, -MAX_FALL, MAX_FALL);

      player.x += player.vx * delta;
      this.resolveHorizontal();

      player.y += player.vy * delta;
      this.resolveVertical();

      if (this.currentLevel.movingGoal && !this.state.goalDestroyed) {
        if (!this.state.goalMoving && Math.abs(player.vx) > 0) {
          this.state.goalMoving = true;
        }
        if (this.state.goalMoving) {
          const goalDirection = this.currentLevel.goalDirection || 1;
          const destroySpike = this.traps.find((trap) => trap.type === "popupSpikes" && trap.initialActive);
          this.goalRect.x += goalDirection * this.currentLevel.goalSpeed * delta;
          if (destroySpike && rectsOverlap(this.goalRect, {
            x: destroySpike.x,
            y: destroySpike.y,
            w: destroySpike.w,
            h: destroySpike.h
          })) {
            this.startGoalDestroySequence(goalDirection);
          }
        }
      }

      this.updateTraps(delta);
      this.updateCamera();
      this.checkGoal();
      this.checkFallOut();
    }

    updateEffects(delta) {
      if (this.particles.length) {
        this.particles = this.particles.filter((particle) => {
          particle.life -= delta;
          if (particle.life <= 0) {
            return false;
          }
          particle.vy += particle.gravity * delta;
          particle.x += particle.vx * delta;
          particle.y += particle.vy * delta;
          return true;
        });
      }


      if (this.snapMarks.length) {
        this.snapMarks = this.snapMarks.filter((mark) => {
          mark.life -= delta;
          return mark.life > 0;
        });
      }

      if (this.player.snapVisualOffsetY !== 0) {
        const step = Math.min(Math.abs(this.player.snapVisualOffsetY), delta * 0.06);
        this.player.snapVisualOffsetY += this.player.snapVisualOffsetY > 0 ? -step : step;
        if (Math.abs(this.player.snapVisualOffsetY) < 0.2) {
          this.player.snapVisualOffsetY = 0;
        }
      }

      if (this.player.switchStretchTimer > 0) {
        this.player.switchStretchTimer = Math.max(0, this.player.switchStretchTimer - delta);
      }

      if (this.state.switchFreezeTimer > 0) {
        this.state.switchFreezeTimer = Math.max(0, this.state.switchFreezeTimer - delta);
      }
      if (this.state.respawnPending) {
        this.state.respawnTimer -= delta;
        if (this.state.respawnTimer <= 0) {
          this.respawn(true);
        }
      }
    }

    emitPixelBurst(rect, options) {
      const cols = options.cols || 4;
      const rows = options.rows || 4;
      const colors = options.colors || ["#000000"];
      const spreadX = options.spreadX || 0.3;
      const spreadY = options.spreadY || 0.3;
      const biasX = options.biasX || 0;
      const biasY = options.biasY || 0;
      const gravity = options.gravity || PARTICLE_GRAVITY;
      const lifeMin = options.lifeMin || 300;
      const lifeMax = options.lifeMax || 600;
      const sizeMin = options.sizeMin || 4;
      const sizeMax = options.sizeMax || sizeMin;

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const size = Math.round(sizeMin + Math.random() * (sizeMax - sizeMin));
          const cellW = rect.w / cols;
          const cellH = rect.h / rows;
          const x = rect.x + col * cellW + (cellW - size) * 0.5;
          const y = rect.y + row * cellH + (cellH - size) * 0.5;
          this.particles.push({
            x,
            y,
            size,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: (Math.random() * 2 - 1) * spreadX + biasX,
            vy: (Math.random() * 2 - 1) * spreadY + biasY,
            gravity,
            life: lifeMin + Math.random() * (lifeMax - lifeMin)
          });
        }
      }
    }

    startPlayerDeathSequence() {
      this.emitPixelBurst({
        x: this.player.x,
        y: this.player.y,
        w: this.player.w,
        h: this.player.h
      }, {
        cols: 5,
        rows: 6,
        colors: ["#000000"],
        sizeMin: 4,
        sizeMax: 5,
        spreadX: 0.34,
        spreadY: 0.42,
        biasY: -0.18,
        gravity: 0.0018,
        lifeMin: 320,
        lifeMax: 760
      });

      this.state.playerDying = true;
      this.state.respawnPending = true;
      this.state.respawnTimer = PLAYER_RESPAWN_DELAY;
      this.player.vx = 0;
      this.player.vy = 0;
      this.input.moveAxis = 0;
      this.input.jumpQueued = false;
    }

    startGoalDestroySequence(goalDirection) {
      const goalPixelRect = {
        x: this.goalRect.x * TILE_SIZE,
        y: this.goalRect.y * TILE_SIZE,
        w: this.goalRect.w * TILE_SIZE,
        h: this.goalRect.h * TILE_SIZE
      };

      this.emitPixelBurst(goalPixelRect, {
        cols: 8,
        rows: 10,
        colors: ["#4d3421", "#a87336", "#f1b743"],
        sizeMin: 3,
        sizeMax: 4,
        spreadX: 0.46,
        spreadY: 0.52,
        biasX: goalDirection * 0.34,
        biasY: -0.1,
        gravity: 0.0017,
        lifeMin: 340,
        lifeMax: 820
      });

      this.state.goalDestroyed = true;
      this.state.goalMoving = false;
      this.state.running = false;
      this.state.respawnPending = true;
      this.state.respawnTimer = 700;
      this.input.moveAxis = 0;
      this.input.jumpQueued = false;
      this.ui.showBanner("门撞上了最左侧的刺。重新来。", 1200);
    }

    resolveHorizontal() {
      const player = this.player;
      const rect = { x: player.x, y: player.y, w: player.w, h: player.h };
      const tiles = this.getSolidTilesAround(rect);
      tiles.forEach((tile) => {
        if (!rectsOverlap(rect, tile)) {
          return;
        }
        if (player.vx > 0) {
          player.x = tile.x - player.w;
        } else if (player.vx < 0) {
          player.x = tile.x + tile.w;
        }
        rect.x = player.x;
      });
    }

    resolveVertical() {
      const player = this.player;
      const wasOnGround = player.onGround;
      player.onGround = false;

      const rect = { x: player.x, y: player.y, w: player.w, h: player.h };
      const tiles = this.getSolidTilesAround(rect);
      tiles.forEach((tile) => {
        if (!rectsOverlap(rect, tile)) {
          return;
        }

        if (player.gravityDir > 0) {
          if (player.vy > 0) {
            player.y = tile.y - player.h;
            player.vy = 0;
            player.onGround = true;
          } else if (player.vy < 0) {
            player.y = tile.y + tile.h;
            player.vy = 0;
          }
        } else if (player.vy < 0) {
          player.y = tile.y + tile.h;
          player.vy = 0;
          player.onGround = true;
        } else if (player.vy > 0) {
          player.y = tile.y - player.h;
          player.vy = 0;
        }
        rect.y = player.y;
      });

      if (!wasOnGround && player.onGround) {
        player.justLanded = true;
      }
    }

    trySwitchGravity() {
      const player = this.player;
      const nextGravityDir = player.gravityDir * -1;
      const targetY = this.findGravitySnapTarget(nextGravityDir);
      player.gravityDir = nextGravityDir;
      player.vy = 0;
      player.onGround = false;
      player.justLanded = false;
      player.snapVisualOffsetY = -nextGravityDir * 2;
      player.switchStretchTimer = GRAVITY_SWITCH_VISUAL;

      if (targetY !== null) {
        player.y = targetY;
        player.onGround = true;
        player.justLanded = true;
        this.state.switchFreezeTimer = GRAVITY_SWITCH_FREEZE;
        this.spawnSnapMarks(nextGravityDir);
        return;
      }

      this.state.switchFreezeTimer = 0;
      player.vy = GRAVITY_FLIP_PUSH * nextGravityDir;
    }

    findGravitySnapTarget(gravityDir) {
      const player = this.player;
      const minTileX = Math.floor(player.x / TILE_SIZE);
      const maxTileX = Math.floor((player.x + player.w - 1) / TILE_SIZE);

      if (gravityDir > 0) {
        const startY = Math.floor((player.y + player.h) / TILE_SIZE);
        for (let tileY = startY; tileY < this.currentMap.length; tileY += 1) {
          if (!this.rowHasSupport(minTileX, maxTileX, tileY)) {
            continue;
          }
          const candidateY = tileY * TILE_SIZE - player.h;
          if (this.canOccupy(player.x, candidateY)) {
            return candidateY;
          }
        }
      } else {
        const startY = Math.floor(player.y / TILE_SIZE) - 1;
        for (let tileY = startY; tileY >= 0; tileY -= 1) {
          if (!this.rowHasSupport(minTileX, maxTileX, tileY)) {
            continue;
          }
          const candidateY = (tileY + 1) * TILE_SIZE;
          if (this.canOccupy(player.x, candidateY)) {
            return candidateY;
          }
        }
      }

      return null;
    }

    rowHasSupport(minTileX, maxTileX, tileY) {
      for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        if (this.isSolidTile(tileX, tileY)) {
          return true;
        }
      }
      return false;
    }

    canOccupy(x, y) {
      const rect = { x, y, w: this.player.w, h: this.player.h };
      const tiles = this.getSolidTilesAround(rect);
      return !tiles.some((tile) => rectsOverlap(rect, tile));
    }

    spawnSnapMarks(gravityDir) {
      const contactY = gravityDir > 0 ? this.player.y + this.player.h : this.player.y;
      const leftX = this.player.x + 4;
      const rightX = this.player.x + this.player.w - 8;
      const markY = gravityDir > 0 ? contactY - 2 : contactY;
      this.snapMarks.push(
        { x: leftX, y: markY, size: 4, life: GRAVITY_SWITCH_VISUAL },
        { x: rightX, y: markY, size: 4, life: GRAVITY_SWITCH_VISUAL }
      );
    }

    updateTraps(delta) {
      const playerRectTiles = this.getPlayerRectInTiles();
      const playerFeet = {
        x: playerRectTiles.x + playerRectTiles.w / 2,
        y: playerRectTiles.y + playerRectTiles.h
      };

      this.traps.forEach((trap) => {
        if (!trap.triggered && this.shouldTriggerTrap(trap, playerRectTiles, playerFeet)) {
          trap.triggered = true;
          if (trap.type === "chainPopup") {
            trap.timer = trap.delay || 0;
          } else {
            trap.active = true;
            if (trap.type === "fakeGoal") {
              this.ui.showBanner("这个出口看着就不太真。", 1300);
            }
          }
        }

        if (trap.triggered && !trap.active && trap.timer > 0) {
          trap.timer -= delta;
          if (trap.timer <= 0) {
            trap.active = true;
          }
        }

        if (trap.type === "fallingTile" && trap.triggered) {
          this.setTiles(trap.x, trap.y, trap.w, trap.h, ".");
        }
      });

      this.checkTrapCollision(playerRectTiles);
    }

    shouldTriggerTrap(trap, playerRectTiles, playerFeet) {
      if (trap.type === "dynamicSpike") {
        if (playerFeet.y < trap.y) {
          return false;
        }
        const playerCenterX = playerRectTiles.x + playerRectTiles.w / 2;
        const goalCenterX = this.goalRect.x + this.goalRect.w / 2;
        const goalDirection = this.currentLevel.goalDirection || 1;
        if (goalDirection < 0) {
          return playerCenterX >= goalCenterX && playerCenterX - goalCenterX < (trap.triggerDistance || 3);
        }
        return playerCenterX <= goalCenterX && goalCenterX - playerCenterX < (trap.triggerDistance || 3);
      }

      const trigger = trap.trigger || { kind: "touch" };

      if (trigger.kind === "touch") {
        return rectsOverlap(playerRectTiles, { x: trap.x, y: trap.y, w: trap.w, h: trap.h });
      }

      if (trigger.kind === "zone") {
        return rectsOverlap(playerRectTiles, trigger);
      }

      if (trigger.kind === "land") {
        return this.player.justLanded && rectsOverlap(playerRectTiles, trigger);
      }

      if (trigger.kind === "goalTouch") {
        return rectsOverlap(playerRectTiles, this.goalRect);
      }

      return pointInRect(playerFeet, trigger);
    }

    setTiles(x, y, w, h, value) {
      for (let row = y; row < y + h; row += 1) {
        for (let col = x; col < x + w; col += 1) {
          if (this.currentMap[row] && this.currentMap[row][col] !== undefined) {
            this.currentMap[row][col] = value;
          }
        }
      }
    }

    checkTrapCollision(playerRectTiles) {
      for (const trap of this.traps) {
        if (!trap.active) {
          continue;
        }

        if (trap.type === "fakeGoal") {
          this.failLevel();
          return;
        }

        const hurtRect = { x: trap.x, y: trap.y, w: trap.w, h: trap.h };
        if (trap.type === "sideSpikes") {
          hurtRect.w = 0.8;
          if (trap.direction === "right") {
            hurtRect.x += 0.2;
          }
        }

        if (rectsOverlap(playerRectTiles, hurtRect)) {
          this.failLevel();
          return;
        }
      }
    }

    checkGoal() {
      if (this.state.goalDestroyed) {
        return;
      }
      const playerRectTiles = this.getPlayerRectInTiles();
      if (rectsOverlap(playerRectTiles, this.goalRect)) {
        if (this.state.levelIndex >= this.levels.length - 1) {
          this.state.completed = true;
          this.state.running = false;
          this.ui.showBanner("通关了。机关说下次再见。", 2400);
          this.ui.showComplete(this.state.totalDeaths);
        } else {
          const levelClear = this.randomLevelClearMessage();
          const nextLevelIndex = this.state.levelIndex + 1;
          this.state.running = false;
          this.ui.showLevelClear({
            title: levelClear.title,
            message: levelClear.message,
            tip: levelClear.tip,
            buttonText: levelClear.buttonText,
            onNext: () => {
              this.loadLevel(nextLevelIndex);
              this.state.running = true;
              this.ui.setGameVisibility(true);
            }
          });
        }
      }
    }

    checkFallOut() {
      if (this.player.y > this.currentLevel.height * TILE_SIZE + 200 || this.player.y + this.player.h < -200) {
        this.failLevel();
      }
    }

    failLevel() {
      if (this.state.playerDying || !this.state.running) {
        return;
      }
      this.startPlayerDeathSequence();
    }

    updateCamera() {
      const worldWidth = this.currentLevel.width * TILE_SIZE;
      const target = this.player.x + this.player.w / 2 - this.canvas.width / 2;
      this.state.cameraX = clamp(target, 0, Math.max(0, worldWidth - this.canvas.width));
    }

    getPlayerRectInTiles() {
      return {
        x: this.player.x / TILE_SIZE,
        y: this.player.y / TILE_SIZE,
        w: this.player.w / TILE_SIZE,
        h: this.player.h / TILE_SIZE
      };
    }

    getSolidTilesAround(rect) {
      const startX = Math.floor(rect.x / TILE_SIZE) - 1;
      const endX = Math.ceil((rect.x + rect.w) / TILE_SIZE) + 1;
      const startY = Math.floor(rect.y / TILE_SIZE) - 1;
      const endY = Math.ceil((rect.y + rect.h) / TILE_SIZE) + 1;
      const solids = [];

      for (let y = startY; y <= endY; y += 1) {
        for (let x = startX; x <= endX; x += 1) {
          if (this.isSolidTile(x, y)) {
            solids.push({ x: x * TILE_SIZE, y: y * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE });
          }
        }
      }
      return solids;
    }

    isSolidTile(x, y) {
      if (y < 0 || y >= this.currentMap.length || x < 0 || x >= this.currentMap[0].length) {
        return x >= 0 && x < this.currentMap[0].length && y >= this.currentMap.length;
      }
      return this.currentMap[y][x] === "#";
    }

    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.drawBackground(ctx);
      this.drawTiles(ctx);
      this.drawGoal(ctx);
      this.drawTraps(ctx);
      this.drawSnapMarks(ctx);
      this.drawPlayer(ctx);
      this.drawParticles(ctx);
    }

    worldToScreen(x, y) {
      return {
        x: x - this.state.cameraX,
        y
      };
    }

    drawBackground(ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
      gradient.addColorStop(0, "#f7df9c");
      gradient.addColorStop(1, "#8d6a47");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      ctx.fillStyle = "rgba(255, 245, 208, 0.12)";
      for (let i = 0; i < 7; i += 1) {
        const x = ((i * 211) % this.canvas.width) - 40;
        const y = 70 + (i % 3) * 90;
        ctx.fillRect(x, y, 120, 22);
      }
    }

    drawTiles(ctx) {
      for (let y = 0; y < this.currentMap.length; y += 1) {
        for (let x = 0; x < this.currentMap[y].length; x += 1) {
          if (this.currentMap[y][x] !== "#") {
            continue;
          }
          const screen = this.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
          if (screen.x + TILE_SIZE < 0 || screen.x > this.canvas.width) {
            continue;
          }
          ctx.fillStyle = (x + y) % 2 === 0 ? "#5f4630" : "#6d5138";
          ctx.fillRect(screen.x, screen.y, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = "#8b6a49";
          ctx.fillRect(screen.x + 2, screen.y + 2, TILE_SIZE - 4, 6);
        }
      }
    }

    drawGoal(ctx) {
      if (this.state.goalDestroyed) {
        return;
      }
      this.drawDoor(ctx, this.goalRect, {
        outline: "#4d3421",
        frame: "#8b5c2f",
        panel: "#d59c49",
        inset: "#f1b743",
        handle: "#2a1d14"
      });
    }

    drawTraps(ctx) {
      this.traps.forEach((trap) => {
        if (trap.type === "fakeGoal" && !trap.active) {
          this.drawDoor(ctx, { x: trap.x, y: trap.y - 1, w: 1.2, h: 2 }, {
            outline: "#4c4338",
            frame: "#7e7468",
            panel: "#b5ab9f",
            inset: "#d1c8be",
            handle: "#40382f"
          });
          return;
        }

        if (!trap.active) {
          return;
        }

        if (trap.type === "popupSpikes" || trap.type === "chainPopup" || trap.type === "sideSpikes" || trap.type === "dynamicSpike") {
          this.drawSpikes(ctx, trap);
        }
      });
    }

    drawSpikes(ctx, trap) {
      const baseX = trap.x * TILE_SIZE;
      const baseY = trap.y * TILE_SIZE;
      const screen = this.worldToScreen(baseX, baseY);
      ctx.fillStyle = "#d7d3d0";
      const count = Math.max(2, trap.w * 2);

      for (let i = 0; i < count; i += 1) {
        const localX = (i * trap.w * TILE_SIZE) / count;
        ctx.beginPath();
        if (trap.type === "sideSpikes") {
          const dir = trap.direction === "left" ? -1 : 1;
          const px = screen.x + (dir === 1 ? 0 : TILE_SIZE);
          const py = screen.y + i * (trap.h * TILE_SIZE / count);
          ctx.moveTo(px, py);
          ctx.lineTo(px + 18 * dir, py + 8);
          ctx.lineTo(px, py + 16);
        } else {
          ctx.moveTo(screen.x + localX, screen.y + TILE_SIZE);
          ctx.lineTo(screen.x + localX + 8, screen.y + 8);
          ctx.lineTo(screen.x + localX + 16, screen.y + TILE_SIZE);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    drawDoor(ctx, rect, palette) {
      const screen = this.worldToScreen(rect.x * TILE_SIZE, rect.y * TILE_SIZE);
      const doorW = rect.w * TILE_SIZE;
      const doorH = rect.h * TILE_SIZE;

      ctx.fillStyle = palette.outline;
      ctx.fillRect(screen.x + 2, screen.y + 2, doorW - 4, doorH - 2);
      ctx.fillStyle = palette.frame;
      ctx.fillRect(screen.x + 5, screen.y + 5, doorW - 10, doorH - 8);
      ctx.fillStyle = palette.panel;
      ctx.fillRect(screen.x + 9, screen.y + 9, doorW - 18, doorH - 16);
      ctx.fillStyle = palette.inset;
      ctx.fillRect(screen.x + 12, screen.y + 13, doorW - 24, 14);
      ctx.fillRect(screen.x + 12, screen.y + 31, doorW - 24, 20);
      ctx.fillStyle = palette.handle;
      ctx.fillRect(screen.x + doorW - 13, screen.y + 33, 3, 3);
    }

    drawParticles(ctx) {
      this.particles.forEach((particle) => {
        const screen = this.worldToScreen(particle.x, particle.y);
        ctx.fillStyle = particle.color;
        ctx.fillRect(screen.x, screen.y, particle.size, particle.size);
      });
    }

    drawSnapMarks(ctx) {
      ctx.fillStyle = "#000000";
      this.snapMarks.forEach((mark) => {
        const screen = this.worldToScreen(mark.x, mark.y);
        ctx.fillRect(screen.x, screen.y, mark.size, mark.size);
      });
    }

    drawPlayer(ctx) {
      if (this.state.playerDying) {
        return;
      }
      const screen = this.worldToScreen(this.player.x, this.player.y + this.player.snapVisualOffsetY);
      const centerX = screen.x + this.player.w / 2;
      const centerY = screen.y + this.player.h / 2;
      const stretchActive = this.player.switchStretchTimer > 0;
      const scaleX = stretchActive ? 1.12 : 1;
      const scaleY = stretchActive ? 0.88 : 1;

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(scaleX, scaleY * this.player.gravityDir);
      ctx.translate(-this.player.w / 2, -this.player.h / 2);
      ctx.fillStyle = "#000000";
      ctx.fillRect(3, 0, 14, 10);
      ctx.fillRect(4, 2, 12, 8);
      ctx.fillRect(1, 8, 18, 12);
      ctx.fillRect(4, 20, 4, 8);
      ctx.fillRect(12, 20, 4, 8);
      const eyeX = this.player.facing === 1 ? 12 : 7;
      ctx.fillRect(eyeX, 5, 2, 2);
      ctx.restore();
    }
  }

  window.CrazyPrimitiveGame = CrazyPrimitiveGame;
}());
