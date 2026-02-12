/* mqtt and Chart are provided as global scripts (mqtt, Chart) loaded from HTML */

const TOTAL = 40;
const MQTT_BROKER = "wss://test.mosquitto.org:8081";
const SUB_TOPIC = "pi5/estacionamento/vaga/#";
const TOPIC_PREFIX = "pi5/estacionamento/vaga";
const SLOT_PREFIX = "A";

const cardsContainer = document.getElementById("cards");
const selectedSlotEl = document.getElementById("selected-slot");
const statusEl = document.getElementById("status");
const updatedEl = document.getElementById("updated");
const topicEl = document.getElementById("topic");

const chartCanvas = document.getElementById("historyChart");
const mqttStatusEl = document.getElementById("mqtt-status");
const mqttBrokerEl = document.getElementById("mqtt-broker");
const mqttStateTextEl = document.getElementById("mqtt-state-text");

let client = null;
// slotData: { A01: { history: [{ts, occ}], last: boolean|null, updated, topic } }
let slotData = {};
let selected = "A01";
let historyChart = null;

// global aggregated history: [{ts, occupiedCount, freeCount, inactiveCount}]
let globalHistory = [];

function pad(n){return n.toString().padStart(2,"0")}
function slotName(i){return `${SLOT_PREFIX}${pad(i)}`}

function extractSlotFromTopic(topic){
  const parts = topic.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if(last && new RegExp(`^${SLOT_PREFIX}\\d{2}$`, "i").test(last)) return last.toUpperCase();
  for(const p of parts){
    if(p && new RegExp(`^${SLOT_PREFIX}\\d{2}$`, "i").test(p)) return p.toUpperCase();
  }
  return null;
}

function createCards(){
  for(let i=1;i<=TOTAL;i++){
    const name = slotName(i);
    slotData[name] = {history:[], last:null, updated:null, topic:`${TOPIC_PREFIX}/${name}`};
    const card = document.createElement("button");
    card.className = "card inactive";
    card.dataset.slot = name;
    card.innerHTML = `
      <div class="slot">${name}</div>
      <div class="meta">
        <span class="meta-right">
          <span class="status-text">Inativo</span>
          <span class="status-dot"></span>
        </span>
      </div>
    `;
    card.addEventListener("click", () => selectSlot(name, true));
    cardsContainer.appendChild(card);
  }
}

function updateCard(slot){
  const card = cardsContainer.querySelector(`.card[data-slot="${slot}"]`);
  if(!card) return;
  const data = slotData[slot];

  const INACTIVE_MS = 20_000;
  const now = Date.now();
  const isStale = !data.updated || (now - data.updated) > INACTIVE_MS;
  const isOccupied = (data.last === true);
  const isFree = (data.last === false);

  card.classList.remove("occupied","free","inactive");
  if(isStale || data.last === null){
    card.classList.add("inactive");
    card.querySelector(".status-text").textContent = "Inativo";
  }else if(isOccupied){
    card.classList.add("occupied");
    card.querySelector(".status-text").textContent = "Ocupada";
  }else if(isFree){
    card.classList.add("free");
    card.querySelector(".status-text").textContent = "Livre";
  }else{
    card.classList.add("inactive");
    card.querySelector(".status-text").textContent = "Inativo";
  }
}

function selectSlot(slot, focus=false){
  selected = slot;
  selectedSlotEl.textContent = slot;
  cardsContainer.querySelectorAll(".card").forEach(c=>c.classList.remove("selected"));
  const card = cardsContainer.querySelector(`.card[data-slot="${slot}"]`);
  if(card) card.classList.add("selected");

  const data = slotData[slot];
  const INACTIVE_MS = 20_000;
  const now = Date.now();
  const isStale = !data.updated || (now - data.updated) > INACTIVE_MS;
  if(isStale || data.last === null){
    statusEl.textContent = "Inativo";
  }else{
    statusEl.textContent = data.last ? "Ocupada" : "Livre";
  }
  updatedEl.textContent = data.updated ? new Date(data.updated).toLocaleString() : "—";
  topicEl.textContent = data.topic;
  updateChart(slot);
  if(focus) card?.focus();
}

