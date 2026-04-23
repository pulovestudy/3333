(function () {
  "use strict";

  function createUI(elements) {
    let bannerTimer = null;

    return {
      setGameVisibility(visible) {
        elements.overlay.classList.toggle("hidden", visible);
        elements.hud.classList.toggle("hidden", !visible);
        elements.controls.classList.toggle("hidden", !visible);
      },
      updateLevel(current) {
        elements.levelLabel.textContent = "第 " + current + " 关";
      },
      updateDeaths(total) {
        elements.deathLabel.textContent = "失败 " + total + " 次";
      },
      showBanner(text, duration) {
        elements.messageBanner.textContent = text;
        elements.messageBanner.classList.add("show");
        window.clearTimeout(bannerTimer);
        bannerTimer = window.setTimeout(function () {
          elements.messageBanner.classList.remove("show");
        }, duration || 1200);
      },
      showComplete(totalDeaths) {
        elements.overlay.classList.remove("hidden");
        elements.controls.classList.add("hidden");
        elements.overlay.querySelector(".panel").innerHTML =
          "<h1>通关了</h1>" +
          "<p>总失败次数：" + totalDeaths + "</p>" +
          "<button id=\"restartButton\" type=\"button\">再来一遍</button>" +
          "<p class=\"tip\">机关已经准备好第二轮了。</p>";
        const restartButton = document.getElementById("restartButton");
        restartButton.addEventListener("click", function () {
          window.location.reload();
        });
      },
      showError() {
        elements.errorBanner.classList.remove("hidden");
      }
    };
  }

  function attachTouchControls(game, joystick, knob, jumpButton) {
    const joystickState = {
      pointerId: null,
      centerX: 0,
      centerY: 0,
      maxRadius: 0
    };

    function updateJoystickGeometry() {
      const rect = joystick.getBoundingClientRect();
      joystickState.centerX = rect.left + rect.width / 2;
      joystickState.centerY = rect.top + rect.height / 2;
      joystickState.maxRadius = rect.width * 0.32;
    }

    function renderKnob(nx, ny) {
      knob.style.transform = "translate(calc(-50% + " + nx + "px), calc(-50% + " + ny + "px))";
    }

    function resetJoystick() {
      joystickState.pointerId = null;
      renderKnob(0, 0);
      game.setInputAxis(0);
    }

    joystick.addEventListener("pointerdown", function (event) {
      updateJoystickGeometry();
      joystickState.pointerId = event.pointerId;
      joystick.setPointerCapture(event.pointerId);
    });

    joystick.addEventListener("pointermove", function (event) {
      if (event.pointerId !== joystickState.pointerId) {
        return;
      }

      const dx = event.clientX - joystickState.centerX;
      const dy = event.clientY - joystickState.centerY;
      const distance = Math.min(joystickState.maxRadius, Math.hypot(dx, dy) || 1);
      const angle = Math.atan2(dy, dx);
      const nx = Math.cos(angle) * distance;
      renderKnob(nx, 0);
      game.setInputAxis(Math.abs(dx) < 10 ? 0 : dx / joystickState.maxRadius);
    });

    joystick.addEventListener("pointerup", resetJoystick);
    joystick.addEventListener("pointercancel", resetJoystick);

    jumpButton.addEventListener("pointerdown", function (event) {
      jumpButton.setPointerCapture(event.pointerId);
      game.queueJump();
    });
    jumpButton.addEventListener("pointerup", function () {
      game.releaseJump();
    });
    jumpButton.addEventListener("pointercancel", function () {
      game.releaseJump();
    });

    window.addEventListener("resize", updateJoystickGeometry);
    updateJoystickGeometry();
  }

  function attachKeyboardControls(game) {
    const keys = new Set();

    function syncAxis() {
      const left = keys.has("ArrowLeft") || keys.has("KeyA");
      const right = keys.has("ArrowRight") || keys.has("KeyD");
      game.setInputAxis(left === right ? 0 : (left ? -1 : 1));
    }

    window.addEventListener("keydown", function (event) {
      if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "ArrowUp", "Space", "KeyW"].includes(event.code)) {
        event.preventDefault();
      }
      keys.add(event.code);
      syncAxis();
      if (["ArrowUp", "Space", "KeyW"].includes(event.code)) {
        game.queueJump();
      }
    });

    window.addEventListener("keyup", function (event) {
      keys.delete(event.code);
      syncAxis();
      if (["ArrowUp", "Space", "KeyW"].includes(event.code)) {
        game.releaseJump();
      }
    });
  }

  function bootstrap() {
    const elements = {
      canvas: document.getElementById("gameCanvas"),
      overlay: document.getElementById("overlay"),
      startButton: document.getElementById("startButton"),
      hud: document.getElementById("hud"),
      controls: document.getElementById("controls"),
      joystick: document.getElementById("joystick"),
      joystickKnob: document.getElementById("joystickKnob"),
      jumpButton: document.getElementById("jumpButton"),
      levelLabel: document.getElementById("levelLabel"),
      deathLabel: document.getElementById("deathLabel"),
      messageBanner: document.getElementById("messageBanner"),
      errorBanner: document.getElementById("errorBanner")
    };

    const ui = createUI(elements);
    const game = new window.CrazyPrimitiveGame({
      canvas: elements.canvas,
      levels: window.FKG_LEVELS,
      messages: window.FKG_MESSAGES,
      ui: ui
    });

    attachTouchControls(game, elements.joystick, elements.joystickKnob, elements.jumpButton);
    attachKeyboardControls(game);

    function frame(now) {
      try {
        const delta = Math.min(34, now - (game.state.lastTime || now));
        game.state.lastTime = now;
        game.update(delta);
        game.render();
      } catch (error) {
        console.error(error);
        ui.showError();
      }
      window.requestAnimationFrame(frame);
    }

    window.addEventListener("resize", function () {
      game.resize();
    });

    elements.startButton.addEventListener("click", function () {
      try {
        game.start();
      } catch (error) {
        console.error(error);
        ui.showError();
      }
    });

    window.requestAnimationFrame(frame);
  }

  try {
    bootstrap();
  } catch (error) {
    console.error(error);
    const errorBanner = document.getElementById("errorBanner");
    if (errorBanner) {
      errorBanner.classList.remove("hidden");
    }
  }
}());
