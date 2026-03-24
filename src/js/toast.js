function ensureToastArea(){
  let area = document.querySelector(".toast-area");
  if (!area) {
    area = document.createElement("div");
    area.className = "toast-area";
    document.body.appendChild(area);
  }
  return area;
}

export function showToast(type, title, message, timeoutMs = 2400){
  const area = ensureToastArea();

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;

  toast.innerHTML = `
    <div class="toast__row">
      <div class="toast__title">${title}</div>
      <button class="toast__close" type="button">×</button>
    </div>
    <div class="toast__msg">${message}</div>
  `;

  const close = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    toast.style.transition = "0.15s";
    setTimeout(() => toast.remove(), 150);
  };

  toast.querySelector(".toast__close").addEventListener("click", close);

  area.appendChild(toast);

  if (timeoutMs) {
    setTimeout(close, timeoutMs);
  }
}
