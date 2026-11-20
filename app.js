// Forutsetter globale: SunCalc (suncalc.js) og GATER (data fra OSM, se hent_data.py)
const LAT = 58.14615, LON = 7.9959, AAR = 2026;
const SLOT = 5; // minutter per steg i simuleringen
const HENGE_TOL = 1.5; // grader: hvor nøyaktig sola må følge gata for en «henge»
const HENGE_H = 1; // grader: maks solhøyde for en «henge» (sola nede ved horisonten)
const TOLERANSE = 8; // grader: hvor nær solretningen en gate må ligge for å regnes som «i sol»
const NSLOT = 1440 / SLOT;
const RAD = Math.PI / 180;
const $ = (id) => document.getElementById(id);

// ---------- Geometri: del gatene i små segmenter med lengde og retning (akse 0-180°) ----------
const mPerLat = 111320, mPerLon = 111320 * Math.cos(LAT * RAD);
const segmenter = [];
for (const g of GATER) {
  for (let i = 1; i < g.coords.length; i++) {
    const dx = (g.coords[i][0] - g.coords[i - 1][0]) * mPerLon;
    const dy = (g.coords[i][1] - g.coords[i - 1][1]) * mPerLat;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    const brg = ((Math.atan2(dx, dy) / RAD) + 360) % 180; // kompass, brettet til akse
    segmenter.push({ len, brg, g, i });
  }
}
const totalLen = segmenter.reduce((s, x) => s + x.len, 0);

// Lengde per 1°-bin (180 stk) av gateakser
const bin = new Float64Array(180);
for (const s of segmenter) bin[Math.floor(s.brg) % 180] += s.len;

/** Andel av gatelengden hvis akse ligger innen ±tol grader av azimut (kompass) */
function andel(azimut, tol) {
  const c = Math.floor(((azimut % 180) + 180) % 180);
  let sum = 0;
  for (let k = -tol; k <= tol; k++) sum += bin[(c + k + 360) % 180];
  return sum / totalLen;
}
function vinkelDiff(a, b) { // forskjell mellom to akser, 0-90
  const d = Math.abs(((a - b) % 180 + 180) % 180);
  return Math.min(d, 180 - d);
}

// To dominante akser (peaks i den lengdevektede retningsfordelingen)
function dominanteAkser() {
  const glatt = (c, w = 6) => { let s = 0; for (let k = -w; k <= w; k++) s += bin[(c + k + 180) % 180]; return s; };
  let a = 0;
  for (let c = 0; c < 180; c++) if (glatt(c) > glatt(a)) a = c;
  let b = -1;
  for (let c = 0; c < 180; c++) if (vinkelDiff(c, a) > 30 && (b < 0 || glatt(c) > glatt(b))) b = c;
  return [a, b];
}
const [AKSE_A, AKSE_B] = dominanteAkser();

// Orientasjonsentropi som i osmnx (36 bin à 10°, over begge retninger av hver gate)
function entropi() {
  const h = new Float64Array(36), n = 36;
  for (const s of segmenter) {
    // osmnx teller begge retninger; bins er sentrert rundt 0, 10, 20 ...
    for (const b of [s.brg, (s.brg + 180) % 360]) h[Math.floor(((b + 5) % 360) / 10)] += s.len;
  }
  const sum = h.reduce((a, b) => a + b, 0);
  return -Array.from(h).filter((x) => x > 0).reduce((a, x) => a + (x / sum) * Math.log(x / sum), 0);
}

// ---------- Sol: SunCalc, norsk lokaltid ----------
const osloFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Oslo", hour12: false, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
function osloOffsetMs(utcMs) {
  const p = Object.fromEntries(osloFmt.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}
const offsetPerDag = [null]; // dag 1..365
for (let d = 1; d <= 365; d++) offsetPerDag.push(osloOffsetMs(Date.UTC(AAR, 0, d, 12)));

function sol(dag, minutt) {
  const ms = Date.UTC(AAR, 0, dag, 0, minutt) - offsetPerDag[dag];
  const p = SunCalc.getPosition(new Date(ms), LAT, LON);
  return { az: (p.azimuth / RAD + 180 + 360) % 360, h: p.altitude / RAD }; // SunCalc: azimut fra sør, mot vest
}
function datoFraDag(dag) { return new Date(Date.UTC(AAR, 0, dag)); }
function fmtDato(dag) { return datoFraDag(dag).toLocaleDateString("nb-NO", { day: "numeric", month: "long", timeZone: "UTC" }); }
function fmtTid(m) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }

