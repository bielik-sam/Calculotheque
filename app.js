let DB=null,historyStack=[],deferredPrompt=null;
const $=id=>document.getElementById(id);
const domainsEl=$("domains"),toolsEl=$("tools"),toolEl=$("tool"),backBtn=$("back"),installBtn=$("install"),searchEl=$("search");
window.addEventListener("beforeinstallprompt",(e)=>{e.preventDefault();deferredPrompt=e;installBtn.classList.remove("hidden");});
installBtn.addEventListener("click",async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();deferredPrompt=null;installBtn.classList.add("hidden");});
async function init(){DB=await fetch("./tools.json").then(r=>r.json());renderDomains(""); if("serviceWorker"in navigator) navigator.serviceWorker.register("./sw.js");}
function setView(v){domainsEl.classList.add("hidden");toolsEl.classList.add("hidden");toolEl.classList.add("hidden");v.classList.remove("hidden");backBtn.classList.toggle("hidden",historyStack.length===0);}
backBtn.addEventListener("click",()=>{const p=historyStack.pop(); if(p) p(); backBtn.classList.toggle("hidden",historyStack.length===0);});
const esc=s=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
function renderDomains(filter=""){setView(domainsEl);
const domains=[...new Set(DB.tools.map(t=>t.domain))].filter(Boolean).sort();
const q=filter.trim().toLowerCase();
domainsEl.innerHTML=`<div class="grid">${domains.filter(d=>!q||d.toLowerCase().includes(q)).map(d=>{
const n=DB.tools.filter(t=>t.domain===d).length;
return `<div class="card" data-domain="${esc(d)}"><h3>${esc(d)}</h3><span class="badge">${n} outils</span></div>`;
}).join("")}</div>`;
domainsEl.querySelectorAll(".card").forEach(c=>c.onclick=()=>{const d=c.dataset.domain; historyStack.push(()=>renderDomains(searchEl.value)); renderTools(d,searchEl.value);});
}
function renderTools(domain,filter=""){setView(toolsEl);
const q=filter.trim().toLowerCase();
const tools=DB.tools.filter(t=>t.domain===domain).filter(t=>!q||(t.name||"").toLowerCase().includes(q)||(t.id||"").toLowerCase().includes(q)||(t.notes||"").toLowerCase().includes(q));
toolsEl.innerHTML=`<div class="card"><h3>${esc(domain)}</h3><span class="badge">${tools.length} outils</span></div>`+tools.map(t=>`
<div class="card" data-id="${esc(t.id)}"><h3>${esc(t.name||t.id)}</h3><div class="badge">${esc(t.id)}</div>${t.notes?`<div><small class="muted">${esc(t.notes)}</small></div>`:""}</div>`).join("");
toolsEl.querySelectorAll(".card[data-id]").forEach(c=>c.onclick=()=>{const id=c.dataset.id; historyStack.push(()=>renderTools(domain,searchEl.value)); renderTool(id);});
}
function renderTool(id){setView(toolEl);
const t=DB.tools.find(x=>x.id===id); if(!t) return;
toolEl.innerHTML=`<div class="card"><h3>${esc(t.name||t.id)}</h3><div class="badge">${esc(t.domain)} • ${esc(t.id)}</div>${t.notes?`<div><small class="muted">${esc(t.notes)}</small></div>`:""}<div><small class="muted">Source: ${esc(DB.generated_from||"JSON")}</small></div></div>
<div class="card" id="form"></div><div class="card" id="result"></div>`;
const form=$("form");
form.innerHTML=`<h3>Entrées</h3>${(t.inputs||[]).map(inp=>`
<div class="row"><div><div><b>${esc(inp.label)}</b></div><div class="badge">${esc(inp.unit||"-")}</div></div>
<input inputmode="decimal" type="number" step="any" value="${inp.default??""}" data-key="${esc(inp.key)}"></div>`).join("")}
<button id="calc">Calculer</button><div><small class="muted">⚠️ Template: ajoute tes formules JS ensuite.</small></div>`;
$("calc").onclick=()=>{$("result").innerHTML=`<h3>KPI</h3><div class="row"><div><b>Résultat clé</b></div><div class="badge">—</div></div><div class="row"><div><b>Statut</b></div><div class="badge">ATT</div></div>`;};
}
searchEl.addEventListener("input",()=>{if(!toolsEl.classList.contains("hidden")){const d=toolsEl.querySelector(".card h3")?.textContent; if(d) renderTools(d,searchEl.value);} else if(toolEl.classList.contains("hidden")){renderDomains(searchEl.value);}});
init();