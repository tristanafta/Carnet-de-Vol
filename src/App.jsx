import React, { useState, useEffect, useMemo } from "react";
import { Plane, Plus, X, Clock, MapPin, TrendingUp, ChevronRight, Moon, Radio, Download, ChevronDown, Trash2 } from "lucide-react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { supabase } from "./supabaseClient";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');`;

const AIRCRAFT_TYPES = ["DA40 TDI", "DA40 NG", "C172", "C172 JETA1", "DA42 TDI", "DA42 NG"];
const AIRCRAFT_COLORS = {
  "DA40 TDI": "#6FA787",
  "DA40 NG": "#5B9BD5",
  "C172": "#E8A33D",
  "C172 JETA1": "#D9822B",
  "DA42 TDI": "#B87FD9",
  "DA42 NG": "#E06C9F",
};
const DEFAULT_AIRPORTS = ["EICK", "EIWF", "EINN", "EISG", "EIWT", "EIDL"];
const TAGS = ["SE", "ME", "SPIC", "XC"];
const FONCTIONS = ["PIC", "CoPIC", "Dual", "Instructor"];

const emptyForm = {
  date: "", depart: "EICK", arrivee: "EICK", heureDep: "", heureArr: "",
  modele: "C172", immat: "", instructeur: "", lecon: "",
  tags: [], fonction: "Dual", nuit: false, ifr: false, attJour: 0, attNuit: 0,
};