// ---------- Simulering: hele året, hvert 5. minutt ----------
const sim = { az: new Float32Array(365 * NSLOT), h: new Float32Array(365 * NSLOT) };
for (let d = 1; d <= 365; d++) for (let k = 0; k < NSLOT; k++) {
  const s = sol(d, k * SLOT);
  sim.az[(d - 1) * NSLOT + k] = s.az; sim.h[(d - 1) * NSLOT + k] = s.h;
}
function simAndel(tol) {
  const out = new Float32Array(365 * NSLOT);
  const cache = new Float32Array(180).map((_, c) => andel(c, tol));
  for (let i = 0; i < out.length; i++) {
    if (sim.h[i] <= 0) { out[i] = -1; continue; }
    out[i] = cache[Math.round(sim.az[i] % 180) % 180];
  }
  return out;
}
let andelGrid = simAndel(8);

/** Beste tidspunkt per dag og hele året */
function funn(tol) {
  const per = [];
  for (let d = 1; d <= 365; d++) {
    let best = -1, bk = 0;
    for (let k = 0; k < NSLOT; k++) { const v = andelGrid[(d - 1) * NSLOT + k]; if (v > best) { best = v; bk = k; } }
    per.push({ dag: d, v: best, min: bk * SLOT });
  }
  return per;
}