function initChart(){
  const ctx = chartCanvas.getContext("2d");
  historyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Ocupadas",
          data: [],
          borderColor: "#ff6b6b",
          backgroundColor: "rgba(255,107,107,0.12)",
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 2,
          fill: true,
        },
        {
          label: "Livres",
          data: [],
          borderColor: "#4cd964",
          backgroundColor: "rgba(76,217,100,0.12)",
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 2,
          fill: true,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { display: true, title: { display: false } },
        y: {
          beginAtZero: true,
          min: 0,
          // set max to TOTAL so chart shows true counts (sum across all slots)
          max: TOTAL,
          ticks: {
            stepSize: Math.max(1, Math.ceil(TOTAL / 10)),
            // show numeric tick labels
            callback: v => String(v)
          }
        }
      },
      plugins: {
        legend: { 
          display: true, 
          position: 'top',
          // ensure clicking legend toggles datasets
          onClick: (e, legendItem, legend) => {
            const index = legendItem.datasetIndex;
            const chart = legend.chart;
            // use built-in toggle when available, fallback to manual hide/show
            if (typeof chart.toggleDataVisibility === "function") {
              chart.toggleDataVisibility(index);
            } else {
              const meta = chart.getDatasetMeta(index);
              meta.hidden = meta.hidden === null ? !chart.data.datasets[index].hidden : null;
            }
            chart.update();
          }
        },
        title: {
          display: true,
          text: `Histórico (soma de todas as vagas: ${TOTAL})`,
          font: { size: 14 },
        }
      },
      elements: {
        line: { cubicInterpolationMode: 'monotone' },
        // remove points globally as extra safeguard
        point: { radius: 0, hoverRadius: 0 }
      }
    }
  });
}

function updateChart(){
  // Use globalHistory to render aggregated counts
  const labels = globalHistory.map(h => new Date(h.ts).toLocaleTimeString());
  const occupied = globalHistory.map(h => h.occupiedCount);
  const free = globalHistory.map(h => h.freeCount);
  const inactive = globalHistory.map(h => h.inactiveCount);

  historyChart.data.labels = labels;
  // ensure three datasets (Ocupadas, Livres, Inativas)
  historyChart.data.datasets = historyChart.data.datasets.slice(0,3);
  historyChart.data.datasets[0].data = occupied;
  historyChart.data.datasets[1].data = free;
  // if third dataset doesn't exist, create/replace it with yellow line
  if(historyChart.data.datasets.length < 3){
    historyChart.data.datasets[2] = {
      label: "Inativas",
      data: inactive,
      borderColor: "#ffcf4d",
      backgroundColor: "rgba(255,207,77,0.12)",
      tension: 0.2,
      pointRadius: 0,
      pointHoverRadius: 0,
      borderWidth: 2,
      fill: true,
    };
  } else {
    historyChart.data.datasets[2].data = inactive;
  }
  historyChart.update();
}

/* Fetch history endpoints and map to boolean occupancy */
async function fetchSlotHistoryHttp(slot){
  const url = `${location.protocol}//${location.hostname}:8000/vaga${slot}.json`;
  try{
    const resp = await fetch(url, {cache: "no-store"});
    if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if(!json || !Array.isArray(json.dados)) return;
    const entries = json.dados.map(item => {
      const ts = Date.parse(item.data_hora) || Date.now();
      const occ = String(item.ocupada).toLowerCase() === "true";
      return {ts, occ};
    });
    const existing = slotData[slot].history || [];
    slotData[slot].history = [...existing, ...entries].sort((a,b)=>a.ts-b.ts).slice(-100);
    const last = slotData[slot].history[slotData[slot].history.length-1];
    if(last){
      slotData[slot].last = last.occ;
      slotData[slot].updated = last.ts;
    }
    updateCard(slot);
    if(slot === selected) selectSlot(slot);
  }catch(e){
    // ignore fetch errors
  }
}

async function fetchAllHistories(){
  // fetch each slot history once at startup
  const promises = [];
  for(let i=1;i<=TOTAL;i++){
    const s = slotName(i);
    promises.push(fetchSlotHistoryHttp(s));
  }
  try{
    await Promise.all(promises);
  }catch(e){}
  // after loading slot histories, build aggregated global history and render chart
  rebuildGlobalHistory();
  updateChart();
}

