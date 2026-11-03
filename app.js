const $ = (s) => document.querySelector(s);
const m = new Map();
let c = null,
  L = [],
  bad = new Set();
const u = {
  preset: $("#sitePreset"),
  base: $("#siteBase"),
  input: $("#tagInput"),
  add: $("#addTag"),
  clear: $("#clearTags"),
  gen: $("#gen"),
  reset: $("#resetZoom"),
  autoY: $("#autoY"),
  exportCSV: $("#exportCSV"),
  chips: $("#chipsRow"),
  canvas: $("#chart"),
  overlay: $("#overlay"),
  status: $("#status")
};
const populatePresets = () => {
  for (const { url, label } of TAGINFO_SITES) {
    const option = document.createElement("option");
    option.value = url;
    option.textContent = label;
    u.preset.append(option);
  }
};
populatePresets();
const sh = (t) => {
  u.status.textContent = t;
  u.overlay.classList.add("show");
};
const hi = () => u.overlay.classList.remove("show");
const rnd = () => `#${Math.floor(Math.random() * 16777216).toString(16).padStart(6, "0")}`;
const ok = (t) => /^("?[\w:.-]+"?)(="?[^"]+"?)?$/.test(t.trim());
const clearChart = () => {
  c?.destroy?.();
  c = null;
  L = [];
  u.canvas.width = u.canvas.width;
};
const clr = () => {
  clearChart();
  bad.clear();
};
const site = () => {
  const b = (u.base.value || u.preset.value).trim().replace(/\/$/, "");
  if (!/^https?:\/\//.test(b)) throw new Error("URL inválida");
  return b;
};
const areaSel = () => {
  const v = u.preset.value.trim();
  if (/taginfo\.openstreetmap\.org\/?$/.test(v)) return "";
  const p = v.replace(/^https?:\/\/taginfo\.geofabrik\.de\//, "");
  if (p === v) return "";
  const a = p.split("/")[0] || "";
  const parts = a.split(":").slice(1);
  return parts.join(" ").replace(/-/g, " ").trim();
};
const dtOf = (d) =>
  d.includes("T") ? d : /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00Z` : d;
const tagSel = (t) => {
  const [kRaw, vRaw] = t.split("=");
  const k = kRaw.replace(/^"|"$/g, "");
  const v = vRaw?.replace(/^"|"$/g, "");
  return vRaw != null ? { k, v } : { k };
};
const overQ = (t, d, a) => {
  const dt = dtOf(d);
  const { k, v } = tagSel(t);
  let q = `[out:xml][timeout:24][maxsize:512Mi][date:"${dt}"];\n`;
  a && (q += `{{geocodeArea:${a}}}->.searchArea;\n`);
  q += `nwr["${k}"${v != null ? `="${v}"` : ""}]${
    a ? "(area.searchArea)" : ""
  };\nout center;`;
  return q;
};
const openOverpass = (t, d) => {
  if (!t || !d) return;
  const a = areaSel();
  const q = overQ(t, d, a);
  const w = window.open(
    `https://overpass-turbo.eu/?Q=${encodeURIComponent(q)}`,
    "_blank",
    "noopener"
  );
  w ||
    alert(
      "El navegador ha bloqueado la nueva pestaña. Permite popups para este sitio."
    );
};
const chrono = async (t, s) => {
  const [kRaw, vRaw] = t.split("=");
  const k = kRaw.replace(/^"|"$/g, "");
  const v = vRaw?.replace(/^"|"$/g, "");
  const url = v
    ? `${s}/api/4/tag/chronology?key=${encodeURIComponent(
        k
      )}&value=${encodeURIComponent(v)}`
    : `${s}/api/4/key/chronology?key=${encodeURIComponent(k)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${t} → ${r.status}`);
  const j = await r.json();
  const a = j.data || [];
  if (!a.length) throw new Error(`${t}: sin datos`);
  let acc = 0,
    d = [],
    y = [];
  for (const { date, nodes = 0, ways = 0, relations = 0 } of a) {
    acc += +nodes + +ways + +relations;
    d.push(date);
    y.push(acc);
  }
  return { t, dates: d, totals: y };
};
const labels = (rs) => [...new Set(rs.flatMap((r) => r.dates))].sort();
const datasets = (rs) => {
  L = labels(rs);
  return rs.map(({ t, dates, totals }) => {
    const map = Object.fromEntries(dates.map((d, i) => [d, totals[i]]));
    const first = L.findIndex((d) => d in map);
    let v = 0;
    const data = L.map((d, i) => {
      if (first === -1 || i < first) return 0;
      if (d in map) v = map[d];
      return v;
    });
    return {
      label: t,
      data,
      borderWidth: 2,
      tension: 0,
      borderColor: m.get(t),
      pointRadius: 0,
      spanGaps: false
    };
  });
};
const col2 = ["#1dd16a", "#ff4b4b"],
  col3 = ["#1dd16a", "#ffd53b", "#ff4b4b"];