// ---------- Tegning ----------
const kart = $("kart"), kc = kart.getContext("2d");
const bounds = (() => {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const g of GATER) for (const [lo, la] of g.coords) { x0 = Math.min(x0, lo); x1 = Math.max(x1, lo); y0 = Math.min(y0, la); y1 = Math.max(y1, la); }
  return { x0, x1, y0, y1 };
})();
function proj(lo, la, W, H, pad = 40) {
  const w = (bounds.x1 - bounds.x0) * mPerLon, h = (bounds.y1 - bounds.y0) * mPerLat;
  const sc = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
  return [W / 2 + ((lo - (bounds.x0 + bounds.x1) / 2) * mPerLon) * sc, H / 2 - ((la - (bounds.y0 + bounds.y1) / 2) * mPerLat) * sc];
}
function mixFarge(t) { // 0 = mørk blågrå, 1 = gul
  const a = [52, 70, 92], b = [255, 196, 40];
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(",")})`;
}

function tegnKart(s, tol) {
  const W = kart.width, H = kart.height;
  kc.clearRect(0, 0, W, H);
  const oppe = s.h > 0;
  // gater
  kc.lineCap = "round";
  for (const g of GATER) {
    for (let i = 1; i < g.coords.length; i++) {
      const dx = (g.coords[i][0] - g.coords[i - 1][0]) * mPerLon, dy = (g.coords[i][1] - g.coords[i - 1][1]) * mPerLat;
      const brg = ((Math.atan2(dx, dy) / RAD) + 360) % 180;
      const d = vinkelDiff(brg, s.az);
      const t = oppe ? Math.max(0, 1 - d / 45) ** 2 : 0;
      const treff = oppe && d <= tol;
      const [x1, y1] = proj(g.coords[i - 1][0], g.coords[i - 1][1], W, H), [x2, y2] = proj(g.coords[i][0], g.coords[i][1], W, H);
      kc.strokeStyle = mixFarge(t); kc.lineWidth = treff ? 5 : 3;
      if (treff) { kc.shadowColor = "rgba(255,176,0,.8)"; kc.shadowBlur = 12; } else kc.shadowBlur = 0;
      kc.beginPath(); kc.moveTo(x1, y1); kc.lineTo(x2, y2); kc.stroke();
    }
  }
  kc.shadowBlur = 0;
  // sol-pil fra kanten av kartet (sola kommer fra azimut-retningen)
  if (oppe) {
    const cx = W / 2, cy = H / 2, ux = Math.sin(s.az * RAD), uy = -Math.cos(s.az * RAD);
    const R = Math.min(W, H) / 2 - 14;
    kc.strokeStyle = "rgba(255,176,0,.35)"; kc.lineWidth = 1.5; kc.setLineDash([6, 6]);
    kc.beginPath(); kc.moveTo(cx - ux * R, cy - uy * R); kc.lineTo(cx + ux * R, cy + uy * R); kc.stroke(); kc.setLineDash([]);
    const sx = cx + ux * R, sy = cy + uy * R;
    kc.fillStyle = "#ffb000"; kc.shadowColor = "#ffb000"; kc.shadowBlur = 24;
    kc.beginPath(); kc.arc(sx, sy, 11, 0, 7); kc.fill(); kc.shadowBlur = 0;
    kc.strokeStyle = "#ffb000"; kc.lineWidth = 2;
    for (let a = 0; a < 8; a++) { const r = a * Math.PI / 4; kc.beginPath(); kc.moveTo(sx + Math.cos(r) * 16, sy + Math.sin(r) * 16); kc.lineTo(sx + Math.cos(r) * 22, sy + Math.sin(r) * 22); kc.stroke(); }
  } else {
    kc.fillStyle = "rgba(15,23,32,.55)"; kc.fillRect(0, 0, W, H);
    kc.fillStyle = "#8b9bab"; kc.font = "20px system-ui"; kc.textAlign = "center"; kc.fillText("Sola er under horisonten", W / 2, 34);
  }
  // nordpil
  kc.fillStyle = "#8b9bab"; kc.font = "bold 16px system-ui"; kc.textAlign = "center";
  kc.fillText("N ↑", W - 34, 30);
}

const pol = $("polar"), pc = pol.getContext("2d");
function tegnPolar(s, tol) {
  const W = pol.width, c = W / 2, R = c - 46;
  pc.clearRect(0, 0, W, W);
  pc.strokeStyle = "#2a3846"; pc.fillStyle = "#8b9bab"; pc.font = "14px system-ui"; pc.textAlign = "center"; pc.textBaseline = "middle"; pc.lineWidth = 1;
  for (const f of [0.5, 1]) { pc.beginPath(); pc.arc(c, c, R * f, 0, 7); pc.stroke(); }
  for (const [t, a] of [["N", 0], ["Ø", 90], ["S", 180], ["V", 270]]) pc.fillText(t, c + Math.sin(a * RAD) * (R + 20), c - Math.cos(a * RAD) * (R + 20));
  // histogram, 5°-bins, speilet (begge retninger)
  const B = 72, h = new Float64Array(B);
  for (const x of segmenter) { h[Math.floor(x.brg / 5) % B] += x.len; h[Math.floor(((x.brg + 180) % 360) / 5) % B] += x.len; }
  const mx = Math.max(...h);
  for (let i = 0; i < B; i++) {
    const a0 = (i * 5) * RAD, a1 = (i * 5 + 5) * RAD, r = R * Math.sqrt(h[i] / mx);
    // bin dekker aksen [i*5, i*5+5]; treff hvis sola er innen toleransen
    const mid = i * 5 + 2.5, treff = s.h > 0 && vinkelDiff(mid, s.az) <= tol;
    pc.fillStyle = treff ? "#ffb000" : "#4f7399";
    pc.beginPath(); pc.moveTo(c, c); pc.arc(c, c, r, a0 - Math.PI / 2, a1 - Math.PI / 2); pc.closePath(); pc.fill();
  }
  if (s.h > 0) {
    for (const az of [s.az, s.az + 180]) {
      pc.strokeStyle = "#ffb000"; pc.lineWidth = 2; pc.beginPath(); pc.moveTo(c, c); pc.lineTo(c + Math.sin(az * RAD) * R * 1.05, c - Math.cos(az * RAD) * R * 1.05); pc.stroke();
    }
    pc.fillStyle = "#ffb000"; pc.beginPath(); pc.arc(c + Math.sin(s.az * RAD) * R * 1.05, c - Math.cos(s.az * RAD) * R * 1.05, 6, 0, 7); pc.fill();
  }
}

const vc = $("varme"), vx = vc.getContext("2d");
const VW = 365, VH = NSLOT;
const img = document.createElement("canvas"); img.width = VW; img.height = VH;
function lagVarme() {
  const ic = img.getContext("2d"), id = ic.createImageData(VW, VH);
  const mx = Math.max(...andelGrid);
  for (let d = 0; d < 365; d++) for (let k = 0; k < NSLOT; k++) {
    const v = andelGrid[d * NSLOT + k], o = (k * VW + d) * 4;
    let rgb;
    if (v < 0) rgb = [15, 23, 32];
    else { const t = Math.min(1, v / Math.max(mx, 1e-9)); rgb = viridisLik(t); }
    id.data[o] = rgb[0]; id.data[o + 1] = rgb[1]; id.data[o + 2] = rgb[2]; id.data[o + 3] = 255;
  }
  ic.putImageData(id, 0, 0);
}
function viridisLik(t) { // enkel Viridis-interpolasjon
  const st = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
  const x = t * (st.length - 1), i = Math.min(st.length - 2, Math.floor(x)), f = x - i;
  return st[i].map((v, j) => Math.round(v + (st[i + 1][j] - v) * f));
}
const M = { l: 48, r: 10, t: 8, b: 26 };
function tegnVarme(dag, min) {
  const W = vc.width, H = vc.height, pw = W - M.l - M.r, ph = H - M.t - M.b;
  vx.clearRect(0, 0, W, H);
  vx.imageSmoothingEnabled = false;
  vx.drawImage(img, M.l, M.t, pw, ph);
  vx.fillStyle = "#8b9bab"; vx.font = "12px system-ui"; vx.textAlign = "right"; vx.textBaseline = "middle";
  for (let h = 0; h <= 24; h += 4) { const y = M.t + ph * h / 24; vx.fillText(String(h).padStart(2, "0") + ":00", M.l - 6, y); vx.strokeStyle = "rgba(255,255,255,.08)"; vx.beginPath(); vx.moveTo(M.l, y); vx.lineTo(W - M.r, y); vx.stroke(); }
  vx.textAlign = "center"; vx.textBaseline = "top";
  for (let m = 0; m < 12; m++) { const d = Math.floor((Date.UTC(AAR, m, 1) - Date.UTC(AAR, 0, 1)) / 864e5); vx.fillText(["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"][m], M.l + pw * (d + 15) / 365, H - M.b + 6); }
  // markør
  const x = M.l + pw * (dag - 0.5) / 365, y = M.t + ph * min / 1440;
  vx.strokeStyle = "#fff"; vx.lineWidth = 1; vx.beginPath(); vx.moveTo(x, M.t); vx.lineTo(x, M.t + ph); vx.moveTo(M.l, y); vx.lineTo(M.l + pw, y); vx.stroke();
  vx.fillStyle = "#ffb000"; vx.beginPath(); vx.arc(x, y, 5, 0, 7); vx.fill();
  // beste punkt
  if (best) { vx.strokeStyle = "#ff4d6d"; vx.lineWidth = 2; vx.beginPath(); vx.arc(M.l + pw * (best.dag - 0.5) / 365, M.t + ph * best.min / 1440, 7, 0, 7); vx.stroke(); }
}
vc.addEventListener("click", (e) => {
  const r = vc.getBoundingClientRect(), sx = vc.width / r.width;
  const x = (e.clientX - r.left) * sx - M.l, y = (e.clientY - r.top) * sx - M.t;
  const pw = vc.width - M.l - M.r, ph = vc.height - M.t - M.b;
  if (x < 0 || y < 0 || x > pw || y > ph) return;
  tilstand.dag = Math.min(365, Math.max(1, Math.floor(x / pw * 365) + 1));
  tilstand.min = Math.floor(y / ph * 1440 / 5) * 5;
  oppdater();
});

// ---------- Oppsummering ----------
let best = null;
function lagFunn() {
  const per = funn(tilstand.tol);
  best = per.reduce((a, b) => (b.v > a.v ? b : a));
  const perioder = hengePerioder();
  const rad = (p) => `<tr class="klikk" data-d="${p.midt}" data-m="${p.min}"><td>${fmtDato(p.fra)} – ${fmtDato(p.til)}<br><span class="note">${p.dager} dager</span></td><td>${fmtTid(p.min)}</td><td>${p.min < 720 ? "Soloppgang" : "Solnedgang"} i ${kompassNavn(p.az)}<br><span class="note" style="color:${p.farge}">langs ${kompassNavn(p.akse)}–${kompassNavn((p.akse + 180) % 360)}-gatene</span></td></tr>`;
  $("funn").innerHTML = `
    <table><tr><th>Datoer</th><th>Kl.</th><th>Hva</th></tr>${perioder.map(rad).join("")}</table>
    <p class="note">Perioder der sola står rett langs en hovedgate (±${HENGE_TOL}°) mens den er nede ved horisonten (under ${HENGE_H}°). Forutsetter flat horisont; bygninger og terreng kan flytte datoene noen dager. Klikk på en rad for å se øyeblikket.</p>`;
  for (const tr of $("funn").querySelectorAll("tr.klikk")) tr.onclick = () => { tilstand.dag = +tr.dataset.d; tilstand.min = +tr.dataset.m; oppdater(); };
}

/** Henge-perioder: sammenhengende dager der sola peker langs en hovedakse mens den er lavere enn HENGE_H */
function hengePerioder() {
  const ut = [];
  [AKSE_A, AKSE_B].forEach((akse, n) => {
    const dager = [];
    for (let d = 1; d <= 365; d++) {
      let b = null;
      for (let k = 0; k < NSLOT; k++) {
        const i = (d - 1) * NSLOT + k;
        if (sim.h[i] <= 0 || sim.h[i] > HENGE_H) continue;
        const df = vinkelDiff(sim.az[i], akse);
        if (df <= HENGE_TOL && (!b || df < b.df)) b = { df, min: k * SLOT, az: sim.az[i] };
      }
      if (b) dager.push({ d, ...b });
    }
    let gr = [];
    const lukk = () => {
      if (!gr.length) return;
      const m = gr[Math.floor(gr.length / 2)];
      ut.push({ akse, farge: AKSE_FARGE[n], fra: gr[0].d, til: gr[gr.length - 1].d, dager: gr.length, midt: m.d, min: m.min, az: m.az });
      gr = [];
    };
    for (const x of dager) { if (gr.length && x.d - gr[gr.length - 1].d > 2) lukk(); gr.push(x); }
    lukk();
  });
  return ut.sort((a, b) => a.fra - b.fra);
}

// ---------- Toppunkter: når peker sola langs hver av de to hovedretningene? ----------
const RETNING = ["nord", "nordøst", "øst", "sørøst", "sør", "sørvest", "vest", "nordvest"];
const kompassNavn = (az) => RETNING[Math.round(az / 45) % 8];
const AKSE_FARGE = ["#56b4e9", "#cc79a7"];
/** For hver hovedakse: tidspunktet den dagen sola peker best langs aksen. Der sola treffer to ganger (sommer),
 *  velges øyeblikket med høyest sol, så lyset faktisk er synlig over takene. */
function toppunkter(dag) {
  const ut = [];
  for (const akse of [AKSE_A, AKSE_B]) {
    let best = null, vindu = [];
    const lukk = () => {
      if (!vindu.length) return;
      const m = vindu.reduce((a, b) => (vinkelDiff(sim.az[b], akse) < vinkelDiff(sim.az[a], akse) ? b : a));
      if (!best || sim.h[m] > sim.h[best]) best = m;
      vindu = [];
    };
    for (let k = 0; k < NSLOT; k++) {
      const i = (dag - 1) * NSLOT + k;
      if (sim.h[i] > 0 && vinkelDiff(sim.az[i], akse) <= 3) vindu.push(i); else lukk();
    }
    lukk();
    if (best !== null) { const k = best - (dag - 1) * NSLOT; ut.push({ akse, min: k * SLOT, az: sim.az[best], h: sim.h[best], farge: AKSE_FARGE[akse === AKSE_A ? 0 : 1] }); }
  }
  return ut.sort((a, b) => a.min - b.min);
}
function tegnTopp(dag) {
  const tp = toppunkter(dag);
  $("tidmerker").innerHTML = tp.map((p) => `<button class="merke" style="left:calc(8px + (100% - 16px) * ${p.min / 1435});--c:${p.farge}" data-m="${p.min}" title="Sola langs ${p.akse}°-gatene"><i></i>${fmtTid(p.min)}</button>`).join("");
  for (const b of $("tidmerker").querySelectorAll("button")) b.onclick = () => { tilstand.min = +b.dataset.m; oppdater(); };
  const nar = dag === DAG_I_DAG ? "i dag" : "den " + fmtDato(dag);
  const del = tp.map((p) => `kl. <b>${fmtTid(p.min)}</b> fra <b>${kompassNavn(p.az)}</b> (${p.h.toFixed(0)}° over horisonten, langs <span style="color:${p.farge}">${kompassNavn(p.akse)}–${kompassNavn((p.akse + 180) % 360)}-gatene</span>)`);
  $("idag").innerHTML = tp.length ? `☀️ For å se lyset ${nar} bør du kikke langs gatene ${del.join(" og ")}.` : `${nar[0].toUpperCase() + nar.slice(1)} står ikke sola langs noen av hovedgatene.`;
}

// ---------- Tilstand og UI ----------
function dagIDag() { const n = new Date(), d = Math.floor((Date.UTC(AAR, n.getMonth(), n.getDate()) - Date.UTC(AAR, 0, 1)) / 864e5) + 1; return d; }
const tilstand = { dag: dagIDag(), min: 12 * 60, tol: TOLERANSE };
const DAG_I_DAG = dagIDag();
let spiller = null;
function oppdater(full = false) {
  const { dag, min, tol } = tilstand;
  $("dag").value = dag; $("dato").value = datoFraDag(dag).toISOString().slice(0, 10);
  $("tid").value = min; $("tidut").textContent = fmtTid(min);
  $("sTol").textContent = tol;
  tegnTopp(dag);
  const s = sol(dag, min), a = s.h > 0 ? andel(s.az, tol) : 0;
  $("sAz").textContent = s.h > 0 ? s.az.toFixed(1) + "°" : "–";
  $("sH").textContent = s.h.toFixed(1) + "°";
  $("sAndel").textContent = (a * 100).toFixed(0) + " %";
  tegnKart(s, tol); tegnPolar(s, tol); tegnVarme(dag, min);
}
function omregn() { andelGrid = simAndel(tilstand.tol); lagVarme(); lagFunn(); }

$("dag").oninput = (e) => { tilstand.dag = +e.target.value; oppdater(); };
$("dato").onchange = (e) => { const d = Math.floor((Date.parse(e.target.value) - Date.UTC(AAR, 0, 1)) / 864e5) + 1; if (d >= 1 && d <= 365) { tilstand.dag = d; oppdater(); } };
$("tid").oninput = (e) => { tilstand.min = +e.target.value; oppdater(); };
$("spill").onclick = () => {
  if (spiller) { clearInterval(spiller); spiller = null; $("spill").textContent = "▶ Spill av dagen"; return; }
  $("spill").textContent = "⏸ Stopp";
  spiller = setInterval(() => { tilstand.min = (tilstand.min + 5) % 1440; oppdater(); }, 120);
};
$("entropi").textContent = `Lengdevektet orientasjonsentropi: ${entropi().toFixed(2)} (skala: 1,39 = perfekt rutenett, 3,58 = helt uordnet). Gult felt = gater solen peker langs akkurat nå.`;

omregn(); oppdater();
// for testing i node
if (typeof module !== "undefined") module.exports = { sim, andelGrid, funn, AKSE_A, AKSE_B };
