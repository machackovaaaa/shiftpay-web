export function computeHours(shiftType) {
  const [sh, sm] = shiftType.start_time.split(":").map(Number);
  const [eh, em] = shiftType.end_time.split(":").map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60;
  const worked = (endMin - startMin - shiftType.pause_min) / 60;
  return Math.max(0, Math.round(worked * 100) / 100);
}

export function computePay(employer, shiftType) {
  if (!employer || !shiftType) return 0;
  const hours = computeHours(shiftType);
  const rate = employer.rate * (1 + (shiftType.surcharge_pct || 0) / 100);
  return Math.round(hours * rate);
}

export function isLiveShift(shift) {
  return !!shift.started_at && !shift.ended_at;
}

export function effectivePauseMin(shift, shiftType) {
  if (shift.pause_override_min !== undefined && shift.pause_override_min !== null) return shift.pause_override_min;
  return shiftType?.pause_min || 0;
}

export function hoursForShift(shift, shiftType) {
  if (shift.started_at && shift.ended_at) {
    const ms = new Date(shift.ended_at) - new Date(shift.started_at);
    const pauseMin = effectivePauseMin(shift, shiftType);
    const hours = ms / 3600000 - pauseMin / 60;
    return Math.max(0, Math.round(hours * 100) / 100);
  }
  if (shiftType) {
    const [sh, sm] = shiftType.start_time.split(":").map(Number);
    const [eh, em] = shiftType.end_time.split(":").map(Number);
    let startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin <= startMin) endMin += 24 * 60;
    const pauseMin = effectivePauseMin(shift, shiftType);
    const worked = (endMin - startMin - pauseMin) / 60;
    return Math.max(0, Math.round(worked * 100) / 100);
  }
  return 0;
}

export function payForShift(shift, employer, shiftType) {
  if (!employer || !shiftType) return 0;
  const hours = hoursForShift(shift, shiftType);
  const rate = employer.rate * (1 + (shiftType.surcharge_pct || 0) / 100);
  return Math.round(hours * rate);
}

export function liveElapsedLabel(startedAt) {
  const ms = Date.now() - new Date(startedAt).getTime();
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function rawDurationLabel(startedAt, endedAt) {
  const ms = new Date(endedAt) - new Date(startedAt);
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) {
    const sec = Math.round(ms / 1000);
    return `${sec} s`;
  }
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

export function fmtK(n) {
  return Math.round(n || 0).toLocaleString("cs-CZ");
}

export function typeLabel(type) {
  return type === "DPC" ? "DPČ" : type;
}
