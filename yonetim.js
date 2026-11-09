(function(){
"use strict";
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2});
const TL=n=>fmt.format(Number(n)||0)+" TL";
const N=n=>fmt.format(Number(n)||0);
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const today=()=>ymd(new Date());
const thisMonth=()=>today().slice(0,7);
const AYLAR=["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const donemAd=d=>{if(!d)return"";const[y,m]=d.split("-");return AYLAR[+m-1]+" "+y};
const trDate=d=>{if(!d)return"";const[y,m,g]=String(d).slice(0,10).split("-");return `${g}.${m}.${y}`};
const num=v=>{if(typeof v==="number")return Math.round(v*100)/100;let t=String(v??"").trim().replace(/\s|TL|₺/g,"");if(t.includes(","))t=t.replace(/\./g,"").replace(",",".");else if(/^\d{1,3}(\.\d{3})+$/.test(t))t=t.replace(/\./g,"");return Math.round((parseFloat(t)||0)*100)/100};
const r2=v=>Math.round(v*100)/100;
const trUp=s=>String(s||"").toLocaleUpperCase("tr");
const prevMonth=m=>{const[y,mm]=m.split("-").map(Number);const d=new Date(y,mm-2,1);return d.getFullYear()+"-"+pad(d.getMonth()+1)};
const isGecikme=x=>/^gecikme/i.test(x.aciklama||"");

const COLS=["daireler","tahakkuk","kasa","duyurular","talepler","bildirimler","ayarlar","isler","kimlik","personel","sakin_hesaplari"];
const S={}; COLS.forEach(c=>S[c]=[]);
let db=null, yonetici=true, loaded=false, page="ozet", arg=null, open={}, pending=null, myDaire=null;
try{myDaire=localStorage.getItem("myDaire")}catch(e){}

function toast(t){const el=$("#toast");el.textContent=t;el.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>el.hidden=true,2800)}
const ayar=()=>S.ayarlar.find(a=>a.id==="site")||{};
const kasalar=()=>{const k=ayar().kasalar;return Array.isArray(k)&&k.length?k:["Banka kasası","Nakit kasası"]};
const defKasa=()=>kasalar()[0];
const kasaOf=k=>k.hesap||"Nakit kasası";
const daire=id=>S.daireler.find(d=>d.id===id);
const daireAd=id=>{const d=daire(id);return d?(d.blok?d.blok+" Blok-":"No ")+d.no:"Silinmiş daire"};
const daireKisa=id=>{const d=daire(id);return d?(d.blok?d.blok+"-":"")+d.no:"?"};
const sortDaire=(a,b)=>String(a.blok||"").localeCompare(String(b.blok||""),"tr")||String(a.no).localeCompare(String(b.no),"tr",{numeric:true});
const ornekTag=x=>x&&x.ornek?`<span class="ornek">ÖRNEK</span>`:"";

/* ---------- Supabase veri katmanı ---------- */
const camel=k=>k.replace(/_([a-z])/g,(m,c)=>c.toUpperCase());
const snake=k=>k.replace(/[A-Z]/g,c=>"_"+c.toLowerCase());
const DATEF=new Set(["dogum","giris","cikis"]);
const NUMF=["tutar","odenen","aidat","maas","devirOdenen","gecikmeOran"];
function fromRow(c,r){const o={};for(const k in r)o[camel(k)]=r[k];if(c==="kimlik")o.id=r.daire_id;if(c==="ayarlar")o.id="site";if(c==="isler"){o.not=r.notu||"";if(o.tarih==null)o.tarih=""}if(c==="personel")for(const k of ["dogum","giris","cikis"])if(o[k]==null)o[k]="";for(const k of NUMF)if(o[k]!=null)o[k]=Number(o[k]);return o}
function toRow(c,o){const r={};for(const k in o){if(o[k]===undefined||k==="id")continue;let key=snake(k);if(c==="isler"&&k==="not")key="notu";let v=o[k];if((DATEF.has(k)||(c==="isler"&&k==="tarih"))&&v==="")v=null;r[key]=v}return r}
async function chk(p){const{data,error}=await p;if(error)throw new Error(hataMetni(error));return data}
async function yukleTablo(c){
  if(c==="ayarlar"){const d=await chk(sb.from("ayarlar").select("*").eq("id",1).single());S.ayarlar=[fromRow(c,d)];return}
  const rows=await hepsi(c);S[c]=rows.map(r=>fromRow(c,r));
}
const reloadQ=new Set();let reloadT=0;
function needReload(...cs){cs.forEach(c=>reloadQ.add(c));clearTimeout(reloadT);reloadT=setTimeout(async()=>{const x=[...reloadQ];reloadQ.clear();try{await Promise.all(x.map(yukleTablo))}catch(e){toast("Yenilenemedi: "+hataMetni(e))}schedule()},300)}
db={
  collection:c=>({add:async o=>{const d=await chk(sb.from(c).insert(toRow(c,o)).select().single());S[c].push(fromRow(c,d));needReload(c);schedule();return{id:d.id}}}),
  doc:p=>{const[c,id]=p.split("/");const key=c==="kimlik"?"daire_id":"id";const idv=c==="ayarlar"?1:id;
    return{
      update:async o=>{await chk(sb.from(c).update(toRow(c,o)).eq(key,idv));const x=S[c].find(v=>v.id===(c==="ayarlar"?"site":id));if(x)Object.assign(x,o);needReload(c);schedule()},
      set:async o=>{const r=toRow(c,o);r[key]=idv;await chk(sb.from(c).upsert(r));needReload(c)},
      delete:async()=>{await chk(sb.from(c).delete().eq(key,idv));S[c]=S[c].filter(v=>v.id!==id);needReload(c);schedule()}}}
};

/* ---------- Hesaplar ---------- */
function hesap(id){
  let tah=0,gec=0,od=0,bal=0;
  for(const x of S.tahakkuk)if(x.daireId===id){const t=num(x.tutar),o=num(x.odenen);if(isGecikme(x))gec+=t;else tah+=t;od+=o;bal+=t-o}
  return{tah:r2(tah),gec:r2(gec),od:r2(od),bal:r2(bal)};
}
const borc=id=>hesap(id).bal;
function vadesiGecmis(id){
  const ay=thisMonth();let t=0,en=null;
  for(const x of S.tahakkuk)if(x.daireId===id&&x.donem<ay){const k=num(x.tutar)-num(x.odenen);if(k>0.009){t+=k;if(!en||x.donem<en)en=x.donem}}
  return{t:r2(t),en};
}
function kasaOzet(){
  const dev=ayar().devir||{};
  const rows=kasalar().map(k=>({k,dev:num(dev[k]),g:0,c:0}));
  const idx=Object.fromEntries(rows.map((r,i)=>[r.k,i]));
  for(const x of S.kasa){let i=idx[kasaOf(x)];if(i===undefined){rows.push({k:kasaOf(x),dev:0,g:0,c:0});i=idx[kasaOf(x)]=rows.length-1}
    if(x.tur==="gelir")rows[i].g+=num(x.tutar);else rows[i].c+=num(x.tutar)}
  rows.forEach(r=>{r.g=r2(r.g);r.c=r2(r.c);r.kal=r2(r.dev+r.g-r.c)});
  return rows;
}
const bekleyen=()=>S.bildirimler.filter(b=>b.durum==="bekliyor");

/* ---------- Yazma işlemleri ---------- */
async function tahsilat(daireId,tutar,tarih,aciklama,kasaAdi){
  await chk(sb.rpc("tahsilat_isle",{p_daire:daireId,p_tutar:num(tutar),p_tarih:tarih||today(),p_aciklama:aciklama||"",p_hesap:kasaAdi||defKasa()}));
  needReload("tahakkuk","kasa");
}
function gecikmeOnizle(donem){
  const oran=num(ayar().gecikmeOran);const out=[];
  if(oran<=0)return{oran,out};
  const etiket="Gecikme tazminatı – "+donemAd(donem);
  for(const d of S.daireler){
    if(S.tahakkuk.some(x=>x.daireId===d.id&&x.aciklama===etiket))continue;
    let base=0;for(const x of S.tahakkuk)if(x.daireId===d.id&&x.donem<=donem&&!isGecikme(x)&&!x.eski)base+=num(x.tutar)-num(x.odenen);
    const zam=r2(base*oran/100);if(zam>=0.01)out.push({d,base:r2(base),zam});
  }
  return{oran,out};
}

/* ---------- Menü ---------- */
const IC={
 ozet:'<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M9 9v11"/>',
 site:'<path d="M4 21V5h9v16M13 9h7v12M7 8h3M7 12h3M7 16h3M16 13h1M16 17h1"/>',
 finans:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M10 7v10M10 9.5l4-1.5M10 12.5l4-1.5M10 17c3 0 5-2 5-4"/>',
 rapor:'<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M8 16v-3M12 16V9M16 16v-5"/>',
 teknik:'<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16v4h4l5.5-5.5a4 4 0 0 0 5-5L16 12l-4-4z"/>',
 tanim:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M17 14v6M14 17h6"/>',
 iletisim:'<path d="M4 12a8 8 0 1 1 3.3 6.5L4 20l1-3.6A8 8 0 0 1 4 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
 sakin:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
 duyuru:'<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M17 9a4 4 0 0 1 0 6"/>'
};
const svg=k=>`<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg>`;
const chev=`<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg>`;
function menu(){
  if(!yonetici)return[{k:"dairem",l:"Dairem",i:"sakin"},{k:"duyurular",l:"Duyurular",i:"duyuru"}];
  return[
    {k:"ozet",l:"Özet",i:"ozet"},
    {g:"site",l:"Site",i:"site",items:[["kisiler","Kişiler"],["daireler","Daireler"],["sifreler","Sakin Şifreleri"],["personel","Personel"],["bildirimler","Onay Bekleyen Ödemeler",bekleyen().length]]},
    {g:"finans",l:"Finans",i:"finans",items:[["finansal","Kişilere Göre Finansal Durum"],["tahsilat","Tahsilat Makbuzu"],["borc","Borç Makbuzu"],["toplu","Toplu Borçlandırma"],["gecikme","Gecikme Zammı"],["fis","Gelir / Gider Fişi"],["transfer","Kasa Transfer Fişi"]]},
    {g:"rapor",l:"Raporlar",i:"rapor",items:[["kasaEks","Kasa Ekstresi"],["hesapEks","Hesap Ekstresi"],["personelEks","Personel Ekstresi"],["vadesi","Vadesi Geçmiş Borçlar"],["gelirGider","Gelir - Gider Raporu"]]},
    {g:"teknik",l:"Teknik",i:"teknik",items:[["pano","İş Takip Panosu",S.talepler.filter(t=>t.durum!=="Çözüldü").length],["isler","Yapılacak İşler"]]},
    {g:"tanim",l:"Tanımlar",i:"tanim",items:[["siteBilgi","Site ve Banka Bilgileri"],["kasaTanim","Kasa Tanımları"],["gecikmeAyar","Gecikme Ayarı"]]},
    {g:"iletisim",l:"İletişim",i:"iletisim",items:[["duyurular","Duyurular"]]},
    {k:"sifreler",l:"Sakin Şifreleri",i:"sakin"}
  ];
}
function groupOf(p){for(const m of menu())if(m.items&&m.items.some(i=>i[0]===p))return m.g;return null}
function renderSide(){
  const g=groupOf(page);if(g&&open[g]===undefined)open[g]=true;
  $("#side").innerHTML=menu().map(m=>{
    if(m.k)return `<button class="mi ${page===m.k?"act":""}" data-go="${m.k}">${svg(m.i)}<span>${esc(m.l)}</span></button>`;
    const isOpen=!!open[m.g];const has=m.items.some(i=>i[0]===page);
    const c=m.items.reduce((s,i)=>s+(i[2]||0),0);
    return `<button class="mi ${has&&!isOpen?"act":""}" data-grp="${m.g}" aria-expanded="${isOpen}">${svg(m.i)}<span>${esc(m.l)}</span>${c&&!isOpen?`<span class="cnt" style="margin-left:auto">${c}</span>`:""}${chev}</button>
    ${isOpen?`<div class="sub">${m.items.map(([k,l,n])=>`<button class="${page===k?"act":""}" data-go="${k}"><span>${esc(l)}</span>${n?`<span class="cnt">${n}</span>`:""}</button>`).join("")}</div>`:""}`;
  }).join("")+`<div class="side-foot">${esc(ayar().ad||"Venüs Ada Sitesi")}<br>${S.daireler.length} daire</div>`;
}

