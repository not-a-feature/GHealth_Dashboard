export function legend(container, items) {
  const box = document.createElement('div');
  box.className = 'legend';
  for (const it of items) {
    const el = document.createElement('span');
    el.className = 'legend-item';
    const sw = document.createElement('span');
    sw.className = 'legend-swatch';
    sw.style.background = it.color;
    el.appendChild(sw);
    el.appendChild(document.createTextNode(it.name));
    box.appendChild(el);
  }
  container.appendChild(box);
  return box;
}