function durationToMinutes(d) { if (!d) return 0; const [h, m] = d.split(":").map(Number); return h * 60 + m; }
function minutesToDuration(min) { const h = Math.floor(min / 60); const m = min % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
function formatDateFR(iso) { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; }
function monthLabel(iso) { const months = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"]; const [, m] = iso.split("-"); return months[parseInt(m, 10) - 1]; }

// Mapping between the app's camelCase fields and Supabase's snake_case columns
function fromDbRow(r) {
  return {
    id: r.id, date: r.date, depart: r.depart, arrivee: r.arrivee,
    heureDep: r.heure_dep, heureArr: r.heure_arr, duree: r.duree,
    modele: r.modele, immat: r.immat, instructeur: r.instructeur, lecon: r.lecon,
    tags: r.tags || [], fonction: r.fonction, nuit: r.nuit, ifr: r.ifr,
    attJour: r.att_jour, attNuit: r.att_nuit,
  };
}
function toDbRow(f) {
  return {
    date: f.date, depart: f.depart, arrivee: f.arrivee,
    heure_dep: f.heureDep, heure_arr: f.heureArr, duree: f.duree,
    modele: f.modele, immat: f.immat, instructeur: f.instructeur, lecon: f.lecon,
    tags: f.tags, fonction: f.fonction, nuit: f.nuit, ifr: f.ifr,
    att_jour: Number(f.attJour) || 0, att_nuit: Number(f.attNuit) || 0,
  };
}

export default function FlightLogApp() {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [expandedId, setExpandedId] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const [addingImmat, setAddingImmat] = useState(false);
  const [addingDepart, setAddingDepart] = useState(false);
  const [addingArrivee, setAddingArrivee] = useState(false);

  // Load flights from Supabase on mount
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("flights").select("*").order("date", { ascending: true });
      if (error) { setErrorMsg(error.message); }
      else { setFlights((data || []).map(fromDbRow)); }
      setLoading(false);
    })();
  }, []);

  // Derived dropdown options directly from your flight history
  const immats = useMemo(() => [...new Set(flights.map((f) => f.immat).filter(Boolean))], [flights]);
  const lieux = useMemo(() => {
    const set = new Set(DEFAULT_AIRPORTS);
    flights.forEach((f) => { if (f.depart) set.add(f.depart); if (f.arrivee) set.add(f.arrivee); });
    return [...set];
  }, [flights]);
  const instructors = useMemo(() => [...new Set(flights.map((f) => f.instructeur).filter(Boolean))], [flights]);

  const lastLecon = useMemo(() => {
    if (!flights.length) return "";
    const latest = flights.reduce((a, b) => (a.id > b.id ? a : b));
    return latest.lecon || "";
  }, [flights]);

  const totals = useMemo(() => {
    const t = { total: 0, SE: 0, ME: 0, PIC: 0, Dual: 0, Instructor: 0, CoPIC: 0, IFR: 0, Nuit: 0, attJour: 0, attNuit: 0 };
    flights.forEach((f) => {
      const min = durationToMinutes(f.duree);
      t.total += min;
      (f.tags || []).forEach((tag) => { if (t[tag] !== undefined) t[tag] += min; });
      if (f.fonction && t[f.fonction] !== undefined) t[f.fonction] += min;
      if (f.ifr) t.IFR += min;
      if (f.nuit) t.Nuit += min;
      t.attJour += Number(f.attJour) || 0;
      t.attNuit += Number(f.attNuit) || 0;
    });
    return t;
  }, [flights]);

  const thisMonthMinutes = useMemo(() => {
    const now = new Date();
    return flights.filter((f) => { const d = new Date(f.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
      .reduce((sum, f) => sum + durationToMinutes(f.duree), 0);
  }, [flights]);

  const monthlyData = useMemo(() => {
    const map = {};
    flights.forEach((f) => { if (!f.date) return; const key = f.date.slice(0, 7); map[key] = (map[key] || 0) + durationToMinutes(f.duree); });
    return Object.entries(map).sort().map(([key, min]) => ({ month: monthLabel(key + "-01"), hours: +(min / 60).toFixed(1) }));
  }, [flights]);

  const gaugePercent = Math.min(totals.total / (100 * 60), 1);

  function openAddForm() {
    setForm({ ...emptyForm, lecon: lastLecon });
    setAddingImmat(false); setAddingDepart(false); setAddingArrivee(false);
    setShowForm(true);
  }

  function toggleTag(tag) {
    setForm((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] }));
  }

  async function handleAddFlight() {
    if (!form.date) return;
    let duree = "";
    if (form.heureDep && form.heureArr) {
      const [dh, dm] = form.heureDep.split(":").map(Number);
      const [ah, am] = form.heureArr.split(":").map(Number);
      let diff = ah * 60 + am - (dh * 60 + dm);
      if (diff < 0) diff += 24 * 60;
      duree = minutesToDuration(diff);
    }
    const newFlight = { ...form, duree };
    setSaveState("saving");
    const { data, error } = await supabase.from("flights").insert([toDbRow(newFlight)]).select();
    if (error) { setErrorMsg(error.message); setSaveState("error"); return; }
    const saved = fromDbRow(data[0]);
    setFlights((prev) => [...prev, saved].sort((a, b) => a.date.localeCompare(b.date)));
    setSaveState("saved");
    setForm(emptyForm);
    setAddingImmat(false); setAddingDepart(false); setAddingArrivee(false);
    setShowForm(false);
  }

  async function handleDelete(id) {
    setFlights((prev) => prev.filter((f) => f.id !== id));
    const { error } = await supabase.from("flights").delete().eq("id", id);
    if (error) setErrorMsg(error.message);
  }

  function exportCSV() {
    const headers = ["Date","Depart","Arrivee","Heure dep","Heure arr","Duree","Modele","Immat","Instructeur","Lecon","Tags","Fonction","Nuit","IFR","Att. jour","Att. nuit"];
    const rows = flights.map((f) => [
      formatDateFR(f.date), f.depart, f.arrivee, f.heureDep, f.heureArr, f.duree, f.modele, f.immat,
      f.instructeur, f.lecon, (f.tags || []).join("/"), f.fonction, f.nuit ? "Oui" : "Non", f.ifr ? "Oui" : "Non",
      f.attJour, f.attNuit,
    ]);
    const summary = [
      [], ["RECAPITULATIF"],
      ["Total", minutesToDuration(totals.total)],
      ["SE", minutesToDuration(totals.SE)], ["ME", minutesToDuration(totals.ME)],
      ["PIC", minutesToDuration(totals.PIC)], ["CoPIC", minutesToDuration(totals.CoPIC)],
      ["Dual", minutesToDuration(totals.Dual)], ["Instructor", minutesToDuration(totals.Instructor)],
      ["IFR", minutesToDuration(totals.IFR)], ["Vol de nuit", minutesToDuration(totals.Nuit)],
      ["Atterrissages jour", totals.attJour], ["Atterrissages nuit", totals.attNuit],
    ];
    const csv = [headers, ...rows, ...summary].map((r) => r.map((c) => `"${c ?? ""}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "carnet_de_vol.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0A1522", color: "#7C93AC", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        Chargement du carnet de vol...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at top, #16283C 0%, #0A1522 55%, #08111C 100%)", color: "#EDE6D6", fontFamily: "'Inter', sans-serif", padding: "0 0 60px" }}>
      <style>{FONT_IMPORT}{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        .display { font-family: 'Space Grotesk', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        input, select { font-family: 'Inter', sans-serif; }
        .strip:hover { border-color: #E8A33D66 !important; }
        .add-btn:hover { background: #F2AE49 !important; }
        .ghost-btn:hover { background: #1C3552 !important; }
        .tag-chip { cursor: pointer; user-select: none; transition: all 0.12s; }
        .add-btn:focus-visible, .icon-btn:focus-visible, .tag-chip:focus-visible { outline: 2px solid #E8A33D; outline-offset: 2px; }
        @media (max-width: 640px) {
          .gauges { grid-template-columns: 1fr 1fr !important; }
          .form-grid { grid-template-columns: 1fr 1fr !important; }
          .totals-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      {errorMsg && (
        <div style={{ background: "#5C2A2A", color: "#F2D4D4", padding: "10px 24px", fontSize: 13 }}>
          Erreur de synchronisation : {errorMsg}
        </div>
      )}

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "28px 24px 20px", maxWidth: 980, margin: "0 auto", borderBottom: "1px solid #1E3552" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#14283D", border: "1px solid #E8A33D55", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Plane size={20} color="#E8A33D" style={{ transform: "rotate(45deg)" }} />
          </div>
          <div>
            <h1 className="display" style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Carnet de Vol</h1>
            <p className="mono" style={{ fontSize: 11, color: "#7C93AC", margin: 0, letterSpacing: 0.5 }}>
              EICK BASE · {saveState === "saving" ? "Sauvegarde..." : saveState === "saved" ? "Sauvegardé" : "Pilote"}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ghost-btn icon-btn" onClick={exportCSV} title="Exporter en CSV"
            style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: "#9FB4CB", border: "1px solid #24405C", borderRadius: 8, padding: "9px 12px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            <Download size={15} /> Exporter
          </button>
          <button className="add-btn icon-btn" onClick={openAddForm}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "#E8A33D", color: "#12200F", border: "none", borderRadius: 8, padding: "9px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            <Plus size={16} strokeWidth={2.5} /> Vol
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 980, margin: "0 auto", padding: "0 24px" }}>

        <div className="gauges" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 14, marginTop: 24 }}>
          <div style={{ background: "#12233866", border: "1px solid #1E3552", borderRadius: 14, padding: "20px", display: "flex", alignItems: "center", gap: 18 }}>
            <svg width="70" height="70" viewBox="0 0 76 76">
              <circle cx="38" cy="38" r="32" fill="none" stroke="#1E3552" strokeWidth="6" />
              <circle cx="38" cy="38" r="32" fill="none" stroke="#E8A33D" strokeWidth="6" strokeDasharray={`${gaugePercent * 201} 201`} strokeLinecap="round" transform="rotate(-90 38 38)" />
            </svg>
            <div>
              <p className="mono" style={{ fontSize: 10, color: "#7C93AC", margin: "0 0 4px", letterSpacing: 0.8 }}>HEURES TOTALES</p>
              <p className="display mono" style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{minutesToDuration(totals.total)}</p>
            </div>
          </div>
          <div style={{ background: "#12233866", border: "1px solid #1E3552", borderRadius: 14, padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}><TrendingUp size={13} color="#6FA787" /><p className="mono" style={{ fontSize: 10, color: "#7C93AC", margin: 0, letterSpacing: 0.8 }}>CE MOIS-CI</p></div>
            <p className="display mono" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{minutesToDuration(thisMonthMinutes)}</p>
          </div>
          <div style={{ background: "#12233866", border: "1px solid #1E3552", borderRadius: 14, padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}><Clock size={13} color="#E8A33D" /><p className="mono" style={{ fontSize: 10, color: "#7C93AC", margin: 0, letterSpacing: 0.8 }}>VOLS</p></div>
            <p className="display mono" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{flights.length}</p>
          </div>
        </div>

        <div className="totals-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 12 }}>
          {[
            ["SE", totals.SE], ["ME", totals.ME], ["PIC", totals.PIC], ["CoPIC", totals.CoPIC],
            ["Dual", totals.Dual], ["Instructor", totals.Instructor], ["IFR", totals.IFR], ["Nuit", totals.Nuit],
          ].map(([label, min]) => (
            <div key={label} style={{ background: "#0F1E2E", border: "1px solid #1E3552", borderRadius: 10, padding: "10px 12px" }}>
              <p className="mono" style={{ fontSize: 9, color: "#7C93AC", margin: "0 0 4px", letterSpacing: 0.6 }}>{label.toUpperCase()}</p>
              <p className="mono" style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{minutesToDuration(min)}</p>
            </div>
          ))}
          <div style={{ background: "#0F1E2E", border: "1px solid #1E3552", borderRadius: 10, padding: "10px 12px" }}>
            <p className="mono" style={{ fontSize: 9, color: "#7C93AC", margin: "0 0 4px", letterSpacing: 0.6 }}>ATT. JOUR</p>
            <p className="mono" style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{totals.attJour}</p>
          </div>
          <div style={{ background: "#0F1E2E", border: "1px solid #1E3552", borderRadius: 10, padding: "10px 12px" }}>
            <p className="mono" style={{ fontSize: 9, color: "#7C93AC", margin: "0 0 4px", letterSpacing: 0.6 }}>ATT. NUIT</p>
            <p className="mono" style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{totals.attNuit}</p>
          </div>
        </div>

        {monthlyData.length > 1 && (
          <div style={{ background: "#12233866", border: "1px solid #1E3552", borderRadius: 14, padding: "18px 20px", marginTop: 14 }}>
            <p className="mono" style={{ fontSize: 10, color: "#7C93AC", margin: "0 0 10px", letterSpacing: 0.8 }}>HEURES PAR MOIS</p>
            <ResponsiveContainer width="100%" height={90}>
              <BarChart data={monthlyData}>
                <XAxis dataKey="month" tick={{ fill: "#7C93AC", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#0F1E30", border: "1px solid #2A4A6B", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#7C93AC" }} formatter={(v) => [`${v}h`, "Durée"]} />
                <Bar dataKey="hours" radius={[4, 4, 0, 0]}>{monthlyData.map((_, i) => <Cell key={i} fill="#E8A33D" fillOpacity={0.85} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div style={{ marginTop: 26 }}>
          <p className="mono" style={{ fontSize: 10, color: "#7C93AC", margin: "0 0 10px", letterSpacing: 0.8 }}>JOURNAL DE VOL</p>
          {flights.length === 0 && (
            <p style={{ color: "#5C7A99", fontSize: 13.5 }}>Aucun vol enregistré pour l'instant. Clique sur "+ Vol" pour commencer.</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {flights.slice().reverse().map((f) => (
              <div key={f.id} className="strip" style={{ background: "#0F1E2E", border: "1px solid #1E3552", borderRadius: 10, transition: "all 0.15s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", cursor: "pointer" }}
                  onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}>
                  <div style={{ width: 3, height: 32, borderRadius: 2, background: AIRCRAFT_COLORS[f.modele] || "#7C93AC", flexShrink: 0 }} />
                  <div style={{ width: 72, flexShrink: 0 }}><p className="mono" style={{ fontSize: 12.5, fontWeight: 600, margin: 0 }}>{formatDateFR(f.date)}</p></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#9FB4CB", fontSize: 12.5, flex: 1, minWidth: 0 }}>
                    <MapPin size={11} /><span className="mono">{f.depart || "—"}</span><ChevronRight size={11} color="#3A5678" /><span className="mono">{f.arrivee || "—"}</span>
                  </div>
                  {f.nuit && <Moon size={13} color="#7C93AC" />}
                  {f.ifr && <Radio size={13} color="#7C93AC" />}
                  <div style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: "#24405C55", color: "#9FB4CB", flexShrink: 0 }} className="mono">{f.fonction}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: `${AIRCRAFT_COLORS[f.modele]}22`, color: AIRCRAFT_COLORS[f.modele] || "#7C93AC", flexShrink: 0 }} className="mono">{f.modele}</div>
                  <p className="mono" style={{ width: 50, textAlign: "right", fontSize: 13.5, fontWeight: 600, margin: 0, flexShrink: 0 }}>{f.duree || "—"}</p>
                  <ChevronDown size={14} color="#5C7A99" style={{ transform: expandedId === f.id ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
                </div>
                {expandedId === f.id && (
                  <div style={{ padding: "0 16px 16px 33px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, fontSize: 12.5 }}>
                    <InfoRow label="Immat" value={f.immat || "—"} />
                    <InfoRow label="Instructeur" value={f.instructeur || "—"} />
                    <InfoRow label="Leçon n°" value={f.lecon || "—"} />
                    <InfoRow label="Tags" value={(f.tags || []).join(", ") || "—"} />
                    <InfoRow label="Att. jour / nuit" value={`${f.attJour || 0} / ${f.attNuit || 0}`} />
                    <InfoRow label="Heures" value={f.heureDep && f.heureArr ? `${f.heureDep} – ${f.heureArr}` : "—"} />
                    <button onClick={() => handleDelete(f.id)} style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid #5C3A3A", color: "#C1554B", borderRadius: 7, padding: "6px 10px", fontSize: 11.5, cursor: "pointer", marginTop: 4, width: "fit-content" }}>
                      <Trash2 size={12} /> Supprimer ce vol
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "#000000aa", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, overflowY: "auto" }} onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#0F1E2E", border: "1px solid #24405C", borderTop: "2px solid #E8A33D", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 540, padding: "22px 22px 28px", maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 className="display" style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Nouveau vol</h2>
              <button className="icon-btn" onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#7C93AC" }}><X size={18} /></button>
            </div>

            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field>
              <Field label="Modèle">
                <select value={form.modele} onChange={(e) => setForm({ ...form, modele: e.target.value })} style={inputStyle}>
                  {AIRCRAFT_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>

              <Field label="Immat">
                {!addingImmat ? (
                  <select value={form.immat} onChange={(e) => {
                    if (e.target.value === "__new__") { setAddingImmat(true); setForm({ ...form, immat: "" }); }
                    else setForm({ ...form, immat: e.target.value });
                  }} style={inputStyle}>
                    <option value="">—</option>
                    {immats.map((i) => <option key={i} value={i}>{i}</option>)}
                    <option value="__new__">+ Nouvelle immat...</option>
                  </select>
                ) : (
                  <input autoFocus value={form.immat} onChange={(e) => setForm({ ...form, immat: e.target.value })}
                    onBlur={() => { if (form.immat) setAddingImmat(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter" && form.immat) setAddingImmat(false); }}
                    placeholder="EI-..." style={inputStyle} />
                )}
              </Field>

              <Field label="Départ">
                {!addingDepart ? (
                  <select value={form.depart} onChange={(e) => {
                    if (e.target.value === "__new__") { setAddingDepart(true); setForm({ ...form, depart: "" }); }
                    else setForm({ ...form, depart: e.target.value });
                  }} style={inputStyle}>
                    <option value="">—</option>
                    {lieux.map((l) => <option key={l} value={l}>{l}</option>)}
                    <option value="__new__">+ Nouvel aéroport...</option>
                  </select>
                ) : (
                  <input autoFocus value={form.depart} onChange={(e) => setForm({ ...form, depart: e.target.value })}
                    onBlur={() => { if (form.depart) setAddingDepart(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter" && form.depart) setAddingDepart(false); }}
                    placeholder="EI.." style={inputStyle} />
                )}
              </Field>
              <Field label="Arrivée">
                {!addingArrivee ? (
                  <select value={form.arrivee} onChange={(e) => {
                    if (e.target.value === "__new__") { setAddingArrivee(true); setForm({ ...form, arrivee: "" }); }
                    else setForm({ ...form, arrivee: e.target.value });
                  }} style={inputStyle}>
                    <option value="">—</option>
                    {lieux.map((l) => <option key={l} value={l}>{l}</option>)}
                    <option value="__new__">+ Nouvel aéroport...</option>
                  </select>
                ) : (
                  <input autoFocus value={form.arrivee} onChange={(e) => setForm({ ...form, arrivee: e.target.value })}
                    onBlur={() => { if (form.arrivee) setAddingArrivee(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter" && form.arrivee) setAddingArrivee(false); }}
                    placeholder="EI.." style={inputStyle} />
                )}
              </Field>

              <Field label="Heure dép."><input type="time" value={form.heureDep} onChange={(e) => setForm({ ...form, heureDep: e.target.value })} style={inputStyle} /></Field>
              <Field label="Heure arr."><input type="time" value={form.heureArr} onChange={(e) => setForm({ ...form, heureArr: e.target.value })} style={inputStyle} /></Field>

              <Field label="Instructeur">
                <input list="instructor-list" value={form.instructeur} onChange={(e) => setForm({ ...form, instructeur: e.target.value })} placeholder="Nom" style={inputStyle} />
                <datalist id="instructor-list">{instructors.map((n) => <option key={n} value={n} />)}</datalist>
              </Field>
              <Field label="Leçon n°"><input value={form.lecon} onChange={(e) => setForm({ ...form, lecon: e.target.value })} placeholder="12" style={inputStyle} /></Field>
              <Field label="Fonction">
                <select value={form.fonction} onChange={(e) => setForm({ ...form, fonction: e.target.value })} style={inputStyle}>
                  {FONCTIONS.map((fn) => <option key={fn} value={fn}>{fn}</option>)}
                </select>
              </Field>

              <Field label="Att. jour"><input type="number" min="0" value={form.attJour} onChange={(e) => setForm({ ...form, attJour: e.target.value })} style={inputStyle} /></Field>
              <Field label="Att. nuit"><input type="number" min="0" value={form.attNuit} onChange={(e) => setForm({ ...form, attNuit: e.target.value })} style={inputStyle} /></Field>
            </div>

            <div style={{ marginTop: 14 }}>
              <span className="mono" style={{ fontSize: 10, color: "#7C93AC", letterSpacing: 0.5 }}>TAGS</span>
              <div style={{ display: "flex", gap: 7, marginTop: 6, flexWrap: "wrap" }}>
                {TAGS.map((tag) => (
                  <div key={tag} className="tag-chip mono" tabIndex={0} onClick={() => toggleTag(tag)}
                    onKeyDown={(e) => e.key === "Enter" && toggleTag(tag)}
                    style={{
                      padding: "6px 13px", borderRadius: 20, fontSize: 12.5, fontWeight: 600,
                      border: `1px solid ${form.tags.includes(tag) ? "#E8A33D" : "#24405C"}`,
                      background: form.tags.includes(tag) ? "#E8A33D22" : "transparent",
                      color: form.tags.includes(tag) ? "#E8A33D" : "#7C93AC",
                    }}>{tag}</div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 20, marginTop: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={form.nuit} onChange={(e) => setForm({ ...form, nuit: e.target.checked })} /> Vol de nuit
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={form.ifr} onChange={(e) => setForm({ ...form, ifr: e.target.checked })} /> IFR
              </label>
            </div>

            <button className="add-btn" onClick={handleAddFlight} disabled={!form.date}
              style={{ marginTop: 18, width: "100%", background: form.date ? "#E8A33D" : "#3A4A5C", color: form.date ? "#12200F" : "#7C93AC", border: "none", borderRadius: 9, padding: "12px", fontWeight: 700, fontSize: 14, cursor: form.date ? "pointer" : "not-allowed" }}>
              Ajouter au journal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="mono" style={{ fontSize: 9.5, color: "#5C7A99", margin: "0 0 2px", letterSpacing: 0.5 }}>{label.toUpperCase()}</p>
      <p style={{ fontSize: 12.5, margin: 0, color: "#D4CDBB" }}>{value}</p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span className="mono" style={{ fontSize: 10, color: "#7C93AC", letterSpacing: 0.5 }}>{label.toUpperCase()}</span>
      {children}
    </label>
  );
}

const inputStyle = { background: "#14283D", border: "1px solid #24405C", borderRadius: 7, padding: "8px 9px", color: "#EDE6D6", fontSize: 13, outline: "none" };