/* ---------- Tablo bileşeni ---------- */
const TS={};
const HARFLER=["#","A","B","C","Ç","D","E","F","G","H","I","İ","J","K","L","M","N","O","Ö","P","R","S","Ş","T","U","Ü","V","Y","Z"];
function dt(id,cols,rows,o={}){
  const st=TS[id]||(TS[id]={sort:o.sort||cols[0].k,dir:o.dir||1,letter:"",page:0,q:"",chip:""});
  let xs=rows;
  if(o.chips&&st.chip)xs=xs.filter(r=>o.chipOf(r)===st.chip);
  if(o.letterOf&&st.letter){xs=xs.filter(r=>{const f=trUp(o.letterOf(r)).charAt(0);return st.letter==="#"?!f||!/[A-ZÇĞİÖŞÜ]/.test(f):f===st.letter})}
  if(st.q){const q=st.q.toLocaleLowerCase("tr");xs=xs.filter(r=>cols.some(c=>String(c.sv?c.sv(r):r[c.k]??"").toLocaleLowerCase("tr").includes(q)))}
  const sc=cols.find(c=>c.k===st.sort)||cols[0];
  const sv=r=>sc.sv?sc.sv(r):r[sc.k];
  xs=xs.slice().sort((a,b)=>{const x=sv(a),y=sv(b);return(typeof x==="number"&&typeof y==="number"?x-y:String(x??"").localeCompare(String(y??""),"tr",{numeric:true}))*st.dir});
  const per=o.per||25,pages=Math.max(1,Math.ceil(xs.length/per));if(st.page>=pages)st.page=pages-1;
  const shown=xs.slice(st.page*per,st.page*per+per);
  const tot=o.totals?o.totals(xs):null;
  return `${o.chips?`<div class="tabs">${["",...o.chips].map(c=>`<button class="${st.chip===c?"act":""}" data-dt="${id}" data-chip="${esc(c)}">${c?esc(c)+(o.chipSuffix||""):"Hepsi"}</button>`).join("")}</div>`:""}
  ${o.letterOf?`<div class="letters">${["",...HARFLER].map(h=>`<button class="${st.letter===h?"act":""}" data-dt="${id}" data-letter="${h}">${h||"Tümü"}</button>`).join("")}</div>`:""}
  <div class="tbar noprint"><input type="search" data-dtq="${id}" value="${esc(st.q)}" placeholder="Tabloda ara" style="max-width:240px">${o.bar||""}<span class="muted small">${xs.length} kayıt</span></div>
  <div class="tbox"><table class="dt" ${o.minw?`style="min-width:${o.minw}px"`:""}><thead><tr>${cols.map(c=>`<th class="${c.r?"r":""} ${c.k===st.sort?"sorted":""}" data-dt="${id}" data-sort="${c.k}">${esc(c.l)}<span class="ar">${c.k===st.sort?(st.dir>0?"↑":"↓"):"⇅"}</span></th>`).join("")}</tr></thead>
  <tbody>${shown.length?shown.map(r=>`<tr ${o.click?`class="click" ${o.click(r)}`:""}>${cols.map((c,i)=>`<td class="${c.r?"r num":""} ${i===0&&o.firstShade?"first":""} ${c.cls?c.cls(r):""}">${c.f?c.f(r):esc(r[c.k]??"")}</td>`).join("")}</tr>`).join(""):`<tr><td colspan="${cols.length}" class="empty">Kayıt bulunamadı.</td></tr>`}</tbody>
  ${tot?`<tfoot><tr>${cols.map((c,i)=>`<td class="${c.r?"r num":""}">${i===0?"Toplam":tot[c.k]!==undefined?tot[c.k]:""}</td>`).join("")}</tr></tfoot>`:""}
  </table></div>
  <div class="tfoot"><div class="acts">${o.acts||""}</div>
  <div class="pager"><button data-dt="${id}" data-pg="0" ${st.page===0?"disabled":""} aria-label="İlk sayfa">«</button><button data-dt="${id}" data-pg="${st.page-1}" ${st.page===0?"disabled":""} aria-label="Önceki">‹</button><span style="padding:0 6px">${st.page+1} / ${pages} (${xs.length} kayıt)</span><button data-dt="${id}" data-pg="${st.page+1}" ${st.page>=pages-1?"disabled":""} aria-label="Sonraki">›</button><button data-dt="${id}" data-pg="${pages-1}" ${st.page>=pages-1?"disabled":""} aria-label="Son sayfa">»</button></div></div>`;
}
const title=(t,extra="")=>`<div class="ptitle"><span class="star">☆</span><h1>${esc(t)}</h1><span class="sp"></span>${extra}</div>`;
const daireOpts=(sel,bos)=>(bos?`<option value="">${esc(bos)}</option>`:"")+S.daireler.slice().sort(sortDaire).map(d=>`<option value="${d.id}" ${d.id===sel?"selected":""}>${esc(daireAd(d.id))}${d.malik?" — "+esc(d.malik):""}</option>`).join("");
const kasaOpts=sel=>kasalar().map(k=>`<option ${k===sel?"selected":""}>${esc(k)}</option>`).join("");
const emptyBox=t=>`<div class="empty"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>${esc(t)}</div>`;
const balCls=b=>b>0.009?"neg":b<-0.009?"pos":"";

