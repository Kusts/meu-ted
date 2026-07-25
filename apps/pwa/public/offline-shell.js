// offline-shell.js — SW fallback shell for offline navigation
// Reads location.pathname + IndexedDB v2 snapshot, renders stale/read-only.
(function(){
"use strict";
var DB="pi-finance-snapshot",STORE="snapshots",KEY="v2";
var TITLE={
  "/":"Resumo Financeiro","/registros":"Últimos Registros","/contas":"Contas",
  "/categorias":"Categorias","/a-pagar":"Contas a Pagar","/orcamentos":"Orçamentos",
  "/metas":"Metas Financeiras","/cartoes":"Faturas do Cartão","/assinaturas":"Assinaturas",
  "/patrimonio":"Patrimônio","/relatorios":"Relatórios","/perfil":"Perfil",
};
var DOMAIN={
  "/":"accounts","/registros":"transactions","/contas":"accounts",
  "/categorias":"categories","/a-pagar":"payables","/orcamentos":"budgets",
  "/metas":"goals","/cartoes":"cardStatements","/assinaturas":"subscriptions",
  "/patrimonio":"accounts","/relatorios":"transactions","/perfil":"accounts",
};
function e(s){return(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function f(c){return"R$ "+(Math.abs(c)/100).toLocaleString("pt-BR",{minimumFractionDigits:2})}
function r(){return window.location.pathname}
function o(){
  return new Promise(function(res,rej){
    var r=indexedDB.open(DB,1);
    r.onupgradeneeded=function(){r.result.createObjectStore(STORE)};
    r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)};
  });
}
function d(db){
  return new Promise(function(res){
    var tx=db.transaction(STORE,"readonly"),req=tx.objectStore(STORE).get(KEY);
    req.onsuccess=function(){db.close();res(req.result||null)};
    req.onerror=function(){db.close();res(null)};
  });
}
async function main(){
  var route=r(),title=TITLE[route]||"Desconhecido",dom=DOMAIN[route];
  document.getElementById("page-title").textContent=title;
  document.getElementById("page-route").textContent=route;
  var db,env;
  try{db=await o()}catch{document.getElementById("content").innerHTML='<div class="empty">Snapshot não disponível</div>';return}
  env=await d(db);
  if(!env||!env.domains){document.getElementById("content").innerHTML='<div class="empty">Nenhum dado offline</div>';return}
  var synced=env.syncedAt&&env.syncedAt[dom];
  document.getElementById("synced-at").textContent="Sincronizado em: "+(synced?new Date(synced).toLocaleString("pt-BR"):"—");
  var data=env.domains[dom];
  if(!data)data=env.domains.accounts;
  if(Array.isArray(data&&data.items))data=data.items;
  if(!data||!data.length){document.getElementById("content").innerHTML='<div class="empty">Nenhum registro offline</div>';return}
  var c=document.getElementById("content");c.innerHTML="";
  for(var i=0;i<Math.min(data.length,50);i++){
    var it=data[i],d=document.createElement("div");d.className="item";
    var h='<div class="label">'+e(it.description||it.name||it.id)+'</div>';
    if(it.amountCents!==void 0)h+='<div class="amount">'+f(it.amountCents)+'</div>';
    if(it.status)h+='<div class="sub">Status: '+e(it.status)+'</div>';
    if(it.dueDate)h+='<div class="sub">Venc: '+e(it.dueDate)+'</div>';
    d.innerHTML=h;c.appendChild(d);
  }
  if(data.length>50){var p=document.createElement("p");p.className="sub";p.style.cssText="text-align:center;padding:12px";p.textContent="… e mais "+(data.length-50)+" itens";c.appendChild(p);}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",main);else main();
})();
