import React, { useState, useEffect, useCallback } from "react";
import { Sun, Sunset, Moon, Plus, Home, Calendar, Settings as SettingsIcon, Coins, Trash2, LogOut, X, Play, Square } from "lucide-react";
import { supabase } from "./lib/supabase";
import { computeHours, computePay, hoursForShift, payForShift, isLiveShift, liveElapsedLabel, rawDurationLabel, fmtK, typeLabel } from "./lib/calc";
import Login from "./components/Login";

const C = {
  plum: "#2B1F3D", plumPale: "#EDE8F5", paper: "#FAF9FC",
  coral: "#FF6B4A", coralDeep: "#B33F26", coralBg: "#FFE8E1",
  mintDeep: "#1E7A54", mintBg: "#DFF6EA",
  ink: "#1E1730", sub: "#7A7189", line: "#EAE5F2", danger: "#D9614F",
};
const ICONS = { Sun, Sunset, Moon };
const DEFAULT_SHIFT_TYPES = [
  { name: "Ranní", start_time: "06:00", end_time: "14:00", pause_min: 30, surcharge_pct: 0, icon: "Sun" },
  { name: "Odpolední", start_time: "14:00", end_time: "22:00", pause_min: 30, surcharge_pct: 0, icon: "Sunset" },
  { name: "Noční", start_time: "22:00", end_time: "06:00", pause_min: 45, surcharge_pct: 15, icon: "Moon" },
];

const inputStyle = { width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "10px 12px", fontSize: 13, fontFamily: "'Inter', sans-serif", color: C.ink, background: "#fff", outline: "none" };

