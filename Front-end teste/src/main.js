const TOTAL = 40;
const MQTT_BROKER = "ws://test.mosquitto.org:8080";
const SUB_TOPIC = "pi5/estacionamento/vaga/#";
const TOPIC_PREFIX = "pi5/estacionamento/vaga";
const SLOT_PREFIX = "A";

const cardsContainer = document.getElementById("cards");
const selectedSlotEl = document.getElementById("selected-slot");
const statusEl = document.getElementById("status");
const distanceEl = document.getElementById("distance");
const updatedEl = document.getElementById("updated");
const topicEl = document.getElementById("topic");

const chartCanvas = document.getElementById("historyChart");

let client = null;
let slotData = {}; // {A01: {history: [{ts,dist}], last, updated, topic}}
let selected = "A01";
let historyChart = null;

function pad(n){return n.toString().padStart(2,"0")}
function slotName(i){return `${SLOT_PREFIX}${pad(i)}`}

/**
 * Extract slot name from topic like "pi5/estacionamento/vaga/A01" (takes last segment if matches).
 */
function extractSlotFromTopic(topic){
  const parts = topic.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if(last && new RegExp(`^${SLOT_PREFIX}\\d{2}$`, "i").test(last)) return last.toUpperCase();
  // fallback: find any segment matching pattern
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
        <span class="distance">— cm</span>
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
  const distText = (data.last === null) ? "—" : `${data.last.toFixed(1)} cm`;
  card.querySelector(".distance").textContent = distText;

  // determine status: occupied if last < 30, free if last >= 30, inactive if no update for a while
  const INACTIVE_MS = 20_000; // 20 seconds inactivity threshold
  const now = Date.now();
  const isStale = !data.updated || (now - data.updated) > INACTIVE_MS;
  const isOccupied = (data.last !== null && data.last < 30);
  const isFree = (data.last !== null && data.last >= 30);

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
  // mark selected
  cardsContainer.querySelectorAll(".card").forEach(c=>c.classList.remove("selected"));
  const card = cardsContainer.querySelector(`.card[data-slot="${slot}"]`);
  if(card) card.classList.add("selected");
  // update detail
  const data = slotData[slot];
  const INACTIVE_MS = 20_000;
  const now = Date.now();
  const isStale = !data.updated || (now - data.updated) > INACTIVE_MS;
  if(isStale || data.last === null){
    statusEl.textContent = "Inativo";
  }else{
    statusEl.textContent = (data.last < 30) ? "Ocupada" : "Livre";
  }
  distanceEl.textContent = (data.last === null) ? "—" : data.last.toFixed(1);
  updatedEl.textContent = data.updated ? new Date(data.updated).toLocaleString() : "—";
  topicEl.textContent = data.topic;
  // update chart (occupancy history)
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
          pointRadius: 3,
          borderWidth: 2,
          fill: true,
        },
        {
          label: "Livres",
          data: [],
          borderColor: "#4cd964",
          backgroundColor: "rgba(76,217,100,0.12)",
          tension: 0.2,
          pointRadius: 3,
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
          max: 1,
          ticks: {
            stepSize: 1,
            callback: v => v ? 'Ocupada' : 'Livre'
          }
        }
      },
      plugins: {
        legend: { display: true, position: 'top' }
      },
      elements: {
        line: { cubicInterpolationMode: 'monotone' }
      }
    }
  });
}

function updateChart(slot){
  const data = slotData[slot];
  // Prepare labels and occupancy arrays
  const labels = data.history.map(h => new Date(h.ts).toLocaleTimeString());
  // Occupied series: 1 when occupied, else 0
  const occupied = data.history.map(h => (h.dist < 30 ? 1 : 0));
  // Free series: 1 when free, else 0 (inverse of occupied)
  const free = data.history.map(h => (h.dist >= 30 ? 1 : 0));
  historyChart.data.labels = labels;
  // Ensure datasets exist
  if(historyChart.data.datasets.length < 2){
    historyChart.data.datasets = historyChart.data.datasets.slice(0,2);
  }
  historyChart.data.datasets[0].data = occupied;
  historyChart.data.datasets[1].data = free;
  historyChart.update();
}