/* ---------- Sayfalar: Özet ---------- */
function pOzet(){
  if(!S.daireler.length)return title("Özet")+`<div class="card"><h2>Kuruluma başlayın</h2><p>Daireler sayfasından <b>Toplu daire oluştur</b> ile daireleri açın, sonra Tanımlar'dan IBAN bilgisini girin.</p><button class="btn" data-go="daireler">Dairelere git</button></div>`;
  const ks=kasaOzet();const T=ks.reduce((a,r)=>({dev:a.dev+r.dev,g:a.g+r.g,c:a.c+r.c,kal:a.kal+r.kal}),{dev:0,g:0,c:0,kal:0});
  const cellRow=(nm,r,tot)=>`<tr class="${tot?"tot":""}"><td class="nm">${nm}</td><td class="cell dev">${N(r.dev)}</td><td class="op">+</td><td class="cell gir">${N(r.g)}</td><td class="op">−</td><td class="cell cik">${N(r.c)}</td><td class="op">=</td><td class="cell kal">${N(r.kal)}</td></tr>`;
  let toplamBorc=0,borclu=0;for(const d of S.daireler){const b=borc(d.id);if(b>0.009){toplamBorc+=b;borclu++}}
  const ay=thisMonth();const ayT=S.kasa.filter(k=>k.tarih?.startsWith(ay)&&k.tur==="gelir"&&k.daireId).reduce((s,k)=>s+num(k.tutar),0);
  const isler=S.isler.filter(i=>!i.bitti).sort((a,b)=>String(a.tarih||"9").localeCompare(b.tarih||"9")).slice(0,6);
  const tal=S.talepler.filter(t=>t.durum!=="Çözüldü").sort((a,b)=>String(b.tarih).localeCompare(a.tarih)).slice(0,6);
  const bek=bekleyen();
  return title("Özet",`<button class="btn out sm noprint" data-act="yazdir">Yazdır</button>`)+`
  <div class="card"><h2>Kasalar</h2>
    <div style="overflow-x:auto"><table class="kasa"><thead><tr><th></th><th class="c-dev">Devir</th><th></th><th class="c-gir">Giren</th><th></th><th class="c-cik">Çıkan</th><th></th><th class="c-kal">Kalan</th></tr></thead>
    <tbody>${cellRow("₺ Toplam",T,true)}${ks.map(r=>cellRow(esc(r.k),r,false)).join("")}</tbody></table></div>
  </div>
  <div class="stats">
    <div class="stat"><div class="l">Toplam alacak</div><div class="v neg">${TL(toplamBorc)}</div><div class="small muted">${borclu} / ${S.daireler.length} daire borçlu</div></div>
    <div class="stat"><div class="l">${AYLAR[new Date().getMonth()]} tahsilatı</div><div class="v pos">${TL(ayT)}</div></div>
    <div class="stat"><div class="l">Onay bekleyen ödeme</div><div class="v">${bek.length}</div>${bek.length?`<button class="btn sm" style="margin-top:6px" data-go="bildirimler">İncele</button>`:""}</div>
    <div class="stat"><div class="l">Açık talep</div><div class="v">${S.talepler.filter(t=>t.durum!=="Çözüldü").length}</div></div>
  </div>
  <div class="card"><h2>Finansal Durum <small>son 12 dönem · aidat tahakkuku ve tahsilatı</small></h2>${grafik()}</div>
  <div class="grid2">
    <div class="card"><h2>Yapılacak İşler <button class="plus" data-act="isEkle" aria-label="İş ekle">+</button></h2>
      ${isler.length?`<div class="list">${isler.map(i=>isSatir(i)).join("")}</div>`:emptyBox("Yeni yapılacak iş yok.")}</div>
    <div class="card"><h2>İş Takibi <button class="plus" data-go="pano" aria-label="İş takip panosu">+</button></h2>
      ${tal.length?`<div class="list">${tal.map(t=>`<div class="li"><div class="grow"><b>${esc(t.konu)}</b> ${ornekTag(t)}<div class="small muted">${esc(daireAd(t.daireId))} · ${trDate(t.tarih)} · ${esc(t.tur||"")}</div></div>${durumPill(t.durum)}</div>`).join("")}</div>`:emptyBox("Yeni iş takibi yok.")}</div>
  </div>`;
}
function grafik(){
  const ay=thisMonth();const ms=[];let m=ay;for(let i=0;i<12;i++){ms.unshift(m);m=prevMonth(m)}
  const data=ms.map(dn=>{const xs=S.tahakkuk.filter(x=>x.donem===dn&&num(x.tutar)>0&&!x.kaynak);const t=xs.reduce((s,x)=>s+num(x.tutar),0),o=xs.reduce((s,x)=>s+Math.min(num(x.odenen),num(x.tutar)),0);return{dn,t,o}});
  const mx=Math.max(1,...data.map(d=>d.t));
  if(data.every(d=>d.t===0))return emptyBox("Henüz borç yazılmış dönem yok.");
  const W=960,H=240,L=60,B=30,bw=(W-L-10)/12;
  const yt=[0,.25,.5,.75,1].map(f=>f*mx);
  const k=v=>v>=1e6?(v/1e6).toFixed(1).replace(".",",")+"M":v>=1e3?Math.round(v/1e3)+"k":Math.round(v);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dönemlere göre tahakkuk ve tahsilat">
  ${yt.map(v=>{const y=H-B-(v/mx)*(H-B-14);return `<line x1="${L}" x2="${W-6}" y1="${y}" y2="${y}" stroke="#e6ebf0"/><text x="${L-8}" y="${y+4}" text-anchor="end" font-size="11" fill="#8a94a1">${k(v)}</text>`}).join("")}
  ${data.map((d,i)=>{const x=L+i*bw+bw*.18,w=bw*.64,h1=(d.o/mx)*(H-B-14),h2=((d.t-d.o)/mx)*(H-B-14);const y0=H-B;
    return `<g><title>${donemAd(d.dn)}: tahakkuk ${TL(d.t)}, tahsil edilen ${TL(d.o)}</title>${h2>0?`<rect x="${x}" y="${y0-h1-h2}" width="${w}" height="${h2}" rx="2" fill="#f4b9bb"/>`:""}<rect x="${x}" y="${y0-h1}" width="${w}" height="${h1}" fill="#6db8e6"/><text x="${x+w/2}" y="${H-10}" text-anchor="middle" font-size="11" fill="#6b7684">${AYLAR[+d.dn.slice(5)-1].slice(0,3)} ${d.dn.slice(2,4)}</text></g>`}).join("")}
  </svg><div class="legend"><span style="background:#fdeced;color:#c0393e">Tahsil edilemeyen</span><span style="background:#e3f2fb;color:#1b6fb5">Tahsil edilen</span></div>`;
}
const durumPill=d=>`<span class="pill ${d==="Çözüldü"?"p-green":d==="İşlemde"?"p-amber":"p-red"}">${esc(d||"Açık")}</span>`;
const isSatir=i=>`<div class="li"><input type="checkbox" style="width:auto;margin-top:3px" data-act="isBitir" data-id="${i.id}" ${i.bitti?"checked":""} aria-label="Tamamlandı"><div class="grow" style="${i.bitti?"text-decoration:line-through;color:var(--muted)":""}"><b style="font-weight:500">${esc(i.baslik)}</b>${i.not?`<p class="small muted">${esc(i.not)}</p>`:""}</div>${i.tarih?`<span class="small ${!i.bitti&&i.tarih<today()?"neg":"muted"}">${trDate(i.tarih)}</span>`:""}</div>`;

/* ---------- Site ---------- */
function pKisiler(){
  const rows=[];
  for(const d of S.daireler){const k=S.kimlik.find(x=>x.id===d.id)||{};
    if(d.malik)rows.push({ad:d.malik,tip:"Malik",daireId:d.id,daire:daireKisa(d.id),tel:d.tel||"",tc:k.malikTc||""});
    if(d.kiraci)rows.push({ad:d.kiraci,tip:"Kiracı",daireId:d.id,daire:daireKisa(d.id),tel:d.kiraciTel||"",tc:k.kiraciTc||""})}
  const bos=S.daireler.filter(d=>!d.malik).length;
  return title("Kişiler")+`${bos?`<div class="note" style="margin-bottom:12px">${bos} dairenin malik adı girilmemiş. Daireler sayfasından daireye tıklayıp bilgilerini girebilirsiniz.</div>`:""}<div class="card">${dt("kisiler",[
    {k:"ad",l:"Adı Soyadı",f:r=>`<b style="font-weight:500">${esc(r.ad)}</b>`},
    {k:"tip",l:"Tip",f:r=>`<span class="pill ${r.tip==="Malik"?"p-blue":"p-gray"}">${r.tip}</span>`},
    {k:"tc",l:"TC Kimlik"},
    {k:"tel",l:"Telefon"},
    {k:"daire",l:"Bağlı Daire",sv:r=>(daire(r.daireId)?.blok||"")+String(daire(r.daireId)?.no||"").padStart(4,"0")},
    {k:"bal",l:"Bakiye",r:1,sv:r=>borc(r.daireId),f:r=>{const b=borc(r.daireId);return `<span class="${balCls(b)}">${TL(b)}</span>`}}
  ],rows,{letterOf:r=>r.ad,click:r=>`data-daire="${r.daireId}"`,firstShade:1})}</div>`;
}
function pDaireler(){
  if(arg&&daire(arg))return pDaireDetay(arg);
  const bloklar=[...new Set(S.daireler.map(d=>d.blok||""))].filter(Boolean).sort((a,b)=>a.localeCompare(b,"tr"));
  return title("Daireler",`<button class="btn sm" data-act="daireYeni">+ Yeni daire</button><button class="btn out sm" data-act="topluDaire">Toplu daire oluştur</button>`)+`<div class="card">${dt("daireler",[
    {k:"daire",l:"Daire",sv:r=>(r.blok||"")+String(r.no).padStart(4,"0"),f:r=>`<b style="font-weight:600">${esc(daireKisa(r.id))}</b>${ornekTag(r)}`},
    {k:"malik",l:"Malik",f:r=>r.malik?esc(r.malik):`<span class="muted">—</span>`},
    {k:"kiraci",l:"Kiracı",f:r=>r.kiraci?esc(r.kiraci):`<span class="muted">—</span>`},
    {k:"tel",l:"Telefon"},
    {k:"aidat",l:"Aylık Aidat",r:1,sv:r=>num(r.aidat),f:r=>TL(r.aidat)},
    {k:"bal",l:"Bakiye",r:1,sv:r=>borc(r.id),f:r=>{const b=borc(r.id);return `<span class="${balCls(b)}">${TL(b)}</span>`}},
    {k:"durum",l:"Durum",sv:r=>borc(r.id)>0?1:0,f:r=>{const b=borc(r.id);return b>0.009?`<span class="pill p-red">Borçlu</span>`:b<-0.009?`<span class="pill p-green">Alacaklı</span>`:`<span class="pill p-green">Ödendi</span>`}}
  ],S.daireler,{chips:bloklar,chipOf:r=>r.blok||"",chipSuffix:" Blok",click:r=>`data-daire="${r.id}"`,firstShade:1,per:50})}</div>`;
}
function hareketler(id){
  const xs=[];
  for(const x of S.tahakkuk)if(x.daireId===id){const t=num(x.tutar),tr=x.tarih||x.donem+"-01";
    if(t>0)xs.push({tarih:tr,ac:(x.aciklama||"Aidat")+" · "+donemAd(x.donem),b:t,a:0,ornek:x.ornek});
    else if(t<0)xs.push({tarih:tr,ac:x.aciklama||"Alacak",b:0,a:-t,ornek:x.ornek});
    if(num(x.devirOdenen)>0)xs.push({tarih:"2026-11-09",ac:(x.aciklama||"Aidat")+" · Apsiyon'da ödenmiş",b:0,a:num(x.devirOdenen)});}
  for(const k of S.kasa)if(k.daireId===id&&k.tur==="gelir")xs.push({tarih:k.tarih,ac:"Tahsilat · "+kasaOf(k)+(k.aciklama?" · "+k.aciklama.split(" — ")[0]:""),b:0,a:num(k.tutar),ornek:k.ornek});
  xs.sort((a,b)=>String(a.tarih).localeCompare(b.tarih)||b.b-a.b);
  let bal=0;xs.forEach(x=>{bal=r2(bal+x.b-x.a);x.bal=bal});
  return xs;
}
function ekstreTablo(xs){
  if(!xs.length)return emptyBox("Hareket yok.");
  const tb=xs.reduce((s,x)=>s+x.b,0),ta=xs.reduce((s,x)=>s+x.a,0);
  return `<div class="tbox"><table class="dt"><thead><tr><th>Tarih</th><th>Açıklama</th><th class="r">Borç</th><th class="r">Alacak</th><th class="r">Bakiye</th></tr></thead><tbody>
  ${xs.map(x=>`<tr><td class="num">${trDate(x.tarih)}</td><td>${esc(x.ac)}${ornekTag(x)}</td><td class="r num">${x.b?N(x.b):""}</td><td class="r num">${x.a?N(x.a):""}</td><td class="r num ${balCls(x.bal)}">${N(x.bal)}</td></tr>`).join("")}
  </tbody><tfoot><tr><td></td><td>Toplam</td><td class="r num">${N(tb)}</td><td class="r num">${N(ta)}</td><td class="r num">${N(tb-ta)}</td></tr></tfoot></table></div>`;
}
function pDaireDetay(id){
  const d=daire(id),h=hesap(id);
  const acik=S.tahakkuk.filter(x=>x.daireId===id&&Math.abs(num(x.tutar)-num(x.odenen))>0.009&&!(num(x.tutar)===0&&!x.kaynak)).sort((a,b)=>String(a.donem).localeCompare(b.donem));
  return `<div class="row noprint" style="margin-bottom:10px"><button class="btn out sm" data-go="daireler">← Daireler</button></div>`+title(daireAd(id),`<button class="btn sm" data-act="tahsilatModal" data-id="${id}">Tahsilat gir</button><button class="btn out sm" data-act="borcModal" data-id="${id}">Borç ekle</button><button class="btn out sm" data-act="daireDuzenle" data-id="${id}">Bilgileri düzenle</button><button class="btn out sm noprint" data-act="yazdir">Yazdır</button>`)+`
  <div class="card"><div class="dhead"><div><div class="muted small">Malik</div><div style="font-size:17px;font-weight:500">${esc(d.malik||"—")}</div><div class="small muted">${[d.tel?esc(d.tel):"",d.kiraci?`Kiracı: ${esc(d.kiraci)} ${esc(d.kiraciTel||"")}`:"","Aylık aidat "+TL(d.aidat)].filter(Boolean).join(" · ")}</div></div>
    <div style="text-align:right"><div class="muted small">Güncel bakiye</div><div class="big ${balCls(h.bal)}">${TL(h.bal)}</div></div></div></div>
  <div class="stats"><div class="stat"><div class="l">Borç tutarı</div><div class="v">${TL(h.tah)}</div></div><div class="stat"><div class="l">Gecikme</div><div class="v">${TL(h.gec)}</div></div><div class="stat"><div class="l">Ödenen</div><div class="v pos">${TL(h.od)}</div></div></div>
  ${acik.length?`<div class="card"><h2>Açık borçlar ve alacaklar</h2><div class="tbox"><table class="dt" style="min-width:420px"><thead><tr><th>Dönem</th><th>Açıklama</th><th class="r">Tutar</th><th class="r">Kalan</th></tr></thead><tbody>${acik.map(x=>`<tr><td>${donemAd(x.donem)}</td><td>${esc(x.aciklama||"Aidat")}${x.eski?` <span class="pill p-gray">sakin görmez</span>`:""}</td><td class="r num">${TL(x.tutar)}</td><td class="r num ${num(x.tutar)-num(x.odenen)<0?"pos":"neg"}">${TL(num(x.tutar)-num(x.odenen))}</td></tr>`).join("")}</tbody></table></div><p class="small muted" style="margin:8px 0 0">Ödemeler önce güncel malik/kiracı borçlarına, sonra eski malik/kiracı borçlarına düşer.</p></div>`:""}
  <div class="card"><h2>Hesap ekstresi</h2>${ekstreTablo(hareketler(id))}</div>
  <div class="card noprint"><h3>Daireyi sil</h3>${pending==="del-"+id?`<div class="row"><span>Daire ve tüm hesap kayıtları silinsin mi?</span><button class="btn red sm" data-act="daireSilOk" data-id="${id}">Evet, sil</button><button class="btn out sm" data-act="vazgec">Vazgeç</button></div>`:`<button class="btn red sm" data-act="daireSil" data-id="${id}">Daireyi sil</button>`}</div>`;
}
function daireForm(d){
  const k=(d.id&&S.kimlik.find(x=>x.id===d.id))||{};
  return `<form class="form" data-form="daire" data-id="${d.id||""}">
    <label>Blok<input name="blok" value="${esc(d.blok||"")}" placeholder="B"></label>
    <label>Daire no<input name="no" required value="${esc(d.no||"")}"></label>
    <label>Aylık aidat (TL)<input name="aidat" inputmode="decimal" required value="${esc(d.aidat??"")}"></label>
    <h3 class="full" style="margin:6px 0 0">Malik</h3>
    <label>Adı soyadı<input name="malik" value="${esc(d.malik||"")}"></label>
    <label>TC kimlik no<input name="malikTc" inputmode="numeric" maxlength="11" value="${esc(k.malikTc||"")}"></label>
    <label>Telefon<input name="tel" inputmode="tel" value="${esc(d.tel||"")}"></label>
    <h3 class="full" style="margin:6px 0 0">Kiracı <span class="muted small">(varsa)</span></h3>
    <label>Adı soyadı<input name="kiraci" value="${esc(d.kiraci||"")}"></label>
    <label>TC kimlik no<input name="kiraciTc" inputmode="numeric" maxlength="11" value="${esc(k.kiraciTc||"")}"></label>
    <label>Telefon<input name="kiraciTel" inputmode="tel" value="${esc(d.kiraciTel||"")}"></label>
    <p class="small muted full" style="margin:0">TC kimlik numaraları yalnızca yöneticilere görünür.</p>
    <div class="full"><button class="btn">${d.id?"Kaydet":"Daireyi ekle"}</button></div>
  </form>`;
}
function tcOk(t){if(!t)return true;if(!/^[1-9][0-9]{10}$/.test(t))return false;const n=[...t].map(Number);const t10=((n[0]+n[2]+n[4]+n[6]+n[8])*7-(n[1]+n[3]+n[5]+n[7]))%10;const t11=n.slice(0,10).reduce((a,b)=>a+b,0)%10;return((t10+10)%10)===n[9]&&t11===n[10]}

function pBildirimler(){
  const xs=S.bildirimler.slice().sort((a,b)=>(a.durum==="bekliyor"?0:1)-(b.durum==="bekliyor"?0:1)||String(b.tarih).localeCompare(a.tarih));
  return title("Onay Bekleyen Ödemeler")+`<div class="note" style="margin-bottom:14px">Sakinler havale/EFT yaptıktan sonra "Dairem" ekranından bildirir. Banka hesabınızda gördüğünüz ödemeyi onaylayınca borçtan düşülür ve seçtiğiniz kasaya işlenir.</div><div class="card">${dt("bildirim",[
    {k:"tarih",l:"Ödeme Tarihi",f:r=>trDate(r.tarih)},
    {k:"daire",l:"Daire",sv:r=>daireKisa(r.daireId),f:r=>esc(daireAd(r.daireId))+ornekTag(r)},
    {k:"gonderen",l:"Gönderen"},
    {k:"aciklama",l:"Not"},
    {k:"tutar",l:"Tutar",r:1,sv:r=>num(r.tutar),f:r=>TL(r.tutar)},
    {k:"durum",l:"Durum",sv:r=>r.durum==="bekliyor"?0:1,f:r=>r.durum==="bekliyor"?`<div class="row"><button class="btn green sm" data-act="onayla" data-id="${r.id}">Onayla</button><button class="btn red sm" data-act="reddet" data-id="${r.id}">Reddet</button></div>`:`<span class="pill ${r.durum==="onaylandi"?"p-green":"p-red"}">${r.durum==="onaylandi"?"Onaylandı":"Reddedildi"}</span>`}
  ],xs,{sort:"durum",bar:`<label style="flex-direction:row;align-items:center;gap:6px">Onaylananlar kasası <select id="onayKasa" style="width:auto">${kasaOpts(defKasa())}</select></label>`})}</div>`;
}

/* ---------- Finans ---------- */
function pFinansal(){
  const rows=S.daireler.map(d=>{const h=hesap(d.id);return{id:d.id,ad:d.malik||"",tel:d.tel||"",daire:daireKisa(d.id),blok:d.blok||"",...h}});
  return title("Kişilere Göre Finansal Durum")+`<div class="card">${dt("finansal",[
    {k:"ad",l:"Borçlu",sv:r=>(r.ad||"\uffff")+" "+r.blok+String(daire(r.id)?.no||"").padStart(4,"0"),f:r=>r.ad?esc(r.ad):`<span class="muted">(malik girilmemiş)</span>`},
    {k:"tel",l:"Telefon"},
    {k:"daire",l:"Bağlı Daire",sv:r=>r.blok+String(daire(r.id)?.no||"").padStart(4,"0")},
    {k:"tah",l:"Borç Tutarı",r:1,f:r=>TL(r.tah)},
    {k:"gec",l:"Gecikme",r:1,f:r=>TL(r.gec)},
    {k:"od",l:"Ödenen",r:1,f:r=>TL(r.od)},
    {k:"borc",l:"Borç",r:1,sv:r=>Math.max(r.bal,0),f:r=>TL(Math.max(r.bal,0))},
    {k:"alacak",l:"Alacak",r:1,sv:r=>Math.max(-r.bal,0),f:r=>TL(Math.max(-r.bal,0))},
    {k:"bal",l:"Bakiye",r:1,cls:r=>balCls(r.bal),f:r=>TL(r.bal)}
  ],rows,{letterOf:r=>r.ad,click:r=>`data-daire="${r.id}"`,firstShade:1,minw:980,sort:"ad",
    totals:xs=>{const s=k=>xs.reduce((a,r)=>a+r[k],0);return{tah:TL(s("tah")),gec:TL(s("gec")),od:TL(s("od")),borc:TL(xs.reduce((a,r)=>a+Math.max(r.bal,0),0)),alacak:TL(xs.reduce((a,r)=>a+Math.max(-r.bal,0),0)),bal:TL(s("bal"))}},
    acts:`<button class="btn out sm" data-go="toplu">Toplu Borçlandırma</button><button class="btn out sm" data-go="hesapEks">Hesap Ekstresi</button><button class="btn out sm" data-go="vadesi">Vadesi Geçmiş Borçlar</button><button class="btn out sm" data-act="yazdir">Yazdır</button>`})}</div>`;
}
function tahsilatFormHtml(id,inModal){
  const b=id?borc(id):0;
  return `<form class="form" data-form="tahsilat">
    <label class="${inModal?"full":""}">Daire<select name="daireId" required data-act="tahDaire">${daireOpts(id,"Daire seçin…")}</select></label>
    <label>Kasa<select name="kasa">${kasaOpts(defKasa())}</select></label>
    <label>Tutar (TL)<input name="tutar" inputmode="decimal" required value="${b>0?String(b).replace(".",","):""}"></label>
    <label>Tarih<input type="date" name="tarih" value="${today()}"></label>
    <label class="${inModal?"full":""}">Açıklama<input name="aciklama" placeholder="Nakit, havale…"></label>
    <div class="full between"><span class="small" id="tahBorc">${id?`Güncel bakiye: <b class="${balCls(b)}">${TL(b)}</b>`:""}</span><button class="btn green">Tahsil et</button></div>
  </form><p class="small muted" style="margin:10px 0 0">Ödeme en eski borçtan başlayarak kapatılır, seçilen kasaya gelir olarak işlenir.</p>`;
}
function pTahsilat(){
  const xs=S.kasa.filter(k=>k.daireId&&k.tur==="gelir");
  return title("Tahsilat Makbuzu")+`<div class="card"><h2>Yeni tahsilat</h2>${tahsilatFormHtml(null,false)}</div><div class="card"><h2>Tahsilat makbuzları</h2>${dt("tahlist",[
    {k:"tarih",l:"Tarih",f:r=>trDate(r.tarih)},{k:"daire",l:"Daire",sv:r=>daireKisa(r.daireId),f:r=>esc(daireAd(r.daireId))+ornekTag(r)},
    {k:"malik",l:"Malik",sv:r=>daire(r.daireId)?.malik||"",f:r=>esc(daire(r.daireId)?.malik||"")},{k:"hesap",l:"Kasa",sv:r=>kasaOf(r),f:r=>esc(kasaOf(r))},
    {k:"aciklama",l:"Açıklama",f:r=>esc((r.aciklama||"").split(" — ")[0])},{k:"tutar",l:"Tutar",r:1,sv:r=>num(r.tutar),f:r=>TL(r.tutar)},
    {k:"sil",l:"",sv:()=>0,f:r=>silBtn("k",r.id,"Tahsilatı iptal et","İptal")}
  ],xs,{sort:"tarih",dir:-1,totals:x=>({tutar:TL(x.reduce((s,r)=>s+num(r.tutar),0))})})}</div>`;
}
const silBtn=(p,id,soru,etiket)=>pending===p+"-"+id?`<span class="row" style="justify-content:flex-end"><button class="btn red sm" data-act="silOk" data-p="${p}" data-id="${id}">${etiket||"Sil"}</button><button class="btn out sm" data-act="vazgec">Vazgeç</button></span>`:`<button class="btn out sm" data-act="sil" data-p="${p}" data-id="${id}" title="${esc(soru)}">${etiket||"Sil"}</button>`;
function borcFormHtml(id,inModal){
  return `<form class="form" data-form="ekborc">
    <label class="${inModal?"full":""}">Daire<select name="daireId" required>${daireOpts(id,"Daire seçin…")}</select></label>
    <label>Dönem<input type="month" name="donem" required value="${thisMonth()}"></label>
    <label>Tutar (TL)<input name="tutar" inputmode="decimal" required></label>
    <label class="${inModal?"full":""}">Açıklama<input name="aciklama" required list="borcTur" placeholder="Demirbaş"></label>
    <datalist id="borcTur">${["Demirbaş","Yakıt farkı","Su","Doğalgaz","Ortak alan onarımı","Avukatlık masrafı"].map(x=>`<option value="${x}">`).join("")}</datalist>
    <div class="full"><button class="btn">Borç ekle</button></div></form>`;
}
function pBorc(){
  const xs=S.tahakkuk.filter(x=>num(x.tutar)>0&&(x.aciklama||"Aidat")!=="Aidat"&&!isGecikme(x));
  return title("Borç Makbuzu")+`<div class="card"><h2>Tek daireye ek borç</h2><p class="muted small" style="margin:-4px 0 12px">Demirbaş, yakıt farkı, onarım payı gibi aidat dışı borçlar için.</p>${borcFormHtml(null,false)}</div>
  <div class="card"><h2>Ek borçlar</h2>${dt("ekborc",[
    {k:"donem",l:"Dönem",f:r=>donemAd(r.donem)},{k:"daire",l:"Daire",sv:r=>daireKisa(r.daireId),f:r=>esc(daireAd(r.daireId))+ornekTag(r)},
    {k:"aciklama",l:"Açıklama"},{k:"tutar",l:"Tutar",r:1,sv:r=>num(r.tutar),f:r=>TL(r.tutar)},{k:"odenen",l:"Ödenen",r:1,sv:r=>num(r.odenen),f:r=>TL(r.odenen)},
    {k:"sil",l:"",sv:()=>0,f:r=>num(r.odenen)>0?"":silBtn("t",r.id,"Borcu sil")}
  ],xs,{sort:"donem",dir:-1})}</div>`;
}
function pToplu(){
  const donemler=[...new Set(S.tahakkuk.map(x=>x.donem))].sort().reverse();
  const rows=donemler.map(dn=>{const xs=S.tahakkuk.filter(x=>x.donem===dn&&num(x.tutar)>0&&!x.kaynak);const t=xs.reduce((s,x)=>s+num(x.tutar),0),o=xs.reduce((s,x)=>s+Math.min(num(x.odenen),num(x.tutar)),0);return{dn,t:r2(t),o:r2(o),n:xs.length}}).filter(r=>r.n);
  return title("Toplu Borçlandırma")+`<div class="card"><h2>Toplu aidat borcu yaz</h2><p class="muted small" style="margin:-4px 0 12px">Seçilen ay için her daireye kendi aylık aidatı kadar borç yazılır. O ay aynı açıklamayla borcu olan daireler atlanır.</p>
  <form class="form" data-form="toplu"><label>Dönem<input type="month" name="donem" required value="${thisMonth()}"></label><label>Açıklama<input name="aciklama" value="Aidat"></label><label>Blok<select name="blok"><option value="">Tüm bloklar</option>${[...new Set(S.daireler.map(d=>d.blok).filter(Boolean))].sort().map(b=>`<option>${esc(b)}</option>`).join("")}</select></label><div><button class="btn">Borçlandır</button></div></form></div>
  <div class="card"><h2>Dönemler</h2>${dt("donemler",[
    {k:"dn",l:"Dönem",f:r=>donemAd(r.dn)},{k:"n",l:"Kayıt",r:1},{k:"t",l:"Tahakkuk",r:1,f:r=>TL(r.t)},{k:"o",l:"Tahsil Edilen",r:1,f:r=>TL(r.o)},
    {k:"k",l:"Kalan",r:1,sv:r=>r.t-r.o,cls:r=>r.t-r.o>0.009?"neg":"",f:r=>TL(r.t-r.o)},
    {k:"p",l:"Tahsilat Oranı",r:1,sv:r=>r.t?r.o/r.t:1,f:r=>{const p=r.t>0?Math.min(100,Math.round(r.o/r.t*100)):100;return `<span class="pill ${p>=95?"p-green":p>=60?"p-amber":"p-red"}">%${p}</span>`}}
  ],rows,{sort:"dn",dir:-1})}</div>`;
}
let gecDonem=null;
function pGecikme(){
  gecDonem=gecDonem||prevMonth(thisMonth());
  const{oran,out}=gecikmeOnizle(gecDonem);const top=out.reduce((s,x)=>s+x.zam,0);
  const yapilan=[...new Set(S.tahakkuk.filter(isGecikme).map(x=>x.aciklama))].sort().reverse();
  return title("Gecikme Zammı")+`<div class="card"><h2>Aylık gecikme tazminatı</h2>
  <div class="note" style="margin-bottom:14px">Son ödeme tarihi her ayın son günüdür. Sistem <b>her ayın 1'inde otomatik olarak</b>, bir önceki ay sonunda ödenmemiş aidat ve ek borçlara <b>%${N(oran).replace(",00","")}</b> gecikme tazminatı yazar. Tazminatın kendisine ve eski malik/kiracı borçlarına yeniden tazminat eklenmez; her daireye bir dönemde bir kez uygulanır. Aşağıdan önizleyip elle de uygulayabilirsiniz.</div>
  ${oran<=0?`<p>Gecikme oranı 0, otomatik tazminat yazılmaz.</p><button class="btn" data-go="gecikmeAyar">Gecikme ayarına git</button>`:`
  <div class="row" style="margin-bottom:12px"><label style="flex-direction:row;align-items:center;gap:8px">Vadesi geçen ay <input type="month" id="gecDonem" data-act="gecDonem" value="${gecDonem}" style="width:auto"></label>
  <span class="muted">${out.length} daire · toplam <b>${TL(top)}</b></span>
  ${out.length?(pending==="gec"?`<button class="btn red sm" data-act="gecUygula">Evet, ${out.length} daireye yaz</button><button class="btn out sm" data-act="vazgec">Vazgeç</button>`:`<button class="btn" data-act="gecSor">Şimdi uygula</button>`):""}</div>
  ${out.length?`<div class="tbox"><table class="dt" style="min-width:480px"><thead><tr><th>Daire</th><th>Malik</th><th class="r">Gecikmiş borç</th><th class="r">Tazminat</th></tr></thead><tbody>${out.sort((a,b)=>sortDaire(a.d,b.d)).map(x=>`<tr class="click" data-daire="${x.d.id}"><td>${esc(daireAd(x.d.id))}</td><td>${esc(x.d.malik||"")}</td><td class="r num">${TL(x.base)}</td><td class="r num neg">${TL(x.zam)}</td></tr>`).join("")}</tbody></table></div>`:emptyBox(donemAd(gecDonem)+" için yazılacak gecikme tazminatı yok.")}`}
  </div>${yapilan.length?`<div class="card"><h2>Uygulanan dönemler</h2><div class="row">${yapilan.map(a=>{const xs=S.tahakkuk.filter(x=>x.aciklama===a);return `<span class="pill p-gray">${esc(a)} · ${xs.length} daire · ${TL(xs.reduce((s,x)=>s+num(x.tutar),0))}</span>`}).join("")}</div></div>`:""}`;
}

const KAT_GIDER=["Elektrik","Su","Doğalgaz","Temizlik","Güvenlik","Asansör bakımı","Bahçe bakımı","İlaçlama","Personel maaşı","SGK","Onarım","Banka masrafı","Kırtasiye","Diğer gider"];
const KAT_GELIR=["Faiz geliri","Kira geliri","Otopark","Diğer gelir"];
function pFis(){
  const xs=S.kasa.filter(k=>!k.transfer);
  return title("Gelir / Gider Fişi")+`<div class="card"><h2>Yeni fiş</h2><form class="form" data-form="kasa">
    <label>Tür<select name="tur"><option value="gider">Gider</option><option value="gelir">Gelir</option></select></label>
    <label>Kasa<select name="hesap">${kasaOpts(defKasa())}</select></label>
    <label>Kategori<input name="kategori" list="katlist" required placeholder="Elektrik"></label>
    <label>Tutar (TL)<input name="tutar" inputmode="decimal" required></label>
    <label>Tarih<input type="date" name="tarih" value="${today()}"></label>
    <label>Açıklama<input name="aciklama"></label>
    <datalist id="katlist">${[...KAT_GIDER,...KAT_GELIR].map(x=>`<option value="${x}">`).join("")}</datalist>
    <div><button class="btn">Kaydet</button></div></form></div>
  <div class="card"><h2>Kasa hareketleri</h2>${dt("kasa",[
    {k:"tarih",l:"Tarih",f:r=>trDate(r.tarih)},
    {k:"tur",l:"Tür",f:r=>`<span class="pill ${r.tur==="gelir"?"p-green":"p-red"}">${r.tur==="gelir"?"Gelir":"Gider"}</span>`},
    {k:"hesap",l:"Kasa",sv:r=>kasaOf(r),f:r=>esc(kasaOf(r))},
    {k:"kategori",l:"Kategori",f:r=>esc(r.kategori||"")+ornekTag(r)},
    {k:"aciklama",l:"Açıklama"},
    {k:"tutar",l:"Tutar",r:1,sv:r=>(r.tur==="gelir"?1:-1)*num(r.tutar),f:r=>`<span class="${r.tur==="gelir"?"pos":"neg"}">${r.tur==="gelir"?"+":"−"}${N(r.tutar)}</span>`},
    {k:"sil",l:"",sv:()=>0,f:r=>silBtn("k",r.id,r.daireId?"Tahsilatı iptal et":"Fişi sil",r.daireId?"İptal":"Sil")}
  ],xs,{sort:"tarih",dir:-1,chips:kasalar(),chipOf:r=>kasaOf(r),totals:x=>{const g=x.filter(r=>r.tur==="gelir").reduce((s,r)=>s+num(r.tutar),0),c=x.filter(r=>r.tur!=="gelir").reduce((s,r)=>s+num(r.tutar),0);return{tutar:`<span class="pos">+${N(g)}</span> / <span class="neg">−${N(c)}</span>`}}})}</div>`;
}
function pTransfer(){
  const ks=kasaOzet();const xs=S.kasa.filter(k=>k.transfer&&k.tur==="gider");
  return title("Kasa Transfer Fişi")+`<div class="stats">${ks.map(r=>`<div class="stat"><div class="l">${esc(r.k)}</div><div class="v ${r.kal<0?"neg":"blue"}">${TL(r.kal)}</div></div>`).join("")}</div>
  <div class="card"><h2>Kasalar arası transfer</h2><p class="muted small" style="margin:-4px 0 12px">Örneğin nakit kasasındaki parayı bankaya yatırdığınızda kullanın. Gelir-gider raporlarına girmez.</p>
  <form class="form" data-form="transfer"><label>Çıkan kasa<select name="from">${kasaOpts(kasalar()[1]||defKasa())}</select></label><label>Giren kasa<select name="to">${kasaOpts(defKasa())}</select></label>
  <label>Tutar (TL)<input name="tutar" inputmode="decimal" required></label><label>Tarih<input type="date" name="tarih" value="${today()}"></label><label>Açıklama<input name="aciklama" placeholder="Bankaya yatırıldı"></label><div><button class="btn">Transfer et</button></div></form></div>
  <div class="card"><h2>Transferler</h2>${dt("transfer",[
    {k:"tarih",l:"Tarih",f:r=>trDate(r.tarih)},{k:"hesap",l:"Çıkan",sv:r=>kasaOf(r),f:r=>esc(kasaOf(r))},{k:"to",l:"Giren",sv:r=>r.karsi||"",f:r=>esc(r.karsi||"")},
    {k:"aciklama",l:"Açıklama"},{k:"tutar",l:"Tutar",r:1,sv:r=>num(r.tutar),f:r=>TL(r.tutar)},{k:"sil",l:"",sv:()=>0,f:r=>silBtn("tr",r.id,"Transferi sil")}
  ],xs,{sort:"tarih",dir:-1})}</div>`;
}

/* ---------- Raporlar ---------- */
let rp={kasa:null,bas:"",bit:"",daire:null,yil:null};
function pKasaEks(){
  rp.kasa=rp.kasa||defKasa();
  const dev=num((ayar().devir||{})[rp.kasa]);
  let bal=dev;const xs=S.kasa.filter(k=>kasaOf(k)===rp.kasa).sort((a,b)=>String(a.tarih).localeCompare(b.tarih));
  const rows=[];for(const k of xs){const g=k.tur==="gelir"?num(k.tutar):0,c=k.tur==="gelir"?0:num(k.tutar);bal=r2(bal+g-c);if((!rp.bas||k.tarih>=rp.bas)&&(!rp.bit||k.tarih<=rp.bit))rows.push({k,g,c,bal})}
  const once=rp.bas?r2(dev+xs.filter(k=>k.tarih<rp.bas).reduce((s,k)=>s+(k.tur==="gelir"?1:-1)*num(k.tutar),0)):dev;
  return title("Kasa Ekstresi",`<button class="btn out sm noprint" data-act="yazdir">Yazdır</button>`)+`<div class="card"><div class="row noprint" style="margin-bottom:14px">
    <label>Kasa<select data-rp="kasa">${kasaOpts(rp.kasa)}</select></label><label>Başlangıç<input type="date" data-rp="bas" value="${rp.bas}"></label><label>Bitiş<input type="date" data-rp="bit" value="${rp.bit}"></label></div>
    <h2>${esc(rp.kasa)} <small>${rp.bas?trDate(rp.bas):"başlangıç"} – ${rp.bit?trDate(rp.bit):"bugün"}</small></h2>
    <div class="tbox"><table class="dt"><thead><tr><th>Tarih</th><th>Kategori</th><th>Açıklama</th><th class="r">Giren</th><th class="r">Çıkan</th><th class="r">Bakiye</th></tr></thead><tbody>
    <tr><td></td><td colspan="4" class="muted">Devreden bakiye</td><td class="r num">${N(once)}</td></tr>
    ${rows.map(x=>`<tr><td class="num">${trDate(x.k.tarih)}</td><td>${esc(x.k.kategori||"")}</td><td>${esc(x.k.aciklama||"")}</td><td class="r num pos">${x.g?N(x.g):""}</td><td class="r num neg">${x.c?N(x.c):""}</td><td class="r num">${N(x.bal)}</td></tr>`).join("")}
    </tbody><tfoot><tr><td></td><td colspan="2">Toplam</td><td class="r num">${N(rows.reduce((s,x)=>s+x.g,0))}</td><td class="r num">${N(rows.reduce((s,x)=>s+x.c,0))}</td><td class="r num">${N(rows.length?rows[rows.length-1].bal:once)}</td></tr></tfoot></table></div></div>`;
}
function pHesapEks(){
  const id=rp.daire&&daire(rp.daire)?rp.daire:null;
  return title("Hesap Ekstresi",`<button class="btn out sm noprint" data-act="yazdir">Yazdır</button>`)+`<div class="card"><div class="row noprint" style="margin-bottom:14px"><label style="min-width:280px">Daire<select data-rp="daire">${daireOpts(id,"Daire seçin…")}</select></label></div>
  ${id?`<div class="between" style="margin-bottom:12px"><div><h2 style="margin:0">${esc(daireAd(id))}</h2><div class="muted">${esc(daire(id).malik||"")}</div></div><div style="text-align:right"><div class="small muted">Bakiye</div><div class="big ${balCls(borc(id))}">${TL(borc(id))}</div></div></div>${ekstreTablo(hareketler(id))}`:emptyBox("Ekstresini görmek istediğiniz daireyi seçin.")}</div>`;
}
function pVadesi(){
  const rows=S.daireler.map(d=>{const v=vadesiGecmis(d.id);return{id:d.id,daire:daireKisa(d.id),blok:d.blok||"",ad:d.malik||"",tel:d.tel||"",t:v.t,en:v.en||""}}).filter(r=>r.t>0.009);
  const ayFark=en=>{if(!en)return 0;const[y,m]=en.split("-").map(Number);const[cy,cm]=thisMonth().split("-").map(Number);return(cy-y)*12+(cm-m)};
  return title("Vadesi Geçmiş Borçlar",`<button class="btn out sm noprint" data-act="yazdir">Yazdır</button>`)+`<div class="note" style="margin-bottom:12px">Ay sonu son ödeme tarihi kabul edilir; içinde bulunduğumuz aydan önceki dönemlerin kalan borçları listelenir.</div><div class="card">${dt("vadesi",[
    {k:"daire",l:"Daire",sv:r=>r.blok+String(daire(r.id)?.no||"").padStart(4,"0")},{k:"ad",l:"Malik"},{k:"tel",l:"Telefon"},
    {k:"en",l:"En eski dönem",f:r=>donemAd(r.en)},{k:"ay",l:"Geciken ay",r:1,sv:r=>ayFark(r.en),f:r=>ayFark(r.en)},
    {k:"t",l:"Vadesi geçen",r:1,cls:()=>"neg",f:r=>TL(r.t)}
  ],rows,{sort:"t",dir:-1,click:r=>`data-daire="${r.id}"`,totals:x=>({t:TL(x.reduce((s,r)=>s+r.t,0))})})}</div>`;
}
function pGelirGider(){
  const yillar=[...new Set(S.kasa.map(k=>(k.tarih||"").slice(0,4)).filter(Boolean))].sort().reverse();
  rp.yil=rp.yil||(yillar[0]||today().slice(0,4));
  const xs=S.kasa.filter(k=>!k.transfer&&(k.tarih||"").startsWith(rp.yil));
  const aylar=AYLAR.map((a,i)=>{const p=rp.yil+"-"+pad(i+1);const m=xs.filter(k=>k.tarih.startsWith(p));const g=m.filter(k=>k.tur==="gelir").reduce((s,k)=>s+num(k.tutar),0),c=m.filter(k=>k.tur!=="gelir").reduce((s,k)=>s+num(k.tutar),0);return{a,g,c}});
  const kat={};xs.forEach(k=>{const key=(k.tur==="gelir"?"Gelir · ":"Gider · ")+(k.kategori||"—");kat[key]=(kat[key]||0)+num(k.tutar)});
  const katS=Object.entries(kat).sort((a,b)=>a[0].localeCompare(b[0],"tr")||b[1]-a[1]);
  const G=aylar.reduce((s,x)=>s+x.g,0),C=aylar.reduce((s,x)=>s+x.c,0);
  return title("Gelir - Gider Raporu",`<button class="btn out sm noprint" data-act="yazdir">Yazdır</button>`)+`<div class="row noprint" style="margin-bottom:14px"><label>Yıl<select data-rp="yil">${(yillar.length?yillar:[rp.yil]).map(y=>`<option ${y===rp.yil?"selected":""}>${y}</option>`).join("")}</select></label></div>
  <div class="stats"><div class="stat"><div class="l">Toplam gelir</div><div class="v pos">${TL(G)}</div></div><div class="stat"><div class="l">Toplam gider</div><div class="v neg">${TL(C)}</div></div><div class="stat"><div class="l">Fark</div><div class="v ${G-C<0?"neg":"blue"}">${TL(G-C)}</div></div></div>
  <div class="grid2"><div class="card"><h2>Aylara göre</h2><div class="tbox"><table class="dt" style="min-width:360px"><thead><tr><th>Ay</th><th class="r">Gelir</th><th class="r">Gider</th><th class="r">Fark</th></tr></thead><tbody>${aylar.map(x=>`<tr><td>${x.a}</td><td class="r num">${N(x.g)}</td><td class="r num">${N(x.c)}</td><td class="r num ${x.g-x.c<0?"neg":""}">${N(x.g-x.c)}</td></tr>`).join("")}</tbody><tfoot><tr><td>Toplam</td><td class="r num">${N(G)}</td><td class="r num">${N(C)}</td><td class="r num">${N(G-C)}</td></tr></tfoot></table></div></div>
  <div class="card"><h2>Kategorilere göre</h2>${katS.length?`<div class="tbox"><table class="dt" style="min-width:300px"><tbody>${katS.map(([k,v])=>`<tr><td>${esc(k)}</td><td class="r num ${k.startsWith("Gelir")?"pos":""}">${N(v)}</td></tr>`).join("")}</tbody></table></div>`:emptyBox("Bu yıl kayıt yok.")}</div></div>`;
}

/* ---------- Sakin şifreleri ---------- */
let yeniSifreler=[];
const hesapOf=id=>S.sakin_hesaplari.find(h=>h.daireId===id);
function pSifreler(){
  const n=S.daireler.filter(d=>hesapOf(d.id)).length,yok=S.daireler.length-n;
  return title("Sakin Şifreleri")+`<div class="stats"><div class="stat"><div class="l">Şifresi olan daire</div><div class="v pos">${n}</div></div><div class="stat"><div class="l">Şifresi olmayan</div><div class="v ${yok?"neg":""}">${yok}</div></div><div class="stat"><div class="l">Sakin giriş adresi</div><div class="v" style="font-size:16px">${esc(location.host)}</div></div></div>
  <div class="card"><h2>Şifre üret</h2><p class="muted small" style="margin:-4px 0 12px">Her daireye ayrı, 6 karakterlik bir şifre üretilir. Şifreler güvenlik için sunucuda açık hâlde saklanmaz; yalnızca üretildiği anda burada görünür. Hemen <b>yazdırın</b> ya da listeyi kopyalayın. Kaybolan şifre için daireyi seçip yeniden üretebilirsiniz.</p>
  <div class="row">${yok?`<button class="btn" data-act="sifreToplu">Şifresi olmayan ${yok} daireye şifre üret</button>`:`<span class="pill p-green">Tüm dairelerin şifresi var</span>`}</div></div>
  ${yeniSifreler.length?`<div class="card"><h2>Yeni üretilen şifreler <small>bu sayfadan çıkınca bir daha görünmez</small></h2><div class="row" style="margin-bottom:10px"><button class="btn green sm" data-act="sifreYazdir">Şifre kâğıtlarını yazdır</button><button class="btn out sm" data-act="sifreKopya">Listeyi kopyala</button></div><div class="tbox"><table class="dt" style="min-width:420px"><thead><tr><th>Daire</th><th>Malik</th><th>Blok</th><th>Daire no</th><th>Şifre</th></tr></thead><tbody>${yeniSifreler.map(x=>{const d=daire(x.daire_id)||{};return `<tr><td><b>${esc(daireKisa(x.daire_id))}</b></td><td>${esc(d.malik||"")}</td><td>${esc(d.blok||"")}</td><td>${esc(d.no||"")}</td><td class="num" style="font-family:ui-monospace,Menlo,monospace;font-size:16px;letter-spacing:.08em"><b>${esc(x.sifre)}</b></td></tr>`}).join("")}</tbody></table></div></div>`:""}
  <div class="card"><h2>Daireler</h2>${dt("sifre",[
    {k:"daire",l:"Daire",sv:r=>(r.blok||"")+String(r.no).padStart(4,"0"),f:r=>`<b>${esc(daireKisa(r.id))}</b>`},
    {k:"malik",l:"Malik"},{k:"tel",l:"Telefon"},
    {k:"hesap",l:"Hesap",sv:r=>hesapOf(r.id)?1:0,f:r=>{const h=hesapOf(r.id);return h?`<span class="pill p-green">Var</span> <span class="small muted">${trDate(h.sifreTarihi)}</span>`:`<span class="pill p-red">Şifre yok</span>`}},
    {k:"is",l:"",sv:()=>0,f:r=>pending==="sf-"+r.id?`<span class="row" style="justify-content:flex-end"><button class="btn red sm" data-act="sifreTekOk" data-id="${r.id}">${hesapOf(r.id)?"Sıfırla":"Üret"}</button><button class="btn out sm" data-act="vazgec">Vazgeç</button></span>`:`<button class="btn out sm" data-act="sifreTek" data-id="${r.id}">${hesapOf(r.id)?"Şifreyi sıfırla":"Şifre üret"}</button>`}
  ],S.daireler,{chips:[...new Set(S.daireler.map(d=>d.blok).filter(Boolean))].sort(),chipOf:r=>r.blok||"",chipSuffix:" Blok",per:50})}</div>`;
}
async function sifreUret(ids,sifirla){
  const out=[];
  for(let i=0;i<ids.length;i+=50){toast(`Şifreler üretiliyor… ${Math.min(i+50,ids.length)}/${ids.length}`);const d=await chk(sb.rpc("sakin_sifre_olustur",{p_daire_ids:ids.slice(i,i+50),p_sifirla:sifirla}));out.push(...(d||[]))}
  const ok=out.filter(x=>x.sifre);
  yeniSifreler=[...yeniSifreler.filter(x=>!ok.some(y=>y.daire_id===x.daire_id)),...ok].sort((a,b)=>sortDaire(daire(a.daire_id)||{},daire(b.daire_id)||{}));
  needReload("sakin_hesaplari");return ok.length;
}
function sifreYazdir(){
  const a=ayar();const host=location.host;
  $("#slips").innerHTML=yeniSifreler.map(x=>{const d=daire(x.daire_id)||{};return `<div class="slip"><div class="slip-h">${esc(a.ad||"Venüs Ada Sitesi")} · Sakin girişi</div><div class="slip-n">${esc(d.malik||"")}</div><table><tr><td>Adres</td><td><b>${esc(host)}</b></td></tr><tr><td>Blok</td><td><b>${esc(d.blok||"")}</b></td></tr><tr><td>Daire no</td><td><b>${esc(d.no||"")}</b></td></tr><tr><td>Şifre</td><td class="slip-s">${esc(x.sifre)}</td></tr></table><div class="slip-f">Borcunuzu görebilir, ödeme bildirebilir ve arıza talebi açabilirsiniz. Giriş yaptıktan sonra şifrenizi değiştirebilirsiniz.</div></div>`}).join("");
  document.body.classList.add("slips");window.print();setTimeout(()=>document.body.classList.remove("slips"),800);
}

/* ---------- Teknik ---------- */
const DURUM=["Açık","İşlemde","Çözüldü"];
function pPano(){
  return title("İş Takip Panosu")+`<div class="board">${DURUM.map(d=>{const xs=S.talepler.filter(t=>(t.durum||"Açık")===d).sort((a,b)=>String(b.tarih).localeCompare(a.tarih));
    return `<div class="col"><h3><span>${d}</span><span class="muted">${xs.length}</span></h3>${xs.map(t=>`<div class="tk" data-act="talepAc" data-id="${t.id}" role="button" tabindex="0"><b>${esc(t.konu)}</b>${ornekTag(t)}<div class="small muted">${esc(daireAd(t.daireId))} · ${trDate(t.tarih)}</div><div class="small" style="margin-top:4px"><span class="pill p-gray">${esc(t.tur||"Arıza")}</span></div></div>`).join("")||`<div class="small muted" style="padding:8px">Kayıt yok</div>`}</div>`}).join("")}</div>`;
}
/* ---------- Personel ---------- */
const pers=id=>S.personel.find(x=>x.id===id);
const persOdeme=id=>S.kasa.filter(k=>k.personelId===id);
function pPersonel(){
  const yil=today().slice(0,4);
  const rows=S.personel.map(x=>{const od=persOdeme(x.id);return{...x,aktifS:x.aktif===false?"Ayrıldı":"Aktif",yilOd:r2(od.filter(k=>(k.tarih||"").startsWith(yil)).reduce((s,k)=>s+num(k.tutar),0)),son:od.map(k=>k.tarih).sort().pop()||""}});
  return title("Personel",`<button class="btn sm" data-act="persYeni">+ Yeni personel</button>`)+`<div class="card">${dt("personel",[
    {k:"kod",l:"Personel Kodu"},
    {k:"gorev",l:"Görevi",f:r=>`<span class="pill p-blue">${esc(r.gorev||"—")}</span>`},
    {k:"ad",l:"Adı Soyadı",f:r=>`<b style="font-weight:500">${esc(r.ad)}</b>${ornekTag(r)}`},
    {k:"firma",l:"Firma"},
    {k:"tel",l:"Telefon"},
    {k:"eposta",l:"E-Posta"},
    {k:"giris",l:"Giriş Tarihi",f:r=>trDate(r.giris)},
    {k:"maas",l:"Aylık Ücret",r:1,sv:r=>num(r.maas),f:r=>num(r.maas)?TL(r.maas):`<span class="muted">—</span>`},
    {k:"yilOd",l:yil+" Ödenen",r:1,f:r=>TL(r.yilOd)},
    {k:"son",l:"Son Ödeme",f:r=>r.son?trDate(r.son):`<span class="muted">—</span>`}
  ],rows,{chips:["Aktif","Ayrıldı"],chipOf:r=>r.aktifS,letterOf:r=>r.ad,click:r=>`data-act="persAc" data-id="${r.id}"`,firstShade:1,minw:1000,sort:"kod",
    totals:x=>({maas:TL(x.reduce((s,r)=>s+num(r.maas),0)),yilOd:TL(x.reduce((s,r)=>s+r.yilOd,0))}),
    acts:`<button class="btn out sm" data-go="personelEks">Personel Ekstresi</button><button class="btn out sm" data-act="yazdir">Yazdır</button>`})}</div>`;
}
function persForm(x){
  return `<form class="form" data-form="personel" data-id="${x.id||""}">
    <label>Personel kodu<input name="kod" value="${esc(x.kod||"")}" placeholder="P0055"></label>
    <label>Adı soyadı<input name="ad" required value="${esc(x.ad||"")}"></label>
    <label>Görevi<input name="gorev" list="gorevler" value="${esc(x.gorev||"")}"></label>
    <datalist id="gorevler">${["Yönetici","Kapıcı","Bahçıvan","Kapıcı-Bahçıvan","Güvenlik","Temizlik","Teknik personel","Muhasebeci","Avukat"].map(g=>`<option value="${g}">`).join("")}</datalist>
    <label>Firma<input name="firma" value="${esc(x.firma||"")}"></label>
    <label>TC kimlik no<input name="tc" inputmode="numeric" maxlength="11" value="${esc(x.tc||"")}"></label>
    <label>Telefon<input name="tel" inputmode="tel" value="${esc(x.tel||"")}"></label>
    <label>E-posta<input name="eposta" type="email" value="${esc(x.eposta||"")}"></label>
    <label>Doğum tarihi<input name="dogum" type="date" value="${esc(x.dogum||"")}"></label>
    <label>Giriş tarihi<input name="giris" type="date" value="${esc(x.giris||"")}"></label>
    <label>Çıkış tarihi<input name="cikis" type="date" value="${esc(x.cikis||"")}"></label>
    <label>Aylık ücret (TL)<input name="maas" inputmode="decimal" value="${num(x.maas)?String(num(x.maas)).replace(".",","):""}"></label>
    <label>IBAN<input name="iban" value="${esc(x.iban||"")}"></label>
    <label class="full">Açıklama<input name="aciklama" value="${esc(x.aciklama||"")}"></label>
    <label class="full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="aktif" style="width:auto" ${x.aktif===false?"":"checked"}> Aktif (çalışıyor)</label>
    <div class="full"><button class="btn">${x.id?"Kaydet":"Personeli ekle"}</button></div></form>`;
}
function persDetay(id){
  const x=pers(id);const od=persOdeme(id).sort((a,b)=>String(b.tarih).localeCompare(a.tarih));
  return `<div class="dhead" style="margin-bottom:12px"><div><div style="font-size:17px;font-weight:600">${esc(x.ad)}</div><div class="small muted">${[x.kod,x.gorev,x.firma,x.tel].filter(Boolean).map(esc).join(" · ")}</div></div><div style="text-align:right"><div class="small muted">Toplam ödenen</div><div style="font-size:20px;font-weight:600">${TL(od.reduce((s,k)=>s+num(k.tutar),0))}</div></div></div>
  <h3>Ödeme yap</h3><form class="form" data-form="persOdeme" data-id="${id}" style="margin-bottom:16px">
    <label>Tür<select name="kategori"><option>Personel maaşı</option><option>Avans</option><option>Prim / ikramiye</option><option>SGK</option><option>Vekalet ücreti</option><option>Diğer</option></select></label>
    <label>Kasa<select name="hesap">${kasaOpts(defKasa())}</select></label>
    <label>Tutar (TL)<input name="tutar" inputmode="decimal" required value="${num(x.maas)?String(num(x.maas)).replace(".",","):""}"></label>
    <label>Tarih<input type="date" name="tarih" value="${today()}"></label>
    <label class="full">Açıklama<input name="aciklama" placeholder="${AYLAR[new Date().getMonth()]} maaşı"></label>
    <div class="full"><button class="btn green">Ödemeyi kaydet</button> <span class="small muted">Seçilen kasadan gider olarak düşülür.</span></div></form>
  ${od.length?`<h3>Ödemeler</h3><div class="tbox" style="margin-bottom:16px"><table class="dt" style="min-width:0"><thead><tr><th>Tarih</th><th>Tür</th><th>Kasa</th><th>Açıklama</th><th class="r">Tutar</th></tr></thead><tbody>${od.map(k=>`<tr><td class="num">${trDate(k.tarih)}</td><td>${esc(k.kategori)}</td><td>${esc(kasaOf(k))}</td><td>${esc(k.aciklama||"")}</td><td class="r num">${TL(k.tutar)}</td></tr>`).join("")}</tbody></table></div>`:`<p class="small muted">Henüz ödeme yok.</p>`}
  <details><summary style="cursor:pointer;font-weight:600;margin-bottom:10px">Bilgileri düzenle</summary>${persForm(x)}
  <div style="margin-top:12px">${pending==="pers-"+id?`<span class="row"><span>Personel kaydı silinsin mi? (ödemeleri kasada kalır)</span><button class="btn red sm" data-act="persSilOk" data-id="${id}">Evet, sil</button><button class="btn out sm" data-act="persSilVaz" data-id="${id}">Vazgeç</button></span>`:`<button class="btn red sm" data-act="persSil" data-id="${id}">Personeli sil</button>`}</div></details>`;
}
let rpPers="";
function pPersonelEks(){
  const id=rpPers&&pers(rpPers)?rpPers:"";
  const xs=S.kasa.filter(k=>k.personelId&&(!id||k.personelId===id)).sort((a,b)=>String(a.tarih).localeCompare(b.tarih));
  return title("Personel Ekstresi",`<button class="btn out sm noprint" data-act="yazdir">Yazdır</button>`)+`<div class="card"><div class="row noprint" style="margin-bottom:14px"><label style="min-width:260px">Personel<select data-act="rpPers"><option value="">Tüm personel</option>${S.personel.slice().sort((a,b)=>String(a.ad).localeCompare(b.ad,"tr")).map(x=>`<option value="${x.id}" ${x.id===id?"selected":""}>${esc(x.ad)} — ${esc(x.gorev||"")}</option>`).join("")}</select></label></div>
  ${xs.length?`<div class="tbox"><table class="dt"><thead><tr><th>Tarih</th><th>Personel</th><th>Tür</th><th>Kasa</th><th>Açıklama</th><th class="r">Tutar</th></tr></thead><tbody>${xs.map(k=>`<tr><td class="num">${trDate(k.tarih)}</td><td>${esc(pers(k.personelId)?.ad||"Silinmiş personel")}</td><td>${esc(k.kategori)}</td><td>${esc(kasaOf(k))}</td><td>${esc(k.aciklama||"")}</td><td class="r num">${TL(k.tutar)}</td></tr>`).join("")}</tbody><tfoot><tr><td></td><td colspan="4">Toplam</td><td class="r num">${TL(xs.reduce((s,k)=>s+num(k.tutar),0))}</td></tr></tfoot></table></div>`:emptyBox("Bu seçim için personel ödemesi yok.")}</div>`;
}

function pIsler(){
  const xs=S.isler.slice().sort((a,b)=>(a.bitti?1:0)-(b.bitti?1:0)||String(a.tarih||"9").localeCompare(b.tarih||"9"));
  return title("Yapılacak İşler")+`<div class="card"><h2>Yeni iş</h2><form class="form" data-form="is"><label class="full">İş<input name="baslik" required placeholder="Asansör yıllık bakım sözleşmesini yenile"></label><label>Son tarih<input type="date" name="tarih"></label><label>Not<input name="not"></label><div><button class="btn">Ekle</button></div></form></div>
  <div class="card"><h2>İşler <small>${xs.filter(i=>!i.bitti).length} açık</small></h2>${xs.length?`<div class="list">${xs.map(i=>`<div class="between">${isSatir(i)}<span>${silBtn("is",i.id,"İşi sil")}</span></div>`).join("")}</div>`:emptyBox("Yeni yapılacak iş yok.")}</div>`;
}

/* ---------- Tanımlar ---------- */
function pSiteBilgi(){
  const a=ayar();
  return title("Site ve Banka Bilgileri")+`<div class="card"><form class="form" data-form="ayar">
    <label>Site adı<input name="ad" value="${esc(a.ad||"Venüs Ada Sitesi")}" required></label><label>İlçe - İl<input name="yer" value="${esc(a.yer||"İnegöl - Bursa")}"></label>
    <label>Banka<input name="banka" value="${esc(a.banka||"")}"></label><label>Alıcı adı<input name="alici" value="${esc(a.alici||"")}"></label>
    <label class="full">IBAN<input name="iban" value="${esc(a.iban||"")}" placeholder="TR00 0000 0000 0000 0000 0000 00"></label>
    <div class="full"><button class="btn">Kaydet</button></div></form></div>
    <div class="card"><h2>Sakin girişi</h2><p style="margin:0">Kat malikleri <b>${esc(location.host)}</b> adresinden, <b>Site → Sakin Şifreleri</b> bölümünde ürettiğiniz şifreyle giriş yapar. Her malik yalnızca kendi dairesinin borcunu, duyuruları ve kendi taleplerini görür.</p></div>
  ${(()=>{const n=COLS.reduce((s,c)=>s+S[c].filter(x=>x.ornek).length,0);return n?`<div class="card"><h2>Örnek veriler</h2><p class="muted" style="margin:0 0 10px">"ÖRNEK" işaretli ${n} kayıt var.</p>${pending==="ornek"?`<div class="row"><button class="btn red sm" data-act="ornekSilOk">Evet, hepsini sil</button><button class="btn out sm" data-act="vazgec">Vazgeç</button></div>`:`<button class="btn red sm" data-act="ornekSil">Örnek verileri sil</button>`}</div>`:""})()}`;
}
function pKasaTanim(){
  const ks=kasaOzet();const dev=ayar().devir||{};
  return title("Kasa Tanımları")+`<div class="card"><h2>Kasalar ve açılış bakiyeleri</h2><p class="muted small" style="margin:-4px 0 12px">Programa geçmeden önce kasada/bankada olan parayı "Devir" olarak girin. İlk sıradaki kasa varsayılan olarak seçilir.</p>
  <form class="form" data-form="kasaTanim" style="grid-template-columns:1fr">${kasalar().map((k,i)=>`<div class="row"><input name="ad${i}" value="${esc(k)}" aria-label="Kasa adı" style="flex:2;min-width:160px"><input name="dev${i}" inputmode="decimal" value="${num(dev[k])?String(num(dev[k])).replace(".",","):""}" placeholder="Devir (TL)" aria-label="Devir" style="flex:1;min-width:120px"><span class="small muted" style="min-width:150px;text-align:right">Kalan: ${TL((ks.find(r=>r.k===k)||{}).kal)}</span></div>`).join("")}
  <div class="row"><input name="adYeni" placeholder="Yeni kasa adı (örn. POS)" style="flex:2;min-width:160px"><input name="devYeni" inputmode="decimal" placeholder="Devir (TL)" style="flex:1;min-width:120px"><span style="min-width:150px"></span></div>
  <div><button class="btn">Kaydet</button></div></form><p class="small muted" style="margin:10px 0 0">Bir kasanın adını silerseniz eski hareketleri yine raporlarda görünür.</p></div>`;
}
function pGecikmeAyar(){
  const a=ayar();
  return title("Gecikme Ayarı")+`<div class="card"><form class="form" data-form="gecAyar"><label>Aylık gecikme oranı (%)<input name="oran" inputmode="decimal" value="${a.gecikmeOran?String(a.gecikmeOran).replace(".",","):""}" placeholder="5"></label><div><button class="btn">Kaydet</button></div></form>
  <p class="small muted" style="margin:12px 0 0">Kat Mülkiyeti Kanunu'na göre ödemede geciken kat maliki, geciktiği günler için aylık %5 gecikme tazminatı öder; oranı yönetim planınıza göre girin. Uygulamak için <a href="#" data-go="gecikme">Finans → Gecikme Zammı</a> sayfasını kullanın.</p></div>`;
}

