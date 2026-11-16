const $ = (s) => document.querySelector(s);
const m = new Map();
const bad = new Set();
let c = null;
let L = [];
let requestId = 0;
let controller = null;
let bbox = [-9.5, 35.7, 4.4, 43.9];
let map = null;
let bboxSource = null;
let dragBox = null;
const STORE = { engine: "osmth.engine", key: "osmth.ohsome.key", config: "osmth.ohsome.config" };
const storage = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del: (k) => { try { localStorage.removeItem(k); } catch {} }
};
const u = {
  engine: $("#engine"), preset: $("#sitePreset"), base: $("#siteBase"), siteWrap: $("#siteWrap"),
  ohSettings: $("#ohsomeSettings"), ohKey: $("#ohKey"), ohSaveKey: $("#ohSaveKey"),
  ohForgetKey: $("#ohForgetKey"), ohKeyStatus: $("#ohKeyStatus"),
  ohAreaMode: $("#ohAreaMode"), ohBboxPanel: $("#ohBboxPanel"),
  ohStart: $("#ohStart"), ohEnd: $("#ohEnd"), ohInterval: $("#ohInterval"),
  ohWest: $("#ohWest"), ohSouth: $("#ohSouth"), ohEast: $("#ohEast"), ohNorth: $("#ohNorth"),
  ohBboxStatus: $("#ohBboxStatus"), ohApplyBbox: $("#ohApplyBbox"), ohSpainBbox: $("#ohSpainBbox"),
  ohMapDetails: $("#ohMapDetails"), ohDrawBbox: $("#ohDrawBbox"), ohViewBbox: $("#ohViewBbox"),
  input: $("#tagInput"), add: $("#addTag"), clear: $("#clearTags"), gen: $("#gen"),
  reset: $("#resetZoom"), autoY: $("#autoY"), exportCSV: $("#exportCSV"),
  chips: $("#chipsRow"), canvas: $("#chart"), overlay: $("#overlay"),
  status: $("#status"), note: $("#resultNote")
};
for (const { url, label } of TAGINFO_SITES) {
  const option = document.createElement("option");
  option.value = url;
  option.textContent = label;
  u.preset.append(option);
}
const sh = (t) => { u.status.textContent = t; u.overlay.classList.add("show"); };
const hi = () => u.overlay.classList.remove("show");
const hideAfter = (id, delay) => setTimeout(() => { if (id === requestId) hi(); }, delay);
const rnd = () => `#${Math.floor(Math.random() * 16777216).toString(16).padStart(6, "0")}`;
const ok = (t) => /^("?[\w:.-]+"?)(="?[^"]+"?)?$/.test(t.trim());
const selectedEngine = () => u.engine.value;
const stopRequest = () => { requestId++; controller?.abort(); controller = null; hi(); };
const clearChart = () => { c?.destroy?.(); c = null; L = []; u.canvas.width = u.canvas.width; };
const clr = () => { stopRequest(); clearChart(); bad.clear(); };
const stale = () => { clr(); u.note.textContent = "Configuración modificada. Genera el gráfico para actualizar los resultados."; u.note.classList.remove("error"); chips(); };
const site = () => {
  const b = (u.base.value || u.preset.value).trim().replace(/\/$/, "");
  if (!/^https?:\/\//.test(b)) throw new Error("URL Taginfo inválida");
  return b;
};
const areaSel = () => {
  const v = u.preset.value.trim();
  if (/taginfo\.openstreetmap\.org\/?$/.test(v)) return "";
  const p = v.replace(/^https?:\/\/taginfo\.geofabrik\.de\//, "");
  if (p === v) return "";
  const a = p.split("/")[0] || "";
  return a.split(":").slice(1).join(" ").replace(/-/g, " ").trim();
};
const tagSel = (t) => {
  const i = t.indexOf("=");
  const k = (i < 0 ? t : t.slice(0, i)).replace(/^"|"$/g, "");
  const v = i < 0 ? undefined : t.slice(i + 1).replace(/^"|"$/g, "");
  return { k, v };
};
const overQ = (t, d) => {
  const { k, v } = tagSel(t);
  const dt = d.includes("T") ? d : `${d}T00:00:00Z`;
  let q = `[out:xml][timeout:24][maxsize:512Mi][date:"${dt}"];\n`;
  const a = selectedEngine() === "taginfo" ? areaSel() : "";
  if (a) q += `{{geocodeArea:${a}}}->.searchArea;\n`;
  const b = selectedEngine() === "ohsome" && u.ohAreaMode.value === "bbox" ? `(${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]})` : a ? "(area.searchArea)" : "";
  const escapedKey = k.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedValue = v?.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  q += `nwr["${escapedKey}"${v !== undefined ? `="${escapedValue}"` : ""}]${b};\nout center;`;
  return q;
};
const openOverpass = (t, d) => {
  if (!t || !d) return;
  const q = overQ(t, d);
  const w = window.open("about:blank", "_blank");
  if (!w) { alert("El navegador ha bloqueado la nueva pestaña. Permite popups para este sitio."); return; }
  w.opener = null;
  w.location.replace(`https://overpass-turbo.eu/?Q=${encodeURIComponent(q)}`);
};
const parseResponse = async (r) => {
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch { throw new Error(`HTTP ${r.status}: respuesta no JSON`); }
  if (!r.ok) {
    const detail = j.detail || j.message || j.error || j.title || j;
    throw new Error(`HTTP ${r.status}: ${(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)}`);
  }
  return j;
};
const chronoTaginfo = async (t, s, signal) => {
  const { k, v } = tagSel(t);
  const url = v !== undefined ? `${s}/api/4/tag/chronology?key=${encodeURIComponent(k)}&value=${encodeURIComponent(v)}` : `${s}/api/4/key/chronology?key=${encodeURIComponent(k)}`;
  const j = await parseResponse(await fetch(url, { signal }));
  const a = j.data || [];
  if (!a.length) throw new Error(`${t}: sin cronología en Taginfo`);
  let acc = 0;
  const d = [];
  const y = [];
  for (const { date, nodes = 0, ways = 0, relations = 0 } of a) {
    acc += +nodes + +ways + +relations;
    d.push(date);
    y.push(acc);
  }
  return { t, dates: d, totals: y };
};
const validBbox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[0] >= -180 && b[2] <= 180 && b[1] >= -90 && b[3] <= 90 && b[0] < b[2] && b[1] < b[3];
const bboxFields = ["ohWest", "ohSouth", "ohEast", "ohNorth"];
const readBbox = () => bboxFields.map((id) => u[id].value.trim()).map((v) => v === "" ? NaN : Number(v));
const writeBbox = () => bboxFields.forEach((id, i) => { u[id].value = bbox[i]; });
const saveOhConfig = () => storage.set(STORE.config, JSON.stringify({ mode: u.ohAreaMode.value, bbox, start: u.ohStart.value, end: u.ohEnd.value, interval: u.ohInterval.value }));
const drawOutline = () => {
  if (!bboxSource || !window.ol) return;
  bboxSource.clear();
  const [w, s, e, n] = bbox;
  const clip = (lat) => Math.max(-85, Math.min(85, lat));
  const ring = [[w, clip(s)], [e, clip(s)], [e, clip(n)], [w, clip(n)], [w, clip(s)]].map((point) => ol.proj.fromLonLat(point));
  bboxSource.addFeature(new ol.Feature({ geometry: new ol.geom.Polygon([ring]) }));
};
const setBbox = (b, zoom = false) => {
  if (!validBbox(b)) throw new Error("BBOX inválido: oeste < este, sur < norte, longitudes ±180 y latitudes ±90");
  bbox = b.map((n) => Number(n.toFixed(6)));
  writeBbox();
  u.ohBboxStatus.textContent = `BBOX: ${bbox.join(", ")}`;
  drawOutline();
  saveOhConfig();
  if (zoom && map && window.ol) {
    const [w, s, e, n] = bbox;
    const extent = ol.proj.transformExtent([w, Math.max(-85, s), e, Math.min(85, n)], "EPSG:4326", "EPSG:3857");
    map.getView().fit(extent, { padding: [30, 30, 30, 30], maxZoom: 12, duration: 200 });
  }
};
const activeDrawing = (active) => {
  if (!dragBox) return;
  dragBox.setActive(active);
  u.ohDrawBbox.textContent = active ? "Cancelar dibujo" : "Dibujar BBOX";
  if (map) {
    const pan = map.getInteractions().getArray().find((i) => i instanceof ol.interaction.DragPan);
    if (pan) pan.setActive(!active);
  }
};
const initMap = () => {
  if (map) { map.updateSize(); return; }
  if (!window.ol) { u.ohBboxStatus.textContent = "No se pudo cargar OpenLayers; utiliza las coordenadas manuales."; return; }
  bboxSource = new ol.source.Vector({ wrapX: false });
  const outline = new ol.layer.Vector({ source: bboxSource, style: new ol.style.Style({ stroke: new ol.style.Stroke({ color: "#45d1ff", width: 2 }), fill: new ol.style.Fill({ color: "rgba(69,209,255,0.18)" }) }) });
  map = new ol.Map({ target: "ohMap", layers: [new ol.layer.Tile({ source: new ol.source.OSM({ referrerPolicy: "strict-origin-when-cross-origin" }) }), outline], view: new ol.View({ center: ol.proj.fromLonLat([-2.5, 40]), zoom: 4 }) });
  dragBox = new ol.interaction.DragBox({ condition: ol.events.condition.always });
  dragBox.setActive(false);
  map.addInteraction(dragBox);
  dragBox.on("boxend", () => {
    try { setBbox(ol.proj.transformExtent(dragBox.getGeometry().getExtent(), "EPSG:3857", "EPSG:4326")); stale(); } catch (e) { u.ohBboxStatus.textContent = e.message; }
    activeDrawing(false);
  });
  drawOutline();
  setBbox(bbox, true);
};
const filterTerm = (v) => /^[a-zA-Z0-9_:-]+$/.test(v) ? v : `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const filterTag = (t) => {
  const { k, v } = tagSel(t);
  return `${filterTerm(k)}=${v === undefined ? "*" : filterTerm(v)}`;
};
const ohConfig = () => {
  const key = u.ohKey.value.trim();
  if (!key) throw new Error("Introduce la API key de ohsome");
  const start = u.ohStart.value;
  const end = u.ohEnd.value;
  if (!start || !end || start < "2007-10-08" || start >= end || end > new Date().toISOString().slice(0, 10)) throw new Error("Intervalo de fechas inválido para ohsome");
  const interval = u.ohInterval.value;
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
  if (interval === "P1D" && days > 999 || interval === "P1W" && days > 6993) throw new Error("ohsome admite un máximo de 1000 fechas. Selecciona un intervalo mayor o acorta el periodo.");
  if (u.ohAreaMode.value === "bbox") setBbox(readBbox());
  const aoi = u.ohAreaMode.value === "world" ? [-180, -90, 180, 90] : [...bbox];
  saveOhConfig();
  u.ohKeyStatus.textContent = storage.set(STORE.key, key) ? "Clave guardada en este navegador." : "No se pudo guardar la clave.";
  return { key, aoi, time: { start, end, interval } };
};
const chronoOhsome = async (t, config, signal) => {
  const body = { aoi: config.aoi, filter: filterTag(t), time: config.time };
  const r = await fetch("https://api.heigit.org/ohsome-api/v2/stats/features/count.json", { method: "POST", headers: { Authorization: config.key, "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const j = await parseResponse(r);
  const dates = j.result?.timestamp;
  const values = j.result?.value;
  if (!Array.isArray(dates) || !Array.isArray(values) || !dates.length || dates.length !== values.length || values.some((v) => !Number.isFinite(v))) throw new Error(`${t}: ohsome no devolvió una serie válida`);
  return { t, dates: dates.map((d) => d.slice(0, 10)), totals: values };
};
const labels = (rs) => [...new Set(rs.flatMap((r) => r.dates))].sort();
const datasets = (rs) => {
  L = labels(rs);
  return rs.map(({ t, dates, totals }) => {
    const lookup = Object.fromEntries(dates.map((d, i) => [d, totals[i]]));
    const first = L.findIndex((d) => d in lookup);
    let v = 0;
    const data = L.map((d, i) => { if (first === -1 || i < first) return 0; if (d in lookup) v = lookup[d]; return v; });
    return { label: t, data, borderWidth: 2, tension: 0, borderColor: m.get(t), pointRadius: 0, spanGaps: false };
  });
};
const col2 = ["#1dd16a", "#ff4b4b"];
const col3 = ["#1dd16a", "#ffd53b", "#ff4b4b"];
const rank = (ds) => {
  const a = ds.map((d) => ({ d, max: Math.max(...d.data) })).sort((x, y) => y.max - x.max);
  const n = a.length;
  a.forEach((o, i) => {
    const { d } = o;
    const t = d.label;
    const col = n === 1 ? col3[0] : n === 2 ? col2[i] : i < 3 ? col3[i] : m.get(t) || rnd();
    m.set(t, col);
    d.borderColor = col;
    d._rank = i;
  });
  const ord = [...m.entries()].sort((A, B) => {
    const da = ds.find((d) => d.label === A[0]);
    const db = ds.find((d) => d.label === B[0]);
    return (da ? da._rank : 0) - (db ? db._rank : 0);
  });
  m.clear();
  ord.forEach(([k, v]) => m.set(k, v));
};
const xIdx = (chart, x) => {
  const sx = chart.scales.x;
  const v = sx.getValueForPixel(x);
  if (typeof v === "number") return Math.max(0, Math.min(chart.data.labels.length - 1, Math.round(v)));
  const i = chart.data.labels.indexOf(v);
  if (i > -1) return i;
  const px = sx.getPixelForValue(v);
  let bi = 0;
  let bd = Infinity;
  for (let j = 0; j < chart.data.labels.length; j++) {
    const d = Math.abs((sx.getPixelForValue(chart.data.labels[j]) || 0) - (x || px || 0));
    if (d < bd) { bd = d; bi = j; }
  }
  return bi;
};
const pickDS = (chart, i, y) => {
  const sy = chart.scales.y;
  let bi = -1;
  let bd = Infinity;
  for (let di = 0; di < chart.data.datasets.length; di++) {
    if (!chart.isDatasetVisible(di)) continue;
    const v = chart.data.datasets[di].data[i];
    if (v == null) continue;
    const d = Math.abs(sy.getPixelForValue(v) - y);
    if (d < bd) { bd = d; bi = di; }
  }
  return bi;
};
const draw = (lbl, ds) => {
  c?.destroy?.();
  if (!window.Chart) throw new Error("No se pudo cargar Chart.js");
  c = new Chart(u.canvas, {
    type: "line", data: { labels: lbl, datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "nearest", axis: "x", intersect: false },
      onClick: (ev, els, chart) => {
        const e = ev?.native || ev;
        const x = ev.x ?? e?.offsetX ?? e?.clientX ?? 0;
        const y = ev.y ?? e?.offsetY ?? e?.clientY ?? 0;
        const i = xIdx(chart, x);
        const di = pickDS(chart, i, y);
        if (di >= 0) openOverpass(chart.data.datasets[di]?.label, chart.data.labels[i]);
      },
      plugins: {
        legend: { display: false },
        tooltip: { itemSort: (a, b) => (a.dataset._rank ?? 0) - (b.dataset._rank ?? 0) },
        zoom: { pan: { enabled: true, mode: "x" }, zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" } }
      },
      elements: { line: { tension: 0 }, point: { radius: 0 } },
      scales: { x: { ticks: { color: "#9aa3ad" }, grid: { color: "rgba(255,255,255,0.02)" } }, y: { ticks: { color: "#9aa3ad" }, grid: { color: "rgba(255,255,255,0.02)" } } }
    }
  });
  u.canvas.style.cursor = "pointer";
};
const chips = () => {
  u.chips.innerHTML = "";
  m.forEach((color, t) => {
    const el = document.createElement("div");
    el.className = "tag" + (bad.has(t) ? " bad" : "");
    el.title = bad.has(t) ? "Sin datos para esta consulta" : "";
    const label = document.createElement("div");
    label.className = "lbl";
    label.textContent = t;
    const picker = document.createElement("input");
    picker.type = "color";
    picker.setAttribute("aria-label", `Color de ${t}`);
    picker.value = color;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `Eliminar ${t}`);
    remove.textContent = "✖";
    el.append(label, picker, remove);
    picker.oninput = (e) => {
      const v = e.target.value;
      m.set(t, v);
      if (c) { const ds = c.data.datasets.find((d) => d.label === t); if (ds) { ds.borderColor = v; c.update("none"); } }
    };
    remove.onclick = () => {
      stopRequest();
      m.delete(t);
      bad.delete(t);
      chips();
      if (c) { c.data.datasets = c.data.datasets.filter((d) => d.label !== t); c.data.datasets.length ? c.update() : clr(); }
      else if (!m.size) clr();
    };
    u.chips.append(el);
  });
};
const run = async () => {
  if (!m.size) { u.note.textContent = "Añade al menos una etiqueta."; return; }
  stopRequest();
  const id = requestId;
  const engine = selectedEngine();
  let conf;
  let base;
  try { if (engine === "ohsome") conf = ohConfig(); else base = site(); }
  catch (e) { u.note.textContent = e.message; u.note.classList.add("error"); return; }
  controller = new AbortController();
  sh(`Consultando ${engine === "ohsome" ? "ohsome" : "Taginfo"}…`);
  u.note.textContent = "";
  u.note.classList.remove("error");
  try {
    bad.clear();
    const tags = [...m.keys()];
    const res = await Promise.allSettled(tags.map((t) => engine === "ohsome" ? chronoOhsome(t, conf, controller.signal) : chronoTaginfo(t, base, controller.signal)));
    if (id !== requestId) return;
    const okRs = [];
    const errors = [];
    res.forEach((r, i) => {
      if (r.status === "fulfilled") okRs.push(r.value);
      else { bad.add(tags[i]); errors.push(r.reason?.message || String(r.reason)); }
    });
    if (!okRs.length) throw new Error(errors.join(" · ") || "Sin datos");
    const ds = datasets(okRs);
    rank(ds);
    draw(L, ds);
    chips();
    const q = engine === "taginfo" ? new URLSearchParams({ tags: tags.join(","), site: base }) : new URLSearchParams({ engine: "ohsome", tags: tags.join(","), area: u.ohAreaMode.value, start: conf.time.start, end: conf.time.end, interval: conf.time.interval, ...(u.ohAreaMode.value === "bbox" ? { bbox: bbox.join(",") } : {}) });
    history.replaceState(null, "", `${location.pathname}?${q.toString()}`);
    u.note.textContent = `${engine === "ohsome" ? "ohsome v2" : "Taginfo"} · ${okRs.length} serie(s) · ${L.length} fechas${errors.length ? ` · Errores: ${errors.join(" · ")}` : ""}`;
    if (errors.length) { u.note.classList.add("error"); hideAfter(id, 500); return; }
  } catch (e) {
    if (id !== requestId) return;
    clearChart();
    chips();
    u.note.textContent = e.message;
    u.note.classList.add("error");
    u.status.textContent = `Error: ${e.message}`;
    hideAfter(id, 1900);
    return;
  } finally { if (id === requestId) controller = null; }
  hideAfter(id, 550);
};
const csv = () => {
  if (!c) return;
  const hdr = ["date", ...c.data.datasets.map((d) => d.label)];
  const rows = L.map((date, i) => [date, ...c.data.datasets.map((d) => d.data[i] ?? 0)]);
  const cell = (v) => {
    const s = String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const txt = [hdr, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "tag-history.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const autoY = () => {
  if (!c) return;
  let max = 0;
  for (const d of c.data.datasets) for (const v of d.data) if (Number.isFinite(v) && v > max) max = v;
  c.options.scales.y.max = Math.ceil(max * 1.05) || 1;
  c.update();
};
const showEngine = (clear = true) => {
  const ohsome = selectedEngine() === "ohsome";
  u.siteWrap.hidden = ohsome;
  u.ohSettings.hidden = !ohsome;
  if (clear) stale();
  storage.set(STORE.engine, u.engine.value);
  if (ohsome && u.ohMapDetails.open && u.ohAreaMode.value === "bbox") requestAnimationFrame(initMap);
};
const showBbox = (clear = true) => {
  u.ohBboxPanel.hidden = u.ohAreaMode.value !== "bbox";
  activeDrawing(false);
  if (clear) stale();
  saveOhConfig();
  if (!u.ohBboxPanel.hidden && u.ohMapDetails.open) requestAnimationFrame(initMap);
};
const saveKey = () => {
  const key = u.ohKey.value.trim();
  if (!key) { u.ohKeyStatus.textContent = "Introduce una clave."; return; }
  u.ohKeyStatus.textContent = storage.set(STORE.key, key) ? "Clave guardada en este navegador." : "No se pudo guardar la clave.";
};
const initSaved = () => {
  u.ohEnd.value = new Date().toISOString().slice(0, 10);
  try {
    const saved = JSON.parse(storage.get(STORE.config) || "null");
    if (saved && typeof saved === "object") {
      if (validBbox(saved.bbox)) bbox = saved.bbox;
      if (["world", "bbox"].includes(saved.mode)) u.ohAreaMode.value = saved.mode;
      if (/^\d{4}-\d{2}-\d{2}$/.test(saved.start || "")) u.ohStart.value = saved.start;
      if (/^\d{4}-\d{2}-\d{2}$/.test(saved.end || "")) u.ohEnd.value = saved.end;
      if (["P1Y", "P1M", "P1W", "P1D"].includes(saved.interval)) u.ohInterval.value = saved.interval;
    }
  } catch {}
  const key = storage.get(STORE.key);
  if (key) { u.ohKey.value = key; u.ohKeyStatus.textContent = "Clave recuperada del navegador."; }
  else u.ohKeyStatus.textContent = "Guarda tu clave para próximas visitas.";
  const savedEngine = storage.get(STORE.engine);
  if (savedEngine === "ohsome") u.engine.value = "ohsome";
  const q = new URLSearchParams(location.search);
  const siteUrl = q.get("site");
  if (siteUrl) { u.base.value = siteUrl; if ([...u.preset.options].some((o) => o.value === siteUrl)) u.preset.value = siteUrl; u.engine.value = "taginfo"; }
  if (q.get("engine") === "ohsome") u.engine.value = "ohsome";
  if (q.get("area") && ["world", "bbox"].includes(q.get("area"))) u.ohAreaMode.value = q.get("area");
  if (q.has("bbox")) { const b = q.get("bbox").split(",").map(Number); if (validBbox(b)) bbox = b; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.get("start") || "")) u.ohStart.value = q.get("start");
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.get("end") || "")) u.ohEnd.value = q.get("end");
  if (["P1Y", "P1M", "P1W", "P1D"].includes(q.get("interval"))) u.ohInterval.value = q.get("interval");
  writeBbox();
  u.ohBboxStatus.textContent = `BBOX: ${bbox.join(", ")}`;
  showEngine(false);
  showBbox(false);
  const tags = q.get("tags");
  if (tags) {
    tags.split(/[,;]+/).map((t) => t.trim()).filter((t) => t && ok(t)).forEach((t) => m.set(t, rnd()));
    chips();
    if (m.size) run();
  }
};
u.add.onclick = () => {
  const raw = u.input.value.trim();
  if (!raw) return;
  const parts = raw.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean);
  const badFmt = parts.filter((p) => !ok(p));
  if (badFmt.length) { u.note.textContent = "Formato inválido: " + badFmt.join(", "); u.note.classList.add("error"); return; }
  parts.forEach((p) => { if (!m.has(p)) m.set(p, rnd()); });
  u.input.value = "";
  chips();
  run();
};
u.input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); u.add.click(); } });
u.clear.onclick = () => { m.clear(); chips(); clr(); u.note.textContent = ""; u.note.classList.remove("error"); };
u.gen.onclick = run;
u.reset.onclick = () => c?.resetZoom?.();
u.autoY.onclick = autoY;
u.exportCSV.onclick = csv;
u.engine.addEventListener("change", () => showEngine());
u.base.addEventListener("input", stale);
u.preset.onchange = () => { u.base.value = u.preset.value; stale(); };
u.ohSaveKey.onclick = saveKey;
u.ohForgetKey.onclick = () => { storage.del(STORE.key); u.ohKey.value = ""; u.ohKeyStatus.textContent = "Clave eliminada del navegador."; stale(); };
u.ohAreaMode.addEventListener("change", () => showBbox());
for (const input of [u.ohStart, u.ohEnd, u.ohInterval]) input.addEventListener("change", () => { saveOhConfig(); stale(); });
u.ohKey.addEventListener("change", stale);
u.ohApplyBbox.onclick = () => { try { setBbox(readBbox(), true); stale(); } catch (e) { u.ohBboxStatus.textContent = e.message; } };
u.ohSpainBbox.onclick = () => { setBbox([-9.5, 35.7, 4.4, 43.9], true); stale(); };
u.ohMapDetails.addEventListener("toggle", () => { if (u.ohMapDetails.open && selectedEngine() === "ohsome" && u.ohAreaMode.value === "bbox") requestAnimationFrame(initMap); else activeDrawing(false); });
u.ohDrawBbox.onclick = () => { if (!dragBox) return; activeDrawing(!dragBox.getActive()); };
u.ohViewBbox.onclick = () => {
  if (!map || !window.ol) return;
  try {
    const extent = ol.proj.transformExtent(map.getView().calculateExtent(map.getSize()), "EPSG:3857", "EPSG:4326");
    const b = [Math.max(-180, extent[0]), Math.max(-90, extent[1]), Math.min(180, extent[2]), Math.min(90, extent[3])];
    setBbox(b);
    stale();
  } catch (e) { u.ohBboxStatus.textContent = e.message; }
};
initSaved();
