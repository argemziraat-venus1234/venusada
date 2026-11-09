// Ortak yardımcılar
const sb = window.supabase.createClient(window.AYAR.SUPABASE_URL, window.AYAR.SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TL = (n) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0) + " TL";
const yerelTarih = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = () => yerelTarih();
const thisMonth = () => yerelTarih().slice(0, 7);
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const donemAd = (d) => { if (!d) return ""; const [y, m] = d.split("-"); return AYLAR[+m - 1] + " " + y; };
const trDate = (d) => { if (!d) return ""; const [y, m, g] = String(d).slice(0, 10).split("-"); return `${g}.${m}.${y}`; };
const num = (v) => { if (typeof v === "number") return Math.round(v * 100) / 100; let s = String(v ?? "").trim().replace(/\s|₺|TL/gi, ""); if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); return Math.round((parseFloat(s) || 0) * 100) / 100; };
const daireEposta = (id) => `daire-${String(id).toLowerCase()}@${window.AYAR.SAKIN_EPOSTA_ALANI || "venusada.local"}`;
const sortDaireO = (a, b) => String(a.blok || "").localeCompare(String(b.blok || ""), "tr") || String(a.no).localeCompare(String(b.no), "tr", { numeric: true });
function toast(t) { const el = $("#toast"); if (!el) return; el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), 3200); }
async function hepsi(tablo, siralama) {
  const out = [];
  for (let i = 0; ; i += 1000) {
    let q = sb.from(tablo).select("*").range(i, i + 999);
    if (siralama) q = q.order(siralama);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
function hataMetni(e) {
  const m = e?.message || String(e || "");
  if (/row-level security|permission denied|Yetkiniz yok/i.test(m)) return "Bu işlem için yetkiniz yok.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.";
  if (/kimlik_.*check|malik_tc|kiraci_tc/i.test(m)) return "TC kimlik numarası 11 haneli olmalı.";
  return m;
}
// ---------- Telefona uygulama olarak kurma ----------
(function () {
  const kurulu = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let kapali = false; try { kapali = localStorage.getItem("kurBannerKapali") === "1"; } catch {}
  if (kurulu || kapali || location.pathname.includes("yonetim")) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
  const mobil = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  let istem = null;
  function goster(metin, dugme) {
    if (document.getElementById("kurBanner")) return;
    const el = document.createElement("div"); el.id = "kurBanner"; el.className = "kur-banner";
    el.innerHTML = `<img src="ikon-192.png" alt="" width="40" height="40"><div class="kur-metin">${metin}</div>${dugme ? `<button class="btn sm" id="kurBtn">Yükle</button>` : ""}<button class="kur-kapat" id="kurKapat" aria-label="Kapat">✕</button>`;
    const h = document.querySelector(".s-top"); h ? h.after(el) : document.body.prepend(el);
    document.getElementById("kurKapat").onclick = () => { el.remove(); try { localStorage.setItem("kurBannerKapali", "1"); } catch {} };
    const b = document.getElementById("kurBtn");
    if (b) b.onclick = async () => { if (!istem) return; istem.prompt(); const s = await istem.userChoice; istem = null; if (s.outcome === "accepted") el.remove(); };
  }
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); istem = e; goster("<b>Telefonunuza uygulama olarak ekleyin.</b> Ana ekrandan tek dokunuşla açılır.", true); });
  window.addEventListener("appinstalled", () => document.getElementById("kurBanner")?.remove());
  if (ios) setTimeout(() => goster("<b>Telefonunuza ekleyin:</b> alttaki <b>Paylaş</b> simgesine, sonra <b>Ana Ekrana Ekle</b>'ye dokunun.", false), 1500);
  else if (mobil) setTimeout(() => { if (!istem) goster("<b>Telefonunuza ekleyin:</b> tarayıcının <b>⋮</b> menüsünden <b>Ana ekrana ekle</b>'ye dokunun.", false); }, 4000);
})();