/* ---------- İletişim ---------- */
function pDuyurular(){
  const xs=S.duyurular.slice().sort((a,b)=>String(b.tarih).localeCompare(a.tarih));
  return title("Duyurular")+`${yonetici?`<div class="card"><h2>Duyuru yayınla</h2><form class="form" data-form="duyuru" style="grid-template-columns:1fr"><label>Başlık<input name="baslik" required></label><label>Metin<textarea name="metin" required></textarea></label><div><button class="btn">Yayınla</button></div></form></div>`:""}
  <div class="card">${xs.length?`<div class="list">${xs.map(d=>`<div class="li"><div class="grow"><div class="between"><b>${esc(d.baslik)}${ornekTag(d)}</b><span class="small muted">${trDate(d.tarih)}</span></div><p>${esc(d.metin)}</p></div>${yonetici?silBtn("d",d.id,"Duyuruyu kaldır","Kaldır"):""}</div>`).join("")}</div>`:emptyBox("Henüz duyuru yok.")}</div>`;
}

/* ---------- Sakin ekranı ---------- */
function pDairem(){
  const a=ayar();
  if(!S.daireler.length)return title("Dairem")+emptyBox("Yönetim henüz daire kaydı girmedi.");
  const id=myDaire&&daire(myDaire)?myDaire:null;
  const sec=`<label style="max-width:360px">Daireniz<select data-act="myDaire">${daireOpts(id,"Dairenizi seçin…")}</select></label>`;
  const pre=yonetici?`<div class="note" style="margin-bottom:14px">Bu ekran sakinlerin gördüğü görünümdür. Önizleme için bir daire seçin.</div>`:"";
  if(!id)return title("Dairem")+pre+`<div class="card"><h2>Hoş geldiniz</h2><p class="muted">Borcunuzu görmek ve ödeme bildirmek için dairenizi seçin.</p>${sec}</div>`;
  const b=r2(S.tahakkuk.filter(x=>x.daireId===id&&!x.eski).reduce((s,x)=>s+num(x.tutar)-num(x.odenen),0));
  const acik=S.tahakkuk.filter(x=>x.daireId===id&&!x.eski&&(num(x.tutar)-num(x.odenen)>0.009||num(x.tutar)<0)).sort((x,y)=>String(x.donem).localeCompare(y.donem));
  const bild=S.bildirimler.filter(x=>x.daireId===id).sort((x,y)=>String(y.tarih).localeCompare(x.tarih)).slice(0,5);
  const tal=S.talepler.filter(x=>x.daireId===id).sort((x,y)=>String(y.tarih).localeCompare(x.tarih));
  const durum=x=>`<span class="pill ${x.durum==="onaylandi"?"p-green":x.durum==="reddedildi"?"p-red":"p-amber"}">${x.durum==="onaylandi"?"Onaylandı":x.durum==="reddedildi"?"Reddedildi":"Onay bekliyor"}</span>`;
  return title("Dairem")+pre+`<div class="card">${sec}</div>
  <div class="grid2"><div class="card"><div class="muted small">${esc(daireAd(id))} · güncel borç</div><div class="big ${b>0.009?"neg":"pos"}" style="margin:4px 0 10px">${TL(Math.max(b,0))}</div>
    ${b<-0.009?`<p class="small pos">${TL(-b)} alacağınız var.</p>`:""}
    ${acik.length?`<div class="tbox"><table class="dt" style="min-width:0"><tbody>${acik.map(x=>`<tr><td>${donemAd(x.donem)}<div class="small muted">${esc(x.aciklama||"Aidat")}</div></td><td class="r num">${TL(num(x.tutar)-num(x.odenen))}</td></tr>`).join("")}</tbody></table></div>`:`<span class="pill p-green">Borcunuz yok</span>`}</div>
  <div class="card"><h2>Ödeme bilgileri</h2>${a.iban?`<div class="small muted">${esc(a.banka||"")}${a.alici?" · Alıcı: "+esc(a.alici):""}</div><div class="iban" id="ibanTxt" style="margin:8px 0">${esc(a.iban)}</div><button class="btn out sm" data-act="ibanKopya">IBAN'ı kopyala</button><p class="note" style="margin:10px 0 0">Açıklamaya <b>${esc(daireAd(id))}</b> yazmayı unutmayın.</p>`:emptyBox("Yönetim henüz IBAN bilgisi girmedi.")}</div></div>
  <div class="card"><h2>Ödeme yaptım, bildir</h2><form class="form" data-form="bildir" data-id="${id}"><label>Tutar (TL)<input name="tutar" inputmode="decimal" required value="${b>0?String(b).replace(".",","):""}"></label><label>Ödeme tarihi<input type="date" name="tarih" value="${today()}"></label><label>Gönderen adı<input name="gonderen"></label><label>Not<input name="aciklama"></label><div><button class="btn">Bildir</button></div></form>
  ${bild.length?`<div class="list" style="margin-top:12px">${bild.map(x=>`<div class="li"><span class="grow">${trDate(x.tarih)} · <span class="num">${TL(x.tutar)}</span></span>${durum(x)}</div>`).join("")}</div>`:""}</div>
  <div class="card"><h2>Arıza / talep bildir</h2><form class="form" data-form="talep" data-id="${id}"><label>Tür<select name="tur"><option>Arıza</option><option>Temizlik</option><option>Güvenlik</option><option>Öneri</option><option>Şikayet</option></select></label><label style="grid-column:span 2">Konu<input name="konu" required placeholder="Asansör çalışmıyor"></label><label class="full">Açıklama<textarea name="metin"></textarea></label><div><button class="btn">Gönder</button></div></form>
  ${tal.length?`<div class="list" style="margin-top:12px">${tal.map(t=>`<div class="li"><div class="grow"><b>${esc(t.konu)}</b><div class="small muted">${trDate(t.tarih)} · ${esc(t.tur||"")}</div>${t.cevap?`<p class="note" style="margin-top:6px"><b>Yönetim:</b> ${esc(t.cevap)}</p>`:""}</div>${durumPill(t.durum)}</div>`).join("")}</div>`:""}</div>`;
}

/* ---------- Modal ---------- */
function modal(t,html){$("#modalRoot").innerHTML=`<div class="modal-bg" data-act="modalBg"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(t)}"><header><h2>${esc(t)}</h2><button class="x" data-act="kapat" aria-label="Kapat">×</button></header><div class="mb">${html}</div></div></div>`;const f=$("#modalRoot input,#modalRoot select");if(f)f.focus()}
const kapat=()=>{$("#modalRoot").innerHTML=""};