const rank = (ds) => {
  const a = ds
    .map((d) => ({ d, max: Math.max(...d.data) }))
    .sort((x, y) => y.max - x.max);
  const n = a.length;
  a.forEach((o, i) => {
    const { d } = o,
      t = d.label;
    let col;
    if (n === 1) col = col3[0];
    else if (n === 2) col = i < 2 ? col2[i] : m.get(t) || rnd();
    else col = i < 3 ? col3[i] : m.get(t) || rnd();
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
  if (typeof v === "number")
    return Math.max(0, Math.min(chart.data.labels.length - 1, Math.round(v)));
  const i = chart.data.labels.indexOf(v);
  if (i > -1) return i;
  const px = sx.getPixelForValue(v);
  let bi = 0,
    bd = 1e18;
  for (let j = 0; j < chart.data.labels.length; j++) {
    const d = Math.abs(
      (sx.getPixelForValue(chart.data.labels[j]) || 0) - (x || px || 0)
    );
    if (d < bd) {
      bd = d;
      bi = j;
    }
  }
  return bi;
};
const pickDS = (chart, i, y) => {
  const sy = chart.scales.y;
  let bi = -1,
    bd = 1e18;
  for (let di = 0; di < chart.data.datasets.length; di++) {
    if (!chart.isDatasetVisible(di)) continue;
    const v = chart.data.datasets[di].data[i];
    if (v == null) continue;
    const py = sy.getPixelForValue(v);
    const d = Math.abs(py - y);
    if (d < bd) {
      bd = d;
      bi = di;
    }
  }
  return bi;
};
const draw = (lbl, ds) => {
  c?.destroy?.();
  c = new Chart(u.canvas, {
    type: "line",
    data: { labels: lbl, datasets: ds },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", axis: "x", intersect: false },
      onClick: (ev, els, chart) => {
        const e = ev?.native || ev;
        const x = ev.x ?? e?.offsetX ?? e?.clientX ?? 0;
        const y = ev.y ?? e?.offsetY ?? e?.clientY ?? 0;
        const i = xIdx(chart, x);
        const di = pickDS(chart, i, y);
        if (di < 0) return;
        openOverpass(chart.data.datasets[di]?.label, chart.data.labels[i]);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          itemSort: (a, b) => (a.dataset._rank ?? 0) - (b.dataset._rank ?? 0)
        },
        zoom: {
          pan: { enabled: true, mode: "x" },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: "x"
          }
        }
      },
      elements: { line: { tension: 0 }, point: { radius: 0 } },
      scales: {
        x: {
          ticks: { color: "#9aa3ad" },
          grid: { color: "rgba(255,255,255,0.02)" }
        },
        y: {
          ticks: { color: "#9aa3ad" },
          grid: { color: "rgba(255,255,255,0.02)" }
        }
      }
    }
  });
  u.canvas.style.cursor = "pointer";
};
const chips = () => {
  u.chips.innerHTML = "";
  m.forEach((color, t) => {
    const el = document.createElement("div");
    el.className = "tag" + (bad.has(t) ? " bad" : "");
    el.title = bad.has(t) ? "Sin datos en esta zona" : "";
    const label = document.createElement("div");
    label.className = "lbl";
    label.textContent = t;
    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = color;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", "Eliminar");
    remove.textContent = "✖";
    el.append(label, picker, remove);
    picker.oninput = (e) => {
      const v = e.target.value;
      m.set(t, v);
      if (c) {
        const ds = c.data.datasets.find((d) => d.label === t);
        if (ds) {
          ds.borderColor = v;
          c.update("none");
        }
      }
    };
    remove.onclick = () => {
      m.delete(t);
      bad.delete(t);
      chips();
      if (c) {
        c.data.datasets = c.data.datasets.filter((d) => d.label !== t);
        c.data.datasets.length ? c.update() : clr();
      } else if (!m.size) clr();
    };
    u.chips.append(el);
  });
};
const run = async () => {
  if (!m.size) return;
  sh("Consultando Taginfo…");
  try {
    const s = site();
    bad.clear();
    const tags = [...m.keys()];
    const res = await Promise.allSettled(tags.map((t) => chrono(t, s)));
    const okRs = [],
      errMsg = [];
    res.forEach((r, i) => {
      if (r.status === "fulfilled") okRs.push(r.value);
      else {
        bad.add(tags[i]);
        errMsg.push(r.reason?.message || String(r.reason));
      }
    });
    if (!okRs.length) throw new Error(errMsg[0] || "sin datos");
    const ds = datasets(okRs);
    rank(ds);
    draw(L, ds);
    chips();
    const q = new URLSearchParams({ tags: tags.join(","), site: s });
    history.replaceState(null, "", `${location.pathname}?${q.toString()}`);
    if (errMsg.length) {
      u.status.textContent = "⚠️ Parcial: " + errMsg.join(" · ");
      setTimeout(hi, 2000);
      return;
    }
  } catch (e) {
    clearChart();
    chips();
    u.status.textContent = "❌ " + e.message;
    setTimeout(hi, 1600);
    return;
  }
  setTimeout(hi, 600);
};
const csv = () => {
  if (!c) return;
  const hdr = ["date", ...c.data.datasets.map((d) => d.label)];
  const rows = L.map((date, i) => [
    date,
    ...c.data.datasets.map((d) => d.data[i] ?? 0)
  ]);
  const cell = (v) => {
    const s = String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? `\'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const txt = [hdr, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
  const blob = new Blob([txt], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tag-history.csv";
  a.click();
  URL.revokeObjectURL(url);
};
const autoY = () => {
  if (!c) return;
  const max = Math.max(
    ...c.data.datasets.flatMap((d) => d.data.map((v) => v || 0))
  );
  c.options.scales.y.max = Math.ceil(max * 1.05);
  c.update();
};
const fromURL = () => {
  const q = new URLSearchParams(location.search);
  const s = q.get("site");
  if (s) u.base.value = s;
  const t = q.get("tags");
  if (t) {
    t.split(/[;,]+/).map((x) => x.trim()).filter((x) => x && ok(x)).forEach((x) => m.set(x, rnd()));
    if (m.size) run();
  }
};
u.add.onclick = () => {
  const raw = u.input.value.trim();
  if (!raw) return;
  const parts = raw
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const badFmt = parts.filter((p) => !ok(p));
  if (badFmt.length) {
    sh("⚠️ Formato inválido en: " + badFmt.join(", "));
    setTimeout(hi, 1600);
    return;
  }
  parts.forEach((p) => {
    m.has(p) || m.set(p, rnd());
  });
  u.input.value = "";
  chips();
  run();
};
u.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    u.add.click();
  }
});
u.clear.onclick = () => {
  m.clear();
  chips();
  clr();
};
u.gen.onclick = run;
u.reset.onclick = () => c?.resetZoom?.();
u.autoY.onclick = autoY;
u.exportCSV.onclick = csv;
u.preset.onchange = () => {
  u.base.value = u.preset.value;
  clr();
  chips();
};
fromURL();
