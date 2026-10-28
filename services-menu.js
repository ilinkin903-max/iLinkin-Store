/* Owner/reseller Nokos and SMM pages. Purchases stay in the Telegram bot. */
(() => {
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>'Rp '+Number(value||0).toLocaleString('id-ID');
  const labels={pending:'Diproses',submitting:'Memesan',uncertain:'Perlu Diperiksa',completed:'Selesai',partial:'Selesai Sebagian',canceled:'Dibatalkan',failed:'Gagal'};
  async function render({api,base,host,kind,isCurrent,onSettings,owner=false}){
    const type=kind==='otp'?'Nokos':'SMM',icon=kind==='otp'?'📱':'📣';
    const data=await api(base+'/overview?kind='+kind);if(!isCurrent())return;
    const stats=data.stats||{};
    host.innerHTML=`<section class="settings-section single-panel"><div class="section-head"><div><h2>${icon} ${type}</h2><p>${kind==='otp'?'Nomor virtual dan OTP dari lima pilihan server.':'Layanan media sosial dengan harga sesuai jumlah pesanan.'}</p></div><span class="badge ${data.available?'ok':'warn'}">${data.available?'Aktif':'Belum Aktif'}</span></div><div class="info-note" role="status">${esc(data.message)}</div><div class="form-actions" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">${data.bot_url?`<a class="neo-btn green" href="${esc(data.bot_url)}" target="_blank" rel="noopener noreferrer" id="servicesOpenBot">${icon} Buka ${type} di Bot</a>`:''}${onSettings?`<button class="neo-btn purple" type="button" id="servicesMenuSettings">${owner?'⚙️ Atur API & Margin':'⚙️ Pengaturan Bot'}</button>`:''}<button class="neo-btn blue" type="button" id="servicesMenuRefresh">⟳ Refresh</button></div><p style="margin-top:12px">Pemesanan dan pembayaran saldo dilakukan melalui bot. ${data.bot_url?'':'Buka bot lalu gunakan /'+(kind==='otp'?'nokos':'smm')+'.'}</p></section>
    <section class="settings-section single-panel" style="margin-top:16px"><h3>📈 Margin ${type} (%)</h3><form id="servicesMarginForm" class="form-grid"><label>Persentase Margin<input id="servicesMarginPercent" name="percent" type="number" min="0" max="1000" step="0.01" required value="${Number(data.margin_percent||0)}" ${data.can_edit_margin===false?'disabled':''}><small>${owner?'Dihitung dari harga akhir supplier.':'Dihitung dari harga owner untuk layanan ini.'} Isi 0 jika tanpa tambahan margin.</small></label><div class="form-actions"><button class="neo-btn purple" type="submit" ${data.can_edit_margin===false?'disabled':''}>Simpan Margin</button></div><p id="servicesMarginStatus" class="full" role="status"></p></form></section>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:16px 0"><div class="info-note">Total Pesanan<br><b>${Number(stats.total||0)}</b></div><div class="info-note">Sedang Diproses<br><b>${Number(stats.processing||0)}</b></div><div class="info-note">Selesai<br><b>${Number(stats.completed||0)}</b></div><div class="info-note">Saldo Dikembalikan<br><b>${money(stats.refunded)}</b></div></div>
    <section class="settings-section single-panel"><div class="section-head"><div><h3>${icon} Katalog ${type}</h3><p>${kind==='otp'?'Pilih server, aplikasi dan negara untuk melihat harga.':'Pilih aplikasi → kategori → layanan. Harga layanan berlaku per 1.000 unit.'}</p></div></div>${kind==='otp'?`<div class="form-grid"><label>Server<select id="servicesCatalogServer">${[1,2,3,4,5].map(n=>`<option value="${n}">Server ${n}</option>`).join('')}</select></label><label id="servicesProviderLabel" class="hidden">Jalur Layanan<select id="servicesCatalogProvider"><option value="">Otomatis</option></select></label></div>`:''}<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0"><button class="neo-btn white small hidden" type="button" id="servicesCatalogBack">← Kembali</button><span id="servicesCatalogTrail"></span></div><div class="form-grid"><label class="full"><span id="servicesCatalogSearchLabel">Cari ${kind==='otp'?'aplikasi / negara':'aplikasi'}</span><input id="servicesCatalogSearch" type="search" placeholder="Ketik nama untuk mencari" autocomplete="off"></label></div><div id="servicesMenuCatalog" style="margin-top:14px"></div><div id="servicesCatalogPages" class="form-actions" style="display:flex;gap:10px;align-items:center;margin-top:14px"></div></section>
    <section class="settings-section single-panel" style="margin-top:16px"><div class="section-head"><h3>📋 Riwayat ${type}</h3></div><div id="servicesMenuOrders"></div></section>`;
    const $=selector=>host.querySelector(selector);
    if(onSettings)$('#servicesMenuSettings').onclick=onSettings;
    $('#servicesMarginForm').onsubmit=async event=>{
      event.preventDefault();const button=event.target.querySelector('[type=submit]'),value=Number($('#servicesMarginPercent').value);button.disabled=true;
      try{await api(base+(owner?'/config':'/margins'),{method:'POST',body:{[owner?(kind==='otp'?'nokos_markup_percent':'smm_markup_percent'):(kind==='otp'?'nokos_percent':'smm_percent')]:value}});if(isCurrent())await render({api,base,host,kind,isCurrent,onSettings,owner});}
      catch(error){if(isCurrent())$('#servicesMarginStatus').textContent=error.message;}finally{button.disabled=false;}
    };
    $('#servicesMenuRefresh').onclick=()=>render({api,base,host,kind,isCurrent,onSettings,owner}).catch(e=>{if(isCurrent())$('#servicesMenuOrders').textContent=e.message;});
    if($('#servicesOpenBot'))$('#servicesOpenBot').onclick=event=>{if(window.Telegram?.WebApp?.openTelegramLink){event.preventDefault();window.Telegram.WebApp.openTelegramLink(data.bot_url);}};
    function renderOrders(){
      $('#servicesMenuOrders').innerHTML=data.items?.length?data.items.map(item=>`<article class="settings-section" style="margin:12px 0;overflow-wrap:anywhere"><b>${esc(item.title)}</b><p><code>${esc(item.ref)}</code> · ${esc(labels[item.status]||item.status)}</p><p>Pembeli: <code>${esc(item.telegram_id)}</code> · ${esc(new Date(item.created_at).toLocaleString('id-ID'))}</p><p>Bayar <b>${money(item.price)}</b> · Refund <b>${money(item.refund_total)}</b></p><button type="button" class="neo-btn purple small" data-zx-menu-check="${esc(item.ref)}">🔄 Cek Pesanan</button></article>`).join(''):'<div class="empty compact">Belum ada pesanan '+type+'.</div>';
      host.querySelectorAll('[data-zx-menu-check]').forEach(button=>button.onclick=async()=>{
        button.disabled=true;
        try{await api(base+'/orders/'+encodeURIComponent(button.dataset.zxMenuCheck)+'/check',{method:'POST'});if(isCurrent())await render({api,base,host,kind,isCurrent,onSettings,owner});}
        catch(e){if(isCurrent()){const p=document.createElement('p');p.setAttribute('role','status');p.textContent=e.message;button.after(p);button.disabled=false;}}
      });
    }
    renderOrders();
    let context={server:'1'},stack=[],catalog,selectedPage=0,request=0;
    function paint(){
      const term=$('#servicesCatalogSearch').value.trim().toLocaleLowerCase('id-ID');
      const items=(catalog?.items||[]).filter(item=>[item.name,item.category,item.description].filter(Boolean).join(' ').toLocaleLowerCase('id-ID').includes(term));
      const pages=Math.max(1,Math.ceil(items.length/12));selectedPage=Math.min(selectedPage,pages-1);
      const leaf=kind==='smm'?catalog?.step==='smm_services':catalog?.step==='offers';
      $('#servicesMenuCatalog').innerHTML=`<h4>${esc(catalog?.title||'Katalog')}</h4><p>${items.length.toLocaleString('id-ID')} pilihan</p>`+(items.length?`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:12px">${items.slice(selectedPage*12,selectedPage*12+12).map(item=>`<article class="info-note" style="overflow-wrap:anywhere"><b>${esc(item.name)}</b>${item.category?`<p>${esc(item.category)}</p>`:''}${item.count!=null?`<p>${Number(item.count).toLocaleString('id-ID')} layanan</p>`:''}${item.price!=null?`<p><b>${money(item.price)}</b>${kind==='smm'?' / 1.000':''} ${item.discounted?'🏷 Promo':''}</p>`:''}${kind==='smm'&&leaf?`<p>Min. ${Number(item.min).toLocaleString('id-ID')} · Maks. ${Number(item.max).toLocaleString('id-ID')}</p>${item.comments?'<p>✍️ Komentar khusus</p>':''}<details><summary>Keterangan</summary><p>${esc(item.description||'Periksa target dan jumlah sebelum memesan di bot.')}</p></details>`:kind==='otp'&&leaf?`<p>${item.stock==null?'Ketersediaan diperiksa saat memesan.':'Stok: '+esc(item.stock)}</p>`:`<p><button type="button" class="neo-btn purple small" data-zx-catalog-pick="${esc(item.id)}">Pilih →</button></p>`}</article>`).join('')}</div>`:'<div class="empty compact">'+esc(term?'Tidak ada pilihan yang cocok dengan pencarian.':catalog?.message||'API mengembalikan daftar kosong. Coba lagi atau pilih server lain.')+'</div>');
      $('#servicesCatalogPages').innerHTML=`${selectedPage?'<button class="neo-btn white small" type="button" data-zx-page="-1">‹ Sebelumnya</button>':''}<span>Halaman ${selectedPage+1}/${pages}</span>${selectedPage+1<pages?'<button class="neo-btn white small" type="button" data-zx-page="1">Berikutnya ›</button>':''}`;
      host.querySelectorAll('[data-zx-page]').forEach(button=>button.onclick=()=>{selectedPage+=Number(button.dataset.zxPage);paint();});
      host.querySelectorAll('[data-zx-catalog-pick]').forEach(button=>button.onclick=()=>{
        const item=catalog.items.find(row=>String(row.id)===button.dataset.zxCatalogPick);if(!item)return;
        stack.push({...context});context={...context,path:[...(context.path||[]),item.name]};
        if(kind==='smm'){if(catalog.step==='smm_apps')context.app_id=item.id;else if(catalog.step==='smm_categories')context.category_id=item.id;}
        else if(catalog.step==='services')context.service_id=item.id;else context[context.server==='1'?'country_code':'country_id']=item.id;
        loadCatalog();
      });
    }
    async function loadCatalog(){
      if(!isCurrent())return;const sequence=++request;
      $('#servicesCatalogBack').classList.toggle('hidden',!stack.length);$('#servicesCatalogTrail').textContent=(context.path||[]).join(' → ');
      if(!data.available){$('#servicesMenuCatalog').textContent=data.message;$('#servicesCatalogSearch').disabled=true;return;}
      $('#servicesCatalogSearch').disabled=true;$('#servicesMenuCatalog').innerHTML='<div class="empty compact">Memuat katalog...</div>';$('#servicesCatalogPages').innerHTML='';
      const params=new URLSearchParams({kind});for(const key of (kind==='otp'?['server','provider','service_id','country_id','country_code']:['app_id','category_id']))if(context[key])params.set(key,context[key]);
      try{const result=await api(base+'/catalog?'+params);if(!isCurrent()||sequence!==request)return;catalog=result;selectedPage=0;
        if(kind==='otp'&&context.server==='1'){
          if(result.provider)context.provider=result.provider;
          if(Array.isArray(result.providers)){
            const choices=result.providers;$('#servicesProviderLabel').classList.toggle('hidden',choices.length<2);
            $('#servicesCatalogProvider').innerHTML=choices.length?choices.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join(''):'<option value="">Otomatis</option>';
            if(choices.some(item=>item.id===context.provider))$('#servicesCatalogProvider').value=context.provider;
          }
        }
        if(kind==='smm')$('#servicesCatalogSearchLabel').textContent='Cari '+({smm_apps:'aplikasi',smm_categories:'kategori',smm_services:'layanan'}[catalog.step]||'layanan');$('#servicesCatalogSearch').disabled=false;$('#servicesCatalogSearch').value='';paint();}
      catch(e){if(!isCurrent()||sequence!==request)return;$('#servicesMenuCatalog').innerHTML=`<p role="status">${esc(e.message)}</p><button type="button" class="neo-btn purple small" id="servicesCatalogRetry">Coba Lagi</button>`;$('#servicesCatalogRetry').onclick=loadCatalog;}
    }
    $('#servicesCatalogSearch').oninput=()=>{selectedPage=0;paint();};
    $('#servicesCatalogBack').onclick=()=>{context=stack.pop()||{server:'1'};loadCatalog();};
    if(kind==='otp'){
      const reset=provider=>{context={server:$('#servicesCatalogServer').value,...(provider?{provider}: {})};stack=[];$('#servicesProviderLabel').classList.add('hidden');loadCatalog();};
      $('#servicesCatalogServer').onchange=()=>reset('');$('#servicesCatalogProvider').onchange=()=>reset($('#servicesCatalogProvider').value);
    }
    await loadCatalog();
  }
  window.ilinkServices={render};
})();