/* ---------- Render ---------- */
const PAGES={sifreler:pSifreler,personel:pPersonel,personelEks:pPersonelEks,ozet:pOzet,kisiler:pKisiler,daireler:pDaireler,bildirimler:pBildirimler,finansal:pFinansal,tahsilat:pTahsilat,borc:pBorc,toplu:pToplu,gecikme:pGecikme,fis:pFis,transfer:pTransfer,kasaEks:pKasaEks,hesapEks:pHesapEks,vadesi:pVadesi,gelirGider:pGelirGider,pano:pPano,isler:pIsler,siteBilgi:pSiteBilgi,kasaTanim:pKasaTanim,gecikmeAyar:pGecikmeAyar,duyurular:pDuyurular,dairem:pDairem};
const ADMIN_ONLY=new Set(Object.keys(PAGES).filter(k=>k!=="dairem"&&k!=="duyurular"));
let rq=0;
function render(){
  if(!loaded)return;
  if(!yonetici&&ADMIN_ONLY.has(page))page="dairem";
  const a=ayar();$("#siteAd").textContent=a.ad||"Venüs Ada Sitesi";$("#siteYer").textContent=a.yer||"İnegöl - Bursa";
  const bk=yonetici?bekleyen().length:0;$("#bell").hidden=!bk;$("#bellN").textContent=bk;
  renderSide();
  const ae=document.activeElement,aid=ae&&ae.dataset&&ae.dataset.dtq,pos=aid?ae.selectionStart:0;
  const y=window.scrollY;
  $("#app").innerHTML=PAGES[page]();
  window.scrollTo(0,y);
  if(aid){const el=document.querySelector(`[data-dtq="${aid}"]`);if(el){el.focus();try{el.setSelectionRange(pos,pos)}catch(e){}}}
}
const schedule=()=>{cancelAnimationFrame(rq);rq=requestAnimationFrame(()=>{if(!document.querySelector("#modalRoot .modal")||!formDirty())render()})};
const formDirty=()=>[...document.querySelectorAll("#modalRoot input,#modalRoot textarea")].some(i=>i.value!==i.defaultValue);
function go(p,a){page=p;arg=a||null;pending=null;try{location.hash=p}catch(e){}document.body.classList.remove("menu");$("#scrim").hidden=true;render();window.scrollTo(0,0)}
function fromHash(){const h=(location.hash||"").slice(1);if(PAGES[h])page=h}