function Field({ label, children }) {
  return <div style={{ marginBottom: 14 }}><label style={{ display: "block", fontSize: 11, fontWeight: 500, color: C.sub, marginBottom: 5 }}>{label}</label>{children}</div>;
}
function ErrorText({ children }) {
  if (!children) return null;
  return <p style={{ fontSize: 11, color: C.danger, margin: "4px 0 0" }}>{children}</p>;
}
function PrimaryButton({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: "100%", background: disabled ? C.line : C.coral, color: disabled ? C.sub : "#fff", border: "none", borderRadius: 14, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: disabled ? "default" : "pointer", marginTop: 6 }}>
      {children}
    </button>
  );
}
function Sheet({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(30,23,48,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
      <div style={{ background: C.paper, width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto", borderRadius: "24px 24px 0 0", padding: "18px 20px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, color: C.ink, margin: 0 }}>{title}</p>
          <button onClick={onClose} aria-label="Zavřít" style={{ background: C.plumPale, border: "none", borderRadius: 10, width: 30, height: 30, cursor: "pointer" }}><X size={16} color={C.ink} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function useShiftPayData(userId) {
  const [employers, setEmployers] = useState([]);
  const [shiftTypes, setShiftTypes] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [emp, st, sh] = await Promise.all([
      supabase.from("employers").select("*").order("created_at"),
      supabase.from("shift_types").select("*").order("created_at"),
      supabase.from("shifts").select("*").order("shift_date", { ascending: false }),
    ]);
    if (emp.data) setEmployers(emp.data);
    if (sh.data) setShifts(sh.data);
    if (st.data) {
      if (st.data.length === 0) {
        const inserts = DEFAULT_SHIFT_TYPES.map((t) => ({ ...t, user_id: userId }));
        const created = await supabase.from("shift_types").insert(inserts).select();
        setShiftTypes(created.data || []);
      } else {
        setShiftTypes(st.data);
      }
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { employers, shiftTypes, shifts, loading, refresh };
}

function AddShiftSheet({ userId, employers, shiftTypes, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [employerId, setEmployerId] = useState(employers[0]?.id || "");
  const [shiftTypeId, setShiftTypeId] = useState(shiftTypes[0]?.id || "");
  const [tip, setTip] = useState("");
  const [error, setError] = useState("");
  const employer = employers.find((e) => e.id === employerId);
  const shiftType = shiftTypes.find((s) => s.id === shiftTypeId);

  const submit = async () => {
    if (!date || !employerId || !shiftTypeId) { setError("Vyplň datum, zaměstnavatele a typ směny."); return; }
    const { error: err } = await supabase.from("shifts").insert({
      user_id: userId, employer_id: employerId, shift_type_id: shiftTypeId, shift_date: date, tip: Number(tip) || 0,
    });
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  };

  if (employers.length === 0) {
    return <Sheet title="Nová směna" onClose={onClose}><p style={{ fontSize: 13, color: C.sub }}>Nejdřív přidej alespoň jednoho zaměstnavatele v Nastavení.</p></Sheet>;
  }

  return (
    <Sheet title="Nová směna" onClose={onClose}>
      <Field label="Datum"><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Zaměstnavatel">
        <select style={inputStyle} value={employerId} onChange={(e) => setEmployerId(e.target.value)}>
          {employers.map((e) => <option key={e.id} value={e.id}>{e.name} ({typeLabel(e.type)})</option>)}
        </select>
      </Field>
      <Field label="Typ směny">
        <select style={inputStyle} value={shiftTypeId} onChange={(e) => setShiftTypeId(e.target.value)}>
          {shiftTypes.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
        </select>
      </Field>
      {employer?.track_tips !== false && (
        <Field label="Dýška (Kč, nepovinné)"><input type="number" min="0" style={inputStyle} value={tip} onChange={(e) => setTip(e.target.value)} /></Field>
      )}
      {shiftType && employer && (
        <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "10px 14px", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: C.sub }}>{computeHours(shiftType)} h po odečtení pauzy</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{fmtK(computePay(employer, shiftType))} Kč</span>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      <PrimaryButton onClick={submit}>Uložit směnu</PrimaryButton>
    </Sheet>
  );
}

function StartShiftSheet({ userId, employers, shiftTypes, onClose, onSaved }) {
  const [employerId, setEmployerId] = useState(employers[0]?.id || "");
  const [shiftTypeId, setShiftTypeId] = useState(shiftTypes[0]?.id || "");
  const [error, setError] = useState("");

  const submit = async () => {
    if (!employerId || !shiftTypeId) { setError("Vyber zaměstnavatele a typ směny."); return; }
    const now = new Date();
    const { error: err } = await supabase.from("shifts").insert({
      user_id: userId, employer_id: employerId, shift_type_id: shiftTypeId,
      shift_date: now.toISOString().slice(0, 10), tip: 0,
      started_at: now.toISOString(), ended_at: null,
    });
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  };

  if (employers.length === 0) {
    return <Sheet title="Spustit směnu" onClose={onClose}><p style={{ fontSize: 13, color: C.sub }}>Nejdřív přidej alespoň jednoho zaměstnavatele v Nastavení.</p></Sheet>;
  }

  return (
    <Sheet title="Spustit směnu" onClose={onClose}>
      <Field label="Zaměstnavatel">
        <select style={inputStyle} value={employerId} onChange={(e) => setEmployerId(e.target.value)}>
          {employers.map((e) => <option key={e.id} value={e.id}>{e.name} ({typeLabel(e.type)})</option>)}
        </select>
      </Field>
      <Field label="Typ směny">
        <select style={inputStyle} value={shiftTypeId} onChange={(e) => setShiftTypeId(e.target.value)}>
          {shiftTypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <p style={{ fontSize: 12, color: C.sub, margin: "0 0 6px" }}>Pauza se odečte podle nastavení typu směny, hodiny se počítají podle skutečného odpracovaného času.</p>
      <ErrorText>{error}</ErrorText>
      <PrimaryButton onClick={submit}>Start směny teď</PrimaryButton>
    </Sheet>
  );
}

function LiveShiftBanner({ shift, employer, shiftType, onStop }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!shift) return null;
  const Icon = ICONS[shiftType?.icon] || Sun;
  return (
    <div style={{ background: C.plum, borderRadius: 20, padding: "16px 18px", margin: "16px 20px 0", display: "flex", alignItems: "center", gap: 14, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={18} color="#fff" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, color: "#C7BEDD", margin: "0 0 2px" }}>{employer?.name} · {shiftType?.name} běží</p>
        <p style={{ fontFamily: "'IBM Plex Mono', 'Space Grotesk', monospace", fontSize: 20, fontWeight: 600, color: "#fff", margin: 0 }}>{liveElapsedLabel(shift.started_at)}</p>
      </div>
      <button onClick={onStop} style={{ display: "flex", alignItems: "center", gap: 6, background: C.coral, color: "#fff", border: "none", borderRadius: 12, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        <Square size={14} fill="#fff" /> Stop
      </button>
    </div>
  );
}

function AddEmployerSheet({ userId, onClose, onSaved }) {
  const [name, setName] = useState(""); const [type, setType] = useState("DPP");
  const [rate, setRate] = useState(""); const [trackTips, setTrackTips] = useState(true);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!name.trim() || !rate || Number(rate) <= 0) { setError("Vyplň jméno a hodinovou sazbu."); return; }
    const { error: err } = await supabase.from("employers").insert({
      user_id: userId, name: name.trim(), type, rate: Number(rate), track_tips: trackTips,
      monthly_limit: type === "DPP" ? 10000 : null,
    });
    if (err) { setError(err.message); return; }
    onSaved(); onClose();
  };
  return (
    <Sheet title="Nový zaměstnavatel" onClose={onClose}>
      <Field label="Název"><input style={inputStyle} placeholder="např. Kavárna Nuance" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Typ smlouvy"><select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}><option value="DPP">DPP</option><option value="DPC">DPČ</option></select></Field>
      <Field label="Hodinová sazba (Kč)"><input type="number" min="0" style={inputStyle} placeholder="150" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
      <Field label="Dýška">
        <button onClick={() => setTrackTips((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          <div style={{ width: 38, height: 22, borderRadius: 11, background: trackTips ? C.coral : C.line, position: "relative" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: trackTips ? 18 : 2 }} />
          </div>
          <span style={{ fontSize: 12, color: C.sub }}>{trackTips ? "evidovat u směn" : "neevidovat"}</span>
        </button>
      </Field>
      <ErrorText>{error}</ErrorText>
      <PrimaryButton onClick={submit}>Uložit zaměstnavatele</PrimaryButton>
    </Sheet>
  );
}

function AddShiftTypeSheet({ userId, onClose, onSaved }) {
  const [name, setName] = useState(""); const [start, setStart] = useState("08:00"); const [end, setEnd] = useState("16:00");
  const [pauseMin, setPauseMin] = useState("30"); const [surchargePct, setSurchargePct] = useState("0");
  const [icon, setIcon] = useState("Sun"); const [error, setError] = useState("");
  const submit = async () => {
    if (!name.trim()) { setError("Zadej název typu směny."); return; }
    const { error: err } = await supabase.from("shift_types").insert({
      user_id: userId, name: name.trim(), start_time: start, end_time: end,
      pause_min: Number(pauseMin) || 0, surcharge_pct: Number(surchargePct) || 0, icon,
    });
    if (err) { setError(err.message); return; }
    onSaved(); onClose();
  };
  return (
    <Sheet title="Nový typ směny" onClose={onClose}>
      <Field label="Název"><input style={inputStyle} placeholder="např. Víkendová" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Začátek"><input type="time" style={inputStyle} value={start} onChange={(e) => setStart(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Konec"><input type="time" style={inputStyle} value={end} onChange={(e) => setEnd(e.target.value)} /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Pauza (min)"><input type="number" min="0" style={inputStyle} value={pauseMin} onChange={(e) => setPauseMin(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Příplatek (%)"><input type="number" min="0" style={inputStyle} value={surchargePct} onChange={(e) => setSurchargePct(e.target.value)} /></Field></div>
      </div>
      <Field label="Ikona">
        <div style={{ display: "flex", gap: 8 }}>
          {Object.keys(ICONS).map((name2) => {
            const Ic = ICONS[name2]; const isSel = icon === name2;
            return (
              <button key={name2} onClick={() => setIcon(name2)} aria-label={name2}
                style={{ width: 38, height: 38, borderRadius: 12, cursor: "pointer", border: isSel ? `1.5px solid ${C.coral}` : `1.5px solid ${C.line}`, background: isSel ? C.coralBg : "#fff" }}>
                <Ic size={16} color={isSel ? C.coralDeep : C.sub} />
              </button>
            );
          })}
        </div>
      </Field>
      <ErrorText>{error}</ErrorText>
      <PrimaryButton onClick={submit}>Uložit typ směny</PrimaryButton>
    </Sheet>
  );
}

function OverviewScreen({ employers, shiftTypes, shifts }) {
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const monthLabel = now.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
  const monthShifts = shifts.filter((s) => s.shift_date.startsWith(monthKey) && !isLiveShift(s));
  const perEmployer = employers.map((emp) => {
    const empShifts = monthShifts.filter((s) => s.employer_id === emp.id);
    let wage = 0, tips = 0, hours = 0;
    empShifts.forEach((s) => {
      const st = shiftTypes.find((t) => t.id === s.shift_type_id);
      if (!st) return;
      wage += payForShift(s, emp, st); tips += Number(s.tip) || 0; hours += hoursForShift(s, st);
    });
    return { ...emp, wage, tips, hours };
  });
  const wageTotal = perEmployer.reduce((a, e) => a + e.wage, 0);
  const tipsTotal = perEmployer.reduce((a, e) => a + e.tips, 0);
  const monthTotal = wageTotal + tipsTotal;
  const monthHours = perEmployer.reduce((a, e) => a + e.hours, 0);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 20px 40px" }}>
      <div style={{ background: C.plum, borderRadius: 28, padding: "26px 26px 28px", margin: "20px 0" }}>
        <p style={{ fontSize: 13, color: "#C7BEDD", margin: "0 0 6px", textTransform: "capitalize" }}>{monthLabel} · celkem</p>
        <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 48, color: "#fff", margin: "0 0 16px", letterSpacing: "-1px" }}>{fmtK(monthTotal)} Kč</p>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.08)", borderRadius: 14, padding: "12px 14px" }}>
            <p style={{ fontSize: 11, color: "#C7BEDD", margin: "0 0 3px" }}>Mzda</p>
            <p style={{ fontSize: 17, fontWeight: 600, color: "#fff", margin: 0 }}>{fmtK(wageTotal)} Kč</p>
          </div>
          <div style={{ flex: 1, background: "rgba(255,107,74,0.18)", borderRadius: 14, padding: "12px 14px" }}>
            <p style={{ fontSize: 11, color: "#FFC4B4", margin: "0 0 3px" }}>Dýška</p>
            <p style={{ fontSize: 17, fontWeight: 600, color: C.coral, margin: 0 }}>{fmtK(tipsTotal)} Kč</p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, padding: "14px 16px" }}>
          <p style={{ fontSize: 12, color: C.sub, margin: "0 0 4px" }}>Odpracováno</p>
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 22, color: C.ink, margin: 0 }}>{Math.round(monthHours * 10) / 10} h</p>
        </div>
        <div style={{ flex: 1, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, padding: "14px 16px" }}>
          <p style={{ fontSize: 12, color: C.sub, margin: "0 0 4px" }}>Směn tento měsíc</p>
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 22, color: C.ink, margin: 0 }}>{monthShifts.length}</p>
        </div>
      </div>

      <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, margin: "0 0 10px", fontFamily: "'Space Grotesk', sans-serif" }}>Zaměstnavatelé</p>
      {perEmployer.length === 0 && <p style={{ fontSize: 13, color: C.sub, background: "#fff", border: `1px dashed ${C.line}`, borderRadius: 16, padding: "16px", textAlign: "center" }}>Zatím žádný zaměstnavatel ani směna.</p>}
      {perEmployer.map((e) => (
        <div key={e.id} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 20, padding: "16px 18px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: C.coralBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Coins size={18} color={C.coral} /></div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: C.ink, margin: 0 }}>{e.name}</p>
              <p style={{ fontSize: 12, color: C.sub, margin: 0 }}>{typeLabel(e.type)} · {Math.round(e.hours * 10) / 10} h</p>
            </div>
            <p style={{ fontSize: 16, fontWeight: 500, color: C.ink, margin: 0 }}>{fmtK(e.wage)}</p>
          </div>
          {e.tips > 0 && <p style={{ fontSize: 12, color: C.coralDeep, margin: "0 0 8px" }}>+ {fmtK(e.tips)} Kč dýška</p>}
          {e.monthly_limit && (
            <div>
              <div style={{ height: 6, background: C.plumPale, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, (e.wage / e.monthly_limit) * 100)}%`, background: e.wage / e.monthly_limit > 0.85 ? C.coral : C.mintDeep, borderRadius: 3 }} />
              </div>
              <p style={{ fontSize: 11, color: C.sub, margin: "5px 0 0" }}>{fmtK(e.wage)} / {fmtK(e.monthly_limit)} Kč limit DPP</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ShiftsScreen({ employers, shiftTypes, shifts, onAdd, onStart, refresh }) {
  const remove = async (id) => { await supabase.from("shifts").delete().eq("id", id); refresh(); };
  const finished = shifts.filter((s) => !isLiveShift(s));
  const sorted = [...finished].sort((a, b) => (a.shift_date < b.shift_date ? 1 : -1));
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 20px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0 16px" }}>
        <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 26, color: C.ink, margin: 0 }}>Směny</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onStart} style={{ display: "flex", alignItems: "center", gap: 6, height: 40, borderRadius: 12, background: C.plum, border: "none", color: "#fff", cursor: "pointer", padding: "0 14px", fontSize: 13, fontWeight: 600 }}>
            <Play size={14} fill="#fff" /> Start
          </button>
          <button onClick={onAdd} style={{ width: 40, height: 40, borderRadius: 12, background: C.coral, border: "none", color: "#fff", cursor: "pointer" }} aria-label="Přidat směnu ručně"><Plus size={20} /></button>
        </div>
      </div>
      {sorted.length === 0 && <p style={{ fontSize: 13, color: C.sub, background: "#fff", border: `1px dashed ${C.line}`, borderRadius: 16, padding: "16px", textAlign: "center" }}>Zatím žádné směny. Spusť Start při příchodu do práce, nebo přidej ručně přes +.</p>}
      {sorted.map((s) => {
        const emp = employers.find((e) => e.id === s.employer_id);
        const st = shiftTypes.find((t) => t.id === s.shift_type_id);
        if (!emp || !st) return null;
        const Icon = ICONS[st.icon] || Sun;
        const hours = hoursForShift(s, st); const pay = payForShift(s, emp, st);
        const dateObj = new Date(s.shift_date + "T00:00:00");
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: C.coralBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={18} color={C.coral} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, margin: "0 0 2px" }}>{st.name}{s.started_at ? " · živě" : ""}</p>
              <p style={{ fontSize: 12, color: C.sub, margin: 0 }}>{emp.name} · {typeLabel(emp.type)} · {dateObj.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" })}</p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: C.ink, margin: "0 0 2px" }}>{fmtK(pay)} Kč</p>
              <p style={{ fontSize: 11, color: s.tip > 0 ? C.coralDeep : C.sub, margin: 0 }}>{hours} h{s.tip > 0 ? ` · +${s.tip}` : ""}</p>
              {s.started_at && s.ended_at && hours === 0 && (
                <p style={{ fontSize: 10, color: C.sub, margin: "2px 0 0" }}>trvalo {rawDurationLabel(s.started_at, s.ended_at)}, kratší než pauza</p>
              )}
            </div>
            <button onClick={() => remove(s.id)} aria-label="Smazat směnu" style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={15} color={C.sub} /></button>
          </div>
        );
      })}
      <p style={{ fontSize: 12, color: C.sub, margin: "10px 0 0", textAlign: "center" }}>pauza se odečítá automaticky podle nastavení směny</p>
    </div>
  );
}

function SettingsScreen({ employers, shiftTypes, onAddShiftType, onAddEmployer, refresh }) {
  const removeShiftType = async (id) => { await supabase.from("shift_types").delete().eq("id", id); refresh(); };
  const removeEmployer = async (id) => { await supabase.from("employers").delete().eq("id", id); refresh(); };
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 20px 40px" }}>
      <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 26, color: C.ink, margin: "0 0 14px" }}>Typy směn</p>
      {shiftTypes.map((t) => {
        const Icon = ICONS[t.icon] || Sun;
        return (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: C.coralBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={18} color={C.coral} /></div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, margin: "0 0 2px" }}>{t.name}</p>
              <p style={{ fontSize: 12, color: C.sub, margin: 0 }}>{t.start_time}–{t.end_time} · pauza {t.pause_min} min{t.surcharge_pct ? ` · +${t.surcharge_pct}%` : ""}</p>
            </div>
            <button onClick={() => removeShiftType(t.id)} aria-label="Smazat typ směny" style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={15} color={C.sub} /></button>
          </div>
        );
      })}
      <button onClick={onAddShiftType} style={{ width: "100%", border: `1.5px dashed ${C.coral}`, background: "none", color: C.coralDeep, borderRadius: 18, padding: "13px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 28 }}>+ přidat vlastní typ směny</button>

      <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 26, color: C.ink, margin: "0 0 14px" }}>Zaměstnavatelé</p>
      {employers.map((e) => (
        <div key={e.id} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, margin: 0 }}>{e.name}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.coralDeep, background: C.coralBg, borderRadius: 6, padding: "2px 8px" }}>{typeLabel(e.type)}</span>
              <button onClick={() => removeEmployer(e.id)} aria-label="Smazat zaměstnavatele" style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={14} color={C.sub} /></button>
            </div>
          </div>
          <p style={{ fontSize: 12, color: C.sub, margin: "0 0 4px" }}>{e.rate} Kč / h</p>
          <p style={{ fontSize: 12, color: C.sub, margin: 0 }}>dýška: {e.track_tips ? "evidovat u každé směny" : "neevidovat"}</p>
        </div>
      ))}
      <button onClick={onAddEmployer} style={{ width: "100%", border: `1.5px dashed ${C.coral}`, background: "none", color: C.coralDeep, borderRadius: 18, padding: "13px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ přidat zaměstnavatele</button>
    </div>
  );
}

function TopNav({ active, setActive, onLogout }) {
  const tabs = [{ id: "overview", label: "Přehled", Icon: Home }, { id: "shifts", label: "Směny", Icon: Calendar }, { id: "settings", label: "Nastavení", Icon: SettingsIcon }];
  return (
    <div style={{ position: "sticky", top: 0, background: C.paper, borderBottom: `1px solid ${C.line}`, zIndex: 10 }}>
      <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" }}>
        <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, color: C.ink, margin: 0 }}>ShiftPay</p>
        <div style={{ display: "flex", gap: 4, background: C.ink, borderRadius: 14, padding: 4 }}>
          {tabs.map(({ id, label, Icon }) => {
            const isActive = active === id;
            return (
              <button key={id} onClick={() => setActive(id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", border: "none", cursor: "pointer", borderRadius: 10, background: isActive ? C.coral : "transparent", color: isActive ? "#fff" : "#8E86A0", fontSize: 12, fontWeight: 500 }}>
                <Icon size={14} /> {label}
              </button>
            );
          })}
        </div>
        <button onClick={onLogout} aria-label="Odhlásit se" style={{ background: "none", border: "none", cursor: "pointer", color: C.sub }}><LogOut size={18} /></button>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [active, setActive] = useState("overview");
  const [sheet, setSheet] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  const { employers, shiftTypes, shifts, loading, refresh } = useShiftPayData(userId);
  const liveShift = shifts.find((s) => isLiveShift(s));
  const liveEmployer = liveShift ? employers.find((e) => e.id === liveShift.employer_id) : null;
  const liveShiftType = liveShift ? shiftTypes.find((t) => t.id === liveShift.shift_type_id) : null;

  const stopLiveShift = async () => {
    if (!liveShift) return;
    await supabase.from("shifts").update({ ended_at: new Date().toISOString() }).eq("id", liveShift.id);
    refresh();
  };

  if (session === undefined) return null;
  if (!session) return <Login />;

  return (
    <div style={{ minHeight: "100vh", background: C.paper, fontFamily: "'Inter', sans-serif" }}>
      <TopNav active={active} setActive={setActive} onLogout={() => supabase.auth.signOut()} />
      {liveShift && <LiveShiftBanner shift={liveShift} employer={liveEmployer} shiftType={liveShiftType} onStop={stopLiveShift} />}
      {loading ? (
        <p style={{ textAlign: "center", color: C.sub, padding: 40 }}>Načítám data…</p>
      ) : (
        <>
          {active === "overview" && <OverviewScreen employers={employers} shiftTypes={shiftTypes} shifts={shifts} />}
          {active === "shifts" && <ShiftsScreen employers={employers} shiftTypes={shiftTypes} shifts={shifts} onAdd={() => setSheet("shift")} onStart={() => setSheet("start")} refresh={refresh} />}
          {active === "settings" && <SettingsScreen employers={employers} shiftTypes={shiftTypes} onAddShiftType={() => setSheet("shiftType")} onAddEmployer={() => setSheet("employer")} refresh={refresh} />}
        </>
      )}
      {sheet === "shift" && <AddShiftSheet userId={userId} employers={employers} shiftTypes={shiftTypes} onClose={() => setSheet(null)} onSaved={refresh} />}
      {sheet === "start" && <StartShiftSheet userId={userId} employers={employers} shiftTypes={shiftTypes} onClose={() => setSheet(null)} onSaved={refresh} />}
      {sheet === "employer" && <AddEmployerSheet userId={userId} onClose={() => setSheet(null)} onSaved={refresh} />}
      {sheet === "shiftType" && <AddShiftTypeSheet userId={userId} onClose={() => setSheet(null)} onSaved={refresh} />}
    </div>
  );
}
