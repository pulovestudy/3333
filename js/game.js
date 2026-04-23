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
        cameraX: 0
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
        facing: 1
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
        y: this.currentLevel.goal.y - 1,
        w: 1.2,
        h: 2
      };
      this.respawn(false);
      this.ui.updateLevel(index + 1, this.levels.length);
      this.ui.showBanner(this.currentLevel.intro || "别眨眼。", 1800);
    }

    instantiateTrap(config) {
      return Object.assign({
        active: false,
        triggered: false,
        timer: 0
      }, config);
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

      this.traps.forEach((trap) => {
        trap.active = false;
        trap.triggered = false;
        trap.timer = 0;
      });
    }

    randomDeathMessage() {
      if (!this.messages.length) {
        return "你又相信机关了。";
      }
      return this.messages[Math.floor(Math.random() * this.messages.length)];
    }

    update(delta) {
      if (!this.state.running || this.state.completed) {
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

      if (this.input.jumpQueued && player.onGround) {
        player.vy = JUMP_SPEED;
        player.onGround = false;
      }
      this.input.jumpQueued = false;

      player.vy = Math.min(MAX_FALL, player.vy + GRAVITY * delta);

      player.x += player.vx * delta;
      this.resolveHorizontal();

      player.y += player.vy * delta;
      this.resolveVertical();

      this.updateTraps(delta);
      this.updateCamera();
      this.checkGoal();
      this.checkFallOut();
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

        if (player.vy > 0) {
          player.y = tile.y - player.h;
          player.vy = 0;
          player.onGround = true;
        } else if (player.vy < 0) {
          player.y = tile.y + tile.h;
          player.vy = 0;
        }
        rect.y = player.y;
      });

      if (!wasOnGround && player.onGround) {
        player.justLanded = true;
      }
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
      const playerRectTiles = this.getPlayerRectInTiles();
      if (rectsOverlap(playerRectTiles, this.goalRect)) {
        if (this.state.levelIndex >= this.levels.length - 1) {
          this.state.completed = true;
          this.state.running = false;
          this.ui.showBanner("通关了。机关说下次再见。", 2400);
          this.ui.showComplete(this.state.totalDeaths);
        } else {
          this.ui.showBanner("这次算你过。", 1200);
          this.loadLevel(this.state.levelIndex + 1);
        }
      }
    }

    checkFallOut() {
      if (this.player.y > this.currentLevel.height * TILE_SIZE + 200) {
        this.failLevel();
      }
    }

    failLevel() {
      this.respawn(true);
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
      this.drawPlayer(ctx);
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
      const x = this.goalRect.x * TILE_SIZE;
      const y = this.goalRect.y * TILE_SIZE;
      const screen = this.worldToScreen(x, y);
      ctx.fillStyle = "#4d3421";
      ctx.fillRect(screen.x + 8, screen.y + 18, 8, TILE_SIZE * 2 - 18);
      ctx.fillStyle = "#f1b743";
      ctx.fillRect(screen.x + 16, screen.y + 12, 24, 18);
    }

    drawTraps(ctx) {
      this.traps.forEach((trap) => {
        if (trap.type === "fakeGoal" && !trap.active) {
          const screen = this.worldToScreen(trap.x * TILE_SIZE, (trap.y - 1) * TILE_SIZE);
          ctx.fillStyle = "#9d7f62";
          ctx.fillRect(screen.x + 8, screen.y + 18, 8, TILE_SIZE * 2 - 18);
          ctx.fillStyle = "#c9974d";
          ctx.fillRect(screen.x + 16, screen.y + 12, 24, 18);
          return;
        }

        if (!trap.active) {
          return;
        }

        if (trap.type === "popupSpikes" || trap.type === "chainPopup" || trap.type === "sideSpikes") {
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

    drawPlayer(ctx) {
      const screen = this.worldToScreen(this.player.x, this.player.y);
      ctx.fillStyle = "#2c1c12";
      ctx.fillRect(screen.x + 3, screen.y, 14, 10);
      ctx.fillStyle = "#f0cf93";
      ctx.fillRect(screen.x + 4, screen.y + 2, 12, 8);
      ctx.fillStyle = "#7b4c2c";
      ctx.fillRect(screen.x + 1, screen.y + 8, 18, 12);
      ctx.fillRect(screen.x + 4, screen.y + 20, 4, 8);
      ctx.fillRect(screen.x + 12, screen.y + 20, 4, 8);
      ctx.fillStyle = "#2c1c12";
      const eyeX = this.player.facing === 1 ? screen.x + 12 : screen.x + 7;
      ctx.fillRect(eyeX, screen.y + 5, 2, 2);
    }
  }

  window.CrazyPrimitiveGame = CrazyPrimitiveGame;
}());