/* --- New: fetch JSON history from localhost endpoints like /vagaA01.json --- */
async function fetchSlotHistoryHttp(slot){
  // endpoint pattern: http://localhost:8000/vagaA01.json
  const url = `${location.protocol}//${location.hostname}:8000/vaga${slot}.json`;
  try{
    const resp = await fetch(url, {cache: "no-store"});
    if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    // expected shape: {"dados":[{"data_hora":"2026-02-04T14:49:55.488503+00:00","ocupada":"False"}, ...]}
    if(!json || !Array.isArray(json.dados)) return;
    const entries = json.dados.map(item => {
      const ts = Date.parse(item.data_hora) || Date.now();
      // map ocupada string to a distance proxy: occupied -> 10cm, free -> 120cm
      const occ = String(item.ocupada).toLowerCase() === "true";
      const dist = occ ? 10 : 120;
      return {ts, dist};
    });
    // merge into slot history (keep chronological, limit 100)
    const existing = slotData[slot].history || [];
    // Simple replace: use fetched entries (assume they're historical), then keep last existing dynamic updates too
    slotData[slot].history = [...existing, ...entries].sort((a,b)=>a.ts-b.ts).slice(-100);
    // update last/updated from newest entry if present
    const last = slotData[slot].history[slotData[slot].history.length-1];
    if(last){
      slotData[slot].last = last.dist;
      slotData[slot].updated = last.ts;
    }
    updateCard(slot);
    if(slot === selected) selectSlot(slot);
  }catch(e){
    // network error - do nothing, keep demo or mqtt data
  }
}

function fetchAllHistories(){
  for(let i=1;i<=TOTAL;i++){
    const s = slotName(i);
    fetchSlotHistoryHttp(s);
  }
}

/* --- end new --- */

function connect(brokerUrl){
  if(client){
    try{ client.end(true); }catch(e){}
    client = null;
  }

  try{
    client = mqtt.connect(brokerUrl, {connectTimeout: 4000});
  }catch(e){
    console.error("MQTT connect error", e);
    return;
  }

  client.on("connect", () => {
    console.info("MQTT conectado");
    // subscribe to all parking slots distances
    client.subscribe(SUB_TOPIC, {qos:0}, (err) => {
      if(err) console.warn("subscribe error", err);
    });
  });

  client.on("reconnect", ()=>console.info("reconnecting..."));
  client.on("error", err => console.error("MQTT error", err));
  client.on("message", (topic, payload) => {
    try{
      const msg = payload.toString().trim();
      let dist = null;

      // Sensor sends plain "true" or "false" indicating occupied / free
      const lw = msg.toLowerCase();
      if(lw === "true" || lw === "false"){
        const occupied = lw === "true";
        dist = occupied ? 10 : 120; // distance proxy
      } else if(/^[\d.]+$/.test(msg)){
        // fallback numeric payload (legacy)
        dist = parseFloat(msg);
      }else{
        // try JSON payload with distance field
        try{
          const parsed = JSON.parse(msg);
          if(typeof parsed === "object" && parsed !== null){
            if(parsed.distance !== undefined) dist = Number(parsed.distance);
            else if(parsed.dist !== undefined) dist = Number(parsed.dist);
          }
        }catch(e){}
      }

      // parse topic to extract slot name
      const slot = extractSlotFromTopic(topic);
      if(slot && slotData[slot]){
          const ts = Date.now();
          slotData[slot].last = (dist===null)?slotData[slot].last:dist;
          slotData[slot].updated = ts;
          // push history (keep last 100)
          if(dist !== null){
            slotData[slot].history.push({ts, dist});
            if(slotData[slot].history.length > 100) slotData[slot].history.shift();
          }
          updateCard(slot);
          if(slot === selected) selectSlot(slot);
        
      }
    }catch(e){
      console.error("msg parse error", e);
    }
  });
}

// initial setup
createCards();
initChart();
selectSlot(selected);

/* attempts to connect on load using broker defined in code */
connect(MQTT_BROKER);

// fetch HTTP histories once on load
fetchAllHistories();

// periodically refresh HTTP histories (every 30s)
setInterval(fetchAllHistories, 30_000);

// keyboard navigation (accessibility): arrow keys change selection
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

// For demo: generate fake sensor data when running without broker
let demoTimer = setInterval(()=>{
  // only simulate if broker seems disconnected
  if(!client || client.disconnected){
    // randomly pick a slot and assign a distance between 10 and 150
    const i = Math.floor(Math.random()*TOTAL)+1;
    const slot = slotName(i);
    const dist = Math.random()*140 + 10;
    const ts = Date.now();
    slotData[slot].last = dist;
    slotData[slot].updated = ts;
    slotData[slot].history.push({ts, dist});
    if(slotData[slot].history.length > 100) slotData[slot].history.shift();
    updateCard(slot);
    if(slot === selected) selectSlot(slot);
  }
}, 2500);

// helper to expose slotName in module scope
window.__parking_utils__ = {slotName, fetchSlotHistoryHttp};