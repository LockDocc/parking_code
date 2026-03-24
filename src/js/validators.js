export function normalizePlaca(input) {
  return (input || "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
}

export function isPlacaValida(input) {
  const p = normalizePlaca(input);

  // Antigo: ABC1234
  const padraoAntigo = /^[A-Z]{3}[0-9]{4}$/;

  // Mercosul: ABC1D23
  const padraoMercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

  return padraoAntigo.test(p) || padraoMercosul.test(p);
}

export function formatPlaca(input) {
  // Só para exibir: se for antigo, coloca hífen ABC-1234
  const p = normalizePlaca(input);
  if (/^[A-Z]{3}[0-9]{4}$/.test(p)) {
    return `${p.slice(0,3)}-${p.slice(3)}`;
  }
  // Mercosul geralmente é exibida sem hífen
  return p;
}
