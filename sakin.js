// Venüs Ada Sitesi — kat maliki / kiracı ekranı ve giriş
(function () {
  const r2 = (v) => Math.round(v * 100) / 100;
  const balCls = (b) => (b > 0.009 ? "neg" : b < -0.009 ? "pos" : "");
  const BLOKLAR = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const S = { daire: null, ayar: {}, tah: [], bil: [], tal: [], duy: [] };
  let sekme = location.hash === "#yonetici" ? "yon" : "sakin";

  // ---------- Giriş ----------
  function girisEkrani(mesaj) {
    $("#who").textContent = "İnegöl - Bursa";
    $("#app").innerHTML = `<div class="card login">
      <div class="tabs"><button class="${sekme === "sakin" ? "act" : ""}" data-sekme="sakin">Kat maliki / Kiracı</button><button class="${sekme === "yon" ? "act" : ""}" data-sekme="yon">Yönetici</button></div>
      ${sekme === "sakin" ? `<form id="girisForm" data-tip="sakin">
        <p class="muted small" style="margin:0">Yönetimden aldığınız şifre kâğıdındaki bilgileri girin.</p>
        <div class="two"><label>Blok<select name="blok" required>${BLOKLAR.map((b) => `<option ${b === "B" ? "selected" : ""}>${b}</option>`).join("")}</select></label>
        <label>Daire no<input name="no" inputmode="numeric" required autocomplete="username" placeholder="12"></label></div>
        <label>Şifre<input name="sifre" type="password" required autocomplete="current-password" autocapitalize="characters" placeholder="6 karakter"></label>
        ${mesaj ? `<div class="err">${esc(mesaj)}</div>` : ""}
        <button class="btn">Giriş yap</button>
        <p class="muted small" style="margin:0">Şifreniz yoksa ya da unuttuysanız site yönetimiyle görüşün.</p>
      </form>` : `<form id="girisForm" data-tip="yon">
        <label>E-posta<input name="email" type="email" required autocomplete="username" placeholder="ornek@gmail.com"></label>
        <label>Şifre<input name="ysifre" type="password" required autocomplete="current-password"></label>
        ${mesaj ? `<div class="err">${esc(mesaj)}</div>` : ""}
        <button class="btn">Yönetici girişi</button>
      </form>`}
    </div>`;
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-sekme]");
    if (t) { sekme = t.dataset.sekme; history.replaceState(null, "", sekme === "yon" ? "#yonetici" : "#"); girisEkrani(); }
  });
  document.addEventListener("submit", async (e) => {
    const f = e.target;
    if (f.id !== "girisForm") return;
    e.preventDefault();
    const b = f.querySelector("button"); b.disabled = true; b.textContent = "Giriş yapılıyor…";
    if (f.dataset.tip === "yon") {
      let mail = f.email.value.trim(); if (!mail.includes("@")) mail += "@gmail.com";
      const { error } = await sb.auth.signInWithPassword({ email: mail, password: f.ysifre.value });
      if (error) return girisEkrani(/fetch|network/i.test(error.message) ? "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin." : "E-posta ya da şifre hatalı.");
      const { data: yon } = await sb.rpc("is_admin");
      if (!yon) { await sb.auth.signOut(); return girisEkrani("Bu hesabın yönetici yetkisi yok."); }
      location.replace("yonetim.html"); return;
    }
    const blok = f.blok.value.trim().toLocaleUpperCase("tr"), no = f.no.value.trim().replace(/\D/g, "");
    if (!no) return girisEkrani("Daire numarasını girin.");
    const id = blok + "-" + no;
    const { error } = await sb.auth.signInWithPassword({ email: daireEposta(id), password: f.sifre.value.trim().toUpperCase() });
    if (error) return girisEkrani(/fetch|network/i.test(error.message) ? "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin." : "Blok, daire no ya da şifre hatalı.");
    basla();
  });

  // ---------- Veri ----------
  async function yukle() {
    const [d, a, t, bi, ta, du] = await Promise.all([
      sb.from("daireler").select("*"), sb.from("ayarlar").select("*").eq("id", 1).single(),
      sb.from("tahakkuk").select("*").order("donem"), sb.from("bildirimler").select("*").order("olusturma", { ascending: false }),
      sb.from("talepler").select("*").order("tarih", { ascending: false }), sb.from("duyurular").select("*").order("tarih", { ascending: false })]);
    for (const x of [d, a, t, bi, ta, du]) if (x.error) throw x.error;
    S.daire = (d.data || []).sort(sortDaireO)[0] || null;
    S.ayar = a.data || {}; S.tah = t.data || []; S.bil = bi.data || []; S.tal = ta.data || []; S.duy = du.data || [];
    render();
  }

  // ---------- Ekran ----------
  function render() {
    const d = S.daire, a = S.ayar;
    $("#siteAd").textContent = a.ad || "Venüs Ada Sitesi";
    if (!d) { $("#app").innerHTML = `<div class="card"><h2>Daire bulunamadı</h2><p>Hesabınıza bağlı daire bulunamadı. Lütfen site yönetimiyle görüşün.</p><button class="btn out" data-act="cikis">Çıkış</button></div>`; return; }
    const etiket = (d.blok ? d.blok + " Blok " : "") + "No " + d.no;
    $("#who").innerHTML = `${esc(etiket)}<br><a href="#" data-act="cikis">Çıkış</a>`;
    const tah = S.tah.filter((x) => x.daire_id === d.id);
    const bal = r2(tah.reduce((s, x) => s + Number(x.tutar) - Number(x.odenen), 0));
    const acik = tah.filter((x) => Number(x.tutar) - Number(x.odenen) > 0.009 || Number(x.tutar) < 0);
    const hareket = tah.filter((x) => Number(x.tutar) !== 0 || Number(x.odenen) !== 0).slice().reverse().slice(0, 30);
    const dur = (x) => `<span class="pill ${x.durum === "onaylandi" ? "p-green" : x.durum === "reddedildi" ? "p-red" : "p-amber"}">${x.durum === "onaylandi" ? "Onaylandı" : x.durum === "reddedildi" ? "Reddedildi" : "Onay bekliyor"}</span>`;
    const tdur = (s) => `<span class="pill ${s === "Çözüldü" ? "p-green" : s === "İşlemde" ? "p-amber" : "p-red"}">${esc(s || "Açık")}</span>`;
    $("#app").innerHTML = `
    <div class="card"><div class="s-hero"><div><div class="s-sub">${esc(etiket)}</div><div style="font-size:17px;font-weight:600">${esc(d.malik || "")}</div>${d.kiraci ? `<div class="s-sub">Kiracı: ${esc(d.kiraci)}</div>` : ""}</div>
      <div style="text-align:right"><div class="s-sub">Güncel borcunuz</div><div class="big ${bal > 0.009 ? "neg" : "pos"}">${TL(Math.max(bal, 0))}</div>${bal < -0.009 ? `<div class="small pos">${TL(-bal)} alacağınız var</div>` : ""}</div></div></div>
    ${acik.length ? `<div class="card"><h2>Açık borçlar</h2><div class="tbox"><table class="dt" style="min-width:0"><tbody>${acik.map((x) => `<tr><td>${esc(donemAd(x.donem))}<div class="small muted">${esc(x.aciklama || "Aidat")}</div></td><td class="r num ${Number(x.tutar) - Number(x.odenen) < 0 ? "pos" : "neg"}">${TL(Number(x.tutar) - Number(x.odenen))}</td></tr>`).join("")}</tbody></table></div></div>` : `<div class="card"><span class="pill p-green">Borcunuz yok</span></div>`}
    <div class="card"><h2>Ödeme bilgileri</h2>${a.iban ? `<div class="small muted">${esc(a.banka || "")}${a.alici ? " · Alıcı: " + esc(a.alici) : ""}</div><div class="iban" id="ibanTxt" style="margin:8px 0">${esc(a.iban)}</div><button class="btn out sm" data-act="ibanKopya">IBAN'ı kopyala</button><p class="note" style="margin:10px 0 0">Havale açıklamasına <b>${esc(etiket)}</b> yazmayı unutmayın. Ödeme yaptıktan sonra aşağıdan bildirin.</p>` : `<p class="muted">Yönetim henüz IBAN bilgisi girmedi.</p>`}</div>
    <div class="card"><h2>Ödeme yaptım, bildir</h2><form class="form" data-form="bildir">
      <label>Tutar (TL)<input name="tutar" inputmode="decimal" required value="${bal > 0 ? String(bal).replace(".", ",") : ""}"></label>
      <label>Ödeme tarihi<input type="date" name="tarih" value="${today()}"></label>
      <label>Gönderen adı<input name="gonderen"></label><label>Not<input name="aciklama"></label>
      <div><button class="btn">Bildir</button></div></form>
      ${S.bil.length ? `<div class="list" style="margin-top:12px">${S.bil.slice(0, 6).map((x) => `<div class="li"><span class="grow">${trDate(x.tarih)} · <span class="num">${TL(x.tutar)}</span></span>${dur(x)}</div>`).join("")}</div>` : ""}</div>
    <div class="card"><h2>Hesap hareketleri</h2>${hareket.length ? `<div class="tbox"><table class="dt" style="min-width:0"><thead><tr><th>Dönem</th><th>Açıklama</th><th class="r">Tutar</th><th class="r">Ödenen</th></tr></thead><tbody>${hareket.map((x) => `<tr><td>${esc(donemAd(x.donem))}</td><td>${esc(x.aciklama || "Aidat")}</td><td class="r num">${TL(x.tutar)}</td><td class="r num">${TL(x.odenen)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Hareket yok.</p>`}</div>
    <div class="card"><h2>Arıza / talep bildir</h2><form class="form" data-form="talep">
      <label>Tür<select name="tur"><option>Arıza</option><option>Temizlik</option><option>Güvenlik</option><option>Öneri</option><option>Şikayet</option></select></label>
      <label style="grid-column:span 2">Konu<input name="konu" required placeholder="Asansör çalışmıyor"></label>
      <label class="full">Açıklama<textarea name="metin"></textarea></label><div><button class="btn">Gönder</button></div></form>
      ${S.tal.length ? `<div class="list" style="margin-top:12px">${S.tal.map((t) => `<div class="li"><div class="grow"><b>${esc(t.konu)}</b><div class="small muted">${trDate(t.tarih)} · ${esc(t.tur || "")}</div>${t.cevap ? `<p class="note" style="margin-top:6px"><b>Yönetim:</b> ${esc(t.cevap)}</p>` : ""}</div>${tdur(t.durum)}</div>`).join("")}</div>` : ""}</div>
    <div class="card"><h2>Duyurular</h2>${S.duy.length ? `<div class="list">${S.duy.map((x) => `<div class="li"><div class="grow"><div class="between"><b>${esc(x.baslik)}</b><span class="small muted">${trDate(x.tarih)}</span></div><p>${esc(x.metin)}</p></div></div>`).join("")}</div>` : `<p class="muted">Henüz duyuru yok.</p>`}</div>
    <div class="card"><h2>Şifremi değiştir</h2><form class="form" data-form="sifre"><label>Yeni şifre<input name="yeni" type="password" minlength="6" required autocomplete="new-password" autocapitalize="characters"></label><label>Yeni şifre (tekrar)<input name="yeni2" type="password" minlength="6" required autocomplete="new-password" autocapitalize="characters"></label><div><button class="btn out">Şifreyi değiştir</button></div></form><p class="small muted" style="margin:8px 0 0">Şifre büyük/küçük harf ayırmaz, en az 6 karakter olmalı.</p></div>`;
  }

  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    if (t.dataset.act === "cikis") { e.preventDefault(); await sb.auth.signOut(); location.replace("./"); }
    if (t.dataset.act === "ibanKopya") {
      const v = (S.ayar.iban || "").replace(/\s/g, "");
      try { await navigator.clipboard.writeText(v); toast("IBAN kopyalandı"); }
      catch { const r = document.createRange(); r.selectNodeContents($("#ibanTxt")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("IBAN seçildi, kopyalayabilirsiniz"); }
    }
  });
  document.addEventListener("submit", async (e) => {
    const f = e.target.closest("form[data-form]"); if (!f) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f).entries()), btn = f.querySelector("button"); btn.disabled = true;
    try {
      if (f.dataset.form === "bildir") {
        if (num(v.tutar) <= 0) throw new Error("Tutar girin");
        const { error } = await sb.from("bildirimler").insert({ daire_id: S.daire.id, tutar: num(v.tutar), tarih: v.tarih || today(), gonderen: v.gonderen.trim(), aciklama: v.aciklama.trim() });
        if (error) throw error; toast("Bildiriminiz yönetime iletildi"); await yukle();
      } else if (f.dataset.form === "talep") {
        const { error } = await sb.from("talepler").insert({ daire_id: S.daire.id, tur: v.tur, konu: v.konu.trim(), metin: v.metin.trim() });
        if (error) throw error; toast("Talebiniz iletildi"); await yukle();
      } else if (f.dataset.form === "sifre") {
        if (v.yeni.length < 6) throw new Error("Şifre en az 6 karakter olmalı");
        if (v.yeni.toUpperCase() !== v.yeni2.toUpperCase()) throw new Error("Şifreler aynı değil");
        const { error } = await sb.auth.updateUser({ password: v.yeni.trim().toUpperCase() });
        if (error) throw error; f.reset(); toast("Şifreniz değiştirildi");
      }
    } catch (err) { toast("Kaydedilemedi: " + hataMetni(err)); }
    finally { if (document.body.contains(btn)) btn.disabled = false; }
  });

  async function basla() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return girisEkrani();
    const { data: yon } = await sb.rpc("is_admin");
    if (yon) { location.replace("yonetim.html"); return; }
    $("#app").innerHTML = `<div class="empty">Bilgileriniz yükleniyor…</div>`;
    try { await yukle(); } catch (err) { $("#app").innerHTML = `<div class="card"><p>Bilgiler yüklenemedi: ${esc(hataMetni(err))}</p><button class="btn out" data-act="cikis">Çıkış</button></div>`; }
  }
  basla();
})();