function connect(brokerUrl){
  if(client){
    try{ client.end(true); }catch(e){}
    client = null;
  }

  try{
    client = mqtt.connect(brokerUrl, {connectTimeout: 10000});
  }catch(e){
    console.error("MQTT connect error", e);
    return;
  }

  client.on("connect", () => {
    console.info("MQTT conectado");
    if(mqttBrokerEl) mqttBrokerEl.textContent = brokerUrl.replace(/^ws:\/\//i,'');
    if(mqttStatusEl){
      mqttStatusEl.classList.remove("inactive","connecting");
      mqttStatusEl.classList.add("active");
    }
    if(mqttStateTextEl) mqttStateTextEl.textContent = "Conectado";
    client.subscribe(SUB_TOPIC, {qos:0}, (err) => {
      if(err) console.warn("subscribe error", err);
    });
  });

  client.on("reconnect", ()=>{
    console.info("reconnecting...");
    if(mqttStatusEl){
      mqttStatusEl.classList.remove("active","inactive");
      mqttStatusEl.classList.add("connecting");
    }
    if(mqttStateTextEl) mqttStateTextEl.textContent = "Reconectando";
  });
  client.on("error", err => {
    console.error("MQTT error", err);
    if(mqttStatusEl){
      mqttStatusEl.classList.remove("active","connecting");
      mqttStatusEl.classList.add("inactive");
    }
    if(mqttStateTextEl) mqttStateTextEl.textContent = "Erro";
  });
  client.on("close", () => {
    if(mqttStatusEl){
      mqttStatusEl.classList.remove("active","connecting");
      mqttStatusEl.classList.add("inactive");
    }
    if(mqttStateTextEl) mqttStateTextEl.textContent = "Desconectado";
  });
  client.on("message", (topic, payload) => {
    try{
      const msg = payload.toString().trim();
      let occ = null;

      const lw = msg.toLowerCase();
      if(lw === "true" || lw === "false"){
        occ = lw === "true";
      } else if(/^[\d.]+$/.test(msg)){
        // legacy numeric: treat <30 as occupied
        const dist = parseFloat(msg);
        occ = dist < 30;
      }else{
        try{
          const parsed = JSON.parse(msg);
          if(typeof parsed === "object" && parsed !== null){
            if(parsed.ocupada !== undefined) occ = String(parsed.ocupada).toLowerCase() === "true";
            else if(parsed.distance !== undefined) occ = Number(parsed.distance) < 30;
            else if(parsed.dist !== undefined) occ = Number(parsed.dist) < 30;
          }
        }catch(e){}
      }

      const slot = extractSlotFromTopic(topic);
      if(slot && slotData[slot]){
        const ts = Date.now();
        if(occ !== null){
          slotData[slot].last = occ;
          slotData[slot].history.push({ts, occ});
          if(slotData[slot].history.length > 100) slotData[slot].history.shift();
        }
        slotData[slot].updated = ts;
        updateCard(slot);
        if(slot === selected) selectSlot(slot);

        // Update aggregated global history with the current totals
        rebuildGlobalHistory();
        updateChart();
      }
    }catch(e){
      console.error("msg parse error", e);
    }
  });
}

 // helper to rebuild global aggregated timeline
function rebuildGlobalHistory(){
  // collect timestamps from all slot histories
  const stamps = new Set();
  for(const k in slotData){
    const h = slotData[k].history || [];
    for(const e of h) stamps.add(e.ts);
  }
  // include last-updated times so inactivity can be represented
  for(const k in slotData){
    if(slotData[k].updated) stamps.add(slotData[k].updated);
  }
  const times = Array.from(stamps).sort((a,b)=>a-b).slice(-100);

  const INACTIVE_MS = 20_000;
  globalHistory = times.map(ts => {
    let occ = 0, free = 0, inactive = 0;
    for(const k in slotData){
      const s = slotData[k];
      // find last known state at or before ts
      const hist = (s.history || []).filter(h => h.ts <= ts);
      const last = hist.length ? hist[hist.length-1] : null;
      if(!last){
        inactive++;
      }else{
        const isStale = !s.updated || (ts - s.updated) > INACTIVE_MS;
        if(isStale) inactive++;
        else if(last.occ) occ++;
        else free++;
      }
    }
    return {ts, occupiedCount: occ, freeCount: free, inactiveCount: inactive};
  });
}

 // initial setup
createCards();
initChart();
selectSlot(selected);

document.getElementById("year").textContent = new Date().getFullYear();

if(mqttBrokerEl) mqttBrokerEl.textContent = MQTT_BROKER.replace(/^ws:\/\//i,'');

connect(MQTT_BROKER);
// load histories once at startup and build aggregated chart
fetchAllHistories();

document.addEventListener("keydown", (e)=>{
  const cols = getComputedStyle(cardsContainer).gridTemplateColumns.split(" ").length || 5;
  const idx = Number(selected.slice(1)) - 1;
  let newIdx = idx;
  if(e.key === "ArrowRight") newIdx = Math.min(TOTAL-1, idx+1);
  if(e.key === "ArrowLeft") newIdx = Math.max(0, idx-1);
  if(e.key === "ArrowDown") newIdx = Math.min(TOTAL-1, idx+cols);
  if(e.key === "ArrowUp") newIdx = Math.max(0, idx-cols);
  if(newIdx !== idx){
    selectSlot(slotName(newIdx+1), true);
    e.preventDefault();
  }
});



window.__parking_utils__ = {slotName, fetchSlotHistoryHttp};

// Periodic refresh to mark cards as inactive when no data for >20s and keep chart in sync
const INACTIVE_CHECK_INTERVAL_MS = 2000;
setInterval(() => {
  // update each card's visual state based on latest timestamps
  for(const name in slotData){
    updateCard(name);
  }
  // rebuild aggregated history and refresh chart so inactivity counts update over time
  rebuildGlobalHistory();
  if(historyChart) updateChart();
}, INACTIVE_CHECK_INTERVAL_MS);