/* ---------- Arama ---------- */
$("#q").addEventListener("input",e=>{
  const q=e.target.value.trim().toLocaleLowerCase("tr");const box=$("#sres");
  if(!q||!yonetici){box.hidden=true;return}
  const xs=S.daireler.filter(d=>[daireKisa(d.id),daireAd(d.id),d.malik,d.kiraci,d.tel,d.kiraciTel].some(v=>String(v||"").toLocaleLowerCase("tr").includes(q))).sort(sortDaire).slice(0,12);
  box.innerHTML=xs.length?xs.map(d=>{const b=borc(d.id);return `<button data-daire="${d.id}"><span><b>${esc(daireKisa(d.id))}</b> ${esc(d.malik||"")}${d.kiraci?` · ${esc(d.kiraci)}`:""}</span><span class="num ${balCls(b)}">${TL(b)}</span></button>`}).join(""):`<div style="padding:10px 12px" class="muted">Sonuç yok</div>`;
  box.hidden=false;
});
$("#q").addEventListener("blur",()=>setTimeout(()=>$("#sres").hidden=true,200));

/* ---------- Olaylar ---------- */
$("#hamb").addEventListener("click",()=>{const o=!document.body.classList.contains("menu");document.body.classList.toggle("menu",o);$("#scrim").hidden=!o});
$("#scrim").addEventListener("click",()=>{document.body.classList.remove("menu");$("#scrim").hidden=true});
$("#homefab").addEventListener("click",()=>go(yonetici?"ozet":"dairem"));
$("#bell").addEventListener("click",()=>go("bildirimler"));
window.addEventListener("hashchange",()=>{const h=location.hash.slice(1);if(PAGES[h]&&h!==page){page=h;arg=null;render()}});
document.addEventListener("keydown",e=>{if(e.key==="Escape")kapat();if(e.key==="Enter"&&e.target.classList&&e.target.classList.contains("tk"))e.target.click()});

document.addEventListener("click",async e=>{
  const t=e.target.closest("[data-go],[data-grp],[data-dt],[data-act],[data-daire]");if(!t)return;
  if(t.tagName==="SELECT"||(t.tagName==="INPUT"&&t.type!=="checkbox"))return;
  if(t.dataset.go){e.preventDefault();kapat();go(t.dataset.go);return}
  if(t.dataset.grp){open[t.dataset.grp]=!open[t.dataset.grp];renderSide();return}
  if(t.dataset.dt&&!t.dataset.act){const st=TS[t.dataset.dt];if(!st)return;
    if(t.dataset.sort!==undefined){if(st.sort===t.dataset.sort)st.dir*=-1;else{st.sort=t.dataset.sort;st.dir=1}}
    else if(t.dataset.letter!==undefined){st.letter=t.dataset.letter;st.page=0}
    else if(t.dataset.chip!==undefined){st.chip=t.dataset.chip;st.page=0}
    else if(t.dataset.pg!==undefined){st.page=Math.max(0,+t.dataset.pg)}
    render();return}
  if(t.dataset.daire&&!t.dataset.act){if(e.target.closest("button")&&e.target.closest("button")!==t&&e.target.closest("td"))return;$("#sres").hidden=true;$("#q").value="";go("daireler",t.dataset.daire);return}
  const a=t.dataset.act,id=t.dataset.id;
  try{
    if(a==="kapat"||(a==="modalBg"&&e.target===t)){kapat();return}
    if(a==="yazdir"){window.print();return}
    if(a==="vazgec"){pending=null;render()}
    else if(a==="sil"){pending=t.dataset.p+"-"+id;render()}
    else if(a==="silOk"){t.disabled=true;const p=t.dataset.p;
      if(p==="k"){const k=S.kasa.find(x=>x.id===id);await chk(sb.rpc("tahsilat_iptal",{p_kasa:id}));needReload("kasa","tahakkuk");toast(k&&k.daireId?"Tahsilat iptal edildi, borç geri eklendi":"Fiş silindi")}
      else if(p==="t"){await db.doc("tahakkuk/"+id).delete();toast("Borç silindi")}
      else if(p==="tr"){const k=S.kasa.find(x=>x.id===id);if(k?.grup){for(const x of S.kasa.filter(x=>x.grup===k.grup))await db.doc("kasa/"+x.id).delete()}else await db.doc("kasa/"+id).delete();toast("Transfer silindi")}
      else if(p==="d"){await db.doc("duyurular/"+id).delete();toast("Duyuru kaldırıldı")}
      else if(p==="is"){await db.doc("isler/"+id).delete();toast("İş silindi")}
      pending=null}
    else if(a==="daireSil"){pending="del-"+id;render()}
    else if(a==="daireSilOk"){t.disabled=true;for(const x of S.tahakkuk.filter(x=>x.daireId===id))await db.doc("tahakkuk/"+x.id).delete();if(S.kimlik.some(x=>x.id===id))await db.doc("kimlik/"+id).delete();await db.doc("daireler/"+id).delete();pending=null;go("daireler");toast("Daire silindi")}
    else if(a==="onayla"){t.disabled=true;const ks=($("#onayKasa")||{}).value||defKasa();await chk(sb.rpc("bildirim_onayla",{p_id:id,p_hesap:ks}));needReload("bildirimler","tahakkuk","kasa");toast("Ödeme onaylandı ve borçtan düşüldü")}
    else if(a==="reddet"){await db.doc("bildirimler/"+id).update({durum:"reddedildi"});toast("Bildirim reddedildi")}
    else if(a==="daireYeni")modal("Yeni daire",daireForm({}));
    else if(a==="daireDuzenle")modal(daireAd(id)+" · bilgiler",daireForm(daire(id)));
    else if(a==="topluDaire")modal("Toplu daire oluştur",`<p class="muted small" style="margin-top:0">Her blok için ayrı çalıştırın. Var olan numaralar atlanır.</p><form class="form" data-form="topluDaire"><label>Blok<input name="blok" placeholder="B"></label><label>İlk no<input name="ilk" inputmode="numeric" required value="1"></label><label>Son no<input name="son" inputmode="numeric" required value="16"></label><label>Aylık aidat (TL)<input name="aidat" inputmode="decimal" required></label><div class="full"><button class="btn">Daireleri oluştur</button></div></form>`);
    else if(a==="tahsilatModal")modal("Tahsilat makbuzu",tahsilatFormHtml(id,true));
    else if(a==="borcModal")modal("Borç makbuzu",borcFormHtml(id,true));
    else if(a==="isEkle")modal("Yapılacak iş",`<form class="form" data-form="is"><label class="full">İş<input name="baslik" required></label><label>Son tarih<input type="date" name="tarih"></label><label>Not<input name="not"></label><div class="full"><button class="btn">Ekle</button></div></form>`);
    else if(a==="sifreToplu"){t.disabled=true;const ids=S.daireler.filter(d=>!hesapOf(d.id)).sort(sortDaire).map(d=>d.id);const n=await sifreUret(ids,false);toast(n+" daireye şifre üretildi. Şimdi yazdırın.");render()}
    else if(a==="sifreTek"){pending="sf-"+id;render()}
    else if(a==="sifreTekOk"){t.disabled=true;pending=null;const n=await sifreUret([id],true);toast(n?"Yeni şifre üretildi":"Şifre üretilemedi");render()}
    else if(a==="sifreYazdir")sifreYazdir();
    else if(a==="sifreKopya"){const txt=yeniSifreler.map(x=>{const d=daire(x.daire_id)||{};return daireKisa(x.daire_id)+"\t"+(d.malik||"")+"\t"+x.sifre}).join("\n");try{await navigator.clipboard.writeText(txt);toast("Liste kopyalandı")}catch(err){toast("Kopyalanamadı")}}
    else if(a==="persYeni")modal("Yeni personel",persForm({}));
    else if(a==="persAc")modal("Personel",persDetay(id));
    else if(a==="persSil"){pending="pers-"+id;modal("Personel",persDetay(id))}
    else if(a==="persSilVaz"){pending=null;modal("Personel",persDetay(id))}
    else if(a==="persSilOk"){await db.doc("personel/"+id).delete();pending=null;kapat();toast("Personel silindi")}
    else if(a==="isBitir"){await db.doc("isler/"+id).update({bitti:t.checked})}
    else if(a==="talepAc"){const x=S.talepler.find(v=>v.id===id);modal(x.konu,`<div class="small muted" style="margin-bottom:8px">${esc(daireAd(x.daireId))} · ${trDate(x.tarih)} · ${esc(x.tur||"")}</div>${x.metin?`<p style="white-space:pre-wrap;margin-top:0">${esc(x.metin)}</p>`:""}<form class="form" data-form="talepGuncel" data-id="${id}"><label>Durum<select name="durum">${DURUM.map(d=>`<option ${d===(x.durum||"Açık")?"selected":""}>${d}</option>`).join("")}</select></label><label class="full">Sakine cevap<textarea name="cevap">${esc(x.cevap||"")}</textarea></label><div class="full"><button class="btn">Güncelle</button></div></form>`)}
    else if(a==="gecSor"){pending="gec";render()}
    else if(a==="gecUygula"){t.disabled=true;const n=await chk(sb.rpc("gecikme_uygula",{p_donem:gecDonem}));pending=null;needReload("tahakkuk");toast((n||0)+" daireye gecikme tazminatı yazıldı")}
    else if(a==="ornekSil"){pending="ornek";render()}
    else if(a==="ornekSilOk"){t.disabled=true;for(const c of COLS)for(const x of S[c].filter(x=>x.ornek))await db.doc(c+"/"+x.id).delete();pending=null;toast("Örnek veriler silindi")}
    else if(a==="ibanKopya"){const v=ayar().iban||"";try{await navigator.clipboard.writeText(v.replace(/\s/g,""));toast("IBAN kopyalandı")}catch(err){const r=document.createRange();r.selectNodeContents($("#ibanTxt"));const s=getSelection();s.removeAllRanges();s.addRange(r);toast("IBAN seçildi, kopyalayabilirsiniz")}}
  }catch(err){toast("İşlem kaydedilemedi: "+(err?.message||"yetkiniz olmayabilir"))}
});
document.addEventListener("input",e=>{const q=e.target.dataset&&e.target.dataset.dtq;if(q){TS[q].q=e.target.value;TS[q].page=0;render()}});
document.addEventListener("change",e=>{
  const el=e.target,a=el.dataset.act;
  if(a==="myDaire"){myDaire=el.value||null;try{myDaire?localStorage.setItem("myDaire",myDaire):localStorage.removeItem("myDaire")}catch(err){}render()}
  if(a==="rpPers"){rpPers=el.value;render()}
  if(a==="gecDonem"){gecDonem=el.value||thisMonth();pending=null;render()}
  if(a==="tahDaire"){const b=el.value?borc(el.value):0;const f=el.form;if(el.value&&b>0)f.tutar.value=String(b).replace(".",",");const s=f.querySelector("#tahBorc");if(s)s.innerHTML=el.value?`Güncel bakiye: <b class="${balCls(b)}">${TL(b)}</b>`:""}
  if(el.dataset.rp){rp[el.dataset.rp]=el.value;render()}
});
document.addEventListener("submit",async e=>{
  const f=e.target.closest("form[data-form]");if(!f)return;e.preventDefault();
  const v=Object.fromEntries(new FormData(f).entries()),id=f.dataset.id,k=f.dataset.form;
  const btn=f.querySelector("button");if(btn)btn.disabled=true;
  try{
    if(k==="daire"){const mtc=(v.malikTc||"").trim(),ktc=(v.kiraciTc||"").trim();
      if(!tcOk(mtc))throw new Error("Malikin TC kimlik numarası geçersiz");
      if(!tcOk(ktc))throw new Error("Kiracının TC kimlik numarası geçersiz");
      const d={blok:trUp(v.blok.trim()),no:v.no.trim(),malik:v.malik.trim(),kiraci:v.kiraci.trim(),tel:v.tel.trim(),kiraciTel:v.kiraciTel.trim(),aidat:num(v.aidat)};
      let did=id;
      if(id)await db.doc("daireler/"+id).update(d);
      else{did=(d.blok?d.blok+"-":"")+d.no;if(daire(did))throw new Error("Bu daire zaten var");await db.doc("daireler/"+did).set(d)}
      const old=S.kimlik.find(x=>x.id===did)||{};
      if(mtc!==(old.malikTc||"")||ktc!==(old.kiraciTc||""))await db.doc("kimlik/"+did).set({malikTc:mtc,kiraciTc:ktc});
      kapat();toast(id?"Daire güncellendi":"Daire eklendi")}
    else if(k==="topluDaire"){const ilk=parseInt(v.ilk),son=parseInt(v.son),blok=trUp(v.blok.trim());if(!(ilk>0&&son>=ilk&&son-ilk<500))throw new Error("Numara aralığını kontrol edin");let n=0;for(let i=ilk;i<=son;i++){const did=(blok?blok+"-":"")+i;if(daire(did)||S.daireler.some(d=>String(d.no)===String(i)&&(d.blok||"")===blok))continue;await db.doc("daireler/"+did).set({blok,no:String(i),malik:"",kiraci:"",tel:"",kiraciTel:"",aidat:num(v.aidat)});n++;if(n%10===0)toast(n+" daire oluşturuldu…")}kapat();toast(n+" daire oluşturuldu")}
    else if(k==="tahsilat"){if(!v.daireId)throw new Error("Daire seçin");if(num(v.tutar)<=0)throw new Error("Tutar girin");await tahsilat(v.daireId,v.tutar,v.tarih,v.aciklama.trim(),v.kasa);kapat();f.reset&&f.reset();toast("Tahsilat işlendi: "+TL(num(v.tutar)))}
    else if(k==="toplu"){const ac=v.aciklama.trim()||"Aidat";const rows=[];for(const d of S.daireler){if(v.blok&&d.blok!==v.blok)continue;if(num(d.aidat)<=0)continue;if(S.tahakkuk.some(x=>x.daireId===d.id&&x.donem===v.donem&&(x.aciklama||"Aidat")===ac))continue;rows.push({daire_id:d.id,donem:v.donem,tutar:num(d.aidat),odenen:0,aciklama:ac,tarih:today()})}if(rows.length)await chk(sb.from("tahakkuk").insert(rows));needReload("tahakkuk");toast(rows.length?`${rows.length} daireye ${donemAd(v.donem)} borcu yazıldı`:"Bu dönem için yazılacak yeni borç yok")}
    else if(k==="ekborc"){if(!v.daireId)throw new Error("Daire seçin");if(num(v.tutar)<=0)throw new Error("Tutar girin");await db.collection("tahakkuk").add({daireId:v.daireId,donem:v.donem,tutar:num(v.tutar),odenen:0,aciklama:v.aciklama.trim(),tarih:today()});kapat();f.reset&&f.reset();toast("Borç eklendi")}
    else if(k==="kasa"){if(num(v.tutar)<=0)throw new Error("Tutar girin");await db.collection("kasa").add({tur:v.tur,hesap:v.hesap,kategori:v.kategori.trim(),tutar:num(v.tutar),tarih:v.tarih||today(),aciklama:v.aciklama.trim()});f.reset();toast("Fiş kaydedildi")}
    else if(k==="transfer"){if(v.from===v.to)throw new Error("Farklı iki kasa seçin");if(num(v.tutar)<=0)throw new Error("Tutar girin");const grup="tr"+Date.now();const base={tutar:num(v.tutar),tarih:v.tarih||today(),aciklama:v.aciklama.trim(),kategori:"Kasa transferi",transfer:true,grup};
      await db.collection("kasa").add({...base,tur:"gider",hesap:v.from,karsi:v.to});await db.collection("kasa").add({...base,tur:"gelir",hesap:v.to,karsi:v.from});f.reset();toast("Transfer kaydedildi")}
    else if(k==="duyuru"){await db.collection("duyurular").add({baslik:v.baslik.trim(),metin:v.metin.trim(),tarih:new Date().toISOString()});f.reset();toast("Duyuru yayınlandı")}
    else if(k==="ayar"){await saveAyar({ad:v.ad.trim(),yer:v.yer.trim(),banka:v.banka.trim(),alici:v.alici.trim(),iban:trUp(v.iban.trim())});toast("Bilgiler kaydedildi")}
    else if(k==="kasaTanim"){const ks=[],dev={};let i=0;while(v["ad"+i]!==undefined){const ad=v["ad"+i].trim();if(ad&&!ks.includes(ad)){ks.push(ad);dev[ad]=num(v["dev"+i])}i++}
      const yeni=(v.adYeni||"").trim();if(yeni&&!ks.includes(yeni)){ks.push(yeni);dev[yeni]=num(v.devYeni)}
      if(!ks.length)throw new Error("En az bir kasa olmalı");await saveAyar({kasalar:ks,devir:dev});toast("Kasalar kaydedildi")}
    else if(k==="gecAyar"){const o=num(v.oran);if(o<0||o>100)throw new Error("Oranı kontrol edin");await saveAyar({gecikmeOran:o});toast("Gecikme oranı kaydedildi")}
    else if(k==="personel"){const tc=(v.tc||"").trim();if(tc&&!tcOk(tc))throw new Error("TC kimlik numarası geçersiz");
      const d={kod:v.kod.trim(),ad:v.ad.trim(),gorev:v.gorev.trim(),firma:v.firma.trim(),tc,tel:v.tel.trim(),eposta:v.eposta.trim(),dogum:v.dogum||"",giris:v.giris||"",cikis:v.cikis||"",maas:num(v.maas),iban:trUp(v.iban.trim()),aciklama:v.aciklama.trim(),aktif:!!v.aktif};
      if(id)await db.doc("personel/"+id).update(d);else await db.collection("personel").add(d);kapat();toast(id?"Personel güncellendi":"Personel eklendi")}
    else if(k==="persOdeme"){if(num(v.tutar)<=0)throw new Error("Tutar girin");const x=pers(id);
      await db.collection("kasa").add({tur:"gider",hesap:v.hesap,kategori:v.kategori,tutar:num(v.tutar),tarih:v.tarih||today(),aciklama:(v.aciklama.trim()||v.kategori)+" — "+x.ad,personelId:id});
      toast("Ödeme kaydedildi: "+TL(num(v.tutar)));setTimeout(()=>{if(document.querySelector("#modalRoot .modal"))modal("Personel",persDetay(id))},700)}
    else if(k==="is"){await db.collection("isler").add({baslik:v.baslik.trim(),tarih:v.tarih||"",not:(v.not||"").trim(),bitti:false,olusturma:new Date().toISOString()});kapat();f.reset&&f.reset();toast("İş eklendi")}
    else if(k==="bildir"){if(num(v.tutar)<=0)throw new Error("Tutar girin");await db.collection("bildirimler").add({daireId:id,tutar:num(v.tutar),tarih:v.tarih||today(),gonderen:v.gonderen.trim(),aciklama:v.aciklama.trim(),durum:"bekliyor",olusturma:new Date().toISOString()});f.reset();toast("Bildiriminiz yönetime iletildi")}
    else if(k==="talep"){await db.collection("talepler").add({daireId:id,tur:v.tur,konu:v.konu.trim(),metin:v.metin.trim(),durum:"Açık",tarih:new Date().toISOString()});f.reset();toast("Talebiniz iletildi")}
    else if(k==="talepGuncel"){await db.doc("talepler/"+id).update({durum:v.durum,cevap:v.cevap.trim()});kapat();toast("Talep güncellendi")}
  }catch(err){toast("Kaydedilemedi: "+(err?.message||"yetkiniz olmayabilir"))}
  finally{if(btn&&document.body.contains(btn))btn.disabled=false}
});
async function saveAyar(patch){const cur={...ayar()};delete cur.id;await db.doc("ayarlar/site").set({...cur,...patch})}

