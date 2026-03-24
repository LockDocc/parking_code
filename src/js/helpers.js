export const $ = (sel) => document.querySelector(sel);

export function pad2(n){
  return String(n).padStart(2, "0");
}

export function fmtDateTimeBR(iso){
  const d = new Date(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fmtMoney(v){
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

export function fmtTempo(min){
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}
