let DB=null;
let historyStack=[];
let deferredPrompt=null;

const $=id=>document.getElementById(id);
const domainsEl=$("domains");
const toolsEl=$("tools");
const toolEl=$("tool");
const backBtn=$("back");
const installBtn=$("install");
const searchEl=$("search");
const metaEl=$("meta");

window.addEventListener("beforeinstallprompt",(e)=>{
  e.preventDefault();
  deferredPrompt=e;
  installBtn.classList.remove("hidden");
});

installBtn.addEventListener("click", async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt=null;
  installBtn.classList.add("hidden");
});

async function init(){
  DB = await fetch("./tools.json",{cache:"no-store"}).then(r=>r.json());
  metaEl.textContent = `Source: ${DB.generated_from || "Excel"} • Outils: ${DB.tools?.length || 0}`;
  renderDomains("");
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js");
  }
}

function setView(view){
  domainsEl.classList.add("hidden");
  toolsEl.classList.add("hidden");
  toolEl.classList.add("hidden");
  view.classList.remove("hidden");
  backBtn.classList.toggle("hidden", historyStack.length===0);
}

backBtn.addEventListener("click", ()=>{
  const prev=historyStack.pop();
  if(prev) prev();
  backBtn.classList.toggle("hidden", historyStack.length===0);
});

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}

function uniqDomains(){
  return [...new Set((DB.tools||[]).map(t=>t.domain).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}

function renderDomains(filter=""){
  setView(domainsEl);
  const q=filter.trim().toLowerCase();
  const domains=uniqDomains().filter(d=>!q || d.toLowerCase().includes(q));
  const cards = domains.map(d=>{
    const n = DB.tools.filter(t=>t.domain===d).length;
    return `<div class="card" data-domain="${esc(d)}">
      <h3>${esc(d)}</h3>
      <span class="badge">${n} outils</span>
    </div>`;
  }).join("");
  domainsEl.innerHTML = `<div class="grid">${cards}</div>`;
  domainsEl.querySelectorAll(".card").forEach(c=>{
    c.onclick=()=>{
      const domain=c.dataset.domain;
      historyStack.push(()=>renderDomains(searchEl.value));
      renderTools(domain, searchEl.value);
    };
  });
}

function renderTools(domain, filter=""){
  setView(toolsEl);
  const q=filter.trim().toLowerCase();
  const tools=(DB.tools||[])
    .filter(t=>t.domain===domain)
    .filter(t=>!q || (t.name||"").toLowerCase().includes(q) || (t.id||"").toLowerCase().includes(q) || (t.notes||"").toLowerCase().includes(q));
  toolsEl.innerHTML = `
    <div class="card">
      <h3>${esc(domain)}</h3>
      <span class="badge">${tools.length} outils</span>
    </div>
    <div class="list">
      ${tools.map(t=>`
        <div class="card" data-id="${esc(t.id)}">
          <h3>${esc(t.name || t.id)}</h3>
          <div class="badge">${esc(t.id)}</div>
          ${t.notes?`<div><small class="muted">${esc(t.notes)}</small></div>`:""}
        </div>
      `).join("")}
    </div>
  `;
  toolsEl.querySelectorAll(".card[data-id]").forEach(c=>{
    c.onclick=()=>{
      const id=c.dataset.id;
      historyStack.push(()=>renderTools(domain, searchEl.value));
      renderTool(id);
    };
  });
}

function renderTool(id){
  setView(toolEl);
  const t=(DB.tools||[]).find(x=>x.id===id);
  if(!t) return;

  const inputs=(t.inputs||[]);
  toolEl.innerHTML = `
    <div class="card">
      <h3>${esc(t.name || t.id)}</h3>
      <div class="badge">${esc(t.domain)} • ${esc(t.id)}</div>
      ${t.notes?`<div><small class="muted">${esc(t.notes)}</small></div>`:""}
    </div>

    <div class="card" id="form">
      <h3>Entrées</h3>
      ${inputs.length? inputs.map(inp=>`
        <div class="row">
          <div>
            <div><b>${esc(inp.label)}</b></div>
            <div class="badge">${esc(inp.unit || "-")}</div>
          </div>
          <input inputmode="decimal" type="number" step="any" value="${inp.default ?? ""}" data-key="${esc(inp.key)}">
        </div>
      `).join("") : `<div class="muted">Aucune entrée détectée dans l’Excel (A7:C12).</div>`}
      <button class="primary" id="calc">Calculer</button>
      <div><small class="muted">V1: catalogue + saisie. Portage des formules Excel en JS à faire progressivement.</small></div>
    </div>

    <div class="card" id="result">
      <h3>KPI</h3>
      <div class="row"><div><b>Résultat clé</b></div><div class="badge">—</div></div>
      <div class="row"><div><b>Statut</b></div><div class="badge">ATT</div></div>
    </div>
  `;

  $("calc").onclick=()=>{
    $("result").innerHTML = `
      <h3>KPI</h3>
      <div class="row"><div><b>Résultat clé</b></div><div class="badge">—</div></div>
      <div class="row"><div><b>Statut</b></div><div class="badge">ATT</div></div>
      <div class="badge">Formules non intégrées (à migrer depuis Excel).</div>
    `;
  };
}

searchEl.addEventListener("input", ()=>{
  const q=searchEl.value;
  if(!toolsEl.classList.contains("hidden")){
    const domain = toolsEl.querySelector(".card h3")?.textContent;
    if(domain) renderTools(domain, q);
  }else if(toolEl.classList.contains("hidden")){
    renderDomains(q);
  }
});

init();
