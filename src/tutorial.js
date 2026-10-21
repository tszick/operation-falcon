import { trHtml } from './i18n.js';
import { pilotEntries, pilotMarkup } from './pilotLibrary.js';
import { escapeHtml as escape } from './ui/html.js';
function render() {
  document.getElementById('printable-guide').innerHTML = trHtml(
    `<a href="/">← Vissza a játékhoz</a><h1>Teljes, nyomtatható kézikönyv</h1><p>A fejezetek a játék pilótakézikönyvével közös, aktuális leírások.</p><nav>${pilotEntries.map((e) => `<a href="#${e.id}">${escape(e.name)}</a>`).join('')}</nav>${pilotEntries.map((e) => `<article id="${e.id}"><h2>${escape(e.name)}</h2><p>${escape(e.description)}</p>${pilotMarkup(e)}</article>`).join('')}`,
  );
}
render();
window.addEventListener('falcon:languagechange', render);
