/* sensors.js - plain script exposing createSensors on window (uses global nanoid) */

(function () {
  const PUB_PREFIX = "pi5/estacionamento/vaga/";

  function makeId(n) {
    // produce A01..A40
    return "A" + String(n).padStart(2, "0");
  }

  function createElement(id) {
    const cell = document.createElement("div");
    cell.className = "cell";
    const slot = document.createElement("div");
    slot.className = "slot free";
    slot.textContent = id;
    const status = document.createElement("div");
    status.className = "meta";
    status.textContent = "Livre";
    cell.appendChild(slot);
    cell.appendChild(status);
    return { cell, slot, status };
  }

  function randomBool(prob = 0.5) {
    return Math.random() < prob;
  }

  window.createSensors = function createSensors(count = 40) {
    const sensors = [];
    for (let i = 1; i <= count; i++) {
      const id = makeId(i);
      const { cell, slot, status } = createElement(id);
      let occupied = false;
      let timer = null;
      // use global nanoid from the UMD bundle: nanoid is available as nanoid
      const clientId = (typeof nanoid === "function") ? nanoid(6) : ("id" + Math.random().toString(36).slice(2, 8));

      function currentPayload() {
        // sensor should publish plain string "true" or "false"
        return occupied ? "true" : "false";
      }

      function render() {
        slot.classList.toggle("occupied", occupied);
        slot.classList.toggle("free", !occupied);
        status.textContent = occupied ? "Ocupado" : "Livre";
      }

      function flipState() {
        // simulate sensor noise / realistic changes: occupied toggles with lower prob
        const p = occupied ? 0.25 : 0.12; // chance to change
        if (Math.random() < p) occupied = !occupied;
      }

      function startAutoPublish(publishFn) {
        // initial random state
        occupied = Math.random() < 0.35;
        render();
        // publish immediately
        const topic = PUB_PREFIX + id;
        publishFn(topic, currentPayload());
        // schedule repeating random interval
        function schedule() {
          const delay = 3000 + Math.floor(Math.random() * 5000); // 3-8s
          timer = setTimeout(() => {
            flipState();
            render();
            publishFn(topic, currentPayload());
            schedule();
          }, delay);
        }
        schedule();
      }

      function stopAutoPublish() {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      }

      function updateFromNetwork(msg) {
        // accept incoming message to update display
        if (typeof msg.occupied === "boolean") {
          occupied = msg.occupied;
          render();
        }
      }

      // allow clicking a cell to toggle and publish (manual)
      cell.addEventListener("click", () => {
        occupied = !occupied;
        render();
      });

      sensors.push({
        id,
        element: cell,
        startAutoPublish,
        stopAutoPublish,
        updateFromNetwork,
        currentPayload
      });
    }
    return sensors;
  };
})();