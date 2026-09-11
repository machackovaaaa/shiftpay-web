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

export function fmtK(n) {
  return Math.round(n || 0).toLocaleString("cs-CZ");
}

export function typeLabel(type) {
  return type === "DPC" ? "DPČ" : type;
}