/* ---------- Başlat ---------- */
fromHash();
(async()=>{
  const{data:{session}}=await sb.auth.getSession();
  if(!session){location.replace("./#yonetici");return}
  const{data:yon}=await sb.rpc("is_admin");
  if(!yon){location.replace("./");return}
  $("#roleChip").textContent="Yönetici";
  const em=session.user.email||"";$("#avatar").textContent=em.slice(0,2).toLocaleUpperCase("tr");$("#avatar").title=em;
  try{await Promise.all(COLS.map(yukleTablo));loaded=true;if(!location.hash)page="ozet";render()}
  catch(e){$("#app").innerHTML=`<div class="empty">Veriler yüklenemedi: ${esc(hataMetni(e))}</div>`}
  window.addEventListener("focus",()=>{if(loaded&&!document.querySelector("#modalRoot .modal"))needReload(...COLS)});
})();
$("#avatar").style.cursor="pointer";
$("#avatar").addEventListener("click",()=>{modal("Hesap",`<p style="margin-top:0">${esc($("#avatar").title)}</p><div class="row"><a class="btn out" href="./">Sakin girişi sayfası</a><button class="btn red" data-act="cikis">Çıkış yap</button></div>`)});
document.addEventListener("click",async e=>{if(e.target.closest('[data-act="cikis"]')){await sb.auth.signOut();location.replace("./")}});
})();
