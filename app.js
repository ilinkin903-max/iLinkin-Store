const $=(s)=>document.querySelector(s);const $$=(s)=>[...document.querySelectorAll(s)];
const state={token:sessionStorage.getItem('ilink_owner_token')||localStorage.getItem('ilink_owner_token')||'',view:'dashboard',cache:{supplierCatalogs:{}},me:null,overview:null,couponTab:'coupon',settingsTab:'',botTab:'',resellerTab:'resellers',resellerFilter:'',invitationTab:'emails',invitationSearch:'',invitationStatus:'',invitationSessionFilter:'',invitationsData:{items:[],sessions:[]},selectedEmailIds:new Set(),promoData:{items:[],store:{}},promoTemplate:'wa',promoCategoryFilter:'',promoSearch:'',promoSelectedIds:new Set(),promoOptions:{showPrice:true,showStock:true,showBot:true,showCs:true,showWarranty:true,customHeader:'',customCs:'',customFooter:''},report:{type:'monthly'},legacyMigration:null,notifications:[],notificationTimer:null};
const titles={dashboard:['Dashboard','Ringkasan performa toko hari ini'],products:['Produk','Katalog, varian, deskripsi, SNK, dan stok'],fresh:['Jaspay Fresh','Produk fresh, harga, mode, setting akun, dan perpanjang'],orders:['Pesanan','Pantau seluruh detail transaksi tanpa tabel horizontal'],invitations:['List Email & Sesi Undangan','Daftar email pembeli produk undangan (Canva, Gemini, dsb.) dan kelola sesi tim'],promotions:['Promosi Stok Ready','Daftar produk ready dan generator template promosi WhatsApp, Telegram, Flash Sale, & Story'],reports:['Laporan','Omzet, profit, dan performa penjualan'],coupons:['Kupon','Voucher promo dan kode redeem'],settings:['Pengaturan','Toko, referral, TopUp, pembayaran, supplier, dan backup'],bot:['Bot & Notifikasi','Bot, /start, link, transaksi, dan diagnostik'],broadcast:['Broadcast','Kirim dan pantau pesan massal ke pengguna'],users:['User','Data pengguna Telegram, saldo, referral, dan aktivitas'],resellers:['Reseller Bot','Kelola reseller, bot toko white-label, komisi profit, dan penarikan saldo']};
function esc(v=''){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}function money(v){return'Rp '+Number(v||0).toLocaleString('id-ID')}function date(v){if(!v)return'-';try{return new Date(v).toLocaleString('id-ID')}catch{return String(v)}}function bytes(v){const n=Number(v||0);if(n<1024)return n+' B';if(n<1048576)return(n/1024).toFixed(1)+' KB';return(n/1048576).toFixed(1)+' MB'}function toast(msg,bad=false){const t=$('#toast');if(!t)return;const m=$('#modal');if(m&&m.open){if(t.parentElement!==m)m.appendChild(t);}else{if(t.parentElement!==document.body)document.body.appendChild(t);}t.textContent=msg;t.className='toast show'+(bad?' bad':'');clearTimeout(toast.t);toast.t=setTimeout(()=>{t.className='toast';if(!m||!m.open){if(t.parentElement!==document.body)document.body.appendChild(t);}},2800);}function badge(status){const s=String(status||'').toLowerCase();const cls=['completed','paid','success','active','running','waiting_delivery'].includes(s)?'ok':['pending','pending_payment','pending_approval','awaiting_payment','awaiting_token','supplier_pending','fresh_processing','fresh_attention','inactive'].includes(s)?'warn':['failed','blocked','canceled','cancelled','expired','rejected','suspended'].includes(s)?'bad':'purple';const labelMap={pending_approval:'Menunggu Persetujuan',awaiting_payment:'Menunggu Pembayaran',awaiting_token:'Menunggu Bot Token',active:'Aktif',suspended:'Ditangguhkan',rejected:'Ditolak'};const label=labelMap[s]||status||'-';return`<span class="badge ${cls}">${esc(label)}</span>`}function firstLetter(v){return esc(String(v||'?').trim().charAt(0).toUpperCase()||'?')}
function bulkTiers(value){let rows=value;if(typeof rows==='string'){try{rows=JSON.parse(rows)}catch{rows=[]}}if(!Array.isArray(rows))rows=[];const byQty=new Map();for(const row of rows){const min=Math.max(2,Math.floor(Number(row?.min_qty??row?.minQty??row?.qty??0)||0)),price=Math.max(0,Math.floor(Number(row?.price??row?.unit_price??0)||0));if(min>=2&&price>0)byQty.set(min,{min_qty:min,price})}return[...byQty.values()].sort((a,b)=>a.min_qty-b.min_qty)}
function bulkUnitPrice(base,tiers,qty=1){let price=Math.max(0,Number(base||0)),q=Math.max(1,Number(qty||1));for(const t of bulkTiers(tiers)){if(q>=t.min_qty)price=t.price;else break}return price}
function bulkEditorHtml(prefix,tiers=[]){const rows=bulkTiers(tiers);return`<div class="full bulk-editor"><div class="bulk-editor-head"><div><b>Harga Bulk / Grosir</b><small>Harga per pcs otomatis berubah saat jumlah pesanan mencapai minimal tier.</small></div><button type="button" id="${prefix}Add" class="neo-btn purple small">＋ Tambah Tier</button></div><div id="${prefix}Rows" class="bulk-tier-list"></div><input type="hidden" name="bulk_prices" id="${prefix}Value" value="${esc(JSON.stringify(rows))}"><div class="bulk-help">Contoh: mulai 2 pcs Rp 845/pcs, mulai 50 pcs Rp 200/pcs. Tier diurutkan otomatis dari jumlah terkecil.</div></div>`}
function bindBulkEditor(prefix,initial=[]){let rows=bulkTiers(initial);const host=$(`#${prefix}Rows`),value=$(`#${prefix}Value`),add=$(`#${prefix}Add`);const sync=()=>{if(value)value.value=JSON.stringify(bulkTiers(rows))};const render=()=>{if(!host)return;host.innerHTML=rows.length?rows.map((t,i)=>`<div class="bulk-tier-row"><label>Mulai Qty<input type="number" min="2" value="${Number(t.min_qty)}" data-bulk-qty="${i}"></label><label>Harga / pcs<input type="number" min="1" value="${Number(t.price)}" data-bulk-price="${i}"></label><button type="button" class="neo-btn red small" data-bulk-remove="${i}">Hapus</button></div>`).join(''):'<div class="empty compact">Belum ada harga bulk. Harga normal berlaku untuk semua jumlah.</div>';sync();$$('[data-bulk-qty]').forEach(el=>el.oninput=()=>{rows[Number(el.dataset.bulkQty)].min_qty=Math.max(2,Number(el.value||2));sync()});$$('[data-bulk-price]').forEach(el=>el.oninput=()=>{rows[Number(el.dataset.bulkPrice)].price=Math.max(1,Number(el.value||1));sync()});$$('[data-bulk-remove]').forEach(el=>el.onclick=()=>{rows.splice(Number(el.dataset.bulkRemove),1);render()})};if(add)add.onclick=()=>{const normalized=bulkTiers(rows),last=normalized.at(-1);rows=normalized;rows.push({min_qty:last?last.min_qty+1:2,price:last?last.price:1});render()};render()}
function mediaSrc(value){const raw=String(value||'').trim();if(raw.startsWith('vps://'))return `/api/media?name=${encodeURIComponent(raw.slice(6))}&v=250`;return raw;}
function fileToBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||'').split(',').pop()||'');r.onerror=()=>reject(new Error('Gagal membaca file.'));r.readAsDataURL(file);});}
function mediaTypeFrom(value,fallback=''){const raw=String(value||'').toLowerCase(),fb=String(fallback||'').toLowerCase();if(fb==='gif')return'animation';if(fb)return fb;if(/\.gif(?:$|\?)/.test(raw))return'animation';if(/\.(mp4|webm)(?:$|\?)/.test(raw))return'video';if(/\.(jpg|jpeg|png|webp)(?:$|\?)/.test(raw))return'photo';return'';}
function mediaPreviewHtml(value,type=''){const raw=String(value||'').trim();if(!raw)return'<span>Belum ada media.</span>';const src=mediaSrc(raw),t=mediaTypeFrom(raw,type);if(t==='video')return`<video src="${esc(src)}" controls preload="metadata" playsinline></video><small>${esc(raw)}</small>`;if(t==='photo'||t==='animation')return`<img src="${esc(src)}" alt="Preview media"><small>${t==='animation'?'GIF animasi · ':''}${esc(raw)}</small>`;return`<b>${esc(raw)}</b>`;}
async function uploadMedia(file,kind='media',onProgress=null){
  if(!file)throw new Error('Pilih file terlebih dahulu.');
  const isVideo=String(file.type||'').startsWith('video/')||/\.(mp4|webm)$/i.test(String(file.name||''));const max=isVideo?40*1024*1024:8*1024*1024;if(file.size>max)throw new Error(`Ukuran ${isVideo?'video':'gambar'} maksimal ${Math.round(max/1024/1024)} MB.`);
  const init=await api('/api/admin/media/upload/init',{method:'POST',body:{name:file.name,mime:file.type,size:file.size,kind}});const uploadId=init.upload_id;const chunkSize=Math.min(Number(init.chunk_bytes||512*1024),512*1024);let offset=0;
  try{while(offset<file.size){const blob=file.slice(offset,Math.min(file.size,offset+chunkSize));const data=await fileToBase64(blob);const r=await api('/api/admin/media/upload/chunk',{method:'POST',body:{upload_id:uploadId,offset,data_base64:data}});offset=Number(r.received||offset+blob.size);if(onProgress)onProgress(Math.min(100,Math.round(offset/file.size*100)));}return await api('/api/admin/media/upload/complete',{method:'POST',body:{upload_id:uploadId}})}catch(e){try{await api('/api/admin/media/upload/cancel',{method:'POST',body:{upload_id:uploadId}})}catch{}throw e}
}
async function uploadLegacyJson(file,onProgress=null){
  if(!file)throw new Error('Pilih file backup JSON terlebih dahulu.');if(!/\.json$/i.test(String(file.name||'')))throw new Error('File harus berformat .json');if(file.size>50*1024*1024)throw new Error('Ukuran backup JSON maksimal 50 MB.');
  const init=await api('/api/admin/legacy-import/upload/init',{method:'POST',body:{name:file.name,size:file.size}}),id=init.upload_id,chunkSize=Math.min(Number(init.chunk_bytes||512*1024),512*1024);let offset=0;
  try{while(offset<file.size){const blob=file.slice(offset,Math.min(file.size,offset+chunkSize)),data=await fileToBase64(blob);const r=await api('/api/admin/legacy-import/upload/chunk',{method:'POST',body:{upload_id:id,offset,data_base64:data}});offset=Number(r.received||offset+blob.size);if(onProgress)onProgress(Math.min(100,Math.round(offset/file.size*100)));}return await api('/api/admin/legacy-import/upload/complete',{method:'POST',body:{upload_id:id}})}catch(e){try{await api('/api/admin/legacy-import/cancel',{method:'POST',body:{upload_id:id}})}catch{}throw e}
}
function legacyPreviewHtml(p={}){const c=p.counts||{},h=p.historical||{};return`<div class="legacy-preview"><div class="legacy-preview-head"><div><b>${esc(p.format||'Backup JSON')}</b><small>${p.version?`Versi ${esc(p.version)} · `:''}${p.generated_at?date(p.generated_at):'Siap dianalisis'}</small></div>${badge('siap')}</div><div class="legacy-count-grid"><span>User <b>${Number(c.users||0)}</b></span><span>Produk <b>${Number(c.products||0)}</b></span><span>Varian <b>${Number(c.variants||0)}</b></span><span>Stok Ready <b>${Number(c.stock||0)}</b></span><span>Voucher <b>${Number(c.vouchers||0)}</b></span><span>Redeem <b>${Number(c.redeem||0)}</b></span><span>Detail Transaksi <b>${Number(c.transactions||0)}</b></span><span>Hist. Transaksi <b>${Number(h.orders_total||0)}</b></span><span>Hist. Terjual <b>${Number(h.quantity_sold||0)}</b></span></div>${Number(h.orders_total||0)||Number(h.quantity_sold||0)?'<div class="info-note" style="margin-top:12px">Counter historis menjaga Total Transaksi dan Stok Terjual agar tidak turun walau detail transaksi lama pernah dibersihkan.</div>':''}</div>`}
function supplierPrice(x){const unit=x?.priceUnit||'';const v=Number(x?.price||0);return unit==='USDT'?`${v.toLocaleString('id-ID',{maximumFractionDigits:6})} USDT`:`${v.toLocaleString('id-ID',{maximumFractionDigits:6})}${unit?' '+unit:''}`;}
function freshOptionLabel(key,value,presentation={}){const labels={product:'Produk',variant:'Paket',plan:'Paket',login:'Login',duration:'Durasi',mode:'Mode',domain:'Domain',auto_renew:'Auto Renew',auto_renew_duration:'Durasi Auto Renew'};let v=value;if(key==='mode'&&presentation?.mode_labels?.[String(value)])v=presentation.mode_labels[String(value)];else if(key==='duration'||key==='auto_renew_duration')v=`${value} Hari`;else if(typeof value==='boolean')v=value?'Ya':'Tidak';else v=String(value).replace(/[_-]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase());return`${labels[key]||String(key).replace(/_/g,' ')}: ${v}`;}
function freshOptionKey(value={}){const walk=v=>Array.isArray(v)?v.map(walk):(v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,walk(v[k])])):v);return JSON.stringify(walk(value&&typeof value==='object'?value:{}));}
function freshPriceMatrixHtml(r,{editable=false}={}){
  const rows=Array.isArray(r.price_options)?r.price_options:[];
  if(!rows.length)return`<div class="empty compact">Rincian harga API belum tersedia. Tekan Refresh Fresh.</div>`;
  const prodResPrice=Number(r.reseller_price||0);
  return`<div class="fresh-price-grid ${editable?'editable':''}">${rows.map((x,i)=>{
    const opts=Object.entries(x.options||{}).filter(([k])=>!['accounts','accounts_token','password','domain','name','order_id','suffix_digits'].includes(k)).map(([k,v])=>freshOptionLabel(k,v,r.presentation||{})).join(' · ')||'Harga dasar';
    const override=x.override_price===null||x.override_price===undefined?'':Number(x.override_price);
    const resOverride=x.reseller_override_price===null||x.reseller_override_price===undefined?'':Number(x.reseller_override_price);
    const resBase=Number(x.reseller_price||prodResPrice||0);
    const apiPrice=Number(x.api_unit_price||0);
    const defaultSell=override!==''?override:Number(x.sell_price||Math.round(apiPrice*1.25));
    const defaultRes=resOverride!==''?resOverride:(resBase>0?resBase:defaultSell);
    return`<div class="fresh-price-card ${editable?'fresh-price-edit-card':''}"><span>#${i+1}</span><div class="fresh-price-main"><b>${esc(opts)}</b><small>Modal API Jaspay: <b>${money(apiPrice)}</b> · Jual: <b>${money(x.sell_price)}</b> · Modal Reseller: <b>${money(resBase>0?resBase:x.sell_price)}</b>${resOverride!==''?' (Khusus)':''}</small>${editable?`<div class="fresh-price-input-row"><label class="fresh-price-input"><em>🏷️ Harga Jual Owner (Customer)</em><input name="price_override_${i}" type="number" min="0" step="any" value="${esc(override)}" placeholder="Saat ini: ${money(defaultSell)}"><input type="hidden" name="price_key_${i}" value="${esc(x.price_key||'')}"></label><label class="fresh-price-input"><em>🤝 Harga Modal Reseller</em><input name="reseller_price_override_${i}" type="number" min="0" step="any" value="${esc(resOverride)}" placeholder="Saat ini: ${money(defaultRes)}"></label></div>`:''}</div></div>`;
  }).join('')}</div>`;
}
function freshPriceRange(r){const min=Number(r.api_price_min??r.api_unit_price??0),max=Number(r.api_price_max??r.api_unit_price??0);return min===max?money(min):`${money(min)} – ${money(max)}`;}
async function loadSupplierCatalog(source,force=false){if(!source)return[];state.cache.supplierCatalogs=state.cache.supplierCatalogs||{};if(!force&&Array.isArray(state.cache.supplierCatalogs[source]))return state.cache.supplierCatalogs[source];const r=await api(`/api/admin/integrations/supplier-products?source=${encodeURIComponent(source)}${force?'&force=1':''}`);state.cache.supplierCatalogs[source]=r.items||[];return state.cache.supplierCatalogs[source];}
async function api(path,options={}){const url='/api/gateway?path='+encodeURIComponent(path);const headers={...(options.headers||{})};if(state.token)headers.authorization='Bearer '+state.token;if(options.body&&typeof options.body!=='string'&&!(options.body instanceof Blob)){headers['content-type']='application/json';options.body=JSON.stringify(options.body)}const res=await fetch(url,{...options,headers});if(options.raw){if(!res.ok)throw new Error(`HTTP ${res.status}`);return res}const ct=res.headers.get('content-type')||'';const data=ct.includes('json')?await res.json():{ok:res.ok,message:await res.text()};if(res.status===401){logout(false);throw new Error('Sesi berakhir. Silakan login kembali.')}if(!res.ok||data.ok===false)throw new Error(data.message||data.error||`HTTP ${res.status}`);return data}
async function remove(url,confirmText,callback){if(confirmText&&!confirm(confirmText))return;try{await api(url,{method:'DELETE'});toast('Berhasil dihapus');if(typeof callback==='function')await callback();}catch(err){toast(err.message||'Gagal menghapus',true);}}
function notificationIcon(level){return level==='bad'?'⛔':level==='warn'?'⚠️':level==='ok'?'✅':'ℹ️';}
function renderNotifications(data={}){
  const items=Array.isArray(data.items)?data.items:[];state.notifications=items;const unread=Number(data.unread||0),count=$('#notifCount'),list=$('#notificationList'),summary=$('#notificationSummary');
  if(count){count.textContent=unread>99?'99+':String(unread);count.classList.toggle('hidden',unread<1)}
  if(summary)summary.textContent=unread?`${unread} belum dibaca · ${items.length} aktif`:items.length?`${items.length} notifikasi aktif · semua dibaca`:'Tidak ada notifikasi aktif';
  if(list)list.innerHTML=items.length?items.map(x=>`<button class="notification-item ${esc(x.level||'info')} ${x.read_at?'read':'unread'}" data-notif-key="${esc(x.key)}" data-notif-view="${esc(x.target_view||'dashboard')}"><span class="notification-icon">${notificationIcon(x.level)}</span><span class="notification-copy"><b>${esc(x.title||'Notifikasi')}</b><small>${esc(x.message||'')}</small><em>${date(x.updated_at)}</em></span>${x.read_at?'':'<i class="notification-unread-dot"></i>'}</button>`).join(''):'<div class="notification-empty">✅ Tidak ada notifikasi aktif.</div>';
}
async function refreshNotifications(silent=true){if(!state.token)return;try{const r=await api('/api/admin/notifications');renderNotifications(r)}catch(e){if(!silent)toast(e.message,true)}}
function closeNotifications(){const p=$('#notificationPanel');if(p)p.classList.add('hidden');$('#notifBtn')?.setAttribute('aria-expanded','false')}
function toggleNotifications(){const p=$('#notificationPanel');if(!p)return;const open=p.classList.contains('hidden');p.classList.toggle('hidden',!open);$('#notifBtn')?.setAttribute('aria-expanded',open?'true':'false');if(open)refreshNotifications(false)}
function showLogin(){$('#loginView').classList.remove('hidden');$('#appView').classList.add('hidden')}function showApp(){$('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden')}function logout(show=true){state.token='';sessionStorage.removeItem('ilink_owner_token');localStorage.removeItem('ilink_owner_token');if(state.notificationTimer){clearInterval(state.notificationTimer);state.notificationTimer=null}closeNotifications();showLogin();if(show)toast('Sesi ditutup')}
$('#loginForm').onsubmit=async e=>{e.preventDefault();$('#loginError').textContent='';try{const r=await api('/api/admin/auth/login',{method:'POST',body:{username:$('#loginUsername').value,password:$('#loginPassword').value}});state.token=r.token;sessionStorage.setItem('ilink_owner_token',r.token);localStorage.setItem('ilink_owner_token',r.token);$('#loginPassword').value='';await initialize()}catch(err){$('#loginError').textContent=err.message}};$('#logoutBtn').onclick=()=>logout();$('#refreshBtn').onclick=()=>navigate(state.view,true);$('#notifBtn').onclick=e=>{e.stopPropagation();toggleNotifications()};$('#notificationPanel').onclick=e=>e.stopPropagation();$('#notifMarkAll').onclick=async()=>{try{const r=await api('/api/admin/notifications/read',{method:'POST',body:{all:true}});renderNotifications(r);toast('Semua notifikasi ditandai dibaca')}catch(e){toast(e.message,true)}};$('#notificationList').onclick=async e=>{const b=e.target.closest('[data-notif-key]');if(!b)return;try{const r=await api('/api/admin/notifications/read',{method:'POST',body:{keys:[b.dataset.notifKey]}});renderNotifications(r)}catch{}closeNotifications();if(b.dataset.notifView){const parts=b.dataset.notifView.split(':');if(parts[0]==='settings'&&parts[1]){state.settingsTab=parts[1];navigate('settings');}else{navigate(b.dataset.notifView);}}};document.addEventListener('click',closeNotifications);function closeSidebar(){$('#sidebar').classList.remove('open');$('#sidebarBackdrop')?.classList.remove('show');$('#menuBtn')?.setAttribute('aria-expanded','false')}$('#menuBtn').onclick=e=>{e.stopPropagation();const open=$('#sidebar').classList.toggle('open');$('#sidebarBackdrop')?.classList.toggle('show',open);$('#menuBtn').setAttribute('aria-expanded',open?'true':'false')};$('#sidebarBackdrop').onclick=closeSidebar;document.addEventListener('click',e=>{const side=$('#sidebar'),menu=$('#menuBtn');if(side?.classList.contains('open')&&!side.contains(e.target)&&!menu?.contains(e.target))closeSidebar()});$('#nav').onclick=e=>{const b=e.target.closest('[data-view]');if(b){closeSidebar();navigate(b.dataset.view)}};
function setHeader(view){const[t,s]=titles[view]||[view,''];$('#pageTitle').textContent=t;$('#pageSubtitle').textContent=s;$$('#nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view))}
async function initialize(){state.me=(await api('/api/admin/me')).user;showApp();await navigate('dashboard');await refreshNotifications();if(!state.notificationTimer)state.notificationTimer=setInterval(()=>refreshNotifications(true),60000)}
async function vpsRenewalInfo(settings = {}) {
  const vd = String(settings.vps_renewal_date || '').trim();
  const provider = String(settings.vps_provider_name || 'VPS Server').trim() || 'VPS Server';
  const cost = Number(settings.vps_cost || 0);
  const enabled = settings.vps_reminder_enabled !== false;
  if (!vd) {
    return {
      configured: false,
      provider,
      cost,
      enabled,
      date: '',
      daysLeft: null,
      badgeHtml: '<span class="badge bad">Belum Diatur</span>',
      text: 'Tanggal jatuh tempo belum diatur. Klik Atur VPS untuk mencatat.',
      urgent: false
    };
  }
  const parts = vd.split('-');
  const due = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  let badgeHtml = '';
  let text = '';
  let urgent = false;
  if (d < 0) {
    urgent = true;
    badgeHtml = `<span class="badge bad">Lewat ${Math.abs(d)} hari</span>`;
    text = `Jatuh tempo terlewat ${Math.abs(d)} hari lalu (${vd})! Segera perpanjang agar bot tetap aktif.`;
  } else if (d === 0) {
    urgent = true;
    badgeHtml = `<span class="badge bad">🚨 Jatuh Tempo Hari Ini</span>`;
    text = `Jatuh tempo HARI INI (${vd})! Segera lakukan perpanjangan server VPS.`;
  } else if (d <= 3) {
    urgent = true;
    badgeHtml = `<span class="badge bad">⏳ Sisa ${d} hari</span>`;
    text = `Jatuh tempo tinggal ${d} hari lagi (${vd}). Segera siapkan perpanjangan.`;
  } else if (d <= 7) {
    urgent = true;
    badgeHtml = `<span class="badge warn">⚠️ Sisa ${d} hari</span>`;
    text = `Jatuh tempo dalam ${d} hari (${vd}).`;
  } else {
    badgeHtml = `<span class="badge ok">✅ Sisa ${d} hari</span>`;
    text = `Jatuh tempo berikutnya: ${vd} (${d} hari lagi).`;
  }
  return {
    configured: true,
    provider,
    cost,
    enabled,
    date: vd,
    daysLeft: d,
    badgeHtml,
    text,
    urgent
  };
}
function navigate(view){
  if(view&&typeof view==='string'&&view.startsWith('settings:')){state.settingsTab=view.split(':')[1];view='settings';}if(state.broadcastPollTimer){clearInterval(state.broadcastPollTimer);state.broadcastPollTimer=null;}state.view=view;closeNotifications();setHeader(view);$('#content').innerHTML='<div class="empty-product">Memuat data...</div>';try{await({dashboard:loadDashboard,products:loadProducts,fresh:loadFresh,orders:loadOrders,invitations:loadInvitations,promotions:loadPromotions,reports:loadReports,coupons:loadCoupons,settings:loadSettings,bot:loadBot,broadcast:loadBroadcast,users:loadUsers,resellers:loadResellers}[view]||loadDashboard)();$('#lastUpdated').textContent='Terakhir diperbarui: '+new Date().toLocaleString('id-ID');refreshNotifications(true)}catch(e){$('#content').innerHTML=`<div class="empty-product">${esc(e.message)}</div>`;toast(e.message,true)}}
function applyShell(r){const s=r.settings||{};const o=r.stats||{};state.overview=r;$('#brandName').innerHTML=esc(String(s.store_name||'AUTO ORDER')).replace(/\s+/g,'<br>');$('#brandTagline').textContent=s.store_tagline||'Digital Store';$('#ownerName').textContent=s.owner_display_name||state.me?.display_name||'Owner';$('#ownerUsername').textContent='@'+String(s.owner_username||state.me?.owner_username||'owneradmin').replace(/^@/,'');const metric=String(s.store_balance_metric||o.store_balance_metric||'month_profit');const metricMap={month_profit:['Profit Bulan Ini',o.month_profit],month_revenue:['Omzet Bulan Ini',o.month_revenue],today_profit:['Profit Hari Ini',o.today_profit],today_revenue:['Omzet Hari Ini',o.today_revenue],manual:['Saldo Manual',s.store_balance??o.store_balance]};const selected=metricMap[metric]||metricMap.month_profit;$('#storeBalanceLabel').textContent=selected[0];$('#storeBalance').textContent=money(selected[1]||0);const badgeEl=$('#orderBadge');const pending=Number(o.pending_orders||0);badgeEl.textContent=pending;badgeEl.classList.toggle('hidden',pending<1);const resBadgeEl=$('#resellerBadge');if(resBadgeEl){api('/api/admin/resellers/overview').then(ro=>{const pWd=Number(ro?.stats?.pending_withdrawals||0);const pRes=Number(ro?.stats?.pending_resellers||0);const pTotal=pWd+pRes;resBadgeEl.textContent=pTotal;resBadgeEl.classList.toggle('hidden',pTotal<1);}).catch(()=>null);}const username=state.overview?.bot?.username;$('#telegramBtn').href=username?`https://t.me/${username}`:'#';$('#telegramBtn').textContent='✈ Telegram Mini App';$('#systemSafe').textContent=state.overview?.bot?.running?'Semua sistem berjalan dengan aman':'Dashboard aktif · Bot Telegram offline'}
function stat(icon,color,label,value,small){return`<div class="stat-card"><div class="stat-icon ${color}">${icon}</div><div><small>${esc(label)}</small><strong>${esc(value)}</strong><em>${esc(small)}</em></div></div>`}
function productStockState(p={}){const all=Array.isArray(p.variants)?p.variants:[],vars=all.filter(v=>v.active);if(all.length){if(vars.some(v=>v.delivery_mode!=='preorder'&&Number(v.stock||0)>0))return'ready';if(vars.some(v=>v.delivery_mode==='preorder'))return'preorder';return'empty'}if(p.delivery_mode==='preorder'&&Number(p.stock||0)<1)return'preorder';return Number(p.sale_stock??p.stock??0)>0?'ready':'empty'}
function stockStateLabel(state,stock=0){return state==='ready'?`READY · ${Number(stock||0)}`:state==='preorder'?'PRE-ORDER':'HABIS'}
function variantChip(v={}){const st=v.delivery_mode==='preorder'?'preorder':Number(v.stock||0)>0?'ready':'empty';const label=st==='ready'?`Ready ${Number(v.stock||0)}`:st==='preorder'?'PO':'Habis';const resOff=v.reseller_allowed===0;return`<span class="variant-chip stock-${st}" title="${esc(v.name)} · ${label}${resOff?' · Reseller OFF':''}">${esc(v.name)} · ${label}${resOff?' (No Resell)':''}${v.require_email?' · 📧':''}</span>`}
function productCard(p,i=0){
  const vars=(p.variants||[]).filter(v=>v.active);
  const chips=vars.slice(0,3).map(variantChip).join('')+(vars.length>3?`<span class="variant-chip muted">+${vars.length-3} VARIAN</span>`:'');
  const allVariants=Array.isArray(p.variants)?p.variants:[];const price=allVariants.length&&!vars.length?'Tidak ada varian aktif':p.price_min===p.price_max?money(p.price_min):`${money(p.price_min)} - ${money(p.price_max)}`;
  const icon=['💎','🤖','🎨','🎬','🛍️'][i%5];
  const thumb=`<span class="thumb-fallback">${icon}</span>${p.image_url?`<img src="${esc(mediaSrc(p.image_url))}" alt="${esc(p.name||'Produk')}" loading="lazy" onerror="this.remove()">`:''}`;
  const stockState=productStockState(p),stockNumber=Number(p.sale_stock??p.stock??0),stockText=stockStateLabel(stockState,stockNumber),hasLocalStockTarget=allVariants.length?allVariants.some(v=>!v.supplier_source):!p.supplier_source;
  const resAllowed=p.reseller_allowed!==0;
  const resPriceTxt=!allVariants.length&&Number(p.reseller_price||0)>0?` · Modal Reseller ${money(p.reseller_price)}`:'';
  const resellerChip=`<span class="variant-chip ${resAllowed?'stock-ready':'stock-empty'}">${resAllowed?'Reseller ON':'Reseller OFF'}${resPriceTxt}</span>`;
  const defaultChipLabel=p.supplier_source?`${String(p.supplier_source).toUpperCase()} · ${stockState==='ready'?`Ready ${stockNumber}`:stockState==='preorder'?'PO':'Habis'}`:`DEFAULT · ${stockState==='ready'?`Ready ${stockNumber}`:stockState==='preorder'?'PO':'Habis'}`;const variantSummary=allVariants.length?((chips||'<span class="variant-chip muted">Tidak ada varian aktif</span>')+` ${resellerChip}`):`<span class="variant-chip stock-${stockState}">${esc(defaultChipLabel)}</span> ${resellerChip}`;
  return `<article class="product-card stock-${stockState}" data-product-card="${p.id}">
    <span class="product-index">${String(i+1).padStart(2,'0')}</span>
    <div class="product-thumb">${thumb}</div>
    <div class="product-body">
      <div class="product-head"><div class="product-title"><h3>${esc(p.name)}</h3><p>${esc(p.subtitle||p.category||'Produk Digital')}</p>${p.tag?`<span class="tag-chip"># ${esc(String(p.tag).replace(/^#/,'').toUpperCase())}</span>`:''}${p.require_email?`<span class="tag-chip" style="background:#e0e7ff;color:#3730a3;border-color:#6366f1">📧 BUTUH EMAIL</span>`:''}${!resAllowed?'<span class="tag-chip" style="background:#fee2e2;color:#b91c1c;border-color:#b91c1c"># KHUSUS OWNER</span>':''}</div><div class="product-head-actions"><span class="stock-state-pill ${stockState}">${stockText}</span><button class="toggle ${p.active?'':'off'}" data-toggle-product="${p.id}" data-active="${p.active?1:0}">${p.active?'ON':'OFF'}</button></div></div>
      <div class="product-info"><div class="info-box stock-box ${stockState}"><small>📦 Stok</small><strong>${stockState==='preorder'?'PO':stockNumber}</strong><em>${stockState==='ready'?'Ready stok':stockState==='preorder'?'Pre-order':'Stok habis'}</em></div><div class="info-box price"><small>🏷 Harga</small><strong>${price}</strong>${bulkTiers(p.bulk_prices).length?`<em>Bulk mulai ${bulkTiers(p.bulk_prices)[0].min_qty} pcs</em>`:''}</div></div>
      <div class="variant-row">${variantSummary}</div>
      <div class="product-actions"><button class="neo-btn blue small" data-edit-product="${p.id}">✎ EDIT</button>${p.supplier_source?`<button class="neo-btn green small" data-sync-product-supplier-card="${p.id}">↻ SYNC SUPPLIER</button>`:hasLocalStockTarget?`<button class="neo-btn green small" data-stock-product="${p.id}">📦 STOK</button><button class="neo-btn yellow small" data-manage-product="${p.id}">⚙ KELOLA</button>`:''}<button class="neo-btn red small" data-delete-product="${p.id}">🗑 HAPUS</button></div>
    </div>
  </article>`;
}

async function loadDashboard(){
  const [overview,dash]=await Promise.all([api('/api/admin/overview'),api('/api/admin/dashboard')]);
  applyShell(overview);
  const d=dash.data||{},t=d.today||{},daily=d.last7||[],top=d.top_products||[];
  const max=Math.max(1,...daily.map(x=>Number(x.revenue||0)));
  const vps=vpsRenewalInfo(overview.settings||state.cache.settings||{});
  $('#content').innerHTML=`
    <div class="dashboard-kpis">
      ${stat('📈','pink','Omset Hari Ini',money(t.revenue),'Penjualan selesai hari ini')}
      ${stat('💵','green','Profit Hari Ini',money(t.profit),'Profit bersih hari ini')}
      ${stat('🛒','purple','Total Order',t.orders||0,'Order hari ini')}
      ${stat('📦','yellow','Total Stok',d.total_stock||0,'Stok siap kirim')}
    </div>
    <div class="vps-dashboard-card report-card" style="margin-top:14px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;background:var(--card-bg,#fff);border:2px solid var(--ink);border-radius:14px;box-shadow:3px 3px 0 var(--ink)">
      <div style="display:flex;align-items:center;gap:12px;min-width:240px">
        <div style="font-size:26px;line-height:1;width:44px;height:44px;display:grid;place-items:center;background:#f0eaff;border:2px solid var(--ink);border-radius:10px;flex-shrink:0">🖥️</div>
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <b style="font-size:15px">Pengingat VPS: ${esc(vps.provider)}</b>
            ${vps.badgeHtml}
          </div>
          <small style="display:block;margin-top:3px;color:var(--muted);font-size:12px">
            ${esc(vps.text)} · Biaya: <b>${vps.cost ? money(vps.cost) : 'Rp 0'}</b> · Pengingat Telegram: <b>${vps.enabled ? 'Aktif' : 'Nonaktif'}</b>
          </small>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button type="button" class="neo-btn white small" id="dashOpenVpsBtn">⚙️ Atur VPS</button>
        <button type="button" class="neo-btn yellow small" id="dashRenewVpsBtn">✅ +30 Hari</button>
      </div>
    </div>
    <div class="dashboard-grid" style="margin-top:14px">
      <section class="report-card chart-card"><div class="card-heading"><div><h3>📊 Grafik 7 Hari Terakhir</h3></div></div><div class="seven-chart">${daily.map(x=>{const h=Math.max(5,Math.round(Number(x.revenue||0)/max*100));const lbl=new Date(x.day+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short'});return `<div class="day-col"><div class="day-value">${Number(x.revenue||0)?money(x.revenue):'Rp 0'}</div><div class="day-track"><div class="day-bar" style="height:${h}%"></div></div><div class="day-label">${esc(lbl)}</div></div>`}).join('')}</div></section>
      <section class="report-card top-products-card"><div class="card-heading"><div><h3>🏆 Produk Terlaris</h3><p>Berdasarkan jumlah item 7 hari terakhir</p></div></div><div class="top-list">${top.length?top.map((x,i)=>`<div class="top-item"><span class="rank">${i+1}</span><div><b>${esc(x.product_name||'-')}</b><small>${x.qty||0} item · ${x.orders||0} order</small></div><strong>${money(x.revenue)}</strong></div>`).join(''):'<div class="empty compact">Belum ada transaksi 7 hari terakhir.</div>'}</div></section>
    </div>`;
  if($('#dashOpenVpsBtn'))$('#dashOpenVpsBtn').onclick=()=>{state.settingsTab='vps';navigate('settings');};
  if($('#dashRenewVpsBtn'))$('#dashRenewVpsBtn').onclick=async()=>{
    try{
      const res=await api('/api/admin/system/vps-renew-30',{method:'POST'});
      if(state.cache.settings)state.cache.settings.vps_renewal_date=res.vps_renewal_date;
      if(state.overview?.settings)state.overview.settings.vps_renewal_date=res.vps_renewal_date;
      toast(res.message||'Jatuh tempo VPS berhasil diperpanjang +30 hari!');
      loadDashboard();
    }catch(err){toast(err.message,true);}
  };
}
function categories(rows){return[...new Set(rows.map(x=>x.category).filter(Boolean))].sort().map(x=>`<option>${esc(x)}</option>`).join('')}function renderProductCards(rows){return rows.length?rows.map(productCard).join(''):'<div class="empty-product"><h3>Belum ada produk</h3><p>Tekan Tambah Produk untuk membuat katalog pertama.</p></div>'}async function loadProducts(){
  const r=await api('/api/admin/products?limit=500');state.cache.products=r.items||[];
  $('#content').innerHTML=`<div class="section-title product-section-title"><div><h2>📦 Katalog Produk</h2><p>Tambah dan edit produk hingga ke varian, deskripsi, dan SNK.</p></div><span style="display:flex;gap:8px;flex-wrap:wrap"><button id="gotoPromotions" class="neo-btn green">📢 Buat Promosi Stok Ready</button><button id="addProduct" class="neo-btn purple">＋ Tambah Produk</button></span></div>
  <div class="toolbar product-toolbar"><div class="searchbox"><input id="productSearch" placeholder="Cari produk..."></div><select id="productCategory"><option value="">Semua Kategori</option>${categories(state.cache.products)}</select><select id="productStatus"><option value="">Semua Status</option><option value="1">Aktif</option><option value="0">Nonaktif</option></select></div>
  <div id="productGrid" class="product-grid">${renderProductCards(state.cache.products)}</div>`;
  $('#addProduct').onclick=()=>openProduct();
  $('#gotoPromotions').onclick=()=>navigate('promotions');
  const filter=()=>{const q=($('#productSearch')?.value||'').toLowerCase().trim(),cat=$('#productCategory')?.value||'',st=$('#productStatus')?.value||'';const rows=state.cache.products.filter(p=>(!q||[p.name,p.code,p.category,p.tag].some(x=>String(x||'').toLowerCase().includes(q)))&&(!cat||p.category===cat)&&(!st||String(p.active)===st));$('#productGrid').innerHTML=renderProductCards(rows);bindProductActions()};
  $('#productSearch').oninput=filter;$('#productCategory').onchange=filter;$('#productStatus').onchange=filter;bindProductActions();
}
function bindProductActions(){$$('[data-edit-product]').forEach(b=>b.onclick=()=>openProduct(findProduct(b.dataset.editProduct)));$$('[data-stock-product]').forEach(b=>b.onclick=()=>openStock(findProduct(b.dataset.stockProduct)));$$('[data-manage-product]').forEach(b=>b.onclick=()=>openManageProduct(findProduct(b.dataset.manageProduct)));$$('[data-sync-product-supplier-card]').forEach(b=>b.onclick=async()=>{const old=b.textContent;try{b.disabled=true;b.textContent='Menyinkronkan...';await api(`/api/admin/products/${b.dataset.syncProductSupplierCard}/supplier-sync`,{method:'POST',body:{}});toast('Stok dan harga supplier diperbarui');await reloadProducts(b.dataset.syncProductSupplierCard)}catch(e){toast(e.message,true)}finally{b.disabled=false;b.textContent=old}});$$('[data-delete-product]').forEach(b=>b.onclick=()=>remove(`/api/admin/products/${b.dataset.deleteProduct}`,'Hapus produk beserta varian dan stoknya?',()=>reloadProducts()));$$('[data-toggle-product]').forEach(b=>b.onclick=async()=>{try{await api(`/api/admin/products/${b.dataset.toggleProduct}/toggle`,{method:'POST',body:{active:b.dataset.active!=='1'}});toast('Status produk diperbarui');await reloadProducts(b.dataset.toggleProduct)}catch(e){toast(e.message,true)}})}function findProduct(id){return(state.cache.products||[]).find(x=>String(x.id)===String(id))||{}}
async function reloadProducts(targetProductId=null){
  const grid=$('#productGrid');
  if(!grid||state.view!=='products'){return navigate(state.view)}
  const scrollY=window.scrollY;
  const searchVal=$('#productSearch')?.value||'';
  const catVal=$('#productCategory')?.value||'';
  const statusVal=$('#productStatus')?.value||'';
  const r=await api('/api/admin/products?limit=500');
  state.cache.products=r.items||[];
  const catSelect=$('#productCategory');
  if(catSelect){const cur=catVal;catSelect.innerHTML=`<option value="">Semua Kategori</option>${categories(state.cache.products)}`;catSelect.value=cur;}
  const q=searchVal.toLowerCase().trim();
  const rows=state.cache.products.filter(p=>(!q||[p.name,p.code,p.category,p.tag].some(x=>String(x||'').toLowerCase().includes(q)))&&(!catVal||p.category===catVal)&&(!statusVal||String(p.active)===statusVal));
  grid.innerHTML=renderProductCards(rows);
  bindProductActions();
  if(targetProductId){
    const targetCard=$(`[data-product-card="${targetProductId}"]`);
    if(targetCard)targetCard.scrollIntoView({behavior:'smooth',block:'nearest'});
    else window.scrollTo({top:scrollY,behavior:'instant'});
  }else{
    window.scrollTo({top:scrollY,behavior:'instant'});
  }
}
async function loadOrders(preserveScroll=false,targetOrderId=null){
  const scrollY=preserveScroll?window.scrollY:0;
  const currentSearch=$('#orderSearch')?.value||'';
  const currentStatus=$('#orderStatus')?.value||'';
  const existingCards=$('#orderCards');
  const [r,p]=await Promise.all([api('/api/admin/orders?limit=500'),api('/api/admin/products?limit=500')]);
  state.cache.orders=r.items||[];state.cache.products=p.items||[];
  if(!existingCards){
    $('#content').innerHTML=`<div class="toolbar order-toolbar"><div class="searchbox"><input id="orderSearch" placeholder="Cari invoice, user, produk..."></div><select id="orderStatus"><option value="">Semua Status</option>${['pending_payment','paid','fresh_processing','fresh_attention','completed','waiting_delivery','supplier_pending','failed','canceled','expired'].map(s=>`<option>${s}</option>`).join('')}</select><button id="addOrder" class="neo-btn purple">＋ Pesanan Manual</button></div><div id="orderCards" class="order-list">${orderCards(state.cache.orders)}</div>`;
    $('#orderSearch').oninput=filterOrders;$('#orderStatus').onchange=filterOrders;$('#addOrder').onclick=()=>openManualOrder();
  }else{
    if(currentSearch&&$('#orderSearch'))$('#orderSearch').value=currentSearch;
    if(currentStatus&&$('#orderStatus'))$('#orderStatus').value=currentStatus;
  }
  filterOrders();
  if(preserveScroll){
    window.scrollTo({top:scrollY,behavior:'instant'});
    if(targetOrderId){
      const el=$(`[data-detail-order="${targetOrderId}"],[data-edit-order="${targetOrderId}"]`);
      if(el)el.closest('.order-card')?.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
  }
}
function orderCards(rows){return rows.length?rows.map(o=>{
  const isWaitingEmail=o.status==='paid'&&o.require_email&&!o.customer_email;
  const statusBadge=isWaitingEmail?'<span class="badge yellow" style="font-weight:700">⏳ Menunggu Email</span>':badge(o.status);
  const emailRow=o.customer_email?`<div><small>📧 Email Pembeli</small><strong class="mono" style="color:var(--purple);font-size:12px">${esc(o.customer_email)}</strong></div>`:(o.require_email?`<div><small>📧 Email Pembeli</small><span style="color:#b45309;font-weight:700;font-size:11px">⏳ Menunggu input</span></div>`:'');
  return `<article class="order-card" data-order-card="${o.id}">
  <div class="order-head"><div><small>Invoice</small><b class="mono">${esc(o.order_ref)}</b></div>${statusBadge}</div>
  <div class="order-grid">
    <div><small>Pembeli</small><strong>${esc(o.buyer_name||'-')}</strong><span>${esc(o.telegram_id||'-')}</span></div>
    <div><small>Produk</small><strong>${esc(o.product_name||'-')}</strong><span>${esc(o.variant_name||'Default')}</span></div>
    ${emailRow}
    <div><small>Qty</small><strong>${o.quantity||0}</strong></div>
    <div><small>Total</small><strong>${money(o.total_price)}</strong></div>
    <div><small>Profit</small><strong>${money(o.profit_amount)}</strong></div>
    <div><small>Metode Bayar</small><strong>${esc(o.payment_channel||o.payment_method||'-')}</strong><span>${esc(o.payment_method||'-')}</span></div><div><small>Status Bayar</small><strong>${esc(o.payment_status||(o.paid_at?'paid':(['completed','waiting_delivery','paid'].includes(o.status)?'paid':'-')))}</strong><span>${o.payment_amount!=null?money(o.payment_amount):''}</span></div><div class="wide"><small>Ref Pembayaran</small><strong class="mono">${esc(o.payment_reference||'-')}</strong></div>
    <div class="wide"><small>Waktu</small><strong>${date(o.created_at)}</strong></div>
  </div>
  <div class="order-actions"><button class="neo-btn blue small" data-detail-order="${o.id}">Detail</button>${o.status==='waiting_delivery'?`<button class="neo-btn green small" data-fulfill-order="${o.id}">Kirim Produk</button>`:''}<button class="neo-btn yellow small" data-edit-order="${o.id}">Edit</button><button class="neo-btn red small" data-delete-order="${o.id}">Hapus</button></div>
</article>`;
}).join(''):'<div class="empty-product">Belum ada pesanan.</div>'}
function filterOrders(){const q=($('#orderSearch')?.value||'').toLowerCase().trim(),st=$('#orderStatus')?.value||'';const rows=state.cache.orders.filter(o=>(!q||[o.order_ref,o.telegram_id,o.buyer_name,o.product_name,o.variant_name,o.customer_email].some(x=>String(x||'').toLowerCase().includes(q)))&&(!st||o.status===st));$('#orderCards').innerHTML=orderCards(rows);bindOrderActions()}
function bindOrderActions(){$$('[data-detail-order]').forEach(b=>b.onclick=()=>openOrderDetail(b.dataset.detailOrder));$$('[data-edit-order]').forEach(b=>b.onclick=()=>openOrderEdit(state.cache.orders.find(x=>String(x.id)===b.dataset.editOrder)));$$('[data-fulfill-order]').forEach(b=>b.onclick=()=>openFulfill(state.cache.orders.find(x=>String(x.id)===b.dataset.fulfillOrder)));$$('[data-delete-order]').forEach(b=>b.onclick=()=>remove(`/api/admin/orders/${b.dataset.deleteOrder}`,'Hapus pesanan?',()=>loadOrders(true)))}
async function openOrderDetail(id){try{const r=await api(`/api/admin/orders/${id}/detail`),o=r.item||{},items=o.purchased_items||[];const emailDisplay=o.require_email?`<dt>Email Pembeli</dt><dd>${o.customer_email?`<b class="mono" style="color:var(--purple);font-size:13px">${esc(o.customer_email)}</b> <button type="button" class="neo-btn white tiny" style="margin-left:6px" onclick="navigator.clipboard.writeText('${esc(o.customer_email)}');toast('Email berhasil disalin')">📋 Salin</button>`:'<span style="color:#b45309;font-weight:700">⏳ Belum diisi pembeli</span>'}</dd>`:(o.customer_email?`<dt>Email Pembeli</dt><dd><b class="mono">${esc(o.customer_email)}</b> <button type="button" class="neo-btn white tiny" style="margin-left:6px" onclick="navigator.clipboard.writeText('${esc(o.customer_email)}');toast('Email berhasil disalin')">📋 Salin</button></dd>`:'');modal('Detail Pesanan · '+(o.order_ref||''),`<div class="detail-grid"><section class="detail-card"><h4>🧾 Pesanan</h4><dl><dt>Invoice</dt><dd class="mono">${esc(o.order_ref||'-')}</dd><dt>Status</dt><dd>${badge(o.status)}</dd>${emailDisplay}<dt>Waktu</dt><dd>${date(o.created_at)}</dd><dt>Pembeli</dt><dd>${esc(o.buyer_name||'-')}<br><span class="mono">${esc(o.telegram_id||'-')}</span></dd></dl></section><section class="detail-card"><h4>📦 Produk Dibeli</h4><dl><dt>Produk</dt><dd>${esc(o.product_name||'-')}</dd><dt>Varian</dt><dd>${esc(o.variant_name||'Default')}</dd><dt>Qty</dt><dd>${Number(o.quantity||0)}</dd><dt>Harga</dt><dd>${money(o.unit_price)} / item</dd><dt>Total</dt><dd>${money(o.total_price)}</dd><dt>Profit</dt><dd>${money(o.profit_amount)}</dd></dl></section><section class="detail-card full"><h4>🔐 Produk / Stok yang Dikirim</h4>${items.length?`<div class="purchased-items">${items.map((x,i)=>`<div class="purchased-item"><span>#${i+1}</span><code>${esc(x.value)}</code>${badge(x.status)}</div>`).join('')}</div>`:o.delivery_text?`<pre class="delivery-box">${esc(o.delivery_text)}</pre>`:'<p class="muted">Belum ada data produk yang dikirim.</p>'}${o.note?`<div class="detail-note"><b>Catatan</b><p>${esc(o.note)}</p></div>`:''}</section></div>`,async()=>{}, {hideSubmit:true})}catch(e){toast(e.message,true)}}

// ==========================================
// LIST EMAIL PEMBELI & SESI UNDANGAN TIM
// ==========================================

async function loadInvitations(preserveScroll = false) {
  const scrollY = preserveScroll ? window.scrollY : 0;
  try {
    const res = await api('/api/admin/buyer-emails?limit=1000');
    state.invitationsData = res || { items: [], sessions: [] };
    state.selectedEmailIds = state.selectedEmailIds || new Set();
    renderInvitationsView();
    if (preserveScroll) window.scrollTo({ top: scrollY, behavior: 'instant' });
  } catch (e) {
    $('#content').innerHTML = `<div class="empty-product"><h3>Gagal memuat data undangan tim</h3><p>${esc(e.message)}</p></div>`;
    toast(e.message, true);
  }
}

function renderInvitationsView() {
  const data = state.invitationsData || { items: [], sessions: [] };
  const items = data.items || [];
  const sessions = data.sessions || [];
  const activeTab = state.invitationTab || 'emails';

  const kpis = `
    <div class="invitation-kpis">
      ${stat('📧', 'purple', 'Total Email Pembeli', `${data.totalEmails || items.length}`, 'Terinput otomatis dari checkout bot')}
      ${stat('⏳', (data.unassignedCount || 0) > 0 ? 'yellow' : 'green', 'Belum Masuk Sesi Tim', `${data.unassignedCount || 0} Email`, (data.unassignedCount || 0) > 0 ? 'Siap dimasukkan ke sesi tim' : 'Semua email telah masuk sesi')}
      ${stat('👥', 'blue', 'Sesi Undangan Tim', `${sessions.length} Sesi`, `${data.assignedCount || 0} email aktif di sesi`)}
    </div>
  `;

  const tabs = `
    <div class="section-title product-section-title" style="margin-bottom:14px">
      <div class="tabs">
        <button class="tab-btn ${activeTab === 'emails' ? 'active' : ''}" data-inv-tab="emails">📧 List Email Pembeli (${items.length})</button>
        <button class="tab-btn ${activeTab === 'sessions' ? 'active' : ''}" data-inv-tab="sessions">👥 Sesi Undangan Tim (${sessions.length})</button>
      </div>
      <span>
        <button type="button" class="neo-btn purple" id="createNewSessionBtn">＋ Buat Sesi Tim Baru</button>
      </span>
    </div>
  `;

  $('#content').innerHTML = `
    ${kpis}
    ${tabs}
    <div id="invitationTabBody"></div>
  `;

  $$('[data-inv-tab]').forEach(b => {
    b.onclick = () => {
      state.invitationTab = b.dataset.invTab;
      renderInvitationsView();
    };
  });

  const createBtn = $('#createNewSessionBtn');
  if (createBtn) createBtn.onclick = () => openTeamSessionModal();

  renderInvitationsTab();
}

function renderInvitationsTab() {
  const host = $('#invitationTabBody');
  if (!host) return;
  const data = state.invitationsData || { items: [], sessions: [] };
  const items = data.items || [];
  const sessions = data.sessions || [];

  if (state.invitationTab === 'sessions') {
    renderSessionsGrid(host, sessions);
  } else {
    renderBuyerEmailsList(host, items, sessions);
  }
}

function renderSessionsGrid(host, sessions = []) {
  const q = String(state.invitationSearch || '').toLowerCase().trim();
  const filtered = sessions.filter(s => {
    return !q || [s.session_name, s.product_name, s.note, s.invite_link].some(x => String(x || '').toLowerCase().includes(q));
  });

  const cardsHtml = filtered.length ? filtered.map(s => {
    const memCount = Number(s.members_count || 0);
    const maxCap = Number(s.max_capacity || 0);
    const isFull = maxCap > 0 && memCount >= maxCap;
    const pct = maxCap > 0 ? Math.min(100, Math.round((memCount / maxCap) * 100)) : (memCount > 0 ? 100 : 0);
    const capLabel = maxCap > 0 ? `${memCount} / ${maxCap} Anggota` : `${memCount} Anggota (Tanpa Batas)`;

    return `
      <article class="session-card">
        <div class="session-head">
          <div>
            <h3>${esc(s.session_name)}</h3>
            <p>${s.product_name ? `🏷️ Produk: <b>${esc(s.product_name)}</b>` : 'Produk Bebas / Undangan Umum'}</p>
          </div>
          <div>
            ${isFull ? '<span class="badge warn" style="margin-right:4px">🟡 Penuh</span>' : ''}
            ${badge(s.status)}
          </div>
        </div>

        <div class="session-progress-wrap">
          <div class="session-progress-head">
            <span>Kapasitas Tim</span>
            <span style="font-weight:950;color:${isFull ? '#b45309' : 'var(--purple)'}">${capLabel}</span>
          </div>
          <div class="session-progress-track">
            <div class="session-progress-fill ${isFull ? 'full' : ''}" style="width:${pct}%"></div>
          </div>
        </div>

        ${s.invite_link ? `
          <div class="session-link-box">
            <span class="mono" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.invite_link)}</span>
            <div style="display:flex;gap:4px">
              <button type="button" class="neo-btn white tiny" onclick="navigator.clipboard.writeText('${esc(s.invite_link)}');toast('Link undangan disalin')">📋 Salin</button>
              <a href="${esc(s.invite_link)}" target="_blank" rel="noreferrer" class="neo-btn blue tiny">🔗 Buka</a>
            </div>
          </div>
        ` : ''}

        ${s.note ? `<div style="font-size:11px;color:var(--muted);background:#faf7ff;border:1px solid #ebdfff;border-radius:8px;padding:6px 10px;"><b>Catatan:</b> ${esc(s.note)}</div>` : ''}

        <div style="font-size:10px;color:var(--muted)">Dibuat: ${date(s.created_at)}</div>

        <div class="session-actions">
          <button type="button" class="neo-btn green small" data-copy-session-emails="${s.id}" ${memCount < 1 ? 'disabled title="Belum ada email anggota"' : ''}>📋 Salin Semua Email (${memCount})</button>
          <button type="button" class="neo-btn purple small" data-view-session-members="${s.id}">👥 Anggota</button>
          <button type="button" class="neo-btn yellow small" data-edit-session="${s.id}">✎ Edit</button>
          <button type="button" class="neo-btn red small" data-delete-session="${s.id}">🗑 Hapus</button>
        </div>
      </article>
    `;
  }).join('') : '<div class="empty-product full" style="grid-column:1/-1"><h3>Belum ada sesi undangan tim</h3><p>Tekan tombol ＋ Buat Sesi Tim Baru untuk membuat sesi tim Canva, Gemini, dll.</p></div>';

  host.innerHTML = `
    <div class="toolbar product-toolbar" style="margin-bottom:14px">
      <div class="searchbox"><input id="sessionSearch" placeholder="Cari nama sesi tim, produk, link..." value="${esc(q)}"></div>
      <button type="button" class="neo-btn purple" id="createNewSessionBtn2">＋ Tambah Sesi Tim</button>
    </div>
    <div class="session-grid">${cardsHtml}</div>
  `;

  $('#sessionSearch').oninput = e => {
    state.invitationSearch = e.target.value;
    renderInvitationsTab();
  };

  const createBtn2 = $('#createNewSessionBtn2');
  if (createBtn2) createBtn2.onclick = () => openTeamSessionModal();

  $$('[data-copy-session-emails]').forEach(b => {
    b.onclick = async () => {
      const sid = b.dataset.copySessionEmails;
      try {
        const res = await api(`/api/admin/team-sessions/${sid}`);
        const session = res.item || {};
        const emails = (session.members || []).map(m => m.customer_email).filter(Boolean);
        if (!emails.length) return toast('Belum ada email pembeli di sesi ini.', true);
        openCopyEmailsModal(emails, session.session_name);
      } catch (err) {
        toast(err.message, true);
      }
    };
  });

  $$('[data-view-session-members]').forEach(b => {
    b.onclick = () => openSessionMembersModal(b.dataset.viewSessionMembers);
  });

  $$('[data-edit-session]').forEach(b => {
    b.onclick = () => {
      const sid = b.dataset.editSession;
      const session = sessions.find(x => String(x.id) === String(sid));
      openTeamSessionModal(session);
    };
  });

  $$('[data-delete-session]').forEach(b => {
    b.onclick = () => {
      const sid = b.dataset.deleteSession;
      const s = sessions.find(x => String(x.id) === String(sid));
      const sName = s?.session_name || 'ini';
      remove(`/api/admin/team-sessions/${sid}`, `Hapus sesi undangan "${sName}"?\nEmail pembeli di dalamnya akan otomatis dikembalikan ke status 'Belum Masuk Sesi' (data pesanan tetap aman).`, () => loadInvitations(true));
    };
  });
}

function renderBuyerEmailsList(host, items = [], sessions = []) {
  const q = String(state.invitationSearch || '').toLowerCase().trim();
  const stFilter = state.invitationStatus || '';
  const sessFilter = state.invitationSessionFilter || '';

  const filtered = items.filter(o => {
    const matchQ = !q || [o.customer_email, o.order_ref, o.buyer_name, o.product_name, o.variant_name, o.session_name].some(x => String(x || '').toLowerCase().includes(q));
    const isAssigned = Boolean(o.team_session_id);
    const matchSt = !stFilter || (stFilter === 'assigned' ? isAssigned : !isAssigned);
    const matchSess = !sessFilter || String(o.team_session_id) === String(sessFilter);
    return matchQ && matchSt && matchSess;
  });

  const selectedSet = state.selectedEmailIds || new Set();
  const allFilteredSelected = filtered.length > 0 && filtered.every(o => selectedSet.has(o.id));

  const sessionOptions = sessions.map(s => `<option value="${s.id}" ${String(sessFilter) === String(s.id) ? 'selected' : ''}>${esc(s.session_name)} (${s.members_count || 0})</option>`).join('');

  const bulkBar = selectedSet.size > 0 ? `
    <div style="background:#f4edff;border:2px solid var(--ink);border-radius:12px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div>
        <b style="color:var(--purple);font-size:14px">✓ ${selectedSet.size} email dipilih</b>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="neo-btn green small" id="assignSelectedBtn">➕ Masukkan ke Sesi Tim...</button>
        <button type="button" class="neo-btn white small" id="copySelectedBtn">📋 Salin Terpilih</button>
        <button type="button" class="neo-btn red small" id="clearSelectedBtn">✕ Batal Pilih</button>
      </div>
    </div>
  ` : '';

  const cardsHtml = filtered.length ? filtered.map(o => {
    const isChecked = selectedSet.has(o.id);
    const hasSession = Boolean(o.team_session_id);

    return `
      <article class="buyer-email-card">
        <div class="buyer-email-select">
          <input type="checkbox" data-select-email="${o.id}" ${isChecked ? 'checked' : ''} aria-label="Pilih ${esc(o.customer_email)}">
        </div>
        <div class="buyer-email-main">
          <strong>
            ${esc(o.customer_email)}
            <button type="button" class="neo-btn white tiny" onclick="navigator.clipboard.writeText('${esc(o.customer_email)}');toast('Email disalin')">📋 Salin</button>
          </strong>
          <small>👤 ${esc(o.buyer_name || '-')} · Invoice: <code class="mono">${esc(o.order_ref)}</code></small>
        </div>
        <div class="buyer-email-meta">
          <small>Produk Dibeli</small>
          <b>${esc(o.product_name)}</b>
          <span style="font-size:11px;color:var(--muted)">${esc(o.variant_name || 'Default')} · Qty ${o.quantity || 1}</span>
        </div>
        <div class="buyer-email-meta">
          <small>Status Sesi Tim</small>
          ${hasSession ? `
            <div>
              <span class="badge ok" style="font-size:11px;padding:3px 7px">👥 ${esc(o.session_name || 'Sesi Tim')}</span>
            </div>
          ` : `
            <div>
              <span class="badge warn" style="font-size:11px;padding:3px 7px">⏳ Belum Ada Sesi</span>
            </div>
          `}
          <span style="font-size:10px;color:var(--muted);display:block;margin-top:3px">${date(o.created_at)}</span>
        </div>
        <div class="buyer-email-actions">
          ${hasSession ? `
            <button type="button" class="neo-btn red tiny" data-unassign-email="${o.id}">✕ Keluarkan</button>
          ` : `
            <button type="button" class="neo-btn purple tiny" data-assign-single-email="${o.id}">➕ Masukkan Sesi</button>
          `}
          <button type="button" class="neo-btn blue tiny" onclick="openOrderDetail(${o.id})">Detail</button>
        </div>
      </article>
    `;
  }).join('') : '<div class="empty-product"><h3>Belum ada email pembeli yang sesuai filter</h3><p>Email pembeli akan otomatis muncul di sini saat pembeli menginput email setelah checkout di bot.</p></div>';

  host.innerHTML = `
    <div class="toolbar product-toolbar" style="margin-bottom:14px">
      <div class="searchbox"><input id="emailSearch" placeholder="Cari email pembeli, invoice, nama, atau produk..." value="${esc(q)}"></div>
      <select id="emailStatusFilter">
        <option value="" ${stFilter === '' ? 'selected' : ''}>Semua Status Sesi</option>
        <option value="unassigned" ${stFilter === 'unassigned' ? 'selected' : ''}>⏳ Belum Masuk Sesi (${state.invitationsData?.unassignedCount || 0})</option>
        <option value="assigned" ${stFilter === 'assigned' ? 'selected' : ''}>🟢 Sudah Masuk Sesi (${state.invitationsData?.assignedCount || 0})</option>
      </select>
      <select id="emailSessionFilter">
        <option value="">Semua Sesi Tim (${sessions.length})</option>
        ${sessionOptions}
      </select>
    </div>

    ${bulkBar}

    ${filtered.length > 0 ? `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding:0 4px">
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:900;cursor:pointer">
          <input type="checkbox" id="selectAllEmailsCheckbox" ${allFilteredSelected ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--purple)">
          <span>Pilih Semua yang Tampil (${filtered.length} Email)</span>
        </label>
        <button type="button" class="neo-btn white tiny" id="copyAllFilteredEmailsBtn">📋 Salin Semua yang Tampil (${filtered.length})</button>
      </div>
    ` : ''}

    <div class="buyer-email-list">${cardsHtml}</div>
  `;

  $('#emailSearch').oninput = e => {
    state.invitationSearch = e.target.value;
    renderInvitationsTab();
  };
  $('#emailStatusFilter').onchange = e => {
    state.invitationStatus = e.target.value;
    renderInvitationsTab();
  };
  $('#emailSessionFilter').onchange = e => {
    state.invitationSessionFilter = e.target.value;
    renderInvitationsTab();
  };

  const selectAll = $('#selectAllEmailsCheckbox');
  if (selectAll) {
    selectAll.onchange = () => {
      if (selectAll.checked) {
        filtered.forEach(o => state.selectedEmailIds.add(o.id));
      } else {
        filtered.forEach(o => state.selectedEmailIds.delete(o.id));
      }
      renderInvitationsTab();
    };
  }

  $$('[data-select-email]').forEach(cb => {
    cb.onchange = () => {
      const id = Number(cb.dataset.selectEmail);
      if (cb.checked) state.selectedEmailIds.add(id);
      else state.selectedEmailIds.delete(id);
      renderInvitationsTab();
    };
  });

  const clearBtn = $('#clearSelectedBtn');
  if (clearBtn) clearBtn.onclick = () => {
    state.selectedEmailIds.clear();
    renderInvitationsTab();
  };

  const assignBtn = $('#assignSelectedBtn');
  if (assignBtn) assignBtn.onclick = () => {
    const ids = Array.from(state.selectedEmailIds);
    if (!ids.length) return toast('Pilih minimal 1 email.', true);
    openAssignToSessionModal(ids);
  };

  const copySelected = $('#copySelectedBtn');
  if (copySelected) copySelected.onclick = () => {
    const ids = Array.from(state.selectedEmailIds);
    const emails = items.filter(o => ids.includes(o.id)).map(o => o.customer_email).filter(Boolean);
    if (!emails.length) return toast('Tidak ada email yang valid.', true);
    openCopyEmailsModal(emails, `${emails.length} Email Terpilih`);
  };

  const copyAllBtn = $('#copyAllFilteredEmailsBtn');
  if (copyAllBtn) copyAllBtn.onclick = () => {
    const emails = filtered.map(o => o.customer_email).filter(Boolean);
    if (!emails.length) return toast('Tidak ada email yang tampil.', true);
    openCopyEmailsModal(emails, `${emails.length} Email Tampil`);
  };

  $$('[data-assign-single-email]').forEach(b => {
    b.onclick = () => {
      const id = Number(b.dataset.assignSingleEmail);
      openAssignToSessionModal([id]);
    };
  });

  $$('[data-unassign-email]').forEach(b => {
    b.onclick = async () => {
      const id = Number(b.dataset.unassignEmail);
      try {
        await api('/api/admin/team-sessions/unassign', { method: 'POST', body: { order_id: id } });
        toast('Email berhasil dikeluarkan dari sesi tim');
        await loadInvitations(true);
      } catch (err) {
        toast(err.message, true);
      }
    };
  });
}

function openTeamSessionModal(session = {}) {
  const edit = Boolean(session && session.id);
  modal(edit ? `Edit Sesi Tim · ${esc(session.session_name)}` : '＋ Buat Sesi Undangan Tim Baru', `
    <div class="form-grid">
      <label class="full">Nama Sesi Tim<input name="session_name" required value="${esc(session.session_name || '')}" placeholder="Contoh: Canva Pro Team Batch #1, Gemini Advanced VIP 2"></label>
      <label>Kategori / Nama Produk<input name="product_name" value="${esc(session.product_name || '')}" placeholder="Contoh: Canva Pro, Gemini, Zoom Pro"></label>
      <label>Kapasitas Tim (Maksimal Anggota)<input name="max_capacity" type="number" min="0" value="${Number(session.max_capacity || 0)}" placeholder="0 = Tanpa Batas"><small class="muted">Isi 0 jika tidak dibatasi (unlimited). Misal tim Canva isi 20/100, Google Family isi 5.</small></label>
      <label class="full">Link Undangan Tim (Opsional)<input name="invite_link" type="url" value="${esc(session.invite_link || '')}" placeholder="https://www.canva.com/brand/join?..."><small class="muted">Link join team yang bisa disalin atau dibagikan saat memasukkan pembeli.</small></label>
      <label>Status Sesi<select name="status">
        <option value="active" ${session.status !== 'full' && session.status !== 'completed' && session.status !== 'archived' ? 'selected' : ''}>🟢 Aktif</option>
        <option value="full" ${session.status === 'full' ? 'selected' : ''}>🟡 Penuh</option>
        <option value="completed" ${session.status === 'completed' ? 'selected' : ''}>⚪ Selesai</option>
        <option value="archived" ${session.status === 'archived' ? 'selected' : ''}>📁 Arsip</option>
      </select></label>
      <label class="full">Catatan Internal (Opsional)<textarea name="note" rows="3" placeholder="Contoh: Email admin pemilik tim, tanggal kedaluwarsa tim, aturan garansi tim...">${esc(session.note || '')}</textarea></label>
    </div>
  `, async b => {
    b.session_name = String(b.session_name || '').trim();
    if (!b.session_name) throw new Error('Nama sesi tim wajib diisi.');
    b.max_capacity = Number(b.max_capacity || 0);
    if (edit) {
      await api(`/api/admin/team-sessions/${session.id}`, { method: 'PATCH', body: b });
      toast('Sesi tim berhasil diperbarui');
    } else {
      await api('/api/admin/team-sessions', { method: 'POST', body: b });
      toast('Sesi tim baru berhasil dibuat');
    }
    await loadInvitations(true);
  }, { submit: edit ? 'Simpan Perubahan Sesi' : '＋ Buat Sesi Tim' });
}

function openAssignToSessionModal(orderIds = []) {
  const sessions = (state.invitationsData?.sessions || []).filter(s => s.status !== 'archived');
  if (!sessions.length) {
    if (confirm('Belum ada Sesi Undangan Tim yang dibuat. Buat sesi tim baru sekarang?')) {
      openTeamSessionModal();
    }
    return;
  }

  const opts = sessions.map(s => {
    const mem = Number(s.members_count || 0);
    const max = Number(s.max_capacity || 0);
    const full = max > 0 && mem >= max;
    return `<option value="${s.id}">${esc(s.session_name)}${s.product_name ? ` · ${esc(s.product_name)}` : ''} (${mem}${max > 0 ? `/${max}` : ''} anggota)${full ? ' ⚠️ Penuh' : ''}</option>`;
  }).join('');

  modal(`Masukkan ke Sesi Undangan Tim (${orderIds.length} Email)`, `
    <div class="form-grid">
      <div class="full info-note">
        <b>Pilih Sesi Tim Tujuan:</b> ${orderIds.length} email pembeli terpilih akan dimasukkan ke dalam sesi tim ini.
      </div>
      <label class="full">Pilih Sesi Tim
        <select name="session_id" id="targetAssignSession">${opts}</select>
      </label>
    </div>
  `, async b => {
    const sid = Number(b.session_id);
    if (!sid) throw new Error('Pilih sesi tim.');
    await api('/api/admin/team-sessions/assign', {
      method: 'POST',
      body: { session_id: sid, order_ids: orderIds }
    });
    toast(`${orderIds.length} email berhasil dimasukkan ke sesi tim!`);
    state.selectedEmailIds.clear();
    await loadInvitations(true);
  }, { submit: 'Masukkan ke Sesi Tim' });
}

async function openSessionMembersModal(sessionId) {
  try {
    const res = await api(`/api/admin/team-sessions/${sessionId}`);
    const session = res.item || {};
    const members = session.members || [];
    const emails = members.map(m => m.customer_email).filter(Boolean);

    const membersListHtml = members.length ? members.map((m, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:#fafafa;border:2px solid var(--ink);border-radius:10px;gap:8px;margin-bottom:8px;">
        <span style="font-weight:950;font-size:12px;width:24px;text-align:center">#${i + 1}</span>
        <div style="flex:1;min-width:0">
          <strong class="mono" style="color:var(--purple);font-size:13px;display:block;overflow-wrap:anywhere">${esc(m.customer_email)}</strong>
          <small style="color:var(--muted);font-size:11px">Invoice: ${esc(m.order_ref)} · ${esc(m.buyer_name || '-')} · ${esc(m.product_name)}</small>
        </div>
        <div style="display:flex;gap:6px">
          <button type="button" class="neo-btn white tiny" onclick="navigator.clipboard.writeText('${esc(m.customer_email)}');toast('Email disalin')">📋 Salin</button>
          <button type="button" class="neo-btn red tiny" data-remove-from-session="${m.order_id}">✕ Keluarkan</button>
        </div>
      </div>
    `).join('') : '<div class="empty compact">Belum ada email pembeli di sesi tim ini.</div>';

    modal(`Anggota Sesi · ${esc(session.session_name)} (${members.length})`, `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
        <button type="button" class="neo-btn green small" id="copyCommaBtn" ${!emails.length ? 'disabled' : ''}>📋 Salin Format Koma (,)</button>
        <button type="button" class="neo-btn blue small" id="copyNewlineBtn" ${!emails.length ? 'disabled' : ''}>📋 Salin Format Per Baris</button>
      </div>
      <div style="max-height:55vh;overflow-y:auto;padding-right:4px;">
        ${membersListHtml}
      </div>
    `, async () => {}, { hideSubmit: true, cancelText: 'Tutup' });

    const commaBtn = $('#copyCommaBtn');
    if (commaBtn) commaBtn.onclick = () => {
      const text = emails.join(', ');
      navigator.clipboard.writeText(text);
      toast(`${emails.length} email disalin (format koma)!`);
    };

    const newlineBtn = $('#copyNewlineBtn');
    if (newlineBtn) newlineBtn.onclick = () => {
      const text = emails.join('\n');
      navigator.clipboard.writeText(text);
      toast(`${emails.length} email disalin (per baris)!`);
    };

    $$('[data-remove-from-session]').forEach(b => {
      b.onclick = async () => {
        const oid = Number(b.dataset.removeFromSession);
        try {
          await api('/api/admin/team-sessions/unassign', { method: 'POST', body: { order_id: oid } });
          toast('Email dikeluarkan dari sesi tim');
          await openSessionMembersModal(sessionId);
          await loadInvitations(true);
        } catch (err) {
          toast(err.message, true);
        }
      };
    });
  } catch (err) {
    toast(err.message, true);
  }
}

function openCopyEmailsModal(emails = [], title = 'Salin Email Pembeli') {
  const commaText = emails.join(', ');
  const newlineText = emails.join('\n');

  modal(`Salin Email · ${esc(title)} (${emails.length})`, `
    <div class="form-grid">
      <div class="full" style="display:flex;gap:8px;margin-bottom:8px;">
        <button type="button" class="neo-btn purple small" id="copyFormatCommaBtn">📋 Salin Format Koma (a@x.com, b@x.com)</button>
        <button type="button" class="neo-btn blue small" id="copyFormatNewlineBtn">📋 Salin Format Baris</button>
      </div>
      <label class="full">
        Format Pisah Koma (Cocok langsung paste di Canva / Google Team Invite):
        <textarea id="copyEmailsArea" rows="8" readonly style="font-family:ui-monospace,monospace;font-size:12px">${esc(commaText)}</textarea>
      </label>
    </div>
  `, async () => {}, { hideSubmit: true, cancelText: 'Tutup' });

  const ta = $('#copyEmailsArea');
  const btnComma = $('#copyFormatCommaBtn');
  if (btnComma) btnComma.onclick = () => {
    if (ta) ta.value = commaText;
    navigator.clipboard.writeText(commaText);
    toast(`${emails.length} email disalin (format koma)!`);
  };
  const btnNewline = $('#copyFormatNewlineBtn');
  if (btnNewline) btnNewline.onclick = () => {
    if (ta) ta.value = newlineText;
    navigator.clipboard.writeText(newlineText);
    toast(`${emails.length} email disalin (per baris)!`);
  };
}
async function loadReports(){
  const d=new Date(),r=state.report||{};if(!r.date)r.date=d.toISOString().slice(0,10);if(!r.month)r.month=d.toISOString().slice(0,7);if(!r.year)r.year=String(d.getFullYear());state.report=r;
  $('#content').innerHTML=`<section class="report-filter panel"><div class="section-head"><div><h3>📊 Pilih Laporan</h3><p>Sesuaikan tipe dan periode laporan.</p></div></div><div class="report-filter-grid"><label>Tipe Laporan<select id="reportType"><option value="daily" ${r.type==='daily'?'selected':''}>Harian</option><option value="monthly" ${r.type==='monthly'?'selected':''}>Bulanan</option><option value="yearly" ${r.type==='yearly'?'selected':''}>Tahunan</option></select></label><label id="reportPeriodWrap"></label><button id="applyReport" class="neo-btn purple">Tampilkan Laporan</button></div></section><div id="reportResult"><div class="empty-product">Memuat laporan...</div></div>`;
  const renderPeriod=()=>{const t=$('#reportType').value;$('#reportPeriodWrap').innerHTML=t==='daily'?`Periode<input id="reportPeriod" type="date" value="${esc(r.date)}">`:t==='monthly'?`Periode<input id="reportPeriod" type="month" value="${esc(r.month)}">`:`Tahun<input id="reportPeriod" type="number" min="2020" max="2100" value="${esc(r.year)}">`};renderPeriod();$('#reportType').onchange=renderPeriod;$('#applyReport').onclick=async()=>{const type=$('#reportType').value,val=$('#reportPeriod').value;state.report.type=type;if(type==='daily')state.report.date=val;if(type==='monthly')state.report.month=val;if(type==='yearly')state.report.year=val;await fetchReport()};await fetchReport();
}
async function fetchReport(){const r=state.report,t=r.type||'monthly';let qs=`type=${encodeURIComponent(t)}`;let periodLabel='';if(t==='daily'){qs+=`&date=${encodeURIComponent(r.date)}`;periodLabel=new Date(r.date+'T00:00:00').toLocaleDateString('id-ID',{dateStyle:'long'})}else if(t==='monthly'){const [y,m]=(r.month||'').split('-');qs+=`&month=${encodeURIComponent(m||'')}&year=${encodeURIComponent(y||'')}`;periodLabel=new Date(Number(y),Number(m)-1,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'})}else{qs+=`&year=${encodeURIComponent(r.year)}`;periodLabel='Tahun '+r.year}const x=(await api('/api/admin/reports?'+qs)).data||{},sum=x.summary||{},series=x.series||[],max=Math.max(1,...series.map(v=>Number(v.revenue||0)));$('#reportResult').innerHTML=`<div class="stats-row">${stat('🛒','purple','Pesanan',sum.total_orders||0,periodLabel)}${stat('📈','pink','Omzet',money(sum.revenue),'Periode terpilih')}${stat('💵','green','Profit',money(sum.profit),'Profit bersih')}${stat('⏳','yellow','Pending',sum.pending||0,'Belum selesai')}</div><div class="grid-2"><section class="report-card"><div class="card-heading"><div><h3>📊 ${t==='daily'?'Omzet per Jam':t==='monthly'?'Omzet Harian':'Omzet Bulanan'}</h3><p>${esc(periodLabel)}</p></div></div><div class="report-series">${series.length?series.map(v=>`<div class="series-row"><span>${esc(v.bucket)}</span><div class="series-track"><i style="width:${Math.max(2,Math.round(Number(v.revenue||0)/max*100))}%"></i></div><b>${money(v.revenue)}</b></div>`).join(''):'<div class="empty compact">Belum ada transaksi pada periode ini.</div>'}</div></section><section class="report-card"><div class="card-heading"><div><h3>🏆 Produk Terlaris</h3><p>${esc(periodLabel)}</p></div></div><div class="top-list">${(x.top_products||[]).length?(x.top_products||[]).map((p,i)=>`<div class="top-item"><span class="rank">${i+1}</span><div><b>${esc(p.product_name||'-')}</b><small>${p.qty||0} item · ${p.orders||0} order</small></div><strong>${money(p.revenue)}</strong></div>`).join(''):'<div class="empty compact">Belum ada data produk.</div>'}</div></section></div>`}
async function loadCoupons(preserveScroll=false){const scrollY=preserveScroll?window.scrollY:0;const[c,r,p]=await Promise.all([api('/api/admin/coupons?limit=500'),api('/api/admin/redeem?limit=500'),api('/api/admin/products?limit=500')]);state.cache.coupons=c.items||[];state.cache.redeem=r.items||[];state.cache.products=p.items||[];renderCoupons();if(preserveScroll)window.scrollTo({top:scrollY,behavior:'instant'});}function renderCoupons(){const isCoupon=state.couponTab==='coupon';$('#content').innerHTML=`<div class="section-title"><div class="tabs"><button class="tab-btn ${isCoupon?'active':''}" data-coupon-tab="coupon">🎟 Voucher / Promo</button><button class="tab-btn ${!isCoupon?'active':''}" data-coupon-tab="redeem">🎁 Redeem Code</button></div><span><button id="addCouponRedeem" class="neo-btn purple">＋ ${isCoupon?'Tambah Kupon':'Generate Redeem'}</button></span></div>${isCoupon?couponTable():redeemTable()}`;$$('[data-coupon-tab]').forEach(b=>b.onclick=()=>{state.couponTab=b.dataset.couponTab;renderCoupons()});$('#addCouponRedeem').onclick=()=>isCoupon?openCoupon():openRedeem();bindCouponActions()}
function couponTable(){return`<div class="table-card"><div class="table-scroll"><table class="neo-table"><thead><tr><th>Kode</th><th>Nama</th><th>Diskon</th><th>Minimal</th><th>Pemakaian</th><th>Status</th><th>Expired</th><th>Aksi</th></tr></thead><tbody>${state.cache.coupons.length?state.cache.coupons.map(x=>`<tr><td class="mono"><b>${esc(x.code)}</b></td><td>${esc(x.name||'-')}</td><td>${x.discount_type==='percent'?x.discount_value+'%':money(x.discount_value)}</td><td>${money(x.min_purchase)}</td><td>${x.used_count}/${x.usage_limit||'∞'}</td><td>${badge(x.active?'active':'inactive')}</td><td>${date(x.expires_at)}</td><td><div class="actions"><button class="neo-btn yellow small" data-edit-coupon="${x.id}">Edit</button><button class="neo-btn red small" data-delete-coupon="${x.id}">Hapus</button></div></td></tr>`).join(''):'<tr><td colspan="8" class="empty">Belum ada kupon.</td></tr>'}</tbody></table></div></div>`}function redeemTable(){return`<div class="table-card"><div class="table-scroll"><table class="neo-table"><thead><tr><th>Kode</th><th>Tipe</th><th>Nilai</th><th>Status</th><th>Diklaim</th><th>Expired</th><th>Aksi</th></tr></thead><tbody>${state.cache.redeem.length?state.cache.redeem.map(x=>`<tr><td class="mono"><b>${esc(x.code)}</b></td><td>${esc(x.type)}</td><td>${x.type==='balance'?money(x.value):`${x.value} item`}</td><td>${badge(x.active&&!x.claimed_by?'active':'used')}</td><td>${esc(x.claimed_by||'-')}</td><td>${date(x.expires_at)}</td><td><div class="actions"><button class="neo-btn red small" data-delete-redeem="${x.id}">Hapus</button></div></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Belum ada redeem.</td></tr>'}</tbody></table></div></div>`}function bindCouponActions(){$$('[data-edit-coupon]').forEach(b=>b.onclick=()=>openCoupon(state.cache.coupons.find(x=>String(x.id)===b.dataset.editCoupon)));$$('[data-delete-coupon]').forEach(b=>b.onclick=()=>remove(`/api/admin/coupons/${b.dataset.deleteCoupon}`,'Hapus kupon?',()=>loadCoupons(true)));$$('[data-delete-redeem]').forEach(b=>b.onclick=()=>remove(`/api/admin/redeem/${b.dataset.deleteRedeem}`,'Hapus kode redeem?',()=>loadCoupons(true)))}
async function loadSettings(){
  const[s,sys,bk,hs]=await Promise.all([api('/api/admin/settings'),api('/api/admin/system'),api('/api/admin/backups'),api('/api/admin/historical-stats')]);
  state.cache.settings=s.settings||{};state.cache.system=sys;state.cache.backups=bk.items||[];state.cache.backupSettings=bk.settings||{};state.cache.historicalStats=hs||{};if(!state.settingsTab)state.settingsTab='';
  renderSettings();
}
function settingsTabsHtml(){const tabs=[['store','🏪','PENGATURAN TOKO','Nama toko, owner, tampilan user, dan metrik dashboard.'],['vps','🖥️','PENGINGAT PERPANJANGAN VPS','Atur provider, tanggal jatuh tempo, biaya perpanjangan, dan pengingat Telegram.'],['referral','👥','REFERRAL','Atur program referral dan hadiah saldo pengguna.'],['topup','💰','SALDO & TOP UP','Atur isi saldo, batas nominal, dan pembayaran saldo bot.'],['partnership','🤝','KEMITRAAN RESELLER BOT','Atur biaya pendaftaran reseller dan status pembukaan kemitraan bot.'],['payment','🧮','METODE PEMBAYARAN','AutoGoPay, ShopeePay Gateway Sendiri, & rotasi hybrid.'],['supplier','🔄','SUPPLIER / RESELLER API','Kelola ProdSeller, Storebat, saldo, katalog, dan import produk.'],['backup','💾','BACKUP & RESTORE','Backup SQLite, restore data, dan migrasi backup lama.'],['system','🖥️','SISTEM','Status layanan, koneksi integrasi, dan database.']];return`<section class="submenu-home settings-menu-home"><div class="submenu-home-head"><h2>Pengaturan</h2><p>Pilih bagian yang ingin dikelola.</p></div><nav class="submenu-card-list" aria-label="Submenu Pengaturan">${tabs.map(([k,icon,title,desc])=>`<button class="submenu-card" data-settings-tab="${k}"><span class="submenu-card-icon">${icon}</span><span class="submenu-card-copy"><b>${title}</b><small>${desc}</small></span><span class="submenu-card-arrow">›</span></button>`).join('')}</nav></section>`}
function renderSettings(){
  const x=state.cache.settings||{},sys=state.cache.system||{},i=sys.integrations||{},bs=state.cache.backupSettings||{};
  const metric=String(x.store_balance_metric||'month_profit');const qrisMode=String(x.autogopay_payment_method||'gopay');
  if(!state.settingsTab){$('#content').innerHTML=settingsTabsHtml();$$('[data-settings-tab]').forEach(b=>b.onclick=()=>{state.settingsTab=b.dataset.settingsTab;renderSettings()});return;}
  const qrisCard=(value,icon,title,desc)=>`<label class="qris-mode-card ${qrisMode===value?'selected':''}"><input type="radio" name="autogopay_payment_method" value="${value}" ${qrisMode===value?'checked':''}><span class="qris-mode-icon">${icon}</span><b>${title}</b><small>${desc}</small><button type="button" class="neo-btn white tiny" data-check-qris="${value}">Cek Status</button><div id="qrisStatus-${value}" class="qris-status"></div></label>`;
  let body='';
  if(state.settingsTab==='store')body=`<section class="settings-section single-panel"><div class="section-head"><div><h3>🏪 Toko & Owner</h3><p>Identitas toko, owner, dan metrik sidebar.</p></div></div><form id="storeSettingsForm" class="form-grid"><label>Nama Store<input name="store_name" value="${esc(x.store_name||'iLink Auto Order')}"></label><label>Tagline<input name="store_tagline" value="${esc(x.store_tagline||'Digital Store')}"></label><label>Nama Owner<input name="owner_display_name" value="${esc(x.owner_display_name||'Owner')}"></label><label>Username Owner<input name="owner_username" value="${esc(x.owner_username||'owneradmin')}"></label><label>Metrik Sidebar<select name="store_balance_metric"><option value="month_profit" ${metric==='month_profit'?'selected':''}>Profit Bulan Ini</option><option value="month_revenue" ${metric==='month_revenue'?'selected':''}>Omzet Bulan Ini</option><option value="today_profit" ${metric==='today_profit'?'selected':''}>Profit Hari Ini</option><option value="today_revenue" ${metric==='today_revenue'?'selected':''}>Omzet Hari Ini</option><option value="manual" ${metric==='manual'?'selected':''}>Saldo Manual</option></select></label><label>Saldo Manual<input name="store_balance" type="number" value="${Number(x.store_balance||0)}"><small>Hanya dipakai bila Metrik Sidebar = Saldo Manual.</small></label><label>Tampilkan Total User<select name="show_total_users"><option value="true" ${x.show_total_users!==false?'selected':''}>Ya</option><option value="false" ${x.show_total_users===false?'selected':''}>Tidak</option></select></label><label class="full">Catatan Dashboard<textarea name="dashboard_note">${esc(x.dashboard_note||'')}</textarea></label><div class="full form-actions"><button class="neo-btn purple" type="submit">Simpan Toko</button></div></form></section>`;
  else if(state.settingsTab==='vps'){const v=vpsRenewalInfo(x);body=`<section class="settings-section single-panel"><div class="section-head"><div><h3>🖥️ Pengingat Perpanjangan VPS</h3><p>Catat tanggal jatuh tempo perpanjangan VPS server agar sistem mengirimkan pengingat ke Telegram Owner dan dashboard MiniApp.</p></div>${v.badgeHtml}</div><form id="vpsReminderForm" class="form-grid"><label>Nama Provider VPS<input name="vps_provider_name" value="${esc(x.vps_provider_name||'')}" placeholder="Contoh: Contabo, Hostinger, Biznet, Reviactyl"><small>Penyedia VPS atau server tempat bot aktif.</small></label><label>Tanggal Jatuh Tempo Perpanjangan<input name="vps_renewal_date" type="date" value="${esc(x.vps_renewal_date||'')}"><small>Tanggal batas akhir periode sewa server.</small></label><label>Biaya Perpanjangan (Rp)<input name="vps_cost" type="number" min="0" value="${Number(x.vps_cost||0)}" placeholder="Contoh: 150000"><small>Nominal tagihan perpanjangan.</small></label><label>Pengingat Otomatis ke Telegram<select name="vps_reminder_enabled"><option value="true" ${x.vps_reminder_enabled!==false?'selected':''}>Aktif (H-7, H-5, H-3, H-2, H-1, Hari H)</option><option value="false" ${x.vps_reminder_enabled===false?'selected':''}>Nonaktif</option></select><small>Peringatan berkala otomatis ke Telegram Owner.</small></label><div class="full info-note"><b>💡 Panduan Fitur Pengingat VPS:</b><br>• <b>Telegram Otomatis:</b> Bot memeriksa tanggal jatuh tempo secara berkala dan mengirim peringatan ke Telegram Owner saat H-7, H-5, H-3, H-2, H-1, dan hari H.<br>• <b>MiniApp & Dashboard:</b> Lonceng notifikasi 🔔 dan widget Dashboard otomatis menampilkan status sisa hari & peringatan darurat.<br>• <b>Tombol +30 Hari:</b> Klik tombol kuning <b>✅ Sudah Diperpanjang (+30 Hari)</b> setelah Anda selesai membayar sewa VPS untuk langsung memajukan tanggal jatuh tempo 1 bulan (30 hari) ke depan secara instan.</div><div class="full form-actions" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="neo-btn purple" type="submit">💾 Simpan Pengaturan VPS</button><button id="renewVps30Btn" class="neo-btn yellow" type="button">✅ Sudah Diperpanjang (+30 Hari)</button></div></form></section>`;}
  else if(state.settingsTab==='referral')body=`<section class="settings-section single-panel"><div class="section-head"><div><h3>👥 Referral</h3><p>Atur program referral dan bonus saldo untuk pengundang.</p></div></div><form id="referralSettingsForm" class="form-grid"><label>Status Referral<select name="referral_enabled"><option value="true" ${x.referral_enabled!==false?'selected':''}>Aktif</option><option value="false" ${x.referral_enabled===false?'selected':''}>Nonaktif</option></select></label><label>Bonus per Referral<input name="referral_reward_amount" type="number" min="0" value="${Number(x.referral_reward_amount||0)}"></label><div class="full info-note">Bonus diberikan ke saldo referral sesuai mekanisme pendaftaran referral bot. User dapat melihat link referral dari menu Saldo & Referral.</div><div class="full form-actions"><button class="neo-btn purple" type="submit">Simpan Referral</button></div></form></section>`;
  else if(state.settingsTab==='topup')body=`<section class="settings-section single-panel"><div class="section-head"><div><h3>➕ TopUp & Saldo</h3><p>Atur TopUp QRIS, pembayaran saldo bot, dan batas nominal.</p></div></div><form id="topupSettingsForm" class="form-grid"><label>Status TopUp<select name="topup_enabled"><option value="true" ${x.topup_enabled!==false?'selected':''}>Aktif</option><option value="false" ${x.topup_enabled===false?'selected':''}>Nonaktif</option></select></label><label>Pembayaran Saldo<select name="wallet_payment_enabled"><option value="true" ${x.wallet_payment_enabled!==false?'selected':''}>Aktif</option><option value="false" ${x.wallet_payment_enabled===false?'selected':''}>Nonaktif</option></select></label><label>Minimal TopUp<input name="topup_min_amount" type="number" min="1000" value="${Number(x.topup_min_amount||1000)}"></label><label>Maksimal TopUp<input name="topup_max_amount" type="number" min="1000" value="${Number(x.topup_max_amount||5000000)}"></label><div class="full info-note">QRIS TopUp mengikuti mode pembayaran pada submenu Pembayaran: GoPay, ShopeePay, ShopeePay GW Sendiri, Auto Rotating, atau Hybrid.</div><div class="full form-actions"><button class="neo-btn purple" type="submit">Simpan TopUp</button></div></form></section>`;
  else if(state.settingsTab==='partnership')body=`<section class="settings-section single-panel"><div class="section-head"><div><h3>🤝 Kemitraan Reseller Bot</h3><p>Atur biaya pendaftaran kemitraan, perizinan tambah produk toko sendiri, dan sakelar buka/tutup pendaftaran bot reseller di Bot Toko Utama.</p></div></div><form id="resellerPartnershipSettingsForm" class="form-grid"><label>Status Pendaftaran Reseller<select name="reseller_registration_enabled"><option value="true" ${x.reseller_registration_enabled!==false?'selected':''}>Buka (User Bisa Daftar Kemitraan)</option><option value="false" ${x.reseller_registration_enabled===false?'selected':''}>Tutup (Pendaftaran Dinonaktifkan)</option></select></label><label>Biaya Pendaftaran (Rp)<input name="reseller_registration_fee" type="number" min="0" step="500" value="${Number(x.reseller_registration_fee||0)}"><small>Isi 0 untuk pendaftaran GRATIS. Jika diisi nominal (misal 50.000), user wajib punya saldo dompet cukup saat mendaftarkan bot di Bot Toko Utama.</small></label><label class="full">Izin Tambah Produk Toko Sendiri (Reseller)<select name="reseller_can_add_products"><option value="false" ${!x.reseller_can_add_products?'selected':''}>🔴 Nonaktif (Default) - Reseller hanya menjual produk dari Owner</option><option value="true" ${x.reseller_can_add_products?'selected':''}>🟢 Aktif - Reseller diizinkan menambahkan & menjual produk toko miliknya sendiri</option></select><small>Fitur ini memungkinkan mitra reseller menginput produk digital buatan sendiri, mengatur varian, upload banner produk, dan memasukkan stok toko sendiri.</small></label><div class="full info-note"><b>Sistem Persetujuan Owner:</b> Setiap user yang mendaftarkan token bot akan berstatus <i>Menunggu Persetujuan</i>. Notifikasi verifikasi akan masuk ke Telegram Owner dengan tombol Setujui / Tolak otomatis. Jika ditolak, biaya pendaftaran akan otomatis di-refund kembali ke saldo user.</div><div class="full form-actions" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="neo-btn purple" type="submit">Simpan Pengaturan Kemitraan</button><button type="button" class="neo-btn blue" id="goToResellersBtn">👥 Buka Halaman Reseller Bot →</button></div></form></section>`;
  else if(state.settingsTab==='payment')body=`<section class="settings-section single-panel payment-section"><div class="section-head"><div><h3>💳 Pembayaran & QRIS Multi-Gateway</h3><p>Pilih gateway AutoGoPay, ShopeePay Gateway Sendiri (Direct Native Bawaan / Unofficial Gateway), atau mode rotasi Hybrid. QRIS transaksi akan dihapus otomatis setelah pembayaran selesai atau expired.</p></div><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span title="Status AutoGoPay">${badge(i.autogopay?.configured?'AutoGoPay: ON':'AutoGoPay: OFF')}</span><span title="Status ShopeePay Gateway">${badge(i.shoppepay_gateway?.configured?'ShopeePay GW: ON':'ShopeePay GW: OFF')}</span></div></div><form id="paymentSettingsForm"><div class="qris-mode-grid">${qrisCard('gopay','📱','AutoGoPay · GoPay','Semua QRIS menggunakan merchant GoPay via AutoGoPay.')}${qrisCard('shopeepay','🛍️','AutoGoPay · ShopeePay','Semua QRIS menggunakan merchant ShopeePay via AutoGoPay.')}${qrisCard('auto_rotate','🔄','AutoGoPay Rotating','Bergantian GoPay ↔ ShopeePay (AutoGoPay) dengan fallback.')}${qrisCard('shoppepay_self','⚡','ShopeePay GW Sendiri','Direct native bawaan tanpa port 4000 (ahmadzakiyox). Tanpa platform fee.')}${qrisCard('hybrid_rotate','🔀','Hybrid Rotating','Bergantian AutoGoPay GoPay ↔ ShopeePay Gateway Sendiri.')}</div><div class="form-grid" style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)"><div class="full" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div><h4 style="margin:0 0 4px 0">⚙️ Konfigurasi ShopeePay Gateway Sendiri (Direct Native)</h4><small class="muted">Tersedia Direct Engine bawaan langsung di server iLink (tanpa butuh port 4000 terpisah), atau gunakan gateway eksternal jika diinginkan.</small></div><button type="button" class="neo-btn white small" id="checkSpayTokenBtn">🔍 Cek Status Token</button></div><label>URL ShopeePay Gateway<input name="shoppepay_gateway_url" value="${esc(x.shoppepay_gateway_url||'internal')}" placeholder="internal"><small>Isi <code>internal</code> untuk Direct Native bawaan bot (rekomendasi VPS/Pterodactyl), atau isi URL jika memakai server gateway eksternal.</small></label><label>API Key Gateway (Opsional)<input type="password" autocomplete="off" name="shoppepay_gateway_key" value="${esc(x.shoppepay_gateway_key||'')}" placeholder="Kosongkan jika tidak pakai key"><small>Header X-API-Key jika menggunakan gateway server terpisah.</small></label><label class="full">String / Payload QRIS Statis ShopeePay<textarea name="shoppepay_qris_static" rows="2" placeholder="00020101021126670016ID.CO.SHOPEE.WWW..." style="font-family:monospace;font-size:12px;">${esc(x.shoppepay_qris_static||'')}</textarea><small>String EMVCo QRIS Merchant ShopeePay toko Anda (didapat dari scan gambar QRIS ShopeePay toko Anda menggunakan Google Lens/QR Scanner, lalu salin teksnya ke sini).</small></label><label>Kode Unik Otomatis (Rp 1 - 99)<select name="shoppepay_unique_code"><option value="true" ${x.shoppepay_unique_code!==false?'selected':''}>Aktif (+Rp 1 - 99 acak per invoice)</option><option value="false" ${x.shoppepay_unique_code===false?'selected':''}>Nonaktif (Nominal murni)</option></select><small>Mencegah tabrakan nominal order kembar saat verifikasi mutasi.</small></label><div class="full" id="spayTokenStatusBox" style="display:none;margin-top:8px"></div></div><div class="qris-footer"><span>Rotasi berikutnya: <b>${esc(x.qris_rotation_next==='shopeepay'?'ShopeePay':'GoPay')}</b></span><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="neo-btn blue small" id="openUpdateSpayTokenModal">🔑 Update Token Live</button><button class="neo-btn purple" type="submit">Simpan Pengaturan Pembayaran</button></div></div></form></section>`;
  else if(state.settingsTab==='supplier')body=`<section class="settings-section single-panel"><div class="section-head"><div><h3>🔌 Reseller Supplier API</h3><p>Balance, katalog, dan import produk/varian ProdSeller serta Storebat.</p></div><button id="refreshSupplierHub" class="neo-btn yellow small">↻ Refresh Supplier</button></div><form id="supplierSettingsForm" class="form-grid" style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)"><label>Storebat API Key (X-Reseller-Key)<input type="password" autocomplete="off" name="storebat_api_key" value="${esc(x.storebat_api_key||'')}" placeholder="Masukkan API Key Storebat"><small>Key reseller dari Storebat / VenteBot API.</small></label><label>Storebat Base URL<input name="storebat_base_url" value="${esc(x.storebat_base_url||'https://web-production-1c7b1.up.railway.app')}" placeholder="https://web-production-1c7b1.up.railway.app"><small>Default: https://web-production-1c7b1.up.railway.app</small></label><label class="full">ProdSeller API Key<input type="password" autocomplete="off" name="prodseller_api_key" value="${esc(x.prodseller_api_key||'')}" placeholder="API Key ProdSeller"></label><div class="full form-actions"><button class="neo-btn purple small" type="submit">Simpan Kunci Supplier</button></div></form><div id="supplierStatus"></div><div id="supplierHub"><div class="empty compact">Memuat data supplier...</div></div></section>`;
  else if(state.settingsTab==='backup')body=`<div class="settings-stack"><section class="settings-section single-panel"><div class="section-head"><div><h3>💾 Backup & Restore SQLite</h3><p>Backup manual, upload/restore SQLite, dan jadwal backup otomatis.</p></div><button id="createBackup" class="neo-btn green small">＋ Buat Backup</button></div><form id="backupSettingsForm" class="backup-settings-grid"><label>Backup Otomatis<select name="auto_backup_enabled"><option value="true" ${(bs.enabled??x.auto_backup_enabled)!==false?'selected':''}>Aktif</option><option value="false" ${(bs.enabled??x.auto_backup_enabled)===false?'selected':''}>Nonaktif</option></select></label><label>Interval (jam)<input name="backup_interval_hours" type="number" min="1" max="168" value="${Number(bs.intervalHours||x.backup_interval_hours||6)}"></label><label>Simpan Maksimal<input name="backup_retention" type="number" min="1" max="365" value="${Number(bs.retention||x.backup_retention||30)}"></label><button class="neo-btn purple" type="submit">Simpan Jadwal</button></form><div class="backup-upload"><input id="backupFile" type="file" accept=".sqlite,application/x-sqlite3"><button id="uploadBackup" class="neo-btn blue">Upload Backup</button><span id="uploadProgress" class="muted">Maksimal 50 MB.</span></div><div class="backup-list">${backupCards(state.cache.backups||[])}</div></section><section class="settings-section single-panel legacy-import-section"><div class="section-head"><div><h3>📥 Migrasi Backup JSON Bot Lama</h3><p>Import backup JSON bot iLink lama ke SQLite tanpa Supabase.</p></div></div><div class="legacy-upload-row"><input id="legacyJsonFile" type="file" accept=".json,application/json"><button id="analyzeLegacyJson" class="neo-btn blue" type="button">Analisis JSON</button><span id="legacyUploadProgress" class="muted">Mendukung backup-bot-*.json, Produk.json, User.json, Trx.json, dan Voucher.json.</span></div><div id="legacyPreview" class="legacy-preview-host">${state.legacyMigration?.preview?legacyPreviewHtml(state.legacyMigration.preview):'<div class="empty compact">Pilih file JSON lama lalu tekan Analisis JSON.</div>'}</div><div id="legacyImportOptions" class="legacy-options ${state.legacyMigration?'':'hidden'}"><label><input type="checkbox" id="legacyUsers" checked> User + saldo/referral</label><label><input type="checkbox" id="legacyProducts" checked> Produk + varian + stok</label><label><input type="checkbox" id="legacyVouchers" checked> Voucher</label><label><input type="checkbox" id="legacyRedeem" checked> Redeem code</label><label><input type="checkbox" id="legacyStats" checked> Statistik historis</label><label><input type="checkbox" id="legacySettings"> Setting toko/bot lama</label><label class="legacy-danger"><input type="checkbox" id="legacyTransactions"> Riwayat transaksi lama</label><p class="muted full">Statistik historis aman diimpor ulang dan tidak membuat detail transaksi ganda. Transaksi dan setting tetap tidak dicentang otomatis untuk mencegah duplikasi atau menimpa konfigurasi baru. Sebelum import, sistem membuat rollback backup SQLite otomatis.</p><button id="applyLegacyImport" type="button" class="neo-btn purple full">Import ke SQLite</button></div><div id="legacyImportResult"></div></section><section class="settings-section single-panel"><div class="section-head"><div><h3>🧮 Perbaiki Counter Historis</h3><p>Gunakan jika angka Total Transaksi / Stok Terjual turun setelah migrasi dari bot lama.</p></div></div>${(()=>{const z=state.cache.historicalStats||{},e=z.effective||{},l=z.live||{},h=z.historical||{};return`<div class="legacy-count-grid"><span>Live Order Detail <b>${Number(l.orders_total||0)}</b></span><span>Live Qty Detail <b>${Number(l.quantity_sold||0)}</b></span><span>Total Tampil <b>${Number(e.orders_total||0)}</b></span><span>Terjual Tampil <b>${Number(e.quantity_sold||0)}</b></span></div><form id="statsRepairForm" class="form-grid" style="margin-top:16px"><label>Total Transaksi Historis<input name="orders_total" type="number" min="0" value="${Number(h.orders_total||e.orders_total||0)}"></label><label>Stok Terjual Historis<input name="quantity_sold" type="number" min="0" value="${Number(h.quantity_sold||e.quantity_sold||0)}"></label><div class="full warning-note">Fitur ini hanya memperbaiki counter historis. Tidak membuat order palsu dan tidak mengubah stok ready. Sistem membuat rollback backup otomatis sebelum menyimpan.</div><div class="full form-actions"><button class="neo-btn yellow" type="submit">Simpan Counter Historis</button></div></form>`})()}</section></div>`;
  else body=`<section class="settings-section single-panel"><div class="section-head"><div><h3>🖥 Status Sistem</h3><p>Ringkasan koneksi dan database.</p></div></div><div class="integration-grid"><div class="integration-card"><div class="integration-status"><b>🤖 Telegram</b>${badge(i.telegram?.running?'running':i.telegram?.configured?'configured':'offline')}</div><p>${esc(i.telegram?.username?'@'+i.telegram.username:'BOT_TOKEN belum terdeteksi')}</p><small>${i.telegram?.last_api_latency_ms?`Latency ${Number(i.telegram.last_api_latency_ms)} ms`:''}</small></div><div class="integration-card"><div class="integration-status"><b>📱 AutoGoPay</b>${badge(i.autogopay?.configured?'configured':'offline')}</div><p>Mode: <b>${esc(qrisMode==='auto_rotate'?'Auto Rotating':qrisMode==='shopeepay'?'ShopeePay':qrisMode==='shoppepay_self'?'ShopeePay GW Sendiri':qrisMode==='hybrid_rotate'?'Hybrid Rotating':'GoPay')}</b></p></div><div class="integration-card"><div class="integration-status"><b>⚡ ShopeePay GW</b>${badge(i.shoppepay_gateway?.configured?'configured':'offline')}</div><p>${esc(x.shoppepay_gateway_url && x.shoppepay_gateway_url !== 'internal' ? x.shoppepay_gateway_url : 'Direct Native (Bawaan)')}</p><div class="integration-actions"><button class="neo-btn yellow small" data-check-qris="shoppepay_self">Cek Gateway</button></div><div id="qrisStatus-shoppepay_self"></div></div><div class="integration-card"><div class="integration-status"><b>🔌 Supplier</b><span>${badge(i.prodseller?.configured?'ProdSeller':'OFF')} ${badge(i.storebat?.configured?'Storebat':'OFF')}</span></div><div class="integration-actions"><button class="neo-btn yellow small" data-test-supplier="prodseller">ProdSeller</button><button class="neo-btn yellow small" data-test-supplier="storebat">Storebat</button></div><div id="supplierStatus"></div></div><div class="integration-card"><div class="integration-status"><b>🖥️ VPS Server</b><span>${vpsRenewalInfo(x).badgeHtml}</span></div><p>${esc(x.vps_provider_name||'VPS Server')} · Jatuh tempo: <b>${esc(x.vps_renewal_date||'Belum diatur')}</b></p><div class="integration-actions"><button type="button" class="neo-btn purple small" id="sysOpenVpsBtn">⚙️ Atur VPS</button><button type="button" class="neo-btn yellow small" id="renewVps30Btn">✅ +30 Hari</button></div></div><div class="integration-card"><div class="integration-status"><b>🗄️ Database</b><span>${bytes(sys.database?.size_bytes)}</span></div><p>SQLite · ${(state.cache.backups||[]).length} file backup</p></div></div></section>`;
  $('#content').innerHTML=`<div class="submenu-detail"><div class="submenu-detail-top"><button type="button" class="neo-btn white submenu-back" id="settingsMenuBack">← Kembali ke Pengaturan</button></div><div class="settings-tab-body">${body}</div></div>`;
  $('#settingsMenuBack').onclick=()=>{state.settingsTab='';renderSettings()};
  if($('#storeSettingsForm'))$('#storeSettingsForm').onsubmit=saveStoreSettings;if($('#referralSettingsForm'))$('#referralSettingsForm').onsubmit=e=>saveSimpleSettings(e,['referral_enabled'],['referral_reward_amount'],'Referral disimpan');if($('#topupSettingsForm'))$('#topupSettingsForm').onsubmit=e=>saveSimpleSettings(e,['topup_enabled','wallet_payment_enabled'],['topup_min_amount','topup_max_amount'],'TopUp disimpan');
  if($('#resellerPartnershipSettingsForm'))$('#resellerPartnershipSettingsForm').onsubmit=e=>saveSimpleSettings(e,['reseller_registration_enabled','reseller_can_add_products'],['reseller_registration_fee'],'Pengaturan kemitraan reseller disimpan');
  if($('#goToResellersBtn'))$('#goToResellersBtn').onclick=()=>navigate('resellers');
  if($('#paymentSettingsForm')){$('#paymentSettingsForm').onsubmit=savePaymentSettings;$$('[data-check-qris]').forEach(b=>b.onclick=()=>testPayment(b.dataset.checkQris));$$('[name="autogopay_payment_method"]').forEach(r=>r.onchange=()=>{$$('.qris-mode-card').forEach(c=>c.classList.toggle('selected',c.querySelector('input')?.checked))});if($('#checkSpayTokenBtn'))$('#checkSpayTokenBtn').onclick=checkShoppepayTokenStatus;if($('#openUpdateSpayTokenModal'))$('#openUpdateSpayTokenModal').onclick=openUpdateShoppepayTokenModal;}
  if($('#supplierSettingsForm'))$('#supplierSettingsForm').onsubmit=async e=>{e.preventDefault();await saveSimpleSettings(e,[],[],'Kunci supplier disimpan');await refreshSupplierHub(true);};
  if($('#refreshSupplierHub')){$('#refreshSupplierHub').onclick=()=>refreshSupplierHub(true);refreshSupplierHub(false)}
    if($('#vpsReminderForm'))$('#vpsReminderForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const payload={vps_provider_name:String(fd.get('vps_provider_name')||'').trim(),vps_renewal_date:String(fd.get('vps_renewal_date')||'').trim(),vps_cost:Number(fd.get('vps_cost')||0),vps_reminder_enabled:fd.get('vps_reminder_enabled')==='true'};try{const res=await api('/api/admin/settings',{method:'PATCH',body:payload});if(res.settings)state.cache.settings=res.settings;else state.cache.settings=Object.assign({},state.cache.settings||{},payload);if(state.overview?.settings)Object.assign(state.overview.settings,state.cache.settings);toast('Pengaturan VPS berhasil disimpan');renderSettings();}catch(err){toast(err.message,true);}};
  if($('#renewVps30Btn'))$('#renewVps30Btn').onclick=async()=>{
    try{
      const res=await api('/api/admin/system/vps-renew-30',{method:'POST'});
      if(state.cache.settings)state.cache.settings.vps_renewal_date=res.vps_renewal_date;if(state.overview?.settings)state.overview.settings.vps_renewal_date=res.vps_renewal_date;
      toast(res.message||'Jatuh tempo VPS berhasil diperpanjang +30 hari!');
      renderSettings();
    }catch(err){toast(err.message,true);}
  };
  if($('#jaspaySettingsForm'))$('#jaspaySettingsForm').onsubmit=e=>saveSimpleSettings(e,['jaspay_enabled'],[],'Pengaturan Produk Fresh disimpan');
  if($('#refreshJaspayHub')){$('#refreshJaspayHub').onclick=()=>refreshJaspayHub(true);refreshJaspayHub(false)}
  $$('[data-test-supplier]').forEach(b=>b.onclick=()=>testSupplier(b.dataset.testSupplier));
  if($('#backupSettingsForm')){$('#backupSettingsForm').onsubmit=saveBackupSettings;$('#createBackup').onclick=createBackup;$('#uploadBackup').onclick=uploadBackup;bindBackupActions();if($('#analyzeLegacyJson'))$('#analyzeLegacyJson').onclick=analyzeLegacyJson;if($('#applyLegacyImport'))$('#applyLegacyImport').onclick=applyLegacyImport;if($('#statsRepairForm'))$('#statsRepairForm').onsubmit=repairHistoricalStats}
}
function backupCards(rows){return rows.length?rows.map(b=>`<article class="backup-card"><div><b>${esc(b.name)}</b><small>${bytes(b.size_bytes)} · ${date(b.created_at)}</small></div><div class="backup-actions"><button class="neo-btn white small" data-download-backup="${esc(b.name)}">Download</button><button class="neo-btn yellow small" data-restore-backup="${esc(b.name)}">Restore</button><button class="neo-btn red small" data-delete-backup="${esc(b.name)}">Hapus</button></div></article>`).join(''):'<div class="empty compact">Belum ada backup.</div>'}
function bindBackupActions(){$$('[data-download-backup]').forEach(b=>b.onclick=()=>downloadBackup(b.dataset.downloadBackup));$$('[data-restore-backup]').forEach(b=>b.onclick=()=>restoreBackup(b.dataset.restoreBackup));$$('[data-delete-backup]').forEach(b=>b.onclick=()=>remove(`/api/admin/backups?name=${encodeURIComponent(b.dataset.deleteBackup)}`,'Hapus backup ini?',loadSettings))}
async function saveSimpleSettings(e,boolKeys=[],numberKeys=[],message='Pengaturan disimpan'){e.preventDefault();const x=Object.fromEntries(new FormData(e.target).entries());for(const k of boolKeys)x[k]=x[k]==='true';for(const k of numberKeys)x[k]=Number(x[k]||0);try{state.cache.settings=await api('/api/admin/settings',{method:'PATCH',body:x}).then(r=>r.settings||x);toast(message)}catch(err){toast(err.message,true)}}
async function saveStoreSettings(e){e.preventDefault();const x=Object.fromEntries(new FormData(e.target).entries());['store_balance'].forEach(k=>x[k]=Number(x[k]||0));x.show_total_users=x.show_total_users==='true';try{await api('/api/admin/settings',{method:'PATCH',body:x});toast('Pengaturan toko disimpan');applyShell(await api('/api/admin/overview'))}catch(err){toast(err.message,true)}}
async function savePaymentSettings(e){e.preventDefault();const x=Object.fromEntries(new FormData(e.target).entries());const method=x.autogopay_payment_method||'gopay';const url=String(x.shoppepay_gateway_url||'internal').trim();const key=String(x.shoppepay_gateway_key||'').trim();const qrisStatic=String(x.shoppepay_qris_static||'').trim();const uniqueCode=x.shoppepay_unique_code==='true';try{await api('/api/admin/settings',{method:'PATCH',body:{autogopay_payment_method:method,shoppepay_gateway_url:url,shoppepay_gateway_key:key,shoppepay_qris_static:qrisStatic,shoppepay_unique_code:uniqueCode}});if(state.cache.settings){state.cache.settings.autogopay_payment_method=method;state.cache.settings.shoppepay_gateway_url=url;state.cache.settings.shoppepay_gateway_key=key;state.cache.settings.shoppepay_qris_static=qrisStatic;state.cache.settings.shoppepay_unique_code=uniqueCode;}toast('Pengaturan pembayaran & QRIS disimpan')}catch(err){toast(err.message,true)}}
function openUpdateShoppepayTokenModal(){const curQris=esc(state.cache.settings?.shoppepay_qris_static||'');modal('Perbarui Token & QRIS ShopeePay Live',`<div class="form-grid"><div class="full info-note">Masukkan token ShopeePay Partner Portal (<code>SHOPEE_TOKEN</code>) dan/atau String QRIS Statis toko Anda. Tersimpan ke database dan aktif seketika tanpa perlu restart server.</div><label class="full">Token ShopeePay Baru (SHOPEE_TOKEN)<textarea id="liveShoppepayToken" rows="3" placeholder="Masukkan token ShopeePay (dari Partner Portal)..." style="font-family:monospace;font-size:12px;"></textarea><small>Diperoleh dari Cookies / Storage / Network request ShopeePay Partner Portal.</small></label><label class="full">String QRIS Statis Merchant (Opsional)<textarea id="liveShoppepayQris" rows="2" placeholder="00020101021126670016ID.CO.SHOPEE.WWW..." style="font-family:monospace;font-size:12px;">${curQris}</textarea><small>String teks dari scan QR code QRIS ShopeePay toko Anda (via Google Lens / QR Scanner).</small></label></div>`,async()=>{const tok=String($('#liveShoppepayToken')?.value||'').trim();const qris=String($('#liveShoppepayQris')?.value||'').trim();if(!tok&&!qris)return toast('Token atau QRIS Statis ShopeePay harus diisi.',true);try{toast('Menyimpan konfigurasi ShopeePay live...');const body={};if(tok)body.token=tok;if(qris)body.qris_static=qris;const res=await api('/api/admin/integrations/shoppepay-update-token',{method:'POST',body});if(state.cache.settings){if(tok)state.cache.settings.shoppepay_token=tok;if(qris)state.cache.settings.shoppepay_qris_static=qris;}toast(res.data?.message||res.message||'Konfigurasi ShopeePay berhasil diperbarui secara live!');testPayment('shoppepay_self');}catch(e){toast('Gagal update: '+e.message,true);}})}
async function checkShoppepayTokenStatus(){const host=$('#spayTokenStatusBox');if(!host)return;host.style.display='block';host.innerHTML='<span class="muted">Mengecek status ShopeePay Gateway & token...</span>';try{const res=await testPayment('shoppepay_self');if(!res)return;const ok=res.ok;const tokStatus=res.token_status||(ok?'valid':'invalid');host.innerHTML=`<div class="supplier-summary" style="margin-top:6px;padding:10px;background:var(--bg-soft);border-radius:8px;border:1px solid var(--border)"><div>Status Gateway: <span class="badge ${ok?'ok':'bad'}">${esc(res.health||(ok?'running':'offline'))}</span></div><div>Status Token: <span class="badge ${tokStatus==='valid'?'ok':'bad'}">${esc(tokStatus)}</span></div><div style="font-size:12px;color:var(--text-muted);margin-top:4px">${esc(res.message||'')}</div></div>`;}catch(err){host.innerHTML=`<span class="badge bad">${esc(err.message)}</span>`;}}
async function saveBackupSettings(e){e.preventDefault();const x=Object.fromEntries(new FormData(e.target).entries());x.auto_backup_enabled=x.auto_backup_enabled==='true';x.backup_interval_hours=Math.max(1,Number(x.backup_interval_hours||6));x.backup_retention=Math.max(1,Number(x.backup_retention||30));try{await api('/api/admin/settings',{method:'PATCH',body:x});toast('Jadwal backup disimpan');await loadSettings()}catch(err){toast(err.message,true)}}
async function testPayment(channel){const ch=channel||state.cache.settings?.autogopay_payment_method||'gopay';const host=$(`#qrisStatus-${ch}`);if(host)host.innerHTML='<span class="muted">Mengecek...</span>';try{const r=await api(`/api/admin/integrations/payment-status?channel=${encodeURIComponent(ch)}`);if(host)host.innerHTML=`<span class="badge ${r.data.ok?'ok':'bad'}">${esc(r.data.message)}</span>`;return r.data}catch(e){if(host)host.innerHTML=`<span class="badge bad">${esc(e.message)}</span>`;return null}}
async function testSupplier(source){try{const r=await api(`/api/admin/integrations/supplier-status?source=${source}`);$('#supplierStatus').innerHTML=`<span class="badge ok">${esc(source)} · Saldo ${esc(Number(r.data.balance||0).toLocaleString('id-ID'))} ${esc(r.data.balanceUnit||'')}</span>`}catch(e){$('#supplierStatus').innerHTML=`<span class="badge bad">${esc(source)} · ${esc(e.message)}</span>`}}
async function refreshSupplierHub(force=false){const host=$('#supplierHub');if(!host)return;host.innerHTML='<div class="empty compact">Memuat saldo dan katalog supplier...</div>';const sources=[['prodseller','ProdSeller'],['storebat','Storebat']];const cards=[];for(const[source,label]of sources){try{const[st,rows]=await Promise.all([api(`/api/admin/integrations/supplier-status?source=${source}${force?'&force=1':''}`),loadSupplierCatalog(source,force)]);cards.push(`<article class="supplier-panel"><div class="supplier-panel-head"><div><h4>${esc(label)}</h4><p>${esc(st.data.account||st.data.membership||'API reseller')}</p></div><div class="supplier-balance"><small>Balance API</small><b>${esc(Number(st.data.balance||0).toLocaleString('id-ID'))} ${esc(st.data.balanceUnit||'')}</b></div></div><div class="supplier-summary"><span>${rows.length} produk</span>${st.data.membership?`<span>Membership: ${esc(st.data.membership)}</span>`:''}</div><div class="supplier-catalog">${rows.length?rows.map(x=>`<div class="supplier-product"><div><b>${esc(x.name)}</b><small>ID ${esc(x.id)} · ${esc(supplierPrice(x))} · stok ${x.stock==null?'?':x.stock}</small></div><div class="supplier-product-actions">${badge(x.inStock===false?'offline':'active')}<button type="button" class="neo-btn blue tiny" data-supplier-import data-source="${esc(source)}" data-product-id="${esc(x.id)}">Masukkan</button></div></div>`).join(''):'<div class="empty compact">Katalog kosong.</div>'}</div><p class="muted">Tombol Masukkan bisa membuat produk baru atau menghubungkan item supplier sebagai varian produk yang sudah ada.</p></article>`)}catch(e){cards.push(`<article class="supplier-panel"><div class="supplier-panel-head"><div><h4>${esc(label)}</h4><p>Belum siap / gagal terhubung.</p></div>${badge('offline')}</div><div class="empty compact">${esc(e.message)}</div></article>`)}}host.innerHTML=`<div class="supplier-grid">${cards.join('')}</div>`;$$('[data-supplier-import]',host).forEach(b=>b.onclick=()=>openSupplierImport(b.dataset.source,b.dataset.productId));}
function freshProductEmoji(key=''){
  const k=String(key||'').toLowerCase();
  if(k.includes('zoom'))return '📹';
  if(k.includes('canva'))return '🎨';
  if(k.includes('picsart'))return '🖌️';
  if(k.includes('meitu'))return '📸';
  if(k.includes('wink'))return '✨';
  if(k.includes('outlook'))return '✉️';
  if(k.includes('hotmail'))return '📧';
  if(k.includes('apple')||k.includes('music'))return '🎵';
  if(k.includes('vpn')||k.includes('express'))return '🛡️';
  if(k.includes('hma'))return '🔒';
  if(k.includes('scribd'))return '📚';
  if(k.includes('remini'))return '🪄';
  if(k.includes('adspower'))return '🌐';
  return '⚡';
}

function freshProductCard(r, index, globalEnabled=true, maintenance=false){
  const p=r.presentation||{};
  const apiRange=freshPriceRange(r);
  const sellMin=Number(r.sell_price_min??r.sell_price??0);
  const sellMax=Number(r.sell_price_max??r.sell_price??0);
  const sellRange=sellMin===sellMax?money(sellMin):`${money(sellMin)} – ${money(sellMax)}`;
  const apiReady=!maintenance&&r.available!==false;
  const isGenActive=apiReady&&globalEnabled&&Boolean(r.enabled);
  const readyCfg=p.ready_stock||{};
  const readyCount=Math.max(0,Number(r.ready_stock_count||0));
  const isReadyActive=readyCfg.enabled===true;

  const cardState=readyCount>0?'ready':(isGenActive?'preorder':'empty');
  const cardStatePill=readyCount>0?`Ready ${readyCount}`:(isGenActive?'GEN ON':(!apiReady?'API OFF':'NONAKTIF'));

  const emoji=p.emoji||freshProductEmoji(r.product_key);
  const thumb=`<span class="thumb-fallback">${emoji}</span>${p.image_url?`<img src="${esc(mediaSrc(p.image_url))}" alt="${esc(r.name||r.product_key)}" loading="lazy" onerror="this.remove()">`:''}`;

  const modes=Array.isArray(r.options?.mode?.pilihan)?r.options.mode.pilihan.map(String):[];
  const priceRows=Array.isArray(r.price_options)?r.price_options:[];

  const chips=[];
  if(modes.length){
    chips.push(...modes.slice(0,3).map(m=>`<span class="variant-chip">${esc(p.mode_labels?.[m]||m)}</span>`));
    if(modes.length>3)chips.push(`<span class="variant-chip muted">+${modes.length-3} Mode</span>`);
  }
  if(priceRows.length>1){
    chips.push(`<span class="variant-chip stock-ready">${priceRows.length} Opsi Harga</span>`);
  }
  if(isReadyActive){
    chips.push(`<span class="variant-chip ${readyCount>0?'stock-ready':'stock-empty'}">Ready Toko: ${readyCount}</span>`);
  }else{
    chips.push(`<span class="variant-chip muted">Ready Toko: OFF</span>`);
  }
  if(Number(r.qty_max||1)>1){
    chips.push(`<span class="variant-chip muted">Maks ${r.qty_max} qty</span>`);
  }
  const resAllowed=r.reseller_allowed!==0;
  let resPriceTxt='';
  if(resAllowed){
    const resMin=Number(r.reseller_price_min??r.reseller_price??0);
    const resMax=Number(r.reseller_price_max??r.reseller_price??0);
    if(resMin>0||resMax>0){
      resPriceTxt=` · Modal ${resMin===resMax?money(resMin):`${money(resMin)} – ${money(resMax)}`}`;
    }
  }
  chips.push(`<span class="variant-chip ${resAllowed?'stock-ready':'stock-empty'}">${resAllowed?'Reseller ON':'Reseller OFF'}${resPriceTxt}</span>`);

  return `<article class="product-card stock-${cardState}" data-fresh-card="${esc(r.product_key)}">
    <span class="product-index">${String(index+1).padStart(2,'0')}</span>
    <div class="product-thumb">${thumb}</div>
    <div class="product-body">
      <div class="product-head">
        <div class="product-title">
          <h3>${esc(r.name||r.product_key)}</h3>
          <p>Key: <code>${esc(r.product_key)}</code> · ${priceRows.length||1} Opsi Harga</p>
          <span class="tag-chip"># FRESH BOT</span>${!resAllowed?'<span class="tag-chip" style="background:#fee2e2;color:#b91c1c;border-color:#b91c1c"># KHUSUS OWNER</span>':''}
        </div>
        <div class="product-head-actions">
          <span class="stock-state-pill ${cardState}">${cardStatePill}</span>
          <button class="toggle ${r.enabled?'':'off'}" data-jaspay-toggle="${esc(r.product_key)}" data-enabled="${r.enabled?'1':'0'}" title="Aktifkan/Matikan Generate API">${r.enabled?'ON':'OFF'}</button>
        </div>
      </div>
      <div class="product-info">
        <div class="info-box stock-box ${readyCount>0?'ready':(isReadyActive?'empty':'preorder')}">
          <small>📦 Stok Ready Lokal</small>
          <strong>${readyCount}</strong>
          <em>${isReadyActive?(readyCount>0?'Tampil di Bot':'Stok Kosong'):'Ready Toko OFF'}</em>
        </div>
        <div class="info-box price">
          <small>🏷 Harga Jual</small>
          <strong>${sellRange}</strong>
          <em>Modal API: ${apiRange}</em>
        </div>
      </div>
      <div class="variant-row">${chips.join('')}</div>
      <div class="product-actions">
        <button class="neo-btn blue small" data-jaspay-edit="${esc(r.product_key)}">✎ ATUR</button>
        <button class="neo-btn green small" data-jaspay-ready-stock="${esc(r.product_key)}">📦 STOK READY (${readyCount})</button>
        <button class="neo-btn ${r.enabled?'yellow':'purple'} small" data-jaspay-toggle="${esc(r.product_key)}" data-enabled="${r.enabled?'1':'0'}">${r.enabled?'⏸ MATIKAN':'▶ AKTIFKAN'}</button>
      </div>
    </div>
  </article>`;
}

function renderFreshProductCards(rows, globalEnabled=true, maintenance=false){
  if(!rows||!rows.length){
    return `<div class="empty-product"><h3>Belum ada produk Fresh</h3><p>Pastikan JASPAY_API_KEY terisi di server VPS lalu tekan Refresh Fresh.</p></div>`;
  }
  return rows.map((r,i)=>freshProductCard(r,i,globalEnabled,maintenance)).join('');
}

async function loadFresh(){
  const res=await api('/api/admin/settings'),x=res.settings||{};
  state.cache.settings={...(state.cache.settings||{}),...x};
  $('#content').innerHTML=`<div class="fresh-admin-page">
    <div class="section-title product-section-title">
      <div>
        <h2>⚡ Jaspay Fresh &amp; Ready Stok</h2>
        <p>Katalog produk fresh otomatis (API Bot) dan stok ready toko.</p>
      </div>
      <div class="section-actions" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button id="toggleFreshConfig" type="button" class="neo-btn white small">⚙️ Pengaturan Global</button>
        <button id="refreshJaspayHub" type="button" class="neo-btn purple small">↻ Refresh Fresh</button>
      </div>
    </div>

    <section id="freshConfigSection" class="settings-section single-panel hidden" style="margin-bottom:14px">
      <div class="section-head">
        <div>
          <h3>⚙️ Pengaturan Global Fresh &amp; Ready Stok</h3>
          <p>Atur sakelar utama bot dan pesan pengantar halaman READY STOK.</p>
        </div>
      </div>
      <form id="jaspaySettingsForm" class="form-grid">
        <label>Status Produk Fresh
          <select name="jaspay_enabled">
            <option value="true" ${x.jaspay_enabled===true?'selected':''}>Aktif</option>
            <option value="false" ${x.jaspay_enabled!==true?'selected':''}>Nonaktif</option>
          </select>
        </label>
        <label>Partial / Gagal
          <select name="jaspay_partial_mode">
            <option value="refund_wallet" ${String(x.jaspay_partial_mode||'refund_wallet')==='refund_wallet'?'selected':''}>Refund sesuai aturan ke Saldo Bot</option>
          </select>
        </label>
        <label class="full">JASPAY API Key (Supplier)
          <input name="jaspay_api_key" type="password" value="${esc(x.jaspay_api_key||'')}" placeholder="Kosongkan jika sudah diisi di .env VPS, atau masukkan API Key di sini">
          <small>API Key dipakai bot untuk mengecek saldo live, katalog produk, dan generate akun otomatis. Bisa diisi di sini tanpa restart VPS.</small>
        </label>
        <label class="full">Teks Halaman READY STOK
          <textarea name="jaspay_ready_intro" rows="8" spellcheck="false">${esc(x.jaspay_ready_intro||'')}</textarea>
          <small>Mendukung Telegram HTML seperti &lt;b&gt;tebal&lt;/b&gt;. Produk, harga, dan jumlah stok dikelola dari kartu Produk Fresh di bawah.</small>
        </label>
        <div class="full info-note"><b>Generate Fresh</b> diproses oleh API Jaspay. <b>Ready Stok</b> adalah inventory lokal milik toko: akun kamu sendiri, stok berkurang otomatis saat terjual, dan harganya mengikuti kombinasi harga Produk Fresh yang kamu pilih.</div>
        <div class="full form-actions">
          <button class="neo-btn purple" type="submit">Simpan Pengaturan Fresh</button>
        </div>
      </form>
    </section>

    <div id="jaspayHub">
      <div class="empty compact">Memuat status API, stok lokal, katalog, dan daftar harga Fresh...</div>
    </div>
  </div>`;

  $('#toggleFreshConfig').onclick=()=>{
    const sec=$('#freshConfigSection');
    if(!sec)return;
    const isHidden=sec.classList.toggle('hidden');
    $('#toggleFreshConfig').textContent=isHidden?'⚙️ Pengaturan Global':'✕ Tutup Pengaturan';
  };

  $('#jaspaySettingsForm').onsubmit=async e=>{
    e.preventDefault();
    const b=Object.fromEntries(new FormData(e.target).entries());
    b.jaspay_enabled=b.jaspay_enabled==='true';
    if(b.jaspay_api_key!==undefined)b.jaspay_api_key=String(b.jaspay_api_key).trim();
    try{
      const saved=await api('/api/admin/settings',{method:'PATCH',body:b});
      state.cache.settings={...(state.cache.settings||{}),...(saved.settings||b)};
      toast(`Pengaturan Jaspay Fresh disimpan`);
      await refreshJaspayHub(true);
    }catch(err){toast(err.message,true);}
  };

  $('#refreshJaspayHub').onclick=()=>refreshJaspayHub(true);
  await refreshJaspayHub(true);
}

async function refreshJaspayHub(force=false,targetKey=null){
  const host=$('#jaspayHub');if(!host)return;
  const grid=$('#freshProductGrid');
  const isInitial=!grid;
  const scrollY=window.scrollY;
  const searchVal=$('#freshSearch')?.value||'';
  const statusVal=$('#freshFilterStatus')?.value||'';
  if(isInitial){host.innerHTML='<div class="empty compact">Memuat status API, stok lokal, katalog, dan daftar harga Fresh...</div>';}
  try{
    const[st,pr]=await Promise.all([
      api(`/api/admin/integrations/jaspay/status${force?'?force=1':''}`),
      api(`/api/admin/integrations/jaspay/products${force?'?force=1':''}`)
    ]);
    const x=st.data||{},q=x.queue||{},rows=pr.items||[];
    const maintenance=Boolean(st.maintenance||pr.maintenance);
    const globalEnabled=st.enabled===true;
    const isConfigured=st.configured!==false;
    const manualReady=Math.max(0,Number(pr.manual_ready_stock_total||0));
    state.cache.jaspayProducts=rows;

    let balanceVal=null;
    if(x.balance!=null&&x.balance!=='')balanceVal=Number(x.balance);
    else if(x.raw_balance!=null&&x.raw_balance!=='')balanceVal=Number(x.raw_balance);

    let balanceTitle='-';
    let balanceSub='Saldo akun supplier';
    let balanceColor='pink';

    if(!isConfigured){
      balanceTitle='Belum Ada Key';
      balanceSub='Isi API Key di ⚙️ Pengaturan Global';
      balanceColor='yellow';
    }else if(maintenance){
      balanceTitle='Perbaikan';
      balanceSub=esc(st.health?.message||'Sedang maintenance API');
      balanceColor='yellow';
    }else if(st.error){
      balanceTitle='Gagal Cek';
      balanceSub=esc(st.error);
      balanceColor='yellow';
    }else if(balanceVal!==null&&!isNaN(balanceVal)){
      balanceTitle=`${balanceVal.toLocaleString('en-US',{maximumFractionDigits:2})} Credit`;
      const rem=Number(x.daily_remaining||0);
      balanceSub=rem>0?`Sisa limit: ${rem.toLocaleString('en-US')} Credit`:'Saldo aktif Jaspay';
      balanceColor='green';
    }

    const statusLabel=maintenance?'Maintenance':(globalEnabled?'Aktif':'Nonaktif');
    const dotState=!maintenance&&globalEnabled?'online':'offline';

    if(isInitial){
      host.innerHTML=`
        <div class="dashboard-kpis fresh-kpis">
          ${stat('⚡', dotState==='online'?'green':'yellow', 'Status Fresh', statusLabel, maintenance?'Sedang perbaikan':(!isConfigured?'API Key Kosong':(globalEnabled?'API Online':'Global OFF')))}
          ${stat('👛', balanceColor, 'Saldo API Jaspay', balanceTitle, balanceSub)}
          ${stat('📦', 'green', 'Ready Stok Toko', manualReady+' Akun', 'Inventory milik toko')}
          ${stat('⏳', 'purple', 'Antrean API', `${Number(q.in_use||0)}/${Number(q.max||0)}`, q.error?`Info: ${esc(q.error)}`:`Menunggu: ${Number(q.waiting||0)}`)}
        </div>

        ${!isConfigured?`<div class="warning-note" style="margin-bottom:12px"><b>⚠️ JASPAY API Key Belum Diatur</b><br>Bot belum dapat mengecek saldo live dan generate akun otomatis. Masukkan API Key melalui tombol <b>⚙️ Pengaturan Global</b> di atas atau di file <code>.env</code> VPS.</div>`:''}
        ${st.error&&isConfigured?`<div class="warning-note" style="margin-bottom:12px"><b>⚠️ Tidak Dapat Terhubung ke API Jaspay</b><br>${esc(st.error)}<br><small>Pastikan API Key benar dan aktif. Buka <b>⚙️ Pengaturan Global</b> jika perlu memperbarui API Key.</small></div>`:''}
        ${maintenance?`<div class="warning-note" style="margin-bottom:12px"><b>🔴 Maintenance API Generate</b><br>${esc(st.health?.message||pr.health?.message||st.error||pr.error||'Bot sedang di update/perbaikan.')}<br><small>Inventory Ready Stok lokal tidak mengambil stok dari endpoint Ready Stock Jaspay.</small></div>`:''}

        <div class="toolbar product-toolbar">
          <div class="searchbox"><input id="freshSearch" placeholder="Cari nama atau key produk fresh..."></div>
          <select id="freshFilterStatus">
            <option value="">Semua Status</option>
            <option value="active">Generate Aktif (ON)</option>
            <option value="inactive">Generate Nonaktif (OFF)</option>
            <option value="api_ready">API Ready</option>
            <option value="has_stock">Ada Stok Ready Lokal</option>
            <option value="no_stock">Stok Ready Kosong</option>
          </select>
          <span id="freshProductCount" class="muted" style="font-size:11px;font-weight:800;margin-left:auto">${rows.length} produk</span>
        </div>

        <div id="freshProductGrid" class="product-grid">
          ${renderFreshProductCards(rows, globalEnabled, maintenance)}
        </div>
      `;
    }

    const filter=()=>{
      const q=($('#freshSearch')?.value||'').toLowerCase().trim();
      const st=$('#freshFilterStatus')?.value||'';
      const filtered=(state.cache.jaspayProducts||[]).filter(r=>{
        const matchQ=!q||[r.name,r.product_key].some(v=>String(v||'').toLowerCase().includes(q));
        if(!matchQ)return false;
        if(st==='active')return r.enabled&&r.available!==false;
        if(st==='inactive')return !r.enabled||r.available===false;
        if(st==='api_ready')return r.available!==false;
        if(st==='has_stock')return Number(r.ready_stock_count||0)>0;
        if(st==='no_stock')return Number(r.ready_stock_count||0)===0;
        return true;
      });
      const currentGrid=$('#freshProductGrid');
      if(currentGrid)currentGrid.innerHTML=renderFreshProductCards(filtered,globalEnabled,maintenance);
      const counter=$('#freshProductCount');
      if(counter)counter.textContent=`${filtered.length} dari ${rows.length} produk`;
      bindFreshProductActions();
    };

    if(isInitial){
      if($('#freshSearch'))$('#freshSearch').oninput=filter;
      if($('#freshFilterStatus'))$('#freshFilterStatus').onchange=filter;
    }else{
      if($('#freshSearch')&&searchVal)$('#freshSearch').value=searchVal;
      if($('#freshFilterStatus')&&statusVal)$('#freshFilterStatus').value=statusVal;
      filter();
    }
    bindFreshProductActions();
    if(!isInitial){
      if(targetKey){
        const targetEl=$(`[data-jaspay-edit="${targetKey}"],[data-jaspay-ready-stock="${targetKey}"]`);
        if(targetEl)targetEl.closest('.product-card')?.scrollIntoView({behavior:'smooth',block:'nearest'});
        else window.scrollTo({top:scrollY,behavior:'instant'});
      }else{
        window.scrollTo({top:scrollY,behavior:'instant'});
      }
    }
  }catch(e){
    if(isInitial)host.innerHTML=`<div class="warning-note"><b>Jaspay Fresh belum siap:</b> ${esc(e.message)}<br><small>Pastikan koneksi backend aktif. Ready Stok lokal tetap berada di database VPS.</small></div>`;
    else toast(e.message,true);
  }
}

function bindFreshProductActions(){
  $$('[data-jaspay-edit]').forEach(b=>b.onclick=()=>openJaspayProduct(b.dataset.jaspayEdit));
  $$('[data-jaspay-ready-stock]').forEach(b=>b.onclick=()=>openJaspayReadyStock(b.dataset.jaspayReadyStock));
  $$('[data-jaspay-toggle]').forEach(b=>b.onclick=async()=>{
    const key=b.dataset.jaspayToggle,next=b.dataset.enabled!=='1';
    try{
      b.disabled=true;
      await api(`/api/admin/integrations/jaspay/products/${encodeURIComponent(key)}`,{method:'PATCH',body:{enabled:next}});
      toast(`Produk Fresh ${key} ${next?'diaktifkan':'dinonaktifkan'}`);
      await refreshJaspayHub(false,key);
    }catch(e){toast(e.message,true);}finally{b.disabled=false;}
  });
}
async function openJaspayReadyStock(key){
  const r=(state.cache.jaspayProducts||[]).find(x=>String(x.product_key)===String(key));if(!r)return toast('Produk Fresh tidak ditemukan.',true);
  try{
    const data=await api(`/api/admin/integrations/jaspay/ready-stock?product_key=${encodeURIComponent(key)}`),items=Array.isArray(data.items)?data.items:[],text=items.map(x=>String(x.value||'')).filter(Boolean).join('\n'),cfg=r.presentation?.ready_stock||{};
    modal('▦ Stok Ready · '+r.name,`<div class="ready-stock-editor"><div class="ready-stock-stats"><span>Available <b>${Number(data.available_count??data.count??0)}</b></span><span>Reserved <b>${Number(data.reserved_count||0)}</b></span><span>Terjual <b>${Number(data.sold_count||0)}</b></span></div><div class="info-note">Stok ini <b>milik toko sendiri</b>, bukan stok endpoint Jaspay. Satu baris = satu akun/data yang akan dikirim persis kepada pembeli. Harga mengikuti kombinasi harga Produk Fresh yang dipilih di menu <b>Atur</b>.</div><div class="form-grid"><label>Mode Update<select name="mode"><option value="replace" selected>Ganti seluruh stok available</option><option value="add">Tambahkan ke stok existing</option></select></label><label>Status Ready Stok<input disabled value="${cfg.enabled===true?'Aktif di halaman READY STOK':'Belum diaktifkan di menu Atur'}"></label><label class="full">Data Akun Ready Stok<textarea name="text" rows="15" spellcheck="false" placeholder="email|password|data lain, satu akun per baris">${esc(text)}</textarea><small>Baris Reserved tidak ikut terhapus saat mode Ganti, supaya order QRIS yang sedang menunggu tidak kehilangan stok.</small></label></div></div>`,async b=>{
      const out=await api('/api/admin/integrations/jaspay/ready-stock',{method:'POST',body:{product_key:key,mode:b.mode||'replace',text:b.text||''}});toast(`Stok Ready disimpan · available ${Number(out.available_count??out.count??0)}`);await refreshJaspayHub(false,key);
    },{submit:'Simpan Stok Ready'});
  }catch(e){toast(e.message,true)}
}
function openJaspayProduct(key){
  const r=(state.cache.jaspayProducts||[]).find(x=>String(x.product_key)===String(key));if(!r)return toast('Produk Fresh tidak ditemukan.',true);
  const p=r.presentation||{},modes=Array.isArray(r.options?.mode?.pilihan)?r.options.mode.pilihan.map(String):[],supportsNew=modes.includes('baru'),supportsRenew=modes.includes('perpanjang'),labels=p.mode_labels||{},descs=p.mode_descriptions||{},styles=p.mode_styles||{},modeOrder=Array.isArray(p.mode_order)?p.mode_order:[],orderDefaults=p.order_defaults||{},accountSettings=p.account_settings||{},renewal=p.renewal_pricing||{},hidden=new Set(Array.isArray(p.hidden_modes)?p.hidden_modes:[]),priceRows=Array.isArray(r.price_options)?r.price_options:[],readyCfg=p.ready_stock&&typeof p.ready_stock==='object'?p.ready_stock:{};
  let readyIndex=priceRows.findIndex(x=>freshOptionKey(x.options||{})===freshOptionKey(readyCfg.options||{}));
  if(readyIndex<0&&priceRows.length>0&&readyCfg.options&&Object.keys(readyCfg.options).length){
    readyIndex=priceRows.findIndex(x=>{
      const xKey=freshOptionKey(Object.fromEntries(Object.entries(x.options||{}).filter(([k])=>!['accounts','accounts_token','password','domain','name','username','usernames','email','emails','recovery','recovery_email','recovery_provider','order_id','suffix_digits'].includes(k))));
      const cfgKey=freshOptionKey(Object.fromEntries(Object.entries(readyCfg.options||{}).filter(([k])=>!['accounts','accounts_token','password','domain','name','username','usernames','email','emails','recovery','recovery_email','recovery_provider','order_id','suffix_digits'].includes(k))));
      return xKey===cfgKey;
    });
  }
  if(readyIndex<0&&priceRows.length>0)readyIndex=0;
  const styleOptions=(cur)=>`<option value="success" ${cur==='success'||!cur?'selected':''}>Hijau</option><option value="primary" ${cur==='primary'?'selected':''}>Biru</option><option value="danger" ${cur==='danger'?'selected':''}>Merah</option>`;
  const modeFields=modes.length?`<div class="full settings-subcard"><h4>🎛 Tampilan Mode di Bot</h4><p class="muted">Atur nama, deskripsi, urutan, warna tombol, dan apakah mode ditampilkan ke customer.</p>${modes.map((m,i)=>`<div class="form-grid compact-grid"><label>Mode API<input disabled value="${esc(m)}"></label><label>Nama Tombol<input name="mode_label_${i}" value="${esc(labels[m]||String(m).replace(/[_-]+/g,' ').replace(/\b\w/g,x=>x.toUpperCase()))}"></label><label>Urutan<input name="mode_order_${i}" type="number" min="1" value="${Math.max(1,(modeOrder.indexOf(String(m))>=0?modeOrder.indexOf(String(m)):i)+1)}"></label><label>Warna Tombol<select name="mode_style_${i}">${styleOptions(styles[m]||'success')}</select></label><label class="full">Deskripsi Mode<textarea name="mode_desc_${i}" rows="2">${esc(descs[m]||'')}</textarea></label><label>Tampilkan<select name="mode_show_${i}"><option value="true" ${!hidden.has(String(m))?'selected':''}>Ya</option><option value="false" ${hidden.has(String(m))?'selected':''}>Tidak</option></select></label><input type="hidden" name="mode_key_${i}" value="${esc(m)}"></div>`).join('')}</div>`:'';
  const accountSection=supportsNew?`<div class="full settings-subcard"><h4>🧩 Default Pembuatan Akun</h4><p class="muted">Hanya muncul karena produk ini mendukung mode Akun Baru. Nilai awal dipakai Bot ketika membuat akun fresh.</p><div class="form-grid"><label>Nama Default<input name="order_default_name" placeholder="Mr iLink" value="${esc(orderDefaults.name||'')}"></label><label>Domain Default<input name="order_default_domain" placeholder="ilinkin.store" value="${esc(orderDefaults.domain||'')}"></label><label>Password Default<input name="order_default_password" type="text" autocomplete="off" placeholder="Password akun fresh" value="${esc(orderDefaults.password||'')}"></label><label>Angka / Suffix Digit<input name="order_default_suffix_digits" type="number" min="0" max="12" value="${esc(orderDefaults.suffix_digits??'')}"></label><label>User boleh Setting Akun<select name="account_allow_edit"><option value="true" ${accountSettings.allow_user_edit!==false?'selected':''}>Ya</option><option value="false" ${accountSettings.allow_user_edit===false?'selected':''}>Tidak</option></select></label><label>Boleh ubah Nama<select name="account_edit_name"><option value="true" ${accountSettings.edit_name!==false?'selected':''}>Ya</option><option value="false" ${accountSettings.edit_name===false?'selected':''}>Tidak</option></select></label><label>Boleh ubah Domain<select name="account_edit_domain"><option value="true" ${accountSettings.edit_domain!==false?'selected':''}>Ya</option><option value="false" ${accountSettings.edit_domain===false?'selected':''}>Tidak</option></select></label><label>Boleh ubah Password<select name="account_edit_password"><option value="true" ${accountSettings.edit_password!==false?'selected':''}>Ya</option><option value="false" ${accountSettings.edit_password===false?'selected':''}>Tidak</option></select></label><label>Boleh ubah Angka<select name="account_edit_suffix"><option value="true" ${accountSettings.edit_suffix_digits!==false?'selected':''}>Ya</option><option value="false" ${accountSettings.edit_suffix_digits===false?'selected':''}>Tidak</option></select></label></div></div>`:'';
  const renewalSection=supportsRenew?`<div class="full settings-subcard"><h4>↻ Harga & Refund Perpanjang</h4><p class="muted">Hanya muncul karena produk ini mempunyai mode Perpanjang.</p><div class="form-grid"><label>Harga Perpanjang 7 Hari<input name="renew_sell_7" type="number" min="0" placeholder="0 = ikut harga umum" value="${Number(renewal?.['7']?.sell_price||0)}"></label><label>Refund Gagal 7 Hari<input name="renew_refund_7" type="number" min="0" placeholder="Kosong = refund penuh" value="${renewal?.['7']?.refund_fail??''}"></label><label>Harga Perpanjang 14 Hari<input name="renew_sell_14" type="number" min="0" placeholder="contoh 12000" value="${Number(renewal?.['14']?.sell_price||0)}"></label><label>Refund Gagal 14 Hari<input name="renew_refund_14" type="number" min="0" placeholder="contoh 4000" value="${renewal?.['14']?.refund_fail??''}"></label></div><div class="info-note">Jika item gagal diproses, nilai refund yang kamu atur dikembalikan ke Saldo Bot user.</div></div>`:'';
  const apiPriceSection=`<div class="full settings-subcard"><h4>💵 Harga Jual &amp; Modal Reseller per Pilihan API</h4><p class="muted">Setiap kombinasi paket, varian, mode, login, dan durasi dapat memiliki harga jual sendiri dan harga modal reseller sendiri. Kosongkan harga jual untuk ikut harga umum; kosongkan modal reseller untuk ikut harga modal produk.</p>${freshPriceMatrixHtml(r,{editable:true})}</div>`;
  const readyPriceOptions=priceRows.map((x,i)=>{const label=Object.entries(x.options||{}).filter(([k])=>!['accounts','accounts_token','password','domain','name','username','usernames','email','emails','recovery','recovery_email','recovery_provider','order_id','suffix_digits'].includes(k)).map(([k,v])=>freshOptionLabel(k,v,p)).join(' · ')||'Harga dasar';return`<option value="${i}" ${readyIndex===i?'selected':''}>${esc(label)} — ${money(x.sell_price)}</option>`}).join('');
  const readySection=`<div class="full settings-subcard ready-stock-config"><h4>▦ Ready Stok Lokal</h4><p class="muted">Ready Stok adalah akun milik toko sendiri. Pilih kombinasi harga Fresh yang dipakai; jumlah akun dikelola melalui tombol Stok Ready pada katalog.</p><div class="form-grid"><label>Tampilkan di READY STOK<select name="ready_stock_enabled"><option value="true" ${readyCfg.enabled===true?'selected':''}>Ya</option><option value="false" ${readyCfg.enabled!==true?'selected':''}>Tidak</option></select></label><label>Nama Tombol Ready<input name="ready_stock_label" maxlength="60" value="${esc(readyCfg.label||p.menu_label||r.name||'')}"></label><label class="full">Pakai Harga / Paket<select name="ready_stock_price_index">${priceRows.length?readyPriceOptions:'<option value="0">Harga dasar</option>'}</select><small>Harga Ready Stok tidak disimpan terpisah. Jika harga kombinasi Fresh berubah, harga Ready Stok ikut berubah otomatis.</small></label><div class="full ready-stock-config-summary">Stok available saat ini: <b>${Number(r.ready_stock_count||0)}</b> akun</div></div></div>`;
  modal('Atur Produk Fresh · '+r.name,`<div class="form-grid"><label>Status Generate API<select name="enabled"><option value="true" ${r.enabled?'selected':''}>Aktif</option><option value="false" ${!r.enabled?'selected':''}>Nonaktif</option></select></label><label>Bisa Dijual Reseller<select name="reseller_allowed"><option value="true" ${r.reseller_allowed!==0?'selected':''}>Ya (Bisa di-reseller)</option><option value="false" ${r.reseller_allowed===0?'selected':''}>Tidak (Khusus Toko Owner)</option></select><small class="muted">Jika 'Tidak', produk fresh tidak tampil di bot & miniapp reseller</small></label><label>Rentang Modal API Jaspay<input disabled value="${esc(freshPriceRange(r))}"><small class="muted">Modal langsung dari supplier Jaspay</small></label><label>Maksimal / Order<input disabled value="${Number(r.qty_max||1)} akun"><small class="muted">Batas generate per transaksi customer</small></label>${apiPriceSection}${readySection}<div class="full settings-subcard"><h4>🤖 Tampilan Customer</h4><div class="form-grid"><label>Emoji Produk<input name="customer_emoji" maxlength="8" value="${esc(p.emoji||'⚡')}"></label><label>Nama di Menu<input name="customer_menu_label" maxlength="80" value="${esc(p.menu_label||r.name||'')}"></label><label class="full">Judul Halaman<input name="customer_title" maxlength="100" value="${esc(p.title||r.name||'')}"></label><label class="full">Deskripsi Singkat<textarea name="customer_short" rows="2">${esc(p.short_description||'')}</textarea></label><label class="full">Deskripsi Lengkap<textarea name="customer_description" rows="5">${esc(p.description||'')}</textarea></label><label>Teks Tombol Deskripsi<input name="description_button" maxlength="40" value="${esc(p.description_button||'☷ Deskripsi')}"></label><label>Warna Deskripsi<select name="description_button_style">${styleOptions(p.description_button_style||'primary')}</select></label><label>Warna Kembali<select name="back_button_style">${styleOptions(p.back_button_style||'primary')}</select></label></div></div>${accountSection}${renewalSection}${modeFields}<label class="full">Catatan Owner<textarea name="description" rows="3">${esc(r.description||'')}</textarea></label></div>`,async b=>{
    b.enabled=b.enabled==='true';b.reseller_allowed=b.reseller_allowed==='true';
    const isReadyStockEnabled=b.ready_stock_enabled==='true';
    const presentation={emoji:b.customer_emoji||'⚡',menu_label:b.customer_menu_label||r.name,title:b.customer_title||r.name,short_description:b.customer_short||'',description:b.customer_description||'',description_button:b.description_button||'☷ Deskripsi',description_button_style:b.description_button_style||'primary',back_button_style:b.back_button_style||'primary',ready_stock:{enabled:isReadyStockEnabled,label:b.ready_stock_label||p.menu_label||r.name,options:{}},order_defaults:supportsNew?{domain:b.order_default_domain||'',password:b.order_default_password||'',name:b.order_default_name||'',suffix_digits:b.order_default_suffix_digits===''?'':Math.max(0,Number(b.order_default_suffix_digits||0))}:{...(p.order_defaults||{})},account_settings:supportsNew?{allow_user_edit:b.account_allow_edit==='true',edit_name:b.account_edit_name==='true',edit_domain:b.account_edit_domain==='true',edit_password:b.account_edit_password==='true',edit_suffix_digits:b.account_edit_suffix==='true'}:{...(p.account_settings||{})},renewal_pricing:supportsRenew?{'7':{sell_price:Math.max(0,Number(b.renew_sell_7||0)),refund_fail:b.renew_refund_7===''?'':Math.max(0,Number(b.renew_refund_7||0))},'14':{sell_price:Math.max(0,Number(b.renew_sell_14||0)),refund_fail:b.renew_refund_14===''?'':Math.max(0,Number(b.renew_refund_14||0))}}:{...(p.renewal_pricing||{})},mode_labels:{},mode_descriptions:{},mode_styles:{},mode_order:[],hidden_modes:[],price_overrides:{...(p.price_overrides&&typeof p.price_overrides==='object'&&!Array.isArray(p.price_overrides)?p.price_overrides:{})},reseller_price_overrides:{...(p.reseller_price_overrides&&typeof p.reseller_price_overrides==='object'&&!Array.isArray(p.reseller_price_overrides)?p.reseller_price_overrides:{})}};
    const readyRaw=String(b.ready_stock_price_index??'').trim();
    let readyIdx=readyRaw===''?(priceRows.length>0?(readyIndex>=0?readyIndex:0):-1):Number(readyRaw);
    if(!Number.isFinite(readyIdx))readyIdx=0;
    if(priceRows.length>0){
      if(readyIdx<0||readyIdx>=priceRows.length)readyIdx=0;
      presentation.ready_stock.options={...(priceRows[readyIdx]?.options||{})};
    }else{
      presentation.ready_stock.options={...(readyCfg.options||{})};
    }
    let firstOverride=0,firstResellerOverride=0;
    for(let i=0;i<priceRows.length;i++){
      const pk=b[`price_key_${i}`]||priceRows[i].price_key||'';
      if(!pk)continue;
      delete presentation.price_overrides[pk];
      const raw=b[`price_override_${i}`];
      if(raw!==undefined&&raw!==null&&String(raw).trim()!==''){
        const value=Number(raw);
        if(Number.isFinite(value)&&value>0){
          presentation.price_overrides[pk]=Math.round(value);
          if(!firstOverride)firstOverride=Math.round(value);
        }
      }
      delete presentation.reseller_price_overrides[pk];
      const rawRes=b[`reseller_price_override_${i}`];
      if(rawRes!==undefined&&rawRes!==null&&String(rawRes).trim()!==''){
        const valRes=Number(rawRes);
        if(Number.isFinite(valRes)&&valRes>0){
          presentation.reseller_price_overrides[pk]=Math.round(valRes);
          if(!firstResellerOverride)firstResellerOverride=Math.round(valRes);
        }
      }
    }
    const ordered=[];for(let i=0;i<modes.length;i++){const mk=b[`mode_key_${i}`]||modes[i];presentation.mode_labels[mk]=b[`mode_label_${i}`]||mk;presentation.mode_descriptions[mk]=b[`mode_desc_${i}`]||'';presentation.mode_styles[mk]=b[`mode_style_${i}`]||'success';ordered.push({key:mk,n:Math.max(1,Number(b[`mode_order_${i}`]||i+1)),i});if(b[`mode_show_${i}`]!=='true')presentation.hidden_modes.push(mk);}presentation.mode_order=ordered.sort((a,c)=>a.n-c.n||a.i-c.i).map(x=>x.key);
    const body={enabled:b.enabled,reseller_allowed:b.reseller_allowed,reseller_price:firstResellerOverride||Number(r.reseller_price||0),pricing_mode:r.pricing_mode||'markup_fixed',pricing_value:firstOverride?Math.max(0,firstOverride-Number(r.api_unit_price||0)):Number(r.pricing_value||0),description:b.description||'',presentation};
    const res=await api(`/api/admin/integrations/jaspay/products/${encodeURIComponent(r.product_key)}`,{method:'PATCH',body});
    if(res?.item){const idx=(state.cache.jaspayProducts||[]).findIndex(x=>String(x.product_key)===String(r.product_key));if(idx>=0)state.cache.jaspayProducts[idx]=res.item;}
    toast('Produk Fresh disimpan');
    await refreshJaspayHub(false,r.product_key);
  },{submit:'Simpan Produk Fresh'});
}

async function loadBot(){const[sys,settings]=await Promise.all([api('/api/admin/system'),api('/api/admin/settings')]);state.cache.system=sys;state.cache.settings=settings.settings||{};state.botTab='';renderBot()}
function botTabsHtml(){const tabs=[['general','🤖','BOT TELEGRAM','Status bot, maintenance, dan pesan ketika bot dinonaktifkan.'],['start','▶️','MEDIA /START','Atur gambar, GIF, video, dan caption pembuka bot.'],['links','🔗','LINK & CHANNEL','Customer service, grup, Nokos, dan channel wajib.'],['transactions','🔔','NOTIFIKASI TRANSAKSI','Atur tujuan notifikasi order/TopUp dan kirim test.'],['diagnostic','🩺','DIAGNOSTIK BOT','Cek koneksi Telegram, latency, antrean chat, dan command owner.']];return`<section class="submenu-home bot-menu-home"><div class="submenu-home-head"><h2>Bot & Notifikasi</h2><p>Pilih bagian bot yang ingin dikelola.</p></div><nav class="submenu-card-list" aria-label="Submenu Bot & Notifikasi">${tabs.map(([k,icon,title,desc])=>`<button class="submenu-card" data-bot-tab="${k}"><span class="submenu-card-icon">${icon}</span><span class="submenu-card-copy"><b>${title}</b><small>${desc}</small></span><span class="submenu-card-arrow">›</span></button>`).join('')}</nav></section>`}
function renderBot(){const sys=state.cache.system||{},x=state.cache.settings||{};if(!state.botTab){$('#content').innerHTML=botTabsHtml();$$('[data-bot-tab]').forEach(b=>b.onclick=()=>{state.botTab=b.dataset.botTab;renderBot()});return;}let body='';if(state.botTab==='general')body=`<section class="settings-section single-panel"><div class="section-head"><div><h3>🤖 Bot Telegram</h3><p>Status bot dan mode maintenance.</p></div>${badge(sys.integrations?.telegram?.running?'running':'offline')}</div><form id="botGeneralForm" class="form-grid"><label>Status Bot<select name="bot_enabled"><option value="true" ${x.bot_enabled!==false?'selected':''}>Aktif</option><option value="false" ${x.bot_enabled===false?'selected':''}>Maintenance</option></select></label><label class="full">Pesan Maintenance<textarea name="bot_maintenance_message">${esc(x.bot_maintenance_message||'')}</textarea></label><div class="full form-actions"><button class="neo-btn purple" type="submit">Simpan Bot</button></div></form></section>`;else if(state.botTab==='start')body=`<section class="settings-section single-panel"><div class="section-head"><div><h3>🏠 Tampilan /start</h3><p>Atur media dan caption menu awal bot. File disimpan di VPS.</p></div></div><form id="startSettingsForm" class="form-grid"><label>Media /start<select name="start_media_type" id="startMediaType"><option value="none" ${!x.start_media_type||x.start_media_type==='none'?'selected':''}>Tidak Ada</option><option value="photo" ${x.start_media_type==='photo'?'selected':''}>Foto</option><option value="animation" ${x.start_media_type==='animation'||x.start_media_type==='gif'?'selected':''}>GIF / Animasi</option><option value="video" ${x.start_media_type==='video'?'selected':''}>Video</option><option value="sticker" ${x.start_media_type==='sticker'?'selected':''}>Sticker</option></select></label><label class="full">Media /start<div class="media-uploader"><input id="startMediaFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"><button type="button" id="uploadStartMedia" class="neo-btn blue small">Upload ke VPS</button><button type="button" id="clearStartMedia" class="neo-btn white small">Hapus</button></div><div class="media-upload-hint"><span>Gambar/GIF maks. 8 MB · Video MP4/WEBM maks. 40 MB</span><b id="startMediaProgress"></b></div><input name="start_media_value" id="startMediaValue" value="${esc(x.start_media_value||'')}" placeholder="vps://... atau Telegram file_id / URL"><div id="startMediaPreview" class="media-preview">${mediaPreviewHtml(x.start_media_value||'',x.start_media_type||'')}</div></label><label class="full">Caption /start<textarea name="start_media_caption">${esc(x.start_media_caption||'')}</textarea></label><div class="full form-actions"><button class="neo-btn purple" type="submit">Simpan Menu /start</button></div></form></section>`;else if(state.botTab==='links')body=`<section class="settings-section single-panel"><div class="section-head"><div><h3>🔗 Link</h3><p>Customer service, grup, Nokos, dan channel wajib.</p></div></div><form id="linkSettingsForm" class="form-grid"><label>Customer Service<input name="customer_service_link" value="${esc(x.customer_service_link||'')}" placeholder="@username atau https://..."></label><label>Grup Telegram<input name="group_link" value="${esc(x.group_link||'')}" placeholder="@username atau https://..."></label><label>Nokos / Link<input name="nokos_link" value="${esc(x.nokos_link||'')}" placeholder="@username atau https://..."></label><label>Channel Wajib ID<input name="required_channel_id" value="${esc(x.required_channel_id||'')}"></label><label>Channel Wajib Link<input name="required_channel_link" value="${esc(x.required_channel_link||'')}" placeholder="@channel atau https://..."></label><div class="full form-actions"><button class="neo-btn purple" type="submit">Simpan Link</button></div></form></section>`;else if(state.botTab==='transactions')body=`<section class="settings-section single-panel"><div class="section-head"><div><h3>💸 Notifikasi Transaksi</h3><p>Atur chat, grup, atau channel Telegram tujuan notifikasi transaksi.</p></div></div><form id="transactionNotificationForm" class="form-grid"><label>Status<select name="transaction_notifications_enabled"><option value="true" ${x.transaction_notifications_enabled!==false?'selected':''}>Aktif</option><option value="false" ${x.transaction_notifications_enabled===false?'selected':''}>Nonaktif</option></select></label><label>Tujuan Notifikasi<input name="transaction_channel_id" value="${esc(x.transaction_channel_id||'')}" placeholder="-1001234567890 atau @channel"><small>Bot harus berada di grup/channel dan memiliki izin mengirim pesan.</small></label><label>Order Berhasil<select name="transaction_notify_orders"><option value="true" ${x.transaction_notify_orders!==false?'selected':''}>Kirim</option><option value="false" ${x.transaction_notify_orders===false?'selected':''}>Jangan kirim</option></select></label><label>TopUp Berhasil<select name="transaction_notify_topups"><option value="true" ${x.transaction_notify_topups!==false?'selected':''}>Kirim</option><option value="false" ${x.transaction_notify_topups===false?'selected':''}>Jangan kirim</option></select></label><div class="full form-actions"><button class="neo-btn purple" type="submit">Simpan Notifikasi</button><button id="testTransactionNotification" class="neo-btn blue" type="button">Kirim Test</button></div></form></section>`;else body=`<div class="grid-2"><section class="settings-section"><div class="section-head"><div><h3>🩺 Status Telegram</h3><p>Diagnostik proses bot.</p></div></div><div class="system-mini-grid"><div><span>Bot</span><b>${esc(sys.integrations?.telegram?.username?'@'+sys.integrations.telegram.username:'Tidak terkonfigurasi')}</b></div><div><span>API Telegram</span><b>${Number(sys.integrations?.telegram?.last_api_latency_ms||0)} ms</b></div><div><span>Antrean Chat</span><b>${Number(sys.integrations?.telegram?.in_flight_chats||0)}</b></div><div><span>Network Failure</span><b>${Number(sys.integrations?.telegram?.network_failures||0)}</b></div><div><span>Node</span><b>${esc(sys.node)}</b></div><div><span>Uptime</span><b>${Math.floor((sys.uptime_seconds||0)/60)} menit</b></div></div>${sys.integrations?.telegram?.last_poll_error?`<div class="warning-note"><b>Telegram terakhir:</b> ${esc(sys.integrations.telegram.last_poll_error)}</div>`:''}</section><section class="settings-section"><div class="section-head"><div><h3>⌨️ Command Owner</h3><p>Perintah cepat owner.</p></div></div><div class="code-list">${['/ownermenu','/panel','/stats','/addproduk','/addstok','/editstok','/editdeskripsi','/editsnk','/bc','/bcphoto','/bcsticker','/bcpoll','/addvoucher','/rekap','/maintenance'].map(c=>`<span class="code-pill">${c}</span>`).join('')}</div></section></div>`;$('#content').innerHTML=`<div class="submenu-detail"><div class="submenu-detail-top"><button type="button" class="neo-btn white submenu-back" id="botMenuBack">← Kembali ke Bot & Notifikasi</button></div><div class="settings-tab-body">${body}</div></div>`;$('#botMenuBack').onclick=()=>{state.botTab='';renderBot()};if($('#botGeneralForm'))$('#botGeneralForm').onsubmit=e=>saveBotSettings(e,['bot_enabled']);if($('#startSettingsForm')){$('#startSettingsForm').onsubmit=e=>saveBotSettings(e,[]);$('#uploadStartMedia').onclick=async()=>{const btn=$('#uploadStartMedia'),progress=$('#startMediaProgress');try{const file=$('#startMediaFile').files?.[0];if(!file)throw new Error('Pilih gambar atau video terlebih dahulu.');const isGif=String(file.type||'').toLowerCase()==='image/gif'||/\.gif$/i.test(String(file.name||'')),isVideo=String(file.type||'').startsWith('video/')||/\.(mp4|webm)$/i.test(String(file.name||'')),isImage=!isGif&&(String(file.type||'').startsWith('image/')||/\.(jpe?g|png|webp)$/i.test(String(file.name||'')));if(!isVideo&&!isImage&&!isGif)throw new Error('Format harus JPG, PNG, WEBP, GIF, MP4, atau WEBM.');btn.disabled=true;btn.textContent='Mengupload...';progress.textContent='0%';const type=isVideo?'video':isGif?'animation':'photo',kind=isVideo?'start-video':isGif?'start-animation':'start-photo',r=await uploadMedia(file,kind,p=>{progress.textContent=p+'%'});await api('/api/admin/settings',{method:'PATCH',body:{start_media_type:type,start_media_value:r.item.key}});state.cache.settings={...(state.cache.settings||{}),start_media_type:type,start_media_value:r.item.key};$('#startMediaValue').value=r.item.key;$('#startMediaType').value=type;$('#startMediaPreview').innerHTML=mediaPreviewHtml(r.item.key,type);progress.textContent='100% · tersimpan';toast(`${isVideo?'Video':isGif?'GIF':'Gambar'} /start berhasil diupload dan langsung disimpan`)}catch(e){progress.textContent='Gagal';toast(e.message,true)}finally{btn.disabled=false;btn.textContent='Upload ke VPS'}};$('#clearStartMedia').onclick=async()=>{const old=$('#startMediaValue').value;try{if(String(old).startsWith('vps://'))await api('/api/admin/media?key='+encodeURIComponent(old),{method:'DELETE'}).catch(()=>null);await api('/api/admin/settings',{method:'PATCH',body:{start_media_type:'none',start_media_value:''}});state.cache.settings={...(state.cache.settings||{}),start_media_type:'none',start_media_value:''};$('#startMediaValue').value='';$('#startMediaType').value='none';$('#startMediaPreview').innerHTML='<span>Belum ada media.</span>';$('#startMediaProgress').textContent='';toast('Media /start dihapus')}catch(e){toast(e.message,true)}}}if($('#linkSettingsForm'))$('#linkSettingsForm').onsubmit=e=>saveBotSettings(e,[]);if($('#transactionNotificationForm')){$('#transactionNotificationForm').onsubmit=e=>saveBotSettings(e,['transaction_notifications_enabled','transaction_notify_orders','transaction_notify_topups']);$('#testTransactionNotification').onclick=async()=>{try{await api('/api/admin/bot/test-transaction-notification',{method:'POST',body:{}});toast('Test notifikasi transaksi berhasil dikirim')}catch(err){toast(err.message,true)}}}}
async function loadBroadcast(){
  if(state.broadcastPollTimer){clearInterval(state.broadcastPollTimer);state.broadcastPollTimer=null;}
  const logs=await api('/api/admin/broadcasts?limit=50').catch(()=>({items:[]}));
  const activeJob=logs.active_job;

  const renderActiveCard=(j)=>{
    if(!j||j.status==='completed')return '';
    const pct=j.total?Math.min(100,Math.round(((j.sent+j.failed)/j.total)*100)):0;
    return `<div class="broadcast-monitor-card" id="broadcastMonitor">
      <div class="broadcast-monitor-head">
        <div><b>📡 Broadcast Sedang Berjalan</b><small>Job: <code>${esc(j.id)}</code></small></div>
        ${badge(j.status||'running')}
      </div>
      <div class="broadcast-monitor-stats">
        <div class="broadcast-monitor-stat"><small>Target</small><b>${j.total||0}</b></div>
        <div class="broadcast-monitor-stat ok"><small>Terkirim</small><b>${j.sent||0}</b></div>
        <div class="broadcast-monitor-stat bad"><small>Gagal</small><b>${j.failed||0}</b></div>
      </div>
      <div class="broadcast-progress-bar"><div class="broadcast-progress-fill" style="width:${pct}%"></div></div>
    </div>`;
  };

  const renderLogCard=(x)=>{
    const btnInfo=x.button_text?`<div class="log-button-info">🔘 <b>${esc(x.button_text)}</b> ${x.button_action==='url'?`(${esc(x.button_url||'-')})`:'(Aksi: /start)'}</div>`:'';
    const targetBadge=x.target==='resellers'?'<span class="badge purple" style="padding:2px 6px;font-size:10px">🤝 Mitra Reseller</span>':'<span class="badge blue" style="padding:2px 6px;font-size:10px">👥 Semua User</span>';
    return `<article class="broadcast-log-card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div><b>${esc(x.type)}</b> ${targetBadge}</div>
        <small>${date(x.created_at)}</small>
      </div>
      <p>${esc(x.message||'-').slice(0,180)}</p>
      ${btnInfo}
      <div>
        <span>Target <b>${x.total}</b></span>
        <span style="color:#15803d;background:#ecfdf5">Terkirim <b>${x.sent}</b></span>
        <span style="color:#b91c1c;background:#fef2f2">Gagal <b>${x.failed}</b></span>
      </div>
    </article>`;
  };

  $('#content').innerHTML=`<div class="broadcast-page">
    <div id="broadcastMonitorWrap">${renderActiveCard(activeJob)}</div>
    <section class="settings-section">
      <div class="section-head">
        <div><h3>📢 Buat Broadcast</h3><p>Kirim teks, foto, sticker, atau polling ke pengguna bot atau mitra reseller.</p></div>
      </div>
      <div class="broadcast-compose">
        <form id="broadcastForm" class="form-grid">
          <label class="full">Target Penerima Pesan
            <select name="target" id="broadcastTarget" style="font-weight:700">
              <option value="all">👥 Seluruh Pengguna Bot Utama (Semua User)</option>
              <option value="resellers">🤝 Mitra Reseller Saja (User Pemilik Bot Toko)</option>
            </select>
            <small style="color:var(--muted)">Pilih "Mitra Reseller Saja" untuk mengirimkan pengumuman atau info penting khusus ke pemilik bot reseller.</small>
          </label>
          <label>Tipe
            <select name="type" id="broadcastType">
              <option value="text">Teks</option>
              <option value="photo">Foto</option>
              <option value="sticker">Sticker File ID</option>
              <option value="poll">Polling</option>
            </select>
          </label>
          <label>Media / Opsi Poll
            <input name="media" id="broadcastMedia" placeholder="vps://, URL/file_id, atau Opsi 1|Opsi 2">
          </label>
          <label class="full">Upload Foto ke VPS
            <div class="media-uploader">
              <input id="broadcastFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
              <button type="button" id="uploadBroadcastMedia" class="neo-btn blue small">Upload Foto</button>
            </div>
          </label>
          <label class="full">Pesan / Caption
            <textarea name="message" id="broadcastMessage" rows="6" placeholder="Tulis pesan broadcast..."></textarea>
          </label>
          
          <div class="full broadcast-button-card">
            <div class="broadcast-button-head">
              <label class="inline-checkbox">
                <input type="checkbox" id="broadcastBtnToggle" name="button_enabled">
                <b>🔘 Tambahkan Tombol di Bawah Pesan</b>
              </label>
            </div>
            <div id="broadcastBtnFields" class="form-grid hidden" style="margin-top:10px">
              <label>Tipe Aksi Tombol
                <select id="broadcastBtnAction" name="button_type">
                  <option value="start">🚀 Mulai Bot (/start)</option>
                  <option value="url">🔗 Buka Link URL</option>
                </select>
              </label>
              <label>Nama / Label Tombol
                <input type="text" id="broadcastBtnText" name="button_text" value="🚀 Mulai Belanja" placeholder="Contoh: Mulai Belanja, Buka Menu...">
              </label>
              <label id="broadcastBtnUrlWrap" class="full hidden">Tautan URL (Website / Channel)
                <input type="url" id="broadcastBtnUrl" name="button_url" placeholder="https://t.me/channel atau https://...">
              </label>
            </div>
          </div>

          <div class="full form-actions">
            <button class="neo-btn purple" id="broadcastSubmitBtn" type="submit">📢 Kirim Broadcast</button>
          </div>
        </form>
        <div>
          <h4>Preview Pesan</h4>
          <div id="broadcastPreview" class="broadcast-preview">
            <div class="broadcast-preview-text" id="broadcastPreviewText">Pesan broadcast akan tampil di sini.</div>
            <div class="broadcast-preview-btn-wrap hidden" id="broadcastPreviewBtnWrap">
              <button type="button" class="telegram-preview-button" id="broadcastPreviewBtn">🚀 Mulai Belanja</button>
            </div>
          </div>
        </div>
      </div>
    </section>
    <section class="settings-section">
      <div class="section-head">
        <div><h3>🧾 Riwayat Broadcast</h3><p>50 broadcast terbaru dengan rincian jumlah terkirim dan gagal.</p></div>
        <button type="button" class="neo-btn white small" id="refreshBroadcastLogs">↻ Refresh</button>
      </div>
      <div class="broadcast-log-list" id="broadcastLogList">${(logs.items||[]).length?(logs.items||[]).map(renderLogCard).join(''):'<div class="empty compact">Belum ada broadcast.</div>'}</div>
    </section>
  </div>`;

  const syncPreview=()=>{
    const msg=$('#broadcastMessage').value||'';
    $('#broadcastPreviewText').textContent=msg||'Pesan broadcast akan tampil di sini.';
    const btnOn=$('#broadcastBtnToggle').checked;
    $('#broadcastPreviewBtnWrap').classList.toggle('hidden',!btnOn);
    if(btnOn){
      $('#broadcastPreviewBtn').textContent=$('#broadcastBtnText').value||'🚀 Tombol';
    }
  };

  $('#broadcastMessage').oninput=syncPreview;
  $('#broadcastBtnText').oninput=syncPreview;

  $('#broadcastBtnToggle').onchange=()=>{
    const on=$('#broadcastBtnToggle').checked;
    $('#broadcastBtnFields').classList.toggle('hidden',!on);
    syncPreview();
  };

  $('#broadcastBtnAction').onchange=()=>{
    const isUrl=$('#broadcastBtnAction').value==='url';
    $('#broadcastBtnUrlWrap').classList.toggle('hidden',!isUrl);
    if(isUrl&&!$('#broadcastBtnText').value.trim())$('#broadcastBtnText').value='🔗 Buka Link';
    else if(!isUrl&&!$('#broadcastBtnText').value.trim())$('#broadcastBtnText').value='🚀 Mulai Belanja';
    syncPreview();
  };

  $('#uploadBroadcastMedia').onclick=async()=>{
    try{
      const file=$('#broadcastFile').files?.[0];
      const r=await uploadMedia(file,'broadcast');
      $('#broadcastMedia').value=r.item.key;
      $('#broadcastType').value='photo';
      toast('Foto broadcast tersimpan di VPS');
    }catch(e){toast(e.message,true);}
  };

  if($('#refreshBroadcastLogs'))$('#refreshBroadcastLogs').onclick=loadBroadcast;

  const startPollingJob=(jobId)=>{
    if(state.broadcastPollTimer)clearInterval(state.broadcastPollTimer);
    state.broadcastPollTimer=setInterval(async()=>{
      try{
        const st=await api(`/api/admin/broadcast/status?id=${encodeURIComponent(jobId)}`);
        const j=st.job;
        if(!j)return;
        const wrap=$('#broadcastMonitorWrap');
        if(wrap)wrap.innerHTML=renderActiveCard(j);
        if(j.status==='completed'||j.status==='failed'){
          clearInterval(state.broadcastPollTimer);
          state.broadcastPollTimer=null;
          toast(j.status==='completed'?`Broadcast selesai: ${j.sent||0} terkirim, ${j.failed||0} gagal`:`Broadcast gagal: ${j.error||'Error'}`);
          const refreshed=await api('/api/admin/broadcasts?limit=50').catch(()=>null);
          if(refreshed&&$('#broadcastLogList'))$('#broadcastLogList').innerHTML=(refreshed.items||[]).length?(refreshed.items||[]).map(renderLogCard).join(''):'<div class="empty compact">Belum ada broadcast.</div>';
        }
      }catch(e){
        clearInterval(state.broadcastPollTimer);
        state.broadcastPollTimer=null;
      }
    },1500);
  };

  if(activeJob&&activeJob.status==='running'){
    startPollingJob(activeJob.id);
  }

  $('#broadcastForm').onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const b=Object.fromEntries(fd.entries());
    const btnEnabled=$('#broadcastBtnToggle').checked;
    const btnType=$('#broadcastBtnAction').value;
    const btnText=($('#broadcastBtnText').value||'').trim();
    const btnUrl=($('#broadcastBtnUrl').value||'').trim();
    if(btnEnabled&&!btnText){toast('Nama tombol harus diisi',true);return;}
    if(btnEnabled&&btnType==='url'&&!btnUrl){toast('URL tombol harus diisi (contoh: https://...)',true);return;}

    const targetName = b.target === 'resellers' ? 'seluruh mitra reseller' : 'seluruh pengguna bot';
    if(!confirm(`Kirim broadcast ke ${targetName}?`))return;

    const submitBtn=$('#broadcastSubmitBtn');
    submitBtn.disabled=true;submitBtn.textContent='Mengirim...';

    try{
      const r=await api('/api/admin/broadcast',{
        method:'POST',
        body:{
          ...b,
          button:{
            enabled:btnEnabled,
            type:btnType,
            text:btnText,
            url:btnUrl
          },
          button_enabled:btnEnabled,
          button_type:btnType,
          button_text:btnText,
          button_url:btnUrl,
          options:b.type==='poll'?String(b.media||'').split('|').map(x=>x.trim()).filter(Boolean):[]
        }
      });
      toast('Broadcast dimulai: '+r.job.id);
      startPollingJob(r.job.id);
      setTimeout(async()=>{
        const refreshed=await api('/api/admin/broadcasts?limit=50').catch(()=>null);
        if(refreshed&&$('#broadcastLogList'))$('#broadcastLogList').innerHTML=(refreshed.items||[]).length?(refreshed.items||[]).map(renderLogCard).join(''):'<div class="empty compact">Belum ada broadcast.</div>';
      },600);
    }catch(err){
      toast(err.message,true);
    }finally{
      submitBtn.disabled=false;submitBtn.textContent='📢 Kirim Broadcast';
    }
  };
}
async function saveBotSettings(e,boolKeys=[]){e.preventDefault();const x=Object.fromEntries(new FormData(e.target).entries());for(const k of boolKeys)x[k]=x[k]==='true';try{await api('/api/admin/settings',{method:'PATCH',body:x});toast('Pengaturan bot disimpan')}catch(err){toast(err.message,true)}}
async function loadUsers(preserveScroll=false){
  const scrollY=preserveScroll?window.scrollY:0;
  const currentSearch=$('#userSearch')?.value||'';
  const currentStatus=$('#userStatus')?.value||'';
  const existingCards=$('#userCards');
  const r=await api('/api/admin/users?limit=50000');state.cache.users=Array.isArray(r.items)?r.items:[];
  const actCount=state.cache.users.filter(u=>u.status==='active').length;
  const blkCount=state.cache.users.filter(u=>u.status==='blocked').length;
  if(!existingCards){
    $('#content').innerHTML=`<div class="toolbar user-toolbar"><div class="searchbox"><input id="userSearch" placeholder="Cari ID, username, nama..."></div><select id="userStatus"><option value="">Semua Status</option><option value="active">Aktif</option><option value="blocked">Blocked</option><option value="inactive">Inactive</option></select><button type="button" id="unblockAllUsers" class="neo-btn green small">⚡ Aktifkan Semua Blocked</button><div class="toolbar-count" id="userCount">${state.cache.users.length} user (${actCount} aktif, ${blkCount} blocked)</div></div><div id="userCards" class="user-list">${userCards(state.cache.users)}</div>`;
    $('#userSearch').oninput=filterUsers;$('#userStatus').onchange=filterUsers;
    bindUserToolbarActions();
  }else{
    if(currentSearch&&$('#userSearch'))$('#userSearch').value=currentSearch;
    if(currentStatus&&$('#userStatus'))$('#userStatus').value=currentStatus;
    if($('#userCount'))$('#userCount').textContent=`${state.cache.users.length} user (${actCount} aktif, ${blkCount} blocked)`;
  }
  filterUsers();
  if(preserveScroll)window.scrollTo({top:scrollY,behavior:'instant'});
}
function bindUserToolbarActions(){
  if($('#unblockAllUsers'))$('#unblockAllUsers').onclick=async()=>{
    if(!confirm('Aktifkan kembali semua user yang berstatus blocked menjadi active?'))return;
    const btn=$('#unblockAllUsers');btn.disabled=true;btn.textContent='Memproses...';
    try{
      let changes=0;
      try{
        const res=await api('/api/admin/users/activate-all',{method:'POST',body:{}});
        changes=Number(res.changes||0);
      }catch(err1){
        try{
          const res2=await api('/api/admin/users',{method:'PATCH',body:{action:'activate_all'}});
          changes=Number(res2.changes||0);
        }catch(err2){
          const blocked=(state.cache.users||[]).filter(u=>u.status==='blocked');
          if(!blocked.length)throw new Error('Tidak ada user berstatus blocked di daftar.');
          for(const u of blocked){
            try{
              await api(`/api/admin/users/${encodeURIComponent(u.telegram_id)}`,{method:'PATCH',body:{status:'active'}});
              changes++;
            }catch{}
          }
        }
      }
      toast(`${changes} user berhasil diaktifkan`);
      await loadUsers(true);
    }catch(e){toast(e.message,true)}
    finally{if(btn){btn.disabled=false;btn.textContent='⚡ Aktifkan Semua Blocked';}}
  };
}
function userCards(rows){return rows.length?rows.map(u=>`<article class="user-card"><div class="user-avatar">${firstLetter(u.first_name||u.username||u.telegram_id)}</div><div class="user-main"><h3>${esc([u.first_name,u.last_name].filter(Boolean).join(' ')||u.username||u.telegram_id)}</h3><p>${u.username?'@'+esc(u.username)+' · ':''}<span class="mono">${esc(u.telegram_id)}</span></p><div class="user-meta"><span>Referral <b>${esc(u.referral_code||'-')}</b></span><span>Saldo Utama <b>${money(u.balance_main)}</b></span><span>Saldo Referral <b>${money(u.balance_referral)}</b></span><span>Total <b>${money(u.balance_total)}</b></span><span>Status ${badge(u.status)}</span><span>Aktif <b>${esc(date(u.last_seen_at))}</b></span></div></div><div class="user-actions">${u.status==='blocked'?`<button class="neo-btn green small" data-unblock-user="${esc(u.telegram_id)}">Aktifkan</button>`:''}<button class="neo-btn yellow small" data-wallet-user="${esc(u.telegram_id)}">Saldo</button><button class="neo-btn blue small" data-chat-user="${esc(u.telegram_id)}">Chat</button><button class="neo-btn red small" data-delete-user="${esc(u.telegram_id)}">Hapus</button></div></article>`).join(''):'<div class="empty-product">Belum ada user Telegram. User akan muncul setelah berinteraksi dengan bot.</div>'}
function filterUsers(){const q=($('#userSearch')?.value||'').toLowerCase().trim(),st=$('#userStatus')?.value||'';const rows=state.cache.users.filter(u=>(!q||[u.telegram_id,u.username,u.first_name,u.last_name,u.referral_code].some(x=>String(x||'').toLowerCase().includes(q)))&&(!st||u.status===st));$('#userCards').innerHTML=userCards(rows);const total=state.cache.users.length;if($('#userCount')){const act=state.cache.users.filter(u=>u.status==='active').length;const blk=state.cache.users.filter(u=>u.status==='blocked').length;$('#userCount').textContent=rows.length===total?`${total} user (${act} aktif, ${blk} blocked)`:`${rows.length} / ${total} user`;}bindUserActions()}
function bindUserActions(){$$('[data-unblock-user]').forEach(b=>b.onclick=async()=>{try{await api(`/api/admin/users/${encodeURIComponent(b.dataset.unblockUser)}`,{method:'PATCH',body:{status:'active'}});toast('User diaktifkan');loadUsers(true)}catch(e){toast(e.message,true)}});$$('[data-wallet-user]').forEach(b=>b.onclick=()=>openWallet(state.cache.users.find(x=>String(x.telegram_id)===b.dataset.walletUser)));$$('[data-chat-user]').forEach(b=>b.onclick=()=>openSendMessage(b.dataset.chatUser));$$('[data-delete-user]').forEach(b=>b.onclick=()=>remove(`/api/admin/users/${encodeURIComponent(b.dataset.deleteUser)}`,'Hapus pengguna?',()=>loadUsers(true)))}
function modal(title,html,onSubmit,{submit='Simpan',hideSubmit=false,onCancel=null,cancelText=''}={}){
  const m=$('#modal');
  if(!m)return;
  $('#modalTitle').innerHTML=title;
  $('#modalBody').innerHTML=html;
  $('#modalSubmit').textContent=submit;
  $('#modalSubmit').classList.toggle('hidden',hideSubmit);
  const cancelBtn=$('#modalCancel');
  if(cancelBtn){
    cancelBtn.textContent=cancelText||(hideSubmit?'Tutup':'Batal');
  }
  const alertEl=$('#modalAlert');
  if(alertEl){alertEl.textContent='';alertEl.classList.add('hidden');}

  const handleClose=async(e)=>{
    if(e&&typeof e.preventDefault==='function')e.preventDefault();
    let shouldClose=true;
    if(typeof onCancel==='function'){
      try{
        const res=await onCancel();
        if(res===false)shouldClose=false;
      }catch(err){
        console.error('Modal onCancel error:',err);
      }
    }
    if(shouldClose&&m.open){
      m.close();
    }
  };

  $('#modalClose').onclick=handleClose;
  if(cancelBtn)cancelBtn.onclick=handleClose;
  m.oncancel=async(e)=>{
    if(typeof onCancel==='function'){
      try{
        const res=await onCancel();
        if(res===false&&typeof e.preventDefault==='function'){
          e.preventDefault();
        }
      }catch(err){
        console.error('Modal oncancel error:',err);
      }
    }
  };

  $('#modalForm').onsubmit=async e=>{
    e.preventDefault();
    if(hideSubmit)return;
    const btn=$('#modalSubmit');
    const oldText=btn?btn.textContent:'Simpan';
    try{
      if(btn){btn.disabled=true;btn.textContent='Menyimpan...';}
      if(alertEl)alertEl.classList.add('hidden');
      const fd=new FormData(e.target);
      const res=await onSubmit(Object.fromEntries(fd.entries()));
      if(res!==false&&m.open)m.close();
    }catch(err){
      toast(err.message||'Gagal menyimpan',true);
      if(alertEl){
        alertEl.textContent='⚠️ '+(err.message||'Gagal menyimpan');
        alertEl.classList.remove('hidden');
        $('#modalBody').scrollTop=0;
      }
    }finally{
      if(btn){btn.disabled=false;btn.textContent=oldText;}
    }
  };
  if(!m.open)m.showModal();
}
const modalEl=$('#modal');
if(modalEl){
  modalEl.addEventListener('close',()=>{
    const t=$('#toast');
    if(t&&t.parentElement!==document.body)document.body.appendChild(t);
    const alertEl=$('#modalAlert');
    if(alertEl){alertEl.textContent='';alertEl.classList.add('hidden');}
  });
  modalEl.addEventListener('click',e=>{
    if(e.target===modalEl){
      $('#modalCancel')?.click();
    }
  });
}
function variantEditorHtml(item){
  if(!item.id)return `<div class="variant-editor"><div class="variant-editor-head"><div><h3>Varian Produk</h3><p>Simpan produk terlebih dahulu, lalu buka Edit untuk menambahkan varian.</p></div></div></div>`;
  if(item.supplier_source)return `<div class="variant-editor supplier-root-editor"><div class="variant-editor-head"><div><h3>🔌 Produk Supplier Langsung</h3><p>Produk ini adalah produk biasa, bukan varian. Checkout langsung memakai supplier yang terhubung.</p></div><button type="button" id="syncProductSupplier" class="neo-btn green small">↻ Sync Supplier</button></div><div class="supplier-root-summary"><span>Supplier <b>${esc(String(item.supplier_source).toUpperCase())}</b></span><span>ID <code>${esc(item.supplier_product_id||'-')}</code></span><span>Stok API <b>${item.supplier_stock==null?'?':Number(item.supplier_stock)}</b></span><span>Harga API <b>${Number(item.supplier_price||0).toLocaleString('id-ID',{maximumFractionDigits:6})}</b></span></div><p class="muted">Jika membutuhkan varian, tambahkan item supplier sebagai <b>Varian produk yang ada</b> dari menu Supplier / Reseller.</p></div>`;
  const rows=(item.variants||[]).map(v=>{
    const st=v.delivery_mode==='preorder'?'preorder':Number(v.stock||0)>0?'ready':'empty',label=st==='ready'?`READY · ${Number(v.stock||0)}`:st==='preorder'?'PRE-ORDER':'HABIS';
    const resAllowed=v.reseller_allowed!==0;
    const resPriceTxt=Number(v.reseller_price||0)>0?` · modal reseller ${money(v.reseller_price)}`:'';
    const resBadge=`<span class="stock-state-pill ${resAllowed?'ready':'empty'}">${resAllowed?'RESELLER ON':'RESELLER OFF'}</span>`;
    return`<div class="variant-edit-card stock-${st}"><div><div class="variant-edit-title"><b>${esc(v.name)}</b><span class="stock-state-pill ${st}">${label}</span>${resBadge}</div><small>${money(v.price)} · modal ${money(v.cost)}${resPriceTxt} · stok ${v.stock}${bulkTiers(v.bulk_prices).length?` · ${bulkTiers(v.bulk_prices).length} tier bulk`:''}</small>${v.supplier_source?`<p><b>${esc(v.supplier_source)}</b> · ID <code>${esc(v.supplier_product_id||'-')}</code> · stok API ${v.supplier_stock==null?'?':v.supplier_stock}${v.supplier_price?` · harga API ${Number(v.supplier_price).toLocaleString('id-ID',{maximumFractionDigits:6})}`:''}</p>`:`<p>${esc(v.description||'Tanpa deskripsi varian')}</p>`}</div><div class="actions">${v.supplier_source?`<button type="button" class="neo-btn green small" data-sync-variant="${v.id}">Sync</button>`:''}<button type="button" class="neo-btn yellow small" data-edit-variant="${v.id}">Edit</button><button type="button" class="neo-btn red small" data-delete-variant="${v.id}">Hapus</button></div></div>`
  }).join('')||'<div class="empty compact">Belum ada varian. Produk memakai data default.</div>';
  return `<div class="variant-editor"><div class="variant-editor-head"><div><h3>Varian Produk</h3><p>Setiap varian dapat memiliki harga normal, modal, harga khusus reseller, harga bulk, deskripsi, dan SNK sendiri.</p></div><button type="button" id="addVariant" class="neo-btn purple small">＋ Tambah Varian</button></div><div class="variant-edit-list">${rows}</div></div>`;
}
async function openSupplierImport(source,productId){
  const x=(state.cache.supplierCatalogs?.[source]||[]).find(r=>String(r.id)===String(productId));if(!x)return toast('Produk supplier tidak ditemukan. Refresh katalog.',true);
  let products=[];try{const pr=await api('/api/admin/products?limit=500');products=Array.isArray(pr.items)?pr.items:[];state.cache.products=products}catch(e){products=state.cache.products||[];toast('Katalog produk induk gagal direfresh: '+e.message,true)}products=products.filter(p=>p&&p.id);const hasParents=products.length>0;const safeCode=('SUP-'+source.slice(0,3)+'-'+String(x.id)).replace(/[^A-Za-z0-9_-]/g,'').slice(0,40).toUpperCase();
  modal('Masukkan Produk Supplier',`<div class="supplier-import-summary"><b>${esc(x.name)}</b><span>${esc(source)} · ID ${esc(x.id)} · ${esc(supplierPrice(x))} · stok ${x.stock==null?'?':x.stock}</span></div><div class="form-grid"><label>Masukkan Sebagai<select name="target_mode" id="supplierImportMode"><option value="variant" ${hasParents?'selected':''}>Varian produk yang ada</option><option value="product" ${!hasParents?'selected':''}>Produk baru</option></select></label><label id="supplierParentWrap">Produk Induk<select name="target_product_id" id="supplierParent"><option value="">${hasParents?'Pilih produk induk':'Belum ada produk lokal'}</option>${products.map(p=>`<option value="${p.id}">${esc(p.name)} · ${esc(p.code)}${p.active===0?' · Nonaktif':''}</option>`).join('')}</select></label><label id="supplierCodeWrap" class="hidden">Kode Produk<input name="product_code" value="${esc(safeCode)}"></label><label id="supplierNameWrap" class="hidden">Nama Produk<input name="product_name" value="${esc(x.name)}"></label><label id="supplierCategoryWrap" class="hidden">Kategori<input name="category" value="Produk Digital"></label><label>Nama Varian<input name="variant_name" value="${esc(x.name)}" required></label><label>Harga Jual iLink<input name="price" type="number" min="0" value="0" required></label><label>Modal iLink<input name="cost" type="number" min="0" value="0"></label><label class="full" id="supplierDescriptionWrap"><span id="supplierDescriptionTitle">Deskripsi Varian</span><textarea name="description" rows="4">${esc(x.description||'')}</textarea></label><label class="full" id="supplierTermsWrap"><span id="supplierTermsTitle">SNK Varian</span><textarea name="terms" rows="4"></textarea></label></div><p class="muted">Harga API supplier disimpan sebagai snapshot. Harga jual dan modal iLink tetap kamu tentukan sendiri agar tidak salah konversi unit/mata uang.</p>`,async b=>{
    const syncedAt=new Date().toISOString();
    if(b.target_mode==='product'){
      await api('/api/admin/products',{method:'POST',body:{code:b.product_code||safeCode,name:b.product_name||x.name,category:b.category||'Produk Digital',price:Number(b.price||0),cost:Number(b.cost||0),active:true,description:b.description||x.description||'',terms:b.terms||'',delivery_mode:'auto',supplier_source:source,supplier_product_id:String(x.id),supplier_price:Number(x.price||0),supplier_public_price:Number(x.publicPrice||0),supplier_stock:x.stock==null?null:Number(x.stock),supplier_synced_at:syncedAt}});
      toast('Produk supplier berhasil dibuat sebagai produk biasa.');await reloadProducts();await refreshSupplierHub(false);return;
    }
    const variantPayload={name:b.variant_name,variant_key:'SUP-'+String(x.id).replace(/[^A-Za-z0-9_-]/g,'').slice(0,40),price:Number(b.price||0),cost:Number(b.cost||0),delivery_mode:'auto',active:true,description:b.description||'',terms:b.terms||'',supplier_source:source,supplier_product_id:String(x.id),supplier_price:Number(x.price||0),supplier_public_price:Number(x.publicPrice||0),supplier_stock:x.stock==null?null:Number(x.stock),supplier_synced_at:syncedAt};
    const parentId=Number(b.target_product_id||0);if(!parentId)throw new Error('Pilih produk induk.');
    const parentProduct=products.find(p=>Number(p.id)===Number(parentId));const existingVariant=(parentProduct?.variants||[]).find(v=>String(v.supplier_source||'')===String(source)&&String(v.supplier_product_id||'')===String(x.id));if(existingVariant)await api(`/api/admin/variants/${existingVariant.id}`,{method:'PATCH',body:variantPayload});else await api(`/api/admin/products/${parentId}/variants`,{method:'POST',body:variantPayload});toast(existingVariant?'Varian supplier yang sudah ada berhasil diperbarui.':'Produk supplier berhasil ditambahkan sebagai varian.');await reloadProducts();await refreshSupplierHub(false);
  },{submit:'Simpan Supplier'});
  const mode=$('#supplierImportMode'),parent=$('#supplierParentWrap'),code=$('#supplierCodeWrap'),name=$('#supplierNameWrap'),cat=$('#supplierCategoryWrap'),variantName=$('[name="variant_name"]')?.closest('label'),descTitle=$('#supplierDescriptionTitle'),termsTitle=$('#supplierTermsTitle');const sync=()=>{const isProduct=mode.value==='product';parent.classList.toggle('hidden',isProduct);code.classList.toggle('hidden',!isProduct);name.classList.toggle('hidden',!isProduct);cat.classList.toggle('hidden',!isProduct);variantName?.classList.toggle('hidden',isProduct);if(descTitle)descTitle.textContent=isProduct?'Deskripsi Produk':'Deskripsi Varian';if(termsTitle)termsTitle.textContent=isProduct?'SNK Produk':'SNK Varian';};mode.onchange=sync;sync();
}
function openProduct(item={}){
  const edit=!!item.id,hasVariants=Array.isArray(item.variants)&&item.variants.length>0;
  const defaultSettings=hasVariants?`<div class="full info-note variant-default-hidden-note"><b>Produk memakai varian.</b><br>Harga, modal, harga khusus reseller, harga bulk, mode pengiriman, dan stok Default disembunyikan. Atur seluruh nilai jual melalui masing-masing varian agar tidak ada dua sumber konfigurasi.</div>`:`<label>Harga Default<input name="price" type="number" min="0" value="${Number(item.price||0)}"></label><label>Modal Default<input name="cost" type="number" min="0" value="${Number(item.cost||0)}"></label><label>Harga Khusus Reseller<input name="reseller_price" type="number" min="0" value="${Number(item.reseller_price||0)}" placeholder="0 = ikuti harga jual"><small class="muted">Harga modal yang dibayar reseller ke owner (0 = ikuti harga jual)</small></label>${bulkEditorHtml('productBulk',item.bulk_prices||[])}<label>Mode Pengiriman<select name="delivery_mode"><option value="auto" ${item.delivery_mode!=='preorder'?'selected':''}>AUTO</option><option value="preorder" ${item.delivery_mode==='preorder'?'selected':''}>PRE-ORDER</option></select></label>`;
  modal(edit?'Edit Produk':'Tambah Produk',`<div class="form-grid product-form"><label>Kode Produk<input name="code" required value="${esc(item.code||'')}"></label><label>Nama Produk<input name="name" required value="${esc(item.name||'')}"></label><label>Kategori<input name="category" value="${esc(item.category||'')}"></label><label>Subtitle<input name="subtitle" value="${esc(item.subtitle||'')}"></label><label>Tag<input name="tag" value="${esc(item.tag||'')}"></label><label class="full">Gambar Produk (disimpan di VPS)<div class="media-uploader"><input id="productImageFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><button type="button" id="uploadProductImage" class="neo-btn blue small">Upload Gambar</button><button type="button" id="clearProductImage" class="neo-btn white small">Hapus</button></div><input type="hidden" name="image_url" id="productImageValue" value="${esc(item.image_url||'')}"><div id="productImagePreview" class="media-preview">${item.image_url?`<img src="${esc(mediaSrc(item.image_url))}" alt="Preview">`:'Belum ada gambar.'}</div></label>${defaultSettings}<label>Status Toko<select name="active"><option value="true" ${item.active!==0?'selected':''}>Aktif</option><option value="false" ${item.active===0?'selected':''}>Nonaktif</option></select></label><label>Bisa Dijual Reseller<select name="reseller_allowed"><option value="true" ${item.reseller_allowed!==0?'selected':''}>Ya (Bisa di-reseller)</option><option value="false" ${item.reseller_allowed===0?'selected':''}>Tidak (Khusus Toko Owner)</option></select><small class="muted">Jika 'Tidak', produk tidak tampil di bot & miniapp reseller</small></label><label>Wajibkan Input Email Pembeli<select name="require_email"><option value="false" ${!item.require_email?'selected':''}>Tidak (Langsung kirim stok)</option><option value="true" ${item.require_email?'selected':''}>Ya (Wajibkan email, misal: Canva / Gemini Undangan)</option></select><small class="muted">Jika diaktifkan, bot meminta pembeli input email setelah bayar baru stok dikirim.</small></label><label class="full">Deskripsi Produk<textarea name="description" rows="5">${esc(item.description||'')}</textarea></label><label class="full">Syarat & Ketentuan (SNK)<textarea name="terms" rows="5">${esc(item.terms||'')}</textarea></label></div>${variantEditorHtml(item)}`,async b=>{
    if(!hasVariants){['price','cost','reseller_price'].forEach(k=>b[k]=Number(b[k]||0));b.bulk_prices=bulkTiers(b.bulk_prices)}else{delete b.price;delete b.cost;delete b.reseller_price;delete b.bulk_prices;delete b.delivery_mode}
    b.active=b.active==='true';b.reseller_allowed=b.reseller_allowed==='true';b.require_email=b.require_email==='true';
    const saved=await api(edit?`/api/admin/products/${item.id}`:'/api/admin/products',{method:edit?'PATCH':'POST',body:b});
    toast(edit?'Produk diperbarui':'Produk dibuat. Buka Edit untuk menambahkan varian.');
    const pid=edit?item.id:(saved?.item?.id||saved?.id);
    await reloadProducts(pid);
  });
  if(!hasVariants)bindBulkEditor('productBulk',item.bulk_prices||[]);
  const uploadProductImage=$('#uploadProductImage');if(uploadProductImage)uploadProductImage.onclick=async()=>{try{const file=$('#productImageFile').files?.[0];const r=await uploadMedia(file,'product');$('#productImageValue').value=r.item.key;$('#productImagePreview').innerHTML=`<img src="${esc(mediaSrc(r.item.key))}" alt="Preview"><small>${esc(r.item.filename||'Tersimpan di VPS')}</small>`;if(edit){await api(`/api/admin/products/${item.id}`,{method:'PATCH',body:{image_url:r.item.key}});item.image_url=r.item.key;const cached=findProduct(item.id);if(cached)cached.image_url=r.item.key;toast('Gambar tersimpan dan langsung dipasang ke produk')}else toast('Gambar tersimpan. Tekan Simpan untuk memasang ke produk baru.')}catch(e){toast(e.message,true)}};const clearProductImage=$('#clearProductImage');if(clearProductImage)clearProductImage.onclick=async()=>{try{$('#productImageValue').value='';$('#productImagePreview').textContent='Belum ada gambar.';if(edit){await api(`/api/admin/products/${item.id}`,{method:'PATCH',body:{image_url:''}});item.image_url='';const cached=findProduct(item.id);if(cached)cached.image_url='';toast('Gambar produk dihapus')}}catch(e){toast(e.message,true)}};
  if(edit){
    const current=findProduct(item.id)||item;
    const productSync=$('#syncProductSupplier');
    if(productSync)productSync.onclick=async()=>{
      try{
        productSync.disabled=true;productSync.textContent='Menyinkronkan...';
        await api(`/api/admin/products/${item.id}/supplier-sync`,{method:'POST',body:{}});
        toast('Data supplier produk diperbarui');
        await reloadProducts(item.id);
        openProduct(findProduct(item.id)||item);
      }catch(e){toast(e.message,true)}
      finally{productSync.disabled=false;productSync.textContent='↻ Sync Supplier'}
    };
    const add=$('#addVariant');
    if(add)add.onclick=()=>openVariant(findProduct(item.id)||current);
    $$('[data-edit-variant]').forEach(b=>b.onclick=()=>{
      const curProd=findProduct(item.id)||current;
      const targetVar=(curProd.variants||[]).find(v=>String(v.id)===b.dataset.editVariant);
      openVariant(curProd,targetVar);
    });
    $$('[data-sync-variant]').forEach(b=>b.onclick=async()=>{
      try{
        await api(`/api/admin/variants/${b.dataset.syncVariant}/supplier-sync`,{method:'POST',body:{}});
        toast('Data supplier varian diperbarui');
        await reloadProducts(item.id);
        openProduct(findProduct(item.id)||item);
      }catch(e){toast(e.message,true)}
    });
    $$('[data-delete-variant]').forEach(b=>b.onclick=async()=>{
      if(!confirm('Hapus varian ini?'))return;
      try{
        await api(`/api/admin/variants/${b.dataset.deleteVariant}`,{method:'DELETE'});
        toast('Varian dihapus');
        await reloadProducts(item.id);
        openProduct(findProduct(item.id)||item);
      }catch(e){toast(e.message,true)}
    });
  }
}
async function openManageProduct(p){
  const variants=Array.isArray(p.variants)?p.variants:[],localVariants=variants.filter(v=>!v.supplier_source),targets=variants.length?localVariants:[{id:'',name:'Stok Default'}];
  if(!targets.length)return toast('Produk ini memakai stok supplier. Kelola melalui Sync Supplier / Edit Varian.',true);
  const options=targets.map(v=>`<option value="${esc(v.id||'')}">${esc(v.name)}</option>`).join('');
  modal('Kelola Stok · '+p.name,`<div class="stock-manager"><div class="stock-manager-controls"><label>Target Stok<select id="manageStockVariant">${options}</select></label><label>Status<select id="manageStockStatus"><option value="available">Ready</option><option value="sold">Terjual</option><option value="">Semua</option></select></label></div><div id="stockManagerSummary" class="stock-summary"></div><div id="stockManagerList" class="stock-manager-list"><div class="empty compact">Memuat stok...</div></div></div>`,async()=>{}, {hideSubmit:true,cancelText:'Tutup',onCancel:()=>reloadProducts(p.id)});
  const load=async()=>{const vid=$('#manageStockVariant').value;const status=$('#manageStockStatus').value;try{const r=await api(`/api/admin/products/${p.id}/stock?variant_id=${encodeURIComponent(vid)}&status=${encodeURIComponent(status)}&limit=2000`);$('#stockManagerSummary').innerHTML=`<b>${r.items.length}</b> item ditampilkan · <b>${r.count}</b> stok ready`;$('#stockManagerList').innerHTML=r.items.length?r.items.map((x,i)=>`<div class="stock-item-card"><div class="stock-item-head"><span>#${i+1} · ID ${x.id}</span>${badge(x.status)}</div><textarea data-stock-value="${x.id}" ${x.status!=='available'?'disabled':''}>${esc(x.value)}</textarea><div class="stock-item-meta"><span>${esc(date(x.created_at))}</span>${x.order_ref?`<span>Order ${esc(x.order_ref)}</span>`:''}</div>${x.status==='available'?`<div class="actions"><button type="button" class="neo-btn blue small" data-save-stock="${x.id}">Simpan Edit</button><button type="button" class="neo-btn red small" data-delete-stock="${x.id}">Hapus</button></div>`:''}</div>`).join(''):'<div class="empty compact">Tidak ada stok pada target ini.</div>';
    $$('[data-save-stock]').forEach(b=>b.onclick=async()=>{try{const val=$(`[data-stock-value="${b.dataset.saveStock}"]`).value;await api(`/api/admin/stock/${b.dataset.saveStock}`,{method:'PATCH',body:{value:val}});toast('Stok diperbarui');await load();await reloadProducts(p.id)}catch(e){toast(e.message,true)}});$$('[data-delete-stock]').forEach(b=>b.onclick=async()=>{if(!confirm('Hapus stok ini?'))return;try{await api(`/api/admin/stock/${b.dataset.deleteStock}`,{method:'DELETE'});toast('Stok dihapus');await load();await reloadProducts(p.id)}catch(e){toast(e.message,true)}})}catch(e){$('#stockManagerList').innerHTML=`<div class="empty compact">${esc(e.message)}</div>`}};
  $('#manageStockVariant').onchange=load;$('#manageStockStatus').onchange=load;await load();
}
function openVariant(p,v={}){
  const edit=!!v.id;
  const parentId=p.id;
  const titleHtml=`<button type="button" class="back-modal-btn" id="backToProductModal" title="Kembali ke Produk">←</button> ${(edit?'Edit':'Tambah')+' Varian · '+esc(p.name)}`;
  modal(titleHtml,`<div class="form-grid"><label>Nama Varian<input name="name" required value="${esc(v.name||'')}"></label><label>Key / SKU<input name="variant_key" value="${esc(v.variant_key||'')}"></label><label>Harga Jual<input name="price" type="number" min="0" value="${Number(v.price??p.price??0)}"></label><label>Modal iLink<input name="cost" type="number" min="0" value="${Number(v.cost??p.cost??0)}"></label><label>Harga Khusus Reseller<input name="reseller_price" type="number" min="0" value="${Number(v.reseller_price||0)}" placeholder="0 = ikuti harga jual"><small class="muted">Harga modal yang dibayar reseller ke owner (0 = ikuti harga jual)</small></label>${bulkEditorHtml('variantBulk',v.bulk_prices||[])}<label>Mode<select name="delivery_mode"><option value="auto" ${v.delivery_mode!=='preorder'?'selected':''}>AUTO</option><option value="preorder" ${v.delivery_mode==='preorder'?'selected':''}>PRE-ORDER</option></select></label><label>Status Toko<select name="active"><option value="true" ${v.active!==0?'selected':''}>Aktif</option><option value="false" ${v.active===0?'selected':''}>Nonaktif</option></select></label><label>Bisa Dijual Reseller<select name="reseller_allowed"><option value="true" ${v.reseller_allowed!==0?'selected':''}>Ya (Bisa di-reseller)</option><option value="false" ${v.reseller_allowed===0?'selected':''}>Tidak (Khusus Toko Owner)</option></select><small class="muted">Jika 'Tidak', varian ini tidak tampil di bot & miniapp reseller</small></label><label>Wajibkan Input Email Pembeli<select name="require_email"><option value="false" ${!v.require_email?'selected':''}>Tidak (Langsung kirim stok)</option><option value="true" ${v.require_email?'selected':''}>Ya (Wajibkan email, misal: Canva / Gemini Undangan)</option></select><small class="muted">Jika diaktifkan, bot meminta pembeli input email setelah bayar baru stok dikirim.</small></label><label>Supplier Source<select name="supplier_source" id="variantSupplierSource"><option value="" ${!v.supplier_source?'selected':''}>Stok Lokal</option><option value="prodseller" ${v.supplier_source==='prodseller'?'selected':''}>ProdSeller</option><option value="storebat" ${v.supplier_source==='storebat'||v.supplier_source==='aiversehub'?'selected':''}>Storebat</option></select></label><label>Produk Supplier<select name="supplier_product_id" id="variantSupplierProduct"><option value="${esc(v.supplier_product_id||'')}">${v.supplier_product_id?esc(v.supplier_product_id):'Pilih supplier terlebih dahulu'}</option></select></label><input type="hidden" name="supplier_price" id="variantSupplierPrice" value="${Number(v.supplier_price||0)}"><input type="hidden" name="supplier_public_price" id="variantSupplierPublicPrice" value="${Number(v.supplier_public_price||0)}"><input type="hidden" name="supplier_stock" id="variantSupplierStock" value="${v.supplier_stock==null?'':Number(v.supplier_stock)}"><input type="hidden" name="supplier_synced_at" id="variantSupplierSynced" value="${esc(v.supplier_synced_at||'')}"><div class="full supplier-link-info" id="variantSupplierInfo">${v.supplier_source?`Terhubung: <b>${esc(v.supplier_source)}</b> · ID <code>${esc(v.supplier_product_id||'-')}</code>`:'Varian menggunakan stok lokal.'}</div><label class="full">Deskripsi Varian<textarea name="description" rows="5">${esc(v.description||'')}</textarea></label><label class="full">SNK Varian<textarea name="terms" rows="5">${esc(v.terms||'')}</textarea></label></div>`,async b=>{
    ['price','cost','reseller_price','supplier_price','supplier_public_price'].forEach(k=>b[k]=Number(b[k]||0));
    b.bulk_prices=bulkTiers(b.bulk_prices);
    b.supplier_stock=b.supplier_stock===''?null:Number(b.supplier_stock);
    b.active=b.active==='true';
    b.reseller_allowed=b.reseller_allowed==='true';
    b.require_email=b.require_email==='true';
    await api(edit?`/api/admin/variants/${v.id}`:`/api/admin/products/${parentId}/variants`,{method:edit?'PATCH':'POST',body:b});
    toast(edit?'Varian berhasil diperbarui':'Varian baru ditambahkan');
    await reloadProducts(parentId);
    openProduct(findProduct(parentId)||p);
    return false;
  },{
    submit:edit?'Simpan Varian':'＋ Tambah Varian',
    onCancel:()=>{ openProduct(findProduct(parentId)||p); return false; }
  });
  const backBtn=$('#backToProductModal');
  if(backBtn)backBtn.onclick=()=>openProduct(findProduct(parentId)||p);
  bindBulkEditor('variantBulk',v.bulk_prices||[]);
  const sourceEl=$('#variantSupplierSource'),productEl=$('#variantSupplierProduct'),info=$('#variantSupplierInfo');
  const fill=async(force=false)=>{const source=sourceEl.value;if(!source){productEl.innerHTML='<option value="">Stok Lokal</option>';$('#variantSupplierPrice').value=0;$('#variantSupplierPublicPrice').value=0;$('#variantSupplierStock').value='';$('#variantSupplierSynced').value='';info.textContent='Varian menggunakan stok lokal.';return;}info.textContent='Memuat katalog supplier...';try{const rows=await loadSupplierCatalog(source,force),selected=v.supplier_source===source?v.supplier_product_id:productEl.value;productEl.innerHTML='<option value="">-- Pilih Produk Supplier --</option>'+rows.map(x=>`<option value="${esc(x.id)}" ${String(x.id)===String(selected)?'selected':''}>${esc(x.name)} · ${esc(x.id)} · ${esc(supplierPrice(x))} · stok ${x.stock==null?'?':x.stock}</option>`).join('');show();}catch(e){productEl.innerHTML=`<option value="${esc(v.supplier_product_id||'')}">${esc(v.supplier_product_id||'Gagal memuat katalog')}</option>`;info.textContent=e.message;}};
  const show=()=>{const source=sourceEl.value,rows=state.cache.supplierCatalogs?.[source]||[],x=rows.find(r=>String(r.id)===String(productEl.value));if(!x){if(source)info.textContent='Pilih produk supplier.';return;}$('#variantSupplierPrice').value=Number(x.price||0);$('#variantSupplierPublicPrice').value=Number(x.publicPrice||0);$('#variantSupplierStock').value=x.stock==null?'':Number(x.stock);$('#variantSupplierSynced').value=new Date().toISOString();info.innerHTML=`<b>${esc(x.name)}</b> · ID <code>${esc(x.id)}</code> · Harga API <b>${esc(supplierPrice(x))}</b> · Stok API <b>${x.stock==null?'?':x.stock}</b>${x.description?`<br><span>${esc(x.description).slice(0,260)}</span>`:''}`;};
  sourceEl.onchange=()=>fill(true);productEl.onchange=show;if(sourceEl.value)fill(false);
}
function openStock(p){
  const variants=Array.isArray(p.variants)?p.variants:[],localVariants=variants.filter(v=>!v.supplier_source);const targets=variants.length?localVariants.map(v=>({id:String(v.id),name:v.name,stock:Number(v.stock||0)})):[{id:'',name:'Stok Default',stock:Number(p.stock||0)}];
  if(!targets.length)return toast('Tidak ada stok lokal yang dapat ditambah. Gunakan Sync Supplier / Edit Varian.',true);
  const variantOpts=targets.map(t=>`<option value="${esc(t.id)}">${esc(t.name)} · ${t.stock} ready</option>`).join('');
  const cards=targets.map(t=>`<div class="stock-target-card"><span>📦</span><div><b>${esc(t.name)}</b><small>${t.stock} stok ready</small></div></div>`).join('');
  modal('Tambah Stok · '+p.name,`<div class="stock-add-layout"><div class="stock-target-grid">${cards}</div><div class="form-grid"><label class="full">Target Stok<select name="variant_id" id="addStockVariant">${variantOpts}</select></label><label class="full">Data Stok<textarea name="text" id="addStockText" rows="13" placeholder="Satu akun / kode / data produk per baris"></textarea></label><div class="full stock-input-summary"><span>Item yang akan ditambahkan</span><b id="addStockCount">0</b></div></div><div class="info-note">${variants.length?'Produk ini memakai varian, sehingga stok Default tidak digunakan. ':''}Stok supplier dikelola melalui sinkronisasi supplier dan tidak ditambahkan manual. Baris kosong otomatis diabaikan.</div></div>`,async b=>{const lines=String(b.text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!lines.length)throw new Error('Masukkan minimal 1 data stok.');await api(`/api/admin/products/${p.id}/stock`,{method:'POST',body:{variant_id:b.variant_id?Number(b.variant_id):null,mode:'add',items:lines}});toast(`${lines.length} stok ditambahkan`);await reloadProducts(p.id)},{submit:'＋ Tambah Stok'});
  const ta=$('#addStockText'),count=$('#addStockCount');const recount=()=>{if(count)count.textContent=String(ta?String(ta.value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).length:0)};if(ta)ta.oninput=recount;recount();
}
function openOrderEdit(o){modal('Edit Pesanan · '+o.order_ref,`<div class="form-grid"><label>Status<select name="status">${['pending_payment','paid','fresh_processing','fresh_attention','completed','waiting_delivery','supplier_pending','failed','canceled','expired'].map(s=>`<option ${o.status===s?'selected':''}>${s}</option>`).join('')}</select></label><label>Modal Aktual<input name="cost_amount" type="number" value="${Number(o.cost_amount||0)}"></label><label class="full">Email Akun / Pembeli<input name="customer_email" type="email" placeholder="nama@email.com" value="${esc(o.customer_email||'')}"></label><label class="full">Catatan<textarea name="note">${esc(o.note||'')}</textarea></label></div>${o.status==='completed'?'<p class="warning-note">Mengubah completed menjadi canceled hanya mengubah status order lokal. Produk/akun yang sudah terkirim tidak otomatis dikembalikan ke stok dan pembayaran tidak otomatis direfund.</p>':''}`,async b=>{b.cost_amount=Number(b.cost_amount||0);b.customer_email=String(b.customer_email||'').trim();await api(`/api/admin/orders/${o.id}`,{method:'PATCH',body:b});toast('Pesanan diperbarui');loadOrders(true,o.id)})}
function openFulfill(o){modal('Kirim PRE-ORDER · '+o.order_ref,`<p>Produk: <b>${esc(o.product_name)}</b>${o.variant_name?' · '+esc(o.variant_name):''}</p><label class="field">Produk / akun untuk pembeli<textarea name="delivery_text" required rows="10" placeholder="Email | Password | Link | Kode lisensi"></textarea></label>`,async b=>{await api(`/api/admin/orders/${o.id}/fulfill`,{method:'POST',body:b});toast('Produk dikirim ke pembeli');loadOrders(true,o.id)},{submit:'Kirim Produk'})}
function openManualOrder(){const products=(state.cache.products||[]).filter(p=>p.active&&(!(p.variants||[]).length||(p.variants||[]).some(v=>v.active)));if(!products.length)return toast('Belum ada produk aktif di katalog.',true);modal('Pesanan Manual',`<div class="form-grid"><label>Telegram ID<input name="telegram_id"></label><label>Nama Pembeli<input name="buyer_name"></label><label>Email Pembeli<input name="customer_email" type="email" placeholder="nama@email.com"></label><label>Produk<select name="product_id" id="manualProduct">${products.map(p=>`<option value="${p.id}">${esc(p.name)} · ${esc(p.code)}</option>`).join('')}</select></label><label>Varian<select name="variant_id" id="manualVariant"></select></label><label>Qty<input name="quantity" id="manualQty" type="number" min="1" value="1"></label><label>Harga / item<input name="unit_price" id="manualUnitPrice" type="number" min="0"></label><label>Total<input name="total_price" id="manualTotal" type="number" min="0"></label><label>Modal Total<input name="cost_amount" id="manualCost" type="number" min="0"></label><label>Metode Bayar<input name="payment_method" value="manual"></label><label>Status<select name="status"><option value="completed">completed</option><option value="paid">paid</option><option value="waiting_delivery">waiting_delivery</option><option value="pending_payment">pending_payment</option><option value="canceled">canceled</option></select></label><label class="full">Catatan<textarea name="note"></textarea></label></div>`,async b=>{['product_id','variant_id','quantity','unit_price','total_price','cost_amount'].forEach(k=>b[k]=b[k]?Number(b[k]):(k==='variant_id'?null:0));b.customer_email=String(b.customer_email||'').trim();await api('/api/admin/orders/manual',{method:'POST',body:b});toast('Pesanan manual dibuat dari katalog');loadOrders(true)});const productEl=$('#manualProduct'),variantEl=$('#manualVariant'),qtyEl=$('#manualQty'),unitEl=$('#manualUnitPrice'),totalEl=$('#manualTotal'),costEl=$('#manualCost');const refresh=()=>{const p=products.find(x=>String(x.id)===productEl.value)||products[0],current=variantEl.value,vars=(p.variants||[]).filter(v=>v.active);const opts=vars.length?vars.map(v=>`<option value="${v.id}">${esc(v.name)} · ${money(v.price)}</option>`):[`<option value="">Default · ${money(p.price)}</option>`];variantEl.innerHTML=opts.join('');if(current&&vars.some(v=>String(v.id)===current))variantEl.value=current;else if(vars.length)variantEl.value=String(vars[0].id);calc();};const calc=()=>{const p=products.find(x=>String(x.id)===productEl.value)||products[0],v=(p.variants||[]).find(x=>String(x.id)===variantEl.value),qty=Math.max(1,Number(qtyEl.value||1)),price=bulkUnitPrice(Number(v?.price??p.price??0),v?.bulk_prices??p.bulk_prices,qty),cost=Number(v?.cost??p.cost??0);unitEl.value=price;totalEl.value=price*qty;costEl.value=cost*qty;};productEl.onchange=refresh;variantEl.onchange=calc;qtyEl.oninput=calc;refresh();}
function openWallet(u){if(!u)return;modal('Atur Saldo · '+(u.first_name||u.username||u.telegram_id),`<div class="form-grid"><label>Saldo Utama<input name="balance_main" type="number" min="0" value="${Number(u.balance_main||0)}"></label><label>Saldo Referral<input name="balance_referral" type="number" min="0" value="${Number(u.balance_referral||0)}"></label><label class="full">Telegram ID<input value="${esc(u.telegram_id)}" disabled></label></div>`,async b=>{b.balance_main=Number(b.balance_main||0);b.balance_referral=Number(b.balance_referral||0);await api(`/api/admin/users/${encodeURIComponent(u.telegram_id)}/wallet`,{method:'POST',body:b});toast('Saldo diperbarui');loadUsers(true)})}
function openSendMessage(id){modal('Kirim Pesan Telegram',`<label class="field">Telegram ID<input value="${esc(id)}" disabled></label><label class="field" style="margin-top:10px">Pesan<textarea name="message" required rows="8"></textarea></label>`,async b=>{await api('/api/admin/bot/send',{method:'POST',body:{chat_id:id,message:b.message}});toast('Pesan dikirim')},{submit:'Kirim'})}
function openCoupon(x={}){const edit=!!x.id;modal(edit?'Edit Kupon':'Tambah Kupon',`<div class="form-grid"><label>Kode<input name="code" required value="${esc(x.code||'')}"></label><label>Nama Promo<input name="name" value="${esc(x.name||'')}"></label><label>Tipe<select name="discount_type"><option value="fixed" ${x.discount_type!=='percent'?'selected':''}>Nominal</option><option value="percent" ${x.discount_type==='percent'?'selected':''}>Persen</option></select></label><label>Diskon<input name="discount_value" type="number" min="0" value="${Number(x.discount_value||0)}"></label><label>Maks Diskon<input name="max_discount" type="number" min="0" value="${Number(x.max_discount||0)}"></label><label>Minimal Belanja<input name="min_purchase" type="number" min="0" value="${Number(x.min_purchase||0)}"></label><label>Limit Pemakaian<input name="usage_limit" type="number" min="0" value="${Number(x.usage_limit||0)}"></label><label>Status<select name="active"><option value="true" ${x.active!==0?'selected':''}>Aktif</option><option value="false" ${x.active===0?'selected':''}>Nonaktif</option></select></label><label>Mulai<input name="starts_at" type="datetime-local" value=""></label><label>Expired<input name="expires_at" type="datetime-local" value=""></label></div>`,async b=>{['discount_value','max_discount','min_purchase','usage_limit'].forEach(k=>b[k]=Number(b[k]||0));b.active=b.active==='true';if(b.starts_at)b.starts_at=new Date(b.starts_at).toISOString();if(b.expires_at)b.expires_at=new Date(b.expires_at).toISOString();await api(edit?`/api/admin/coupons/${x.id}`:'/api/admin/coupons',{method:edit?'PATCH':'POST',body:b});toast('Kupon disimpan');loadCoupons(true)})}
function openRedeem(){const products=state.cache.products||[];modal('Generate Redeem Code',`<div class="form-grid"><label>Jumlah Kode<input name="count" type="number" min="1" max="200" value="1"></label><label>Tipe<select name="type" id="redeemType"><option value="balance">Saldo</option><option value="product">Produk</option></select></label><label>Nilai / Qty<input name="value" type="number" min="0" value="10000"></label><label>Produk<select name="product_id"><option value="">-</option>${products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><label>Expired<input name="expires_at" type="datetime-local"></label><label>Kode Custom (jumlah 1)<input name="code"></label></div>`,async b=>{b.count=Number(b.count||1);b.value=Number(b.value||0);b.product_id=b.product_id?Number(b.product_id):null;if(b.expires_at)b.expires_at=new Date(b.expires_at).toISOString();const r=await api('/api/admin/redeem',{method:'POST',body:b});toast(`${r.items.length} kode dibuat`);loadCoupons(true)})}
// ==========================================
// RESELLER & MULTI-TENANT BOT SYSTEM (v2.6.10)
// ==========================================

async function loadResellers(preserveScroll = false) {
  const scrollY = preserveScroll ? window.scrollY : 0;
  state.resellerTab = state.resellerTab || 'resellers';
  const overviewRes = await api('/api/admin/resellers/overview').catch(() => ({ stats: {} }));
  const stats = overviewRes.stats || {};
  const pendingWd = Number(stats.pending_withdrawals || 0);
  const pendingRes = Number(stats.pending_resellers || 0);
  const pendingTotal = pendingWd + pendingRes;

  const resBadgeEl = $('#resellerBadge');
  if (resBadgeEl) {
    resBadgeEl.textContent = pendingTotal;
    resBadgeEl.classList.toggle('hidden', pendingTotal < 1);
  }

  const kpis = `
    <div class="dashboard-kpis" id="resellerKpis">
      ${stat('👥', 'purple', 'Total Reseller', `${stats.total_resellers || 0}`, `${stats.active_resellers || 0} akun aktif`)}
      ${stat('⏳', pendingRes > 0 ? 'yellow' : 'blue', 'Persetujuan Reseller', `${pendingRes} Pengajuan`, pendingRes > 0 ? 'Menunggu verifikasi owner' : 'Semua pendaftaran diproses')}
      ${stat('🤖', 'blue', 'Bot Toko Reseller', `${stats.total_bots || 0}`, `${stats.active_bots || 0} bot online`)}
      ${stat('💰', 'green', 'Saldo Profit Reseller', money(stats.total_profit_balance), `Total ditarik: ${money(stats.total_withdrawn)}`)}
      ${stat('💸', 'yellow', 'Pending Penarikan', `${pendingWd} Pengajuan`, `${money(stats.pending_withdrawals_amount)} siap dicairkan`)}
    </div>
  `;

  if (preserveScroll && $('#resellerTabBody')) {
    const kpiEl = $('#resellerKpis');
    if (kpiEl) kpiEl.outerHTML = kpis;
    await renderResellerTabContent();
    window.scrollTo({ top: scrollY, behavior: 'instant' });
    return;
  }

  const tabs = `
    <div class="subnav" id="resellerSubnav" style="margin-bottom:16px;">
      <button class="subnav-btn ${state.resellerTab === 'resellers' ? 'active' : ''}" data-reseller-tab="resellers">👥 Daftar Reseller ${pendingRes > 0 ? `<em class="nav-badge" style="display:inline-block;margin-left:4px">${pendingRes}</em>` : ''}</button>
      <button class="subnav-btn ${state.resellerTab === 'bots' ? 'active' : ''}" data-reseller-tab="bots">🤖 Bot Toko Reseller</button>
      <button class="subnav-btn ${state.resellerTab === 'withdrawals' ? 'active' : ''}" data-reseller-tab="withdrawals">💸 Penarikan Saldo ${pendingWd > 0 ? `<em class="nav-badge" style="display:inline-block;margin-left:4px">${pendingWd}</em>` : ''}</button>
      <button class="subnav-btn ${state.resellerTab === 'ledger' ? 'active' : ''}" data-reseller-tab="ledger">📒 Mutasi Profit</button>
    </div>
  `;

  $('#content').innerHTML = `
    <div class="section-title product-section-title">
      <div>
        <h2>👥 Reseller & White-Label Bot Toko</h2>
        <p>Buka kemitraan reseller otomatis: Bot Telegram independen, markup fleksibel, dan pembayaran terpusat QRIS Owner.</p>
      </div>
    </div>
    ${kpis}
    ${tabs}
    <div id="resellerTabBody"><div class="empty compact">Memuat data...</div></div>
  `;

  $$('#resellerSubnav [data-reseller-tab]').forEach(b => {
    b.onclick = () => {
      state.resellerTab = b.dataset.resellerTab;
      $$('#resellerSubnav .subnav-btn').forEach(x => x.classList.toggle('active', x === b));
      renderResellerTabContent();
    };
  });

  await renderResellerTabContent();
}

async function renderResellerTabContent() {
  const host = $('#resellerTabBody');
  if (!host) return;
  host.innerHTML = '<div class="empty compact">Memuat tab...</div>';

  if (state.resellerTab === 'resellers') {
    await renderResellersList(host);
  } else if (state.resellerTab === 'bots') {
    await renderResellerBotsList(host);
  } else if (state.resellerTab === 'withdrawals') {
    await renderResellerWithdrawalsList(host);
  } else if (state.resellerTab === 'ledger') {
    await renderResellerLedgerList(host);
  }
}

// ---------------- TAB 1: DAFTAR RESELLER ----------------
async function renderResellersList(host) {
  const [res, setRes] = await Promise.all([
    api('/api/admin/resellers?limit=500').catch(e => ({ items: [], error: e.message })),
    api('/api/admin/settings').catch(() => ({ settings: {} }))
  ]);
  const items = res.items || [];
  state.cache.resellers = items;
  const s = setRes.settings || state.overview?.settings || {};
  const regFee = Math.max(0, Number(s.reseller_registration_fee || 0));
  const regEnabled = s.reseller_registration_enabled !== false;

  const canAddProducts = Boolean(s.reseller_can_add_products);

  const oldSearch = $('#resellerSearch')?.value || '';
  const oldStatus = $('#resellerStatusFilter')?.value || '';

  host.innerHTML = `
    <div class="reseller-fee-card">
      <div class="reseller-fee-info">
        <div class="reseller-fee-title">
          <strong>💰 Biaya Pendaftaran Kemitraan Reseller</strong>
          <span class="badge ${regEnabled ? 'ok' : 'bad'}">${regEnabled ? '🟢 Pendaftaran Buka' : '🔴 Pendaftaran Tutup'}</span>
        </div>
        <small style="color:var(--muted);font-weight:700">Biaya yang otomatis dipotong dari saldo dompet user saat mendaftarkan bot di Bot Toko Utama.</small>
      </div>
      <div class="reseller-fee-actions">
        <div class="reseller-fee-amount">${regFee > 0 ? money(regFee) : 'GRATIS'}</div>
        <button type="button" class="neo-btn blue" id="editResellerFeeBtn" style="font-size:13px;padding:8px 14px">⚙️ Atur Biaya</button>
      </div>
    </div>

    <div class="reseller-fee-card" style="margin-top:10px">
      <div class="reseller-fee-info">
        <div class="reseller-fee-title">
          <strong>🏬 Izin Tambah Produk Toko Sendiri (Reseller)</strong>
          <span class="badge ${canAddProducts ? 'ok' : 'bad'}">${canAddProducts ? '🟢 Aktif' : '🔴 Nonaktif (Default)'}</span>
        </div>
        <small style="color:var(--muted);font-weight:700">Izinkan mitra reseller menambahkan dan mengelola produk toko mereka sendiri (stok, varian, dan harga custom). Default: Nonaktif.</small>
      </div>
      <div class="reseller-fee-actions">
        <button type="button" class="neo-btn ${canAddProducts ? 'red' : 'green'}" id="toggleResellerAddProductBtn" style="font-size:13px;padding:8px 14px">
          ${canAddProducts ? 'Matikan Izin' : 'Aktifkan Izin'}
        </button>
      </div>
    </div>

    <div class="toolbar product-toolbar" style="margin-bottom:14px;margin-top:14px;">
      <div class="searchbox"><input id="resellerSearch" placeholder="Cari nama, username, telegram ID..." value="${esc(oldSearch)}"></div>
      <select id="resellerStatusFilter">
        <option value="" ${oldStatus === '' ? 'selected' : ''}>Semua Status</option>
        <option value="pending_approval" ${oldStatus === 'pending_approval' ? 'selected' : ''}>⏳ Menunggu Persetujuan</option>
        <option value="awaiting_payment" ${oldStatus === 'awaiting_payment' ? 'selected' : ''}>💳 Menunggu Pembayaran</option>
        <option value="awaiting_token" ${oldStatus === 'awaiting_token' ? 'selected' : ''}>🤖 Menunggu Bot Token</option>
        <option value="active" ${oldStatus === 'active' ? 'selected' : ''}>🟢 Aktif</option>
        <option value="suspended" ${oldStatus === 'suspended' ? 'selected' : ''}>⚠️ Ditangguhkan</option>
        <option value="rejected" ${oldStatus === 'rejected' ? 'selected' : ''}>❌ Ditolak</option>
      </select>
      <button id="addResellerBtn" class="neo-btn purple">＋ Tambah Reseller</button>
    </div>
    <div id="resellersCardGrid" class="reseller-grid"></div>
  `;

  const toggleAddBtn = $('#toggleResellerAddProductBtn');
  if (toggleAddBtn) {
    toggleAddBtn.onclick = async () => {
      const nextState = !canAddProducts;
      toggleAddBtn.disabled = true;
      try {
        const res = await api('/api/admin/settings', {
          method: 'PATCH',
          body: { reseller_can_add_products: nextState }
        });
        if (state.cache) {
          state.cache.settings = res?.settings || {
            ...(state.cache.settings || {}),
            reseller_can_add_products: nextState
          };
        }
        toast(`Fitur tambah produk reseller berhasil ${nextState ? 'diaktifkan' : 'dinonaktifkan'}!`);
        await loadResellers(true);
      } catch (e) {
        toast(e.message, true);
      } finally {
        toggleAddBtn.disabled = false;
      }
    };
  }

  $('#editResellerFeeBtn').onclick = () => {
    modal('Atur Biaya Pendaftaran Reseller', `
      <div class="field">
        <label>Biaya Pendaftaran Kemitraan (Rp)</label>
        <input type="number" name="reseller_registration_fee" value="${regFee}" min="0" step="500" placeholder="0 = Gratis">
        <small class="muted">Isi 0 jika pendaftaran gratis. Jika diisi nominal (misal 50.000), user akan diminta pembayaran via QRIS / Saldo setelah permohonan disetujui Owner.</small>
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" name="reseller_registration_enabled" ${regEnabled ? 'checked' : ''}>
          <b>Buka Pendaftaran Reseller di Bot Utama</b>
        </label>
        <small class="muted">Jika dinonaktifkan, tombol dan perintah pendaftaran kemitraan di bot utama akan ditutup.</small>
      </div>
    `, async (data) => {
      const fee = Math.max(0, Number(data.reseller_registration_fee || 0));
      const enabled = Boolean(data.reseller_registration_enabled === 'on' || data.reseller_registration_enabled === 'true' || data.reseller_registration_enabled === true);
      const res = await api('/api/admin/settings', {
        method: 'PATCH',
        body: {
          reseller_registration_fee: fee,
          reseller_registration_enabled: enabled
        }
      });
      if (state.cache) {
        state.cache.settings = res?.settings || {
          ...(state.cache.settings || {}),
          reseller_registration_fee: fee,
          reseller_registration_enabled: enabled
        };
      }
      toast('Pengaturan pendaftaran reseller berhasil disimpan!');
      await loadResellers(true);
    }, { submit: 'Simpan Pengaturan' });
  };

  $('#addResellerBtn').onclick = () => openResellerModal();

  const filter = () => {
    const q = String($('#resellerSearch')?.value || '').toLowerCase().trim();
    const st = String($('#resellerStatusFilter')?.value || '').trim();
    const filtered = items.filter(r => {
      const matchQ = !q || [r.name, r.username, r.telegram_id, r.phone].some(x => String(x || '').toLowerCase().includes(q));
      const matchSt = !st || r.status === st;
      return matchQ && matchSt;
    });

    const grid = $('#resellersCardGrid');
    if (!grid) return;
    if (!filtered.length) {
      grid.innerHTML = '<div class="empty-product"><h3>Belum ada reseller</h3><p>Tekan Tambah Reseller untuk mendaftarkan mitra pertama.</p></div>';
      return;
    }

    grid.innerHTML = filtered.map(r => {
      const markupText = r.markup_mode === 'percent' ? `+${r.markup_value}%` : `+${money(r.markup_value)} / item`;
      const isPending = r.status === 'pending_approval';
      return `
        <article class="reseller-card ${isPending ? 'pending-approval-border' : ''}">
          <div class="reseller-card-head">
            <div>
              <h3>${esc(r.name)}</h3>
              <p style="margin:3px 0;font-size:11px;color:var(--muted)">
                ${r.username ? '@' + esc(r.username) + ' · ' : ''}
                Telegram ID: <code class="mono">${esc(r.telegram_id || '-')}</code>
                ${r.phone ? ' · ' + esc(r.phone) : ''}
              </p>
            </div>
            <div>${badge(r.status)}</div>
          </div>
          <div class="reseller-meta">
            <div>
              <small>📈 Markup Harga</small>
              <strong>${esc(markupText)}</strong>
            </div>
            <div>
              <small>🤖 Bot Terdaftar</small>
              <strong>${r.bots_count || 0} Bot (${r.active_bots_count || 0} Aktif)</strong>
            </div>
            <div>
              <small>💰 Saldo Profit</small>
              <strong style="color:#15803d">${money(r.profit_balance)}</strong>
            </div>
            <div>
              <small>💸 Total Ditarik</small>
              <strong>${money(r.withdrawn_total)}</strong>
            </div>
            <div>
              <small>🏬 Produk Toko Sendiri</small>
              <strong>${r.can_add_products ? '<span class="badge ok" style="padding:2px 6px;font-size:11px">🟢 Aktif</span>' : '<span class="badge bad" style="padding:2px 6px;font-size:11px">🔴 Nonaktif</span>'}</strong>
            </div>
            <div>
              <small>🏦 Rekening Pencairan</small>
              <strong>${esc(r.bank_name || '-')} ${esc(r.bank_account_number || '')}</strong>
              <span style="font-size:9px;color:var(--muted)">A.N: ${esc(r.bank_account_name || '-')}</span>
            </div>
          </div>
          ${r.note ? `<div style="font-size:10px;color:var(--muted);background:#fcfaff;padding:6px 10px;border-radius:8px;border:1px solid #e0d6f5"><b>Catatan:</b> ${esc(r.note)}</div>` : ''}
          <div class="reseller-actions">
            ${isPending ? `
              <button class="neo-btn green small" data-approve-reseller="${r.id}">✅ Setujui</button>
              <button class="neo-btn red small" data-reject-reseller="${r.id}">❌ Tolak</button>
            ` : ''}
            <button class="neo-btn ${r.can_add_products ? 'red' : 'green'} small" data-toggle-reseller-products="${r.id}" title="${r.can_add_products ? 'Klik untuk mematikan izin tambah produk toko' : 'Klik untuk mengizinkan tambah produk toko'}">
              ${r.can_add_products ? '🏬 Matikan Produk Toko' : '🏬 Izinkan Produk Toko'}
            </button>
            <button class="neo-btn blue small" data-edit-reseller="${r.id}">✎ Edit</button>
            <button class="neo-btn purple small" data-manage-bots="${r.id}">🤖 Kelola Bot (${r.bots_count || 0})</button>
            <button class="neo-btn green small" data-manual-withdraw="${r.id}">💸 Tarik Saldo</button>
            <button class="neo-btn red small" data-delete-reseller="${r.id}">🗑 Hapus</button>
          </div>
        </article>
      `;
    }).join('');

    $$('[data-toggle-reseller-products]').forEach(b => {
      b.onclick = async () => {
        const id = b.dataset.toggleResellerProducts;
        const item = items.find(x => String(x.id) === id);
        const nextState = !item?.can_add_products;
        b.disabled = true;
        try {
          await api(`/api/admin/resellers/${id}`, {
            method: 'PATCH',
            body: { can_add_products: nextState }
          });
          toast(`Izin produk toko untuk "${item?.name}" berhasil ${nextState ? 'diaktifkan' : 'dinonaktifkan'}!`);
          await loadResellers(true);
        } catch (e) {
          toast(e.message, true);
        } finally {
          b.disabled = false;
        }
      };
    });

    $$('[data-approve-reseller]').forEach(b => {
      b.onclick = async () => {
        const id = b.dataset.approveReseller;
        const item = items.find(x => String(x.id) === id);
        if (!confirm(`Setujui pendaftaran reseller "${item?.name || id}"? Bot miliknya akan otomatis diaktifkan & dijalankan.`)) return;
        try {
          await api(`/api/admin/resellers/${id}/approve`, { method: 'POST' });
          toast('Reseller disetujui & bot toko berhasil dijalankan!');
          await loadResellers(true);
        } catch (e) {
          toast(e.message, true);
        }
      };
    });

    $$('[data-reject-reseller]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.rejectReseller;
        const item = items.find(x => String(x.id) === id);
        modal('Tolak Pendaftaran Reseller', `
          <p style="margin-bottom:12px;font-size:12px">Tolak pendaftaran reseller <b>${esc(item?.name || id)}</b>? Jika ada biaya pendaftaran yang telah dipotong, biaya akan otomatis direfund ke saldo dompet user.</p>
          <div class="field">
            <label>Alasan Penolakan</label>
            <textarea name="reason" placeholder="Contoh: Token bot tidak valid / Nama toko tidak sesuai aturan" rows="3"></textarea>
          </div>
        `, async (data) => {
          await api(`/api/admin/resellers/${id}/reject`, {
            method: 'POST',
            body: { reason: data.reason || 'Ditolak oleh Owner' }
          });
          toast('Pendaftaran reseller ditolak & notifikasi dikirim ke user.');
          await loadResellers(true);
        }, { submit: 'Tolak Permohonan' });
      };
    });

    $$('[data-edit-reseller]').forEach(b => {
      b.onclick = () => {
        const item = items.find(x => String(x.id) === b.dataset.editReseller);
        if (item) openResellerModal(item);
      };
    });
    $$('[data-manage-bots]').forEach(b => {
      b.onclick = () => {
        state.resellerTab = 'bots';
        state.resellerFilter = b.dataset.manageBots;
        $$('#resellerSubnav .subnav-btn').forEach(x => x.classList.toggle('active', x.dataset.resellerTab === 'bots'));
        renderResellerTabContent();
      };
    });
    $$('[data-manual-withdraw]').forEach(b => {
      b.onclick = () => openManualWithdrawalModal(b.dataset.manualWithdraw);
    });
    $$('[data-delete-reseller]').forEach(b => {
      b.onclick = async () => {
        if (!confirm('Hapus reseller ini? Semua bot miliknya akan dinonaktifkan.')) return;
        try {
          await api(`/api/admin/resellers/${b.dataset.deleteReseller}`, { method: 'DELETE' });
          toast('Reseller berhasil dihapus');
          await loadResellers(true);
        } catch (e) {
          toast(e.message, true);
        }
      };
    });
  };

  $('#resellerSearch').oninput = filter;
  $('#resellerStatusFilter').onchange = filter;
  filter();
}

// ---------------- TAB 2: BOT TOKO RESELLER ----------------
async function renderResellerBotsList(host) {
  const [botsRes, resellersRes] = await Promise.all([
    api('/api/admin/reseller-bots?limit=500').catch(() => ({ items: [] })),
    api('/api/admin/resellers?limit=500').catch(() => ({ items: [] }))
  ]);
  const bots = botsRes.items || [];
  const resellers = resellersRes.items || [];
  state.cache.resellerBots = bots;
  state.cache.resellers = resellers;

  const oldBotSearch = $('#botSearch')?.value || '';
  const oldBotReseller = $('#botResellerFilter')?.value || state.resellerFilter || '';
  const oldBotStatus = $('#botStatusFilter')?.value || '';

  const resellerOptions = resellers.map(r => `<option value="${r.id}" ${String(oldBotReseller) === String(r.id) ? 'selected' : ''}>${esc(r.name)} (@${esc(r.username || '-')})</option>`).join('');

  host.innerHTML = `
    <div class="toolbar product-toolbar" style="margin-bottom:14px;">
      <div class="searchbox"><input id="botSearch" placeholder="Cari nama bot, username @..." value="${esc(oldBotSearch)}"></div>
      <select id="botResellerFilter">
        <option value="" ${!oldBotReseller ? 'selected' : ''}>Semua Reseller</option>
        ${resellerOptions}
      </select>
      <select id="botStatusFilter">
        <option value="" ${oldBotStatus === '' ? 'selected' : ''}>Semua Status</option>
        <option value="active" ${oldBotStatus === 'active' ? 'selected' : ''}>Aktif (Online)</option>
        <option value="inactive" ${oldBotStatus === 'inactive' ? 'selected' : ''}>Nonaktif (Stopped)</option>
      </select>
      <button id="addBotBtn" class="neo-btn purple">＋ Pasang Bot Baru</button>
    </div>
    <div id="botsCardGrid" class="bot-grid"></div>
  `;

  $('#addBotBtn').onclick = () => openResellerBotModal({}, state.resellerFilter || null);

  const filter = () => {
    const q = String($('#botSearch')?.value || '').toLowerCase().trim();
    const resId = String($('#botResellerFilter')?.value || '').trim();
    const st = String($('#botStatusFilter')?.value || '').trim();

    const filtered = bots.filter(b => {
      const matchQ = !q || [b.bot_name, b.bot_username, b.store_name].some(x => String(x || '').toLowerCase().includes(q));
      const matchRes = !resId || String(b.reseller_id) === resId;
      const matchSt = !st || b.status === st;
      return matchQ && matchRes && matchSt;
    });

    const grid = $('#botsCardGrid');
    if (!grid) return;
    if (!filtered.length) {
      grid.innerHTML = '<div class="empty-product"><h3>Belum ada Bot Toko</h3><p>Pasang bot reseller pertama dengan memasukkan token dari @BotFather.</p></div>';
      return;
    }

    grid.innerHTML = filtered.map(b => {
      const rt = b.runtime || { running: false, last_error: '' };
      let rtBadge = `<span class="bot-runtime-badge stopped">🔴 Offline / Stopped</span>`;
      if (rt.running) {
        rtBadge = `<span class="bot-runtime-badge online">🟢 Online (Polling)</span>`;
      } else if (rt.last_error) {
        rtBadge = `<span class="bot-runtime-badge error" title="${esc(rt.last_error)}">⚠️ Error: ${esc(rt.last_error).slice(0, 30)}</span>`;
      }

      const resOwner = resellers.find(r => r.id === b.reseller_id);

      return `
        <article class="bot-card">
          <div class="bot-card-head">
            <div>
              <h3>${esc(b.store_name || b.bot_name || 'Bot Toko')}</h3>
              <p style="margin:3px 0;font-size:11px;color:var(--muted)">
                Username: <a href="https://t.me/${esc(b.bot_username)}" target="_blank" style="font-weight:900;color:var(--purple)">@${esc(b.bot_username)}</a> · 
                Pemilik: <b>${esc(b.reseller_name || resOwner?.name || `Reseller #${b.reseller_id}`)}</b>
              </p>
            </div>
            <div>${rtBadge}</div>
          </div>
          <div class="bot-meta">
            <div>
              <small>🏪 Nama Toko</small>
              <strong>${esc(b.store_name || '-')}</strong>
            </div>
            <div>
              <small>🎨 Banner Header</small>
              <strong>${b.start_photo_url ? '✅ Terpasang' : 'Standar Teks'}</strong>
            </div>
            <div>
              <small>💬 CS / Admin Toko</small>
              <strong>${esc(b.support_contact || '-')}</strong>
            </div>
            <div>
              <small>📢 Channel Toko</small>
              <strong>${esc(b.channel_url || '-')}</strong>
            </div>
          </div>
          <div class="bot-actions">
            ${rt.running
              ? `<button class="neo-btn red small" data-stop-bot="${b.id}">⏹ Hentikan</button>`
              : `<button class="neo-btn green small" data-start-bot="${b.id}">▶ Jalankan</button>`
            }
            <button class="neo-btn yellow small" data-restart-bot="${b.id}">↻ Restart</button>
            <button class="neo-btn purple small" data-branding-bot="${b.id}">🎨 Atur Branding & /start</button>
            <button class="neo-btn blue small" data-edit-bot="${b.id}">✎ Edit Token</button>
            <button class="neo-btn red small" data-delete-bot="${b.id}">🗑 Hapus</button>
          </div>
        </article>
      `;
    }).join('');

    $$('[data-start-bot]').forEach(btn => {
      btn.onclick = async () => {
        try {
          btn.disabled = true;
          btn.textContent = 'Memulai...';
          await api(`/api/admin/reseller-bots/${btn.dataset.startBot}/start`, { method: 'POST', body: {} });
          toast('Bot berhasil dijalankan!');
          await renderResellerTabContent();
        } catch (e) {
          toast(e.message, true);
        } finally {
          btn.disabled = false;
        }
      };
    });
    $$('[data-stop-bot]').forEach(btn => {
      btn.onclick = async () => {
        try {
          btn.disabled = true;
          btn.textContent = 'Menghentikan...';
          await api(`/api/admin/reseller-bots/${btn.dataset.stopBot}/stop`, { method: 'POST', body: {} });
          toast('Bot berhasil dihentikan');
          await renderResellerTabContent();
        } catch (e) {
          toast(e.message, true);
        } finally {
          btn.disabled = false;
        }
      };
    });
    $$('[data-restart-bot]').forEach(btn => {
      btn.onclick = async () => {
        try {
          btn.disabled = true;
          btn.textContent = 'Restarting...';
          await api(`/api/admin/reseller-bots/${btn.dataset.restartBot}/restart`, { method: 'POST', body: {} });
          toast('Bot berhasil direstart');
          await renderResellerTabContent();
        } catch (e) {
          toast(e.message, true);
        } finally {
          btn.disabled = false;
        }
      };
    });
    $$('[data-branding-bot]').forEach(btn => {
      btn.onclick = () => {
        const item = bots.find(x => String(x.id) === btn.dataset.brandingBot);
        if (item) openResellerBotBrandingModal(item);
      };
    });
    $$('[data-edit-bot]').forEach(btn => {
      btn.onclick = () => {
        const item = bots.find(x => String(x.id) === btn.dataset.editBot);
        if (item) openResellerBotModal(item);
      };
    });
    $$('[data-delete-bot]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Hapus bot ini? Bot akan dihentikan dari sistem.')) return;
        try {
          await api(`/api/admin/reseller-bots/${btn.dataset.deleteBot}`, { method: 'DELETE' });
          toast('Bot berhasil dihapus');
          await renderResellerTabContent();
        } catch (e) {
          toast(e.message, true);
        }
      };
    });
  };

  $('#botSearch').oninput = filter;
  $('#botResellerFilter').onchange = filter;
  $('#botStatusFilter').onchange = filter;
  filter();
}

// ---------------- TAB 3: PENARIKAN SALDO (WITHDRAWALS) ----------------
async function renderResellerWithdrawalsList(host) {
  const res = await api('/api/admin/reseller-withdrawals?limit=300').catch(() => ({ items: [] }));
  const items = res.items || [];

  const oldWdStatus = $('#withdrawalStatusFilter')?.value || 'pending';

  host.innerHTML = `
    <div class="toolbar product-toolbar" style="margin-bottom:14px;">
      <select id="withdrawalStatusFilter">
        <option value="" ${oldWdStatus === '' ? 'selected' : ''}>Semua Status</option>
        <option value="pending" ${oldWdStatus === 'pending' ? 'selected' : ''}>Menunggu Approval (Pending)</option>
        <option value="approved" ${oldWdStatus === 'approved' ? 'selected' : ''}>Disetujui (Approved)</option>
        <option value="rejected" ${oldWdStatus === 'rejected' ? 'selected' : ''}>Ditolak (Rejected)</option>
      </select>
      <button id="addManualWdBtn" class="neo-btn purple">＋ Buat Pengajuan Manual</button>
    </div>
    <div id="withdrawalsGrid" class="withdrawal-grid"></div>
  `;

  $('#addManualWdBtn').onclick = () => openManualWithdrawalModal();

  const filter = () => {
    const st = String($('#withdrawalStatusFilter')?.value || '').trim();
    const filtered = items.filter(w => !st || w.status === st);
    const grid = $('#withdrawalsGrid');
    if (!grid) return;
    if (!filtered.length) {
      grid.innerHTML = '<div class="empty-product"><h3>Tidak ada data penarikan</h3><p>Belum ada pengajuan pencairan saldo profit pada filter ini.</p></div>';
      return;
    }

    grid.innerHTML = filtered.map(w => {
      return `
        <article class="withdrawal-card">
          <div class="withdrawal-card-head">
            <div>
              <h3>Ref: <code>${esc(w.withdrawal_ref)}</code> · ${money(w.amount)}</h3>
              <p style="margin:3px 0;font-size:11px;color:var(--muted)">
                Reseller: <b>${esc(w.reseller_name || `ID #${w.reseller_id}`)}</b> ${w.reseller_username ? `(@${esc(w.reseller_username)})` : ''} · 
                Diajukan: ${date(w.created_at)}
              </p>
            </div>
            <div>${badge(w.status)}</div>
          </div>
          <div class="withdrawal-meta">
            <div>
              <small>🏦 Bank / E-Wallet</small>
              <strong>${esc(w.bank_name)}</strong>
            </div>
            <div>
              <small>💳 Nomor Rekening</small>
              <strong class="mono">${esc(w.account_number)}</strong>
            </div>
            <div>
              <small>👤 Atas Nama</small>
              <strong>${esc(w.account_name)}</strong>
            </div>
            <div>
              <small>💰 Saldo Reseller Saat Ini</small>
              <strong>${money(w.profit_balance)}</strong>
            </div>
          </div>
          ${w.proof_image ? `<div style="font-size:11px;"><b>Bukti Transfer:</b> <a href="${esc(mediaSrc(w.proof_image))}" target="_blank" style="color:var(--purple);font-weight:900">Lihat Gambar Struk</a></div>` : ''}
          ${w.admin_note ? `<div style="font-size:10px;background:#fffde6;border:1px solid #ebdf8c;padding:6px 10px;border-radius:8px"><b>Catatan Admin:</b> ${esc(w.admin_note)}</div>` : ''}
          ${w.status === 'pending' ? `
            <div class="withdrawal-actions">
              <button class="neo-btn green small" data-approve-wd="${w.id}">✅ Setujui & Transfer</button>
              <button class="neo-btn red small" data-reject-wd="${w.id}">❌ Tolak Pengajuan</button>
            </div>
          ` : ''}
        </article>
      `;
    }).join('');

    $$('[data-approve-wd]').forEach(b => {
      b.onclick = () => {
        const item = items.find(x => String(x.id) === b.dataset.approveWd);
        if (item) openWithdrawalApproveModal(item);
      };
    });
    $$('[data-reject-wd]').forEach(b => {
      b.onclick = () => {
        const item = items.find(x => String(x.id) === b.dataset.rejectWd);
        if (item) openWithdrawalRejectModal(item);
      };
    });
  };

  $('#withdrawalStatusFilter').onchange = filter;
  filter();
}

// ---------------- TAB 4: MUTASI PROFIT (LEDGER) ----------------
async function renderResellerLedgerList(host) {
  const res = await api('/api/admin/reseller-profit-ledger?limit=300').catch(() => ({ items: [] }));
  const items = res.items || [];

  if (!items.length) {
    host.innerHTML = '<div class="empty-product"><h3>Belum ada mutasi profit</h3><p>Setiap komisi pesanan reseller atau penarikan saldo akan dicatat di sini secara otomatis.</p></div>';
    return;
  }

  host.innerHTML = `
    <div class="ledger-table-wrap">
      <table class="ledger-table">
        <thead>
          <tr>
            <th>Waktu</th>
            <th>Reseller</th>
            <th>Tipe Mutasi</th>
            <th>Jumlah</th>
            <th>Saldo Setelahnya</th>
            <th>Referensi</th>
            <th>Keterangan</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(l => {
            const isCredit = l.direction === 'credit';
            const sign = isCredit ? '+' : '-';
            const cls = isCredit ? 'ledger-credit' : 'ledger-debit';
            return `
              <tr>
                <td>${date(l.created_at)}</td>
                <td><b>${esc(l.reseller_name || `ID #${l.reseller_id}`)}</b></td>
                <td>${isCredit ? '<span class="badge ok">Komisi Masuk</span>' : '<span class="badge bad">Penarikan</span>'}</td>
                <td class="${cls}">${sign}${money(l.amount)}</td>
                <td><b>${money(l.balance_after)}</b></td>
                <td><code class="mono">${esc(l.order_ref || '-')}</code></td>
                <td><small>${esc(l.reason || '-')}${l.bot_username ? ` · @${esc(l.bot_username)}` : ''}</small></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ==========================================
// RESELLER MODALS & FORMS
// ==========================================

function openResellerModal(item = {}) {
  const edit = !!item.id;
  const html = `
    <div class="form-grid">
      <label>Nama Reseller
        <input name="name" required value="${esc(item.name || '')}" placeholder="Contoh: Budi Santoso">
      </label>
      <label>Telegram ID (Wajib untuk Notifikasi Komisi)
        <input name="telegram_id" required value="${esc(item.telegram_id || '')}" placeholder="Contoh: 123456789">
        <small>ID numerik akun Telegram reseller (dapat diperoleh via @userinfobot).</small>
      </label>
      <label>Username Telegram
        <input name="username" value="${esc(item.username || '')}" placeholder="tanpa @ (contoh: budistore)">
      </label>
      <label>Nomor HP / WhatsApp
        <input name="phone" value="${esc(item.phone || '')}" placeholder="08xxxxxxxxxx">
      </label>
      <label>Mode Markup Harga
        <select name="markup_mode">
          <option value="fixed" ${item.markup_mode !== 'percent' ? 'selected' : ''}>Fixed (Nominal Rp per item)</option>
          <option value="percent" ${item.markup_mode === 'percent' ? 'selected' : ''}>Percent (Persen % dari harga dasar)</option>
        </select>
      </label>
      <label>Nilai Markup
        <input name="markup_value" type="number" min="0" value="${Number(item.markup_value || 0)}" required>
        <small>Contoh: 5000 (jika fixed) atau 10 (jika 10%).</small>
      </label>
      <label>Status Kemitraan
        <select name="status">
          <option value="active" ${item.status === 'active' || !item.status ? 'selected' : ''}>Aktif</option>
          <option value="pending_approval" ${item.status === 'pending_approval' ? 'selected' : ''}>Menunggu Persetujuan</option>
          <option value="suspended" ${item.status === 'suspended' ? 'selected' : ''}>Ditangguhkan</option>
          <option value="rejected" ${item.status === 'rejected' ? 'selected' : ''}>Ditolak</option>
        </select>
      </label>
      <label>Izin Tambah Produk Toko Sendiri
        <select name="can_add_products">
          <option value="false" ${!item.can_add_products ? 'selected' : ''}>🔴 Nonaktif (Default)</option>
          <option value="true" ${item.can_add_products ? 'selected' : ''}>🟢 Aktif (Boleh Tambah Produk Toko)</option>
        </select>
        <small>Jika aktif, reseller ini bisa menambahkan produk digital toko miliknya sendiri.</small>
      </label>
      <label class="full" style="font-weight:900;border-bottom:2px dashed var(--ink);padding-bottom:4px;margin-top:8px">
        Informasi Rekening / Pencairan Dana Reseller
      </label>
      <label>Nama Bank / E-Wallet
        <input name="bank_name" value="${esc(item.bank_name || '')}" placeholder="BCA / Mandiri / DANA / GoPay">
      </label>
      <label>Nomor Rekening
        <input name="bank_account_number" value="${esc(item.bank_account_number || '')}" placeholder="1234567890">
      </label>
      <label>Atas Nama Rekening
        <input name="bank_account_name" value="${esc(item.bank_account_name || '')}" placeholder="Nama Pemilik Rekening">
      </label>
      <label class="full">Catatan Internal
        <textarea name="notes" rows="3" placeholder="Catatan khusus untuk reseller ini...">${esc(item.notes || '')}</textarea>
      </label>
    </div>
  `;

  modal(edit ? 'Edit Data Reseller' : 'Tambah Reseller Baru', html, async b => {
    b.markup_value = Number(b.markup_value || 0);
    b.telegram_id = String(b.telegram_id || '').trim();
    b.username = String(b.username || '').replace(/^@/, '').trim();
    b.can_add_products = b.can_add_products === 'true' || b.can_add_products === true;
    await api(edit ? `/api/admin/resellers/${item.id}` : '/api/admin/resellers', {
      method: edit ? 'PATCH' : 'POST',
      body: b
    });
    toast(edit ? 'Data reseller diperbarui' : 'Reseller baru berhasil dibuat');
    await loadResellers(true);
  }, { submit: edit ? 'Simpan Perubahan' : '＋ Daftarkan Reseller' });
}

function openResellerBotModal(bot = {}, defaultResellerId = null) {
  const edit = !!bot.id;
  const resellers = state.cache.resellers || [];
  const selectedResId = bot.reseller_id || defaultResellerId || (resellers[0]?.id || '');

  const html = `
    <div class="form-grid">
      <label class="full">Reseller Pemilik Bot
        <select name="reseller_id" id="botModalReseller" required>
          ${resellers.map(r => `<option value="${r.id}" ${String(r.id) === String(selectedResId) ? 'selected' : ''}>${esc(r.name)} (@${esc(r.username || '-')})</option>`).join('')}
        </select>
      </label>
      <label class="full">Bot Token (dari @BotFather)
        <div style="display:flex;gap:8px;">
          <input name="bot_token" id="botModalToken" required value="${esc(bot.bot_token || '')}" placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ" style="flex:1">
          <button type="button" id="btnVerifyToken" class="neo-btn blue small" style="white-space:nowrap">🔍 Verifikasi Token</button>
        </div>
        <small id="tokenVerifyStatus" style="font-weight:900;margin-top:5px;display:block"></small>
      </label>
      <label>Nama Bot
        <input name="bot_name" id="botModalName" required value="${esc(bot.bot_name || '')}" placeholder="Nama Bot">
      </label>
      <label>Username Bot
        <input name="bot_username" id="botModalUsername" required value="${esc(bot.bot_username || '')}" placeholder="usernamebot (tanpa @)">
      </label>
      <label>Nama Toko Bot (Tampil di Katalog)
        <input name="store_name" id="botModalStoreName" value="${esc(bot.store_name || '')}" placeholder="Contoh: Toko Keren Store">
      </label>
      <label>Status Bot
        <select name="status">
          <option value="active" ${bot.status !== 'inactive' ? 'selected' : ''}>Aktif (Langsung Online)</option>
          <option value="inactive" ${bot.status === 'inactive' ? 'selected' : ''}>Nonaktif (Offline)</option>
        </select>
      </label>
    </div>
  `;

  modal(edit ? 'Edit Token Bot Reseller' : 'Pasang Bot Reseller Baru', html, async b => {
    b.bot_username = String(b.bot_username || '').replace(/^@/, '').trim();
    b.bot_token = String(b.bot_token || '').trim();
    b.reseller_id = Number(b.reseller_id || selectedResId);
    if (!b.store_name) b.store_name = b.bot_name;

    await api(edit ? `/api/admin/reseller-bots/${bot.id}` : '/api/admin/reseller-bots', {
      method: edit ? 'PATCH' : 'POST',
      body: b
    });
    toast(edit ? 'Token bot diperbarui' : 'Bot reseller berhasil didaftarkan dan dijalankan');
    await loadResellers(true);
  }, { submit: edit ? 'Simpan Perubahan' : '＋ Jalankan Bot' });

  const verifyBtn = $('#btnVerifyToken');
  const tokenInput = $('#botModalToken');
  const statusEl = $('#tokenVerifyStatus');
  if (verifyBtn && tokenInput) {
    verifyBtn.onclick = async () => {
      const token = tokenInput.value.trim();
      if (!token) return toast('Masukkan token terlebih dahulu', true);
      try {
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Mengecek...';
        statusEl.textContent = 'Menghubungkan ke Telegram...';
        statusEl.style.color = '#555';
        const r = await api('/api/admin/reseller-bots/verify-token', { method: 'POST', body: { bot_token: token } });
        if (r.ok && r.bot) {
          statusEl.textContent = `✅ Token Valid! @${r.bot.username} (${r.bot.first_name || 'Bot'})`;
          statusEl.style.color = '#15803d';
          if (!$('#botModalUsername').value) $('#botModalUsername').value = r.bot.username || '';
          if (!$('#botModalName').value) $('#botModalName').value = r.bot.first_name || '';
          if (!$('#botModalStoreName').value) $('#botModalStoreName').value = r.bot.first_name || '';
          toast('Token bot valid!');
        }
      } catch (err) {
        statusEl.textContent = `❌ ${err.message || 'Token tidak valid'}`;
        statusEl.style.color = '#b91c1c';
        toast(err.message, true);
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = '🔍 Verifikasi Token';
      }
    };
  }
}

function openResellerBotBrandingModal(bot) {
  const html = `
    <div class="form-grid">
      <label>Nama Toko Bot
        <input name="store_name" required value="${esc(bot.store_name || '')}" placeholder="Nama Toko">
      </label>
      <label>Tagline Toko
        <input name="store_tagline" value="${esc(bot.store_tagline || '')}" placeholder="Digital Store & TopUp">
      </label>
      <label class="full">Foto Header / Banner Sambutan
        <div style="display:flex;gap:8px;margin-bottom:6px">
          <input name="start_photo_url" id="botBannerInput" value="${esc(bot.start_photo_url || '')}" placeholder="vps:// atau URL https://..." style="flex:1">
          <button type="button" id="btnUploadBotBanner" class="neo-btn blue small" style="white-space:nowrap">Upload Banner</button>
        </div>
        <input type="file" id="botBannerFile" accept="image/*" style="display:none">
        <small>Foto akan tampil di bagian atas menu /start bot.</small>
      </label>
      <label class="full">Pesan Teks /start Sambutan
        <textarea name="start_message" rows="5" placeholder="Gunakan {store_name}, {first_name}, {username}">${esc(bot.start_message || '')}</textarea>
        <small>Kosongkan untuk menggunakan format sambutan standar iLink.</small>
      </label>
      <label>Kontak Admin / Customer Service Toko
        <input name="support_contact" value="${esc(bot.support_contact || '')}" placeholder="@AdminSupport / https://t.me/...">
      </label>
      <label>Link Channel Telegram Toko
        <input name="channel_url" value="${esc(bot.channel_url || '')}" placeholder="https://t.me/channelku">
      </label>
      <label class="full">Link Grup Komunitas / Diskusi Toko
        <input name="group_url" value="${esc(bot.group_url || '')}" placeholder="https://t.me/grupdiskusi">
      </label>
    </div>
  `;

  modal(`🎨 Branding Toko · @${bot.bot_username}`, html, async b => {
    await api(`/api/admin/reseller-bots/${bot.id}`, { method: 'PATCH', body: b });
    toast('Branding bot berhasil diperbarui');
    await loadResellers(true);
  }, { submit: 'Simpan Branding' });

  const uploadBtn = $('#btnUploadBotBanner');
  const fileInput = $('#botBannerFile');
  const bannerInput = $('#botBannerInput');
  if (uploadBtn && fileInput && bannerInput) {
    uploadBtn.onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading...';
        const r = await uploadMedia(file, 'banner');
        bannerInput.value = r.item.key;
        toast('Banner berhasil diupload ke VPS!');
      } catch (e) {
        toast(e.message, true);
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload Banner';
      }
    };
  }
}

function openWithdrawalApproveModal(w) {
  const html = `
    <div style="background:#f4edff;border:2px solid var(--ink);border-radius:12px;padding:12px;margin-bottom:14px">
      <b>Detail Transfer Penarikan:</b><br>
      Nomor Ref: <code>${esc(w.withdrawal_ref)}</code><br>
      Reseller: <b>${esc(w.reseller_name)}</b><br>
      Jumlah Transfer: <b style="font-size:16px;color:#15803d">${money(w.amount)}</b><br>
      Tujuan: <b>${esc(w.bank_name)}</b> - <code>${esc(w.account_number)}</code> a.n. <b>${esc(w.account_name)}</b>
    </div>
    <div class="form-grid">
      <label class="full">Bukti Transfer (Upload atau URL Gambar)
        <div style="display:flex;gap:8px;margin-bottom:6px">
          <input name="proof_image" id="wdProofInput" placeholder="vps:// atau URL bukti transfer" style="flex:1">
          <button type="button" id="btnUploadWdProof" class="neo-btn blue small" style="white-space:nowrap">Upload Struk</button>
        </div>
        <input type="file" id="wdProofFile" accept="image/*" style="display:none">
      </label>
      <label class="full">Catatan untuk Reseller
        <textarea name="admin_note" rows="3" placeholder="Contoh: Transfer m-banking BCA berhasil. Terima kasih!"></textarea>
      </label>
    </div>
    <p class="muted" style="font-size:10px;margin-top:8px">
      Saat disetujui, saldo profit reseller otomatis terpotong dan notifikasi struk akan dikirim ke Telegram reseller.
    </p>
  `;

  modal(`✅ Setujui Penarikan · ${w.withdrawal_ref}`, html, async b => {
    await api(`/api/admin/reseller-withdrawals/${w.id}/approve`, {
      method: 'POST',
      body: {
        proof_image: b.proof_image || '',
        admin_note: b.admin_note || ''
      }
    });
    toast('Penarikan saldo disetujui & notifikasi terkirim!');
    await loadResellers(true);
  }, { submit: '✅ Konfirmasi Telah Ditransfer' });

  const uploadBtn = $('#btnUploadWdProof');
  const fileInput = $('#wdProofFile');
  const proofInput = $('#wdProofInput');
  if (uploadBtn && fileInput && proofInput) {
    uploadBtn.onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading...';
        const r = await uploadMedia(file, 'proof');
        proofInput.value = r.item.key;
        toast('Struk berhasil diupload!');
      } catch (e) {
        toast(e.message, true);
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload Struk';
      }
    };
  }
}

function openWithdrawalRejectModal(w) {
  const html = `
    <div style="background:#fff2f2;border:2px solid #b91c1c;border-radius:12px;padding:12px;margin-bottom:14px">
      <b>Tolak Permintaan Penarikan:</b><br>
      Nomor Ref: <code>${esc(w.withdrawal_ref)}</code><br>
      Jumlah: <b>${money(w.amount)}</b> untuk <b>${esc(w.reseller_name)}</b>
    </div>
    <div class="form-grid">
      <label class="full">Alasan Penolakan
        <textarea name="admin_note" required rows="4" placeholder="Jelaskan alasan penolakan (misal: Rekening salah, nama bank tidak cocok, dsb)..."></textarea>
      </label>
    </div>
    <p class="muted" style="font-size:10px;margin-top:8px">
      Saldo profit reseller tidak akan berkurang dan alasan penolakan akan dikirimkan ke Telegram reseller.
    </p>
  `;

  modal(`❌ Tolak Penarikan · ${w.withdrawal_ref}`, html, async b => {
    await api(`/api/admin/reseller-withdrawals/${w.id}/reject`, {
      method: 'POST',
      body: { admin_note: b.admin_note || '' }
    });
    toast('Pengajuan penarikan ditolak');
    await loadResellers(true);
  }, { submit: '❌ Tolak Pengajuan' });
}

function openManualWithdrawalModal(defaultResellerId = null) {
  const resellers = state.cache.resellers || [];
  if (!resellers.length) return toast('Belum ada data reseller', true);
  const selectedRes = resellers.find(r => String(r.id) === String(defaultResellerId)) || resellers[0];

  const html = `
    <div class="form-grid">
      <label class="full">Pilih Reseller
        <select name="reseller_id" id="manualWdReseller" required>
          ${resellers.map(r => `<option value="${r.id}" ${String(r.id) === String(selectedRes.id) ? 'selected' : ''}>${esc(r.name)} · Saldo: ${money(r.profit_balance)}</option>`).join('')}
        </select>
      </label>
      <label>Jumlah Penarikan (Rp)
        <input name="amount" id="manualWdAmount" type="number" min="10000" step="1000" required placeholder="Minimal 10000">
      </label>
      <label>Nama Bank / E-Wallet
        <input name="bank_name" id="manualWdBank" required value="${esc(selectedRes.bank_name || '')}" placeholder="BCA / DANA">
      </label>
      <label>Nomor Rekening
        <input name="account_number" id="manualWdAccNo" required value="${esc(selectedRes.bank_account_number || '')}" placeholder="1234567890">
      </label>
      <label>Atas Nama Rekening
        <input name="account_name" id="manualWdAccName" required value="${esc(selectedRes.bank_account_name || '')}" placeholder="Nama Penerima">
      </label>
      <label class="full">Catatan Tambahan
        <textarea name="admin_note" rows="2" placeholder="Catatan internal..."></textarea>
      </label>
    </div>
  `;

  modal('＋ Buat Pengajuan Penarikan Saldo', html, async b => {
    b.reseller_id = Number(b.reseller_id);
    b.amount = Number(b.amount || 0);
    await api('/api/admin/reseller-withdrawals', { method: 'POST', body: b });
    toast('Pengajuan penarikan dibuat (status pending)');
    await loadResellers(true);
  }, { submit: 'Buat Pengajuan' });

  const resSelect = $('#manualWdReseller');
  if (resSelect) {
    resSelect.onchange = () => {
      const cur = resellers.find(r => String(r.id) === resSelect.value);
      if (cur) {
        if ($('#manualWdBank')) $('#manualWdBank').value = cur.bank_name || '';
        if ($('#manualWdAccNo')) $('#manualWdAccNo').value = cur.bank_account_number || '';
        if ($('#manualWdAccName')) $('#manualWdAccName').value = cur.bank_account_name || '';
      }
    };
  }
}

// ==========================================================================
// READY STOCK PROMOTIONS & TEMPLATE GENERATOR
// ==========================================================================
function generateClientPromoText(template, items, options, store) {
  const storeName = (options.customHeader || store.name || 'ILINK DIGITAL STORE').trim();
  const botUser = (store.bot_username || '').replace(/^@/, '');
  const botLink = botUser ? `https://t.me/${botUser}` : '';
  const cs = (options.customCs || store.cs_contact || '@owneradmin').trim();
  const showPrice = options.showPrice !== false;
  const showStock = options.showStock !== false;
  const showBot = options.showBot !== false;
  const showCs = options.showCs !== false;
  const showWarranty = options.showWarranty !== false;
  const customFooter = (options.customFooter || '').trim();

  if (!items || !items.length) {
    return '⚠️ Belum ada produk yang dipilih. Silakan centang minimal 1 produk ready di sebelah kiri.';
  }

  // 1. WhatsApp Clean & Modern
  if (template === 'wa') {
    let t = `🏪 *${storeName.toUpperCase()} — LIST PRODUK READY* ⚡\n`;
    t += `_Update Stok Terbaru Hari Ini_\n\n`;
    t += `Halo kak! Berikut daftar produk digital yang *READY STOK* dan siap diproses instan:\n\n`;
    for (const item of items) {
      t += `📦 *${item.name.toUpperCase()}*\n`;
      if (item.has_variants && item.variants && item.variants.length) {
        for (const v of item.variants) {
          const pStr = showPrice ? ` : ${money(v.price)}` : '';
          const sStr = showStock ? ` (Sisa ${v.stock} pcs)` : '';
          t += `• ${v.name}${pStr}${sStr}\n`;
        }
      } else {
        const pStr = showPrice ? ` : ${money(item.single_price || item.price_min)}` : '';
        const sStr = showStock ? ` (Sisa ${item.stock} pcs)` : '';
        t += `• Ready Stok${pStr}${sStr}\n`;
      }
      t += `\n`;
    }
    if (showWarranty) {
      t += `══════════════════════\n`;
      t += `🛡️ *KEUNGGULAN BELANJA DI KAMI:*\n`;
      t += `✅ 100% Bergaransi Resmi\n`;
      t += `✅ Transaksi Aman & Cepat\n`;
      t += `✅ Admin Siap Bantu 24 Jam\n\n`;
    }
    if (showBot || showCs) {
      t += `📲 *CARA ORDER:*\n`;
      if (showBot && botLink) t += `👉 Order via Bot : ${botLink}\n`;
      if (showCs && cs) t += `👉 WhatsApp / CS : ${cs}\n\n`;
    }
    if (customFooter) {
      t += `${customFooter}\n\n`;
    }
    t += `_⚡ Stok terbatas, amankan pesananmu sebelum kehabisan!_`;
    return t;
  }

  // 2. Telegram Channel & Group (HTML & Monospace)
  if (template === 'tg') {
    let t = `📢 <b>LIST PRODUK READY STOK HARI INI</b> ⚡\n`;
    t += `━━━━━━━━━━━━━━━━━━━━\n`;
    t += `🏪 <i>${escapeHtml(storeName)}</i>\n\n`;
    t += `Halo semuanya! Stok akun & layanan digital premium kami <b>READY</b> dan siap diorder otomatis 24 jam:\n\n`;
    for (const item of items) {
      const stockBadge = showStock ? ` <i>(Stok: ${item.stock})</i>` : '';
      t += `📦 <b>${escapeHtml(item.name)}</b>${stockBadge}\n`;
      if (item.has_variants && item.variants && item.variants.length) {
        for (const v of item.variants) {
          const pStr = showPrice ? ` : <code>${money(v.price)}</code>` : '';
          const sStr = showStock ? ` (Sisa ${v.stock})` : '';
          t += ` ▫️ ${escapeHtml(v.name)}${pStr}${sStr}\n`;
        }
      } else {
        const pStr = showPrice ? ` : <code>${money(item.single_price || item.price_min)}</code>` : '';
        const sStr = showStock ? ` (Sisa ${item.stock})` : '';
        t += ` ▫️ Harga${pStr}${sStr}\n`;
      }
      t += `\n`;
    }
    t += `━━━━━━━━━━━━━━━━━━━━\n`;
    if (showWarranty) {
      t += `🛡️ <b>Garansi Penuh</b> · Sistem Otomatis · Layanan 24 Jam\n\n`;
    }
    if (showBot || showCs) {
      t += `💡 <b>Order Mandiri Instan:</b>\n`;
      if (showBot && botUser) t += `🤖 Bot Order: @${botUser}\n`;
      if (showCs && cs) t += `📞 Customer Support: ${cs}\n\n`;
    }
    if (customFooter) {
      t += `${customFooter}\n\n`;
    }
    t += `#ReadyStock #ProdukDigital #PromoTerbaru`;
    return t;
  }

  // 3. Flash Sale / Urgensi Penjualan
  if (template === 'flash') {
    let t = `🔥 *FLASH SALE READY STOK TERBATAS!* 🔥\n`;
    t += `_Jangan sampai kehabisan, langsung amankan slotmu sekarang!_\n\n`;
    t += `⚡ *PRODUK PILIHAN SIAP AMBIL HARI INI:*\n`;
    for (const item of items) {
      if (item.has_variants && item.variants && item.variants.length) {
        for (const v of item.variants.slice(0, 3)) {
          const pStr = showPrice ? ` — *${money(v.price)}*` : '';
          const sStr = showStock ? ` (Sisa ${v.stock} slot!)` : '';
          t += `🚀 *${item.name} (${v.name})*${pStr}${sStr}\n`;
        }
      } else {
        const pStr = showPrice ? ` — *${money(item.single_price || item.price_min)}*` : '';
        const sStr = showStock ? ` (Sisa ${item.stock} slot!)` : '';
        t += `🚀 *${item.name}*${pStr}${sStr}\n`;
      }
    }
    t += `\n`;
    if (showWarranty) {
      t += `💎 *Kenapa harus beli sekarang?*\n`;
      t += `⚡ Sistem otomatis proses dalam hitungan detik\n`;
      t += `🛡️ Full garansi penggantian jika ada kendala\n`;
      t += `💰 Jaminan harga bersaing & kualitas terjamin\n\n`;
    }
    if (showBot || showCs) {
      t += `🛒 *ORDER INSTAN SEKARANG:*\n`;
      if (showBot && botLink) t += `👉 Klik Bot: ${botLink}\n`;
      if (showCs && cs) t += `👉 Chat CS: ${cs}\n\n`;
    }
    if (customFooter) {
      t += `${customFooter}\n\n`;
    }
    t += `_⏰ Stok bergerak cepat setiap menit, amankan sebelum kehabisan!_`;
    return t;
  }

  // 4. Katalog Lengkap per Kategori
  if (template === 'catalog') {
    const byCategory = {};
    for (const item of items) {
      const cat = item.category || 'Umum';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(item);
    }

    let t = `📋 *KATALOG LENGKAP PRODUK READY STOK*\n`;
    t += `━━━━━━━━━━━━━━━━━━━━━\n`;
    t += `🏪 *${storeName}* — _Digital Store_\n\n`;

    for (const [catName, catItems] of Object.entries(byCategory)) {
      t += `📁 *KATEGORI ${catName.toUpperCase()}*\n`;
      for (const item of catItems) {
        t += `▪️ *${item.name}*\n`;
        if (item.has_variants && item.variants && item.variants.length) {
          for (const v of item.variants) {
            const pStr = showPrice ? ` : ${money(v.price)}` : '';
            const sStr = showStock ? ` [Stok ${v.stock}]` : '';
            t += `   • ${v.name}${pStr}${sStr}\n`;
          }
        } else {
          const pStr = showPrice ? ` : ${money(item.single_price || item.price_min)}` : '';
          const sStr = showStock ? ` [Stok ${item.stock}]` : '';
          t += `   • Unit Ready${pStr}${sStr}\n`;
        }
      }
      t += `\n`;
    }

    t += `━━━━━━━━━━━━━━━━━━━━━\n`;
    if (showWarranty) {
      t += `💳 *Metode Pembayaran:* QRIS All Payment & Saldo Otomatis\n`;
      t += `🛡️ *Garansi:* Seluruh produk aktif dilindungi garansi resmi toko.\n\n`;
    }
    if (showBot || showCs) {
      if (showBot && botLink) t += `🔗 *Link Order:* ${botLink}\n`;
      if (showCs && cs) t += `📞 *Kontak Admin:* ${cs}\n\n`;
    }
    if (customFooter) {
      t += `${customFooter}\n\n`;
    }
    t += `_Pemesanan dibuka 24 jam nonstop._`;
    return t;
  }

  // 5. Status WA / Story Ringkas
  if (template === 'story') {
    let t = `✨ *READY STOK HARI INI* ✨\n\n`;
    for (const item of items) {
      const pStr = showPrice
        ? ` : ${money(item.has_variants && item.variants && item.variants.length ? item.variants[0].price : (item.single_price || item.price_min))}`
        : '';
      const sStr = showStock ? ` (Sisa ${item.stock})` : '';
      t += `✅ ${item.name}${pStr}${sStr}\n`;
    }
    t += `\n⚡ Full Garansi & Proses Kilat!\n`;
    if (showBot || showCs) {
      t += `Order klik 👇\n${botLink || cs}`;
    }
    if (customFooter) {
      t += `\n${customFooter}`;
    }
    return t;
  }

  return '';
}

async function loadPromotions() {
  $('#content').innerHTML = '<div class="empty-product">Memuat data produk ready...</div>';
  try {
    const res = await api('/api/admin/promotions/ready-products');
    state.promoData = {
      items: Array.isArray(res?.items) ? res.items : [],
      store: res?.store || {}
    };

    // Default: jika belum ada seleksi, pilih semua produk ready
    if (!state.promoSelectedIds || state.promoSelectedIds.size === 0) {
      state.promoSelectedIds = new Set(state.promoData.items.map(x => x.id));
    }

    renderPromotionsView();
  } catch (err) {
    $('#content').innerHTML = `
      <div class="empty-product">
        <h3>Gagal Memuat Produk Ready</h3>
        <p>${esc(err.message)}</p>
        <button class="neo-btn purple" style="margin-top:12px" onclick="loadPromotions()">🔄 Coba Lagi</button>
      </div>
    `;
  }
}

function renderPromotionsView() {
  const allItems = state.promoData.items || [];
  const store = state.promoData.store || {};
  const currentTemplate = state.promoTemplate || 'wa';
  const options = state.promoOptions || {};

  // Ambil daftar kategori unik
  const catSet = new Set();
  allItems.forEach(item => { if (item.category) catSet.add(item.category); });
  const categoryList = Array.from(catSet).sort();

  // Filter items
  const q = (state.promoSearch || '').toLowerCase().trim();
  const selectedCat = state.promoCategoryFilter || '';
  const filteredItems = allItems.filter(item => {
    const matchesQ = !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q) || (item.tag && item.tag.toLowerCase().includes(q));
    const matchesCat = !selectedCat || item.category === selectedCat;
    return matchesQ && matchesCat;
  });

  // Filter items yang saat ini dicentang untuk dimasukkan ke teks promosi
  const selectedItemsForPromo = allItems.filter(item => state.promoSelectedIds.has(item.id));
  const generatedText = generateClientPromoText(currentTemplate, selectedItemsForPromo, options, store);

  const totalReadyProducts = allItems.length;
  const totalReadyUnits = allItems.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
  const selectedCount = selectedItemsForPromo.length;

  const isAllChecked = filteredItems.length > 0 && filteredItems.every(item => state.promoSelectedIds.has(item.id));

  $('#content').innerHTML = `
    <div class="section-title">
      <div>
        <h2>📢 Promosi Stok Ready</h2>
        <p>Pilih produk yang ready dan generate teks promosi untuk WhatsApp, Telegram, Story, atau media sosial.</p>
      </div>
      <button class="neo-btn white" id="refreshPromoBtn">🔄 Segarkan Stok</button>
    </div>

    <div class="promo-layout">
      <!-- KOLOM KIRI: LIST PRODUK READY -->
      <section class="promo-panel">
        <div class="promo-card">
          <div class="promo-header-kpi">
            <div class="promo-kpi-box">
              <small>Produk Ready</small>
              <strong>${totalReadyProducts}</strong>
            </div>
            <div class="promo-kpi-box">
              <small>Total Unit</small>
              <strong>${totalReadyUnits}</strong>
            </div>
            <div class="promo-kpi-box">
              <small>Dipilih Promo</small>
              <strong style="color:var(--green)">${selectedCount}</strong>
            </div>
          </div>

          <div class="promo-filter-row">
            <input type="text" id="promoSearchInput" placeholder="🔍 Cari produk ready..." value="${esc(state.promoSearch)}" style="flex:1;min-width:140px">
            <select id="promoCategorySelect" style="max-width:140px">
              <option value="">Semua Kategori</option>
              ${categoryList.map(cat => `<option value="${esc(cat)}" ${selectedCat === cat ? 'selected' : ''}>${esc(cat)}</option>`).join('')}
            </select>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:2px dashed #e2e8f0">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;cursor:pointer">
              <input type="checkbox" id="promoToggleAll" ${isAllChecked ? 'checked' : ''} class="promo-product-check">
              Pilih Semua (${filteredItems.length} Produk)
            </label>
            <span style="font-size:11px;color:var(--muted);font-weight:700">Centang yang ingin dipromosikan</span>
          </div>

          <div class="promo-product-scroll" id="promoProductList">
            ${filteredItems.length ? filteredItems.map(item => {
              const checked = state.promoSelectedIds.has(item.id);
              const priceDisplay = item.price_min === item.price_max
                ? money(item.price_min)
                : `${money(item.price_min)} - ${money(item.price_max)}`;
              return `
                <div class="promo-product-item ${checked ? 'selected' : ''}" data-product-id="${item.id}">
                  <input type="checkbox" class="promo-product-check" data-item-check="${item.id}" ${checked ? 'checked' : ''}>
                  <div class="promo-product-info">
                    <b>${esc(item.name)}</b>
                    <small>${esc(item.category)} · ${priceDisplay}</small>
                    ${item.has_variants && item.variants && item.variants.length ? `
                      <div class="promo-product-vars">
                        ${item.variants.map(v => `<span class="promo-var-pill">${esc(v.name)}: ${money(v.price)} (${v.stock})</span>`).join('')}
                      </div>
                    ` : ''}
                  </div>
                  <div class="promo-product-badge">
                    <span class="stock-ready">Ready ${item.stock}</span>
                  </div>
                </div>
              `;
            }).join('') : `
              <div class="empty compact" style="padding:30px 10px;text-align:center">
                <b>Tidak ada produk ready yang cocok</b>
                <small style="display:block;margin-top:4px">Coba ubah kata kunci pencarian atau kategori.</small>
              </div>
            `}
          </div>
        </div>
      </section>

      <!-- KOLOM KANAN: TEMPLATE GENERATOR & LIVE PREVIEW -->
      <section class="promo-panel">
        <div class="promo-card promo-preview-card">
          <!-- Pilihan Template -->
          <div style="margin-bottom:8px">
            <b style="font-size:12px;text-transform:uppercase;color:var(--muted);letter-spacing:0.5px">Pilih Gaya Template:</b>
          </div>
          <div class="promo-tpl-tabs">
            <button type="button" class="promo-tpl-btn ${currentTemplate === 'wa' ? 'active' : ''}" data-tpl="wa">
              <b>🟢 WhatsApp</b>
              <small>List rapi & emoji</small>
            </button>
            <button type="button" class="promo-tpl-btn ${currentTemplate === 'tg' ? 'active' : ''}" data-tpl="tg">
              <b>✈️ Telegram</b>
              <small>HTML & hashtag</small>
            </button>
            <button type="button" class="promo-tpl-btn ${currentTemplate === 'flash' ? 'active' : ''}" data-tpl="flash">
              <b>🔥 Flash Sale</b>
              <small>Hook urgensi stok</small>
            </button>
            <button type="button" class="promo-tpl-btn ${currentTemplate === 'catalog' ? 'active' : ''}" data-tpl="catalog">
              <b>📋 Katalog Rinci</b>
              <small>Kelompok kategori</small>
            </button>
            <button type="button" class="promo-tpl-btn ${currentTemplate === 'story' ? 'active' : ''}" data-tpl="story">
              <b>💬 Story / Ringkas</b>
              <small>Pendek 1 layar</small>
            </button>
          </div>

          <!-- Opsi Kustomisasi Promosi -->
          <div class="promo-options-box">
            <div class="promo-options-title">
              <span>Pengaturan Konten Template</span>
              <span style="font-weight:600;text-transform:none">Otomatis Ter-update</span>
            </div>
            <div class="promo-toggles">
              <label class="promo-toggle-item">
                <input type="checkbox" id="optShowPrice" ${options.showPrice !== false ? 'checked' : ''}>
                🏷️ Tampilkan Harga
              </label>
              <label class="promo-toggle-item">
                <input type="checkbox" id="optShowStock" ${options.showStock !== false ? 'checked' : ''}>
                📦 Tampilkan Sisa Stok
              </label>
              <label class="promo-toggle-item">
                <input type="checkbox" id="optShowBot" ${options.showBot !== false ? 'checked' : ''}>
                🤖 Sertakan Link Bot
              </label>
              <label class="promo-toggle-item">
                <input type="checkbox" id="optShowCs" ${options.showCs !== false ? 'checked' : ''}>
                📞 Sertakan Kontak CS
              </label>
              <label class="promo-toggle-item" style="grid-column:span 2">
                <input type="checkbox" id="optShowWarranty" ${options.showWarranty !== false ? 'checked' : ''}>
                🛡️ Sertakan Garansi & Keunggulan Toko
              </label>
            </div>
            <div class="promo-custom-inputs">
              <label>
                Header / Nama Toko
                <input type="text" id="optCustomHeader" placeholder="${esc(store.name || 'ILINK DIGITAL STORE')}" value="${esc(options.customHeader || '')}">
              </label>
              <label>
                Kontak CS / WhatsApp
                <input type="text" id="optCustomCs" placeholder="${esc(store.cs_contact || '@owneradmin')}" value="${esc(options.customCs || '')}">
              </label>
            </div>
          </div>

          <!-- Live Preview & Editor Textarea -->
          <div class="promo-preview-toolbar">
            <span>📝 Live Preview & Editor (Dapat Diedit Manual)</span>
            <span id="promoCharCount">${generatedText.length} karakter · ${generatedText.split('\n').length} baris</span>
          </div>
          <textarea id="promoTextarea" class="promo-textarea" spellcheck="false">${esc(generatedText)}</textarea>

          <!-- Action Buttons -->
          <div class="promo-actions">
            <button type="button" id="copyPromoBtn" class="neo-btn purple">
              📋 Salin Teks Promosi
            </button>
            <button type="button" id="shareWaBtn" class="neo-btn promo-btn-wa">
              🟢 Kirim ke WA
            </button>
            <button type="button" id="shareTgBtn" class="neo-btn promo-btn-tg">
              ✈️ Kirim ke Telegram
            </button>
          </div>
        </div>
      </section>
    </div>
  `;

  // Bind Events
  $('#refreshPromoBtn').onclick = () => loadPromotions();

  // Search & Category
  $('#promoSearchInput').oninput = (e) => {
    state.promoSearch = e.target.value;
    renderPromotionsView();
  };
  $('#promoCategorySelect').onchange = (e) => {
    state.promoCategoryFilter = e.target.value;
    renderPromotionsView();
  };

  // Toggle All Checkbox
  $('#promoToggleAll').onchange = (e) => {
    const checked = e.target.checked;
    filteredItems.forEach(item => {
      if (checked) state.promoSelectedIds.add(item.id);
      else state.promoSelectedIds.delete(item.id);
    });
    renderPromotionsView();
  };

  // Individual Product Item / Checkbox Click
  $$('[data-item-check]').forEach(chk => {
    chk.onclick = (e) => {
      e.stopPropagation();
      const id = Number(chk.dataset.itemCheck);
      if (chk.checked) state.promoSelectedIds.add(id);
      else state.promoSelectedIds.delete(id);
      renderPromotionsView();
    };
  });
  $$('.promo-product-item').forEach(card => {
    card.onclick = (e) => {
      if (e.target.tagName === 'INPUT') return;
      const id = Number(card.dataset.productId);
      if (state.promoSelectedIds.has(id)) state.promoSelectedIds.delete(id);
      else state.promoSelectedIds.add(id);
      renderPromotionsView();
    };
  });

  // Template Buttons Click
  $$('.promo-tpl-btn').forEach(btn => {
    btn.onclick = () => {
      state.promoTemplate = btn.dataset.tpl;
      renderPromotionsView();
    };
  });

  // Toggles & Custom Options Change
  const updateOptionState = () => {
    state.promoOptions = {
      showPrice: $('#optShowPrice')?.checked !== false,
      showStock: $('#optShowStock')?.checked !== false,
      showBot: $('#optShowBot')?.checked !== false,
      showCs: $('#optShowCs')?.checked !== false,
      showWarranty: $('#optShowWarranty')?.checked !== false,
      customHeader: $('#optCustomHeader')?.value || '',
      customCs: $('#optCustomCs')?.value || '',
      customFooter: state.promoOptions?.customFooter || ''
    };
    const nextSelected = allItems.filter(item => state.promoSelectedIds.has(item.id));
    const nextText = generateClientPromoText(state.promoTemplate, nextSelected, state.promoOptions, store);
    const area = $('#promoTextarea');
    if (area) {
      area.value = nextText;
      updateTextMetrics(nextText);
    }
  };

  $('#optShowPrice').onchange = updateOptionState;
  $('#optShowStock').onchange = updateOptionState;
  $('#optShowBot').onchange = updateOptionState;
  $('#optShowCs').onchange = updateOptionState;
  $('#optShowWarranty').onchange = updateOptionState;
  $('#optCustomHeader').oninput = updateOptionState;
  $('#optCustomCs').oninput = updateOptionState;

  function updateTextMetrics(txt) {
    const el = $('#promoCharCount');
    if (el) el.textContent = `${txt.length} karakter · ${txt.split('\n').length} baris`;
  }

  $('#promoTextarea').oninput = (e) => {
    updateTextMetrics(e.target.value);
  };

  // Copy Button
  $('#copyPromoBtn').onclick = async () => {
    const textToCopy = $('#promoTextarea')?.value || '';
    if (!textToCopy) {
      toast('Teks promosi kosong.', true);
      return;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      toast('✅ Teks promosi berhasil disalin ke clipboard!');
    } catch {
      // Fallback manual selection
      const area = $('#promoTextarea');
      area.select();
      document.execCommand('copy');
      toast('✅ Teks promosi berhasil disalin!');
    }
  };

  // Kirim ke WhatsApp
  $('#shareWaBtn').onclick = () => {
    const textToSend = $('#promoTextarea')?.value || '';
    if (!textToSend) {
      toast('Teks promosi kosong.', true);
      return;
    }
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(textToSend)}`;
    window.open(url, '_blank');
  };

  // Kirim ke Telegram
  $('#shareTgBtn').onclick = () => {
    const textToSend = $('#promoTextarea')?.value || '';
    if (!textToSend) {
      toast('Teks promosi kosong.', true);
      return;
    }
    const url = `https://t.me/share/url?text=${encodeURIComponent(textToSend)}`;
    window.open(url, '_blank');
  };
}

(async () => {
  if (!state.token) {
    const tg = window.Telegram?.WebApp;
    const initData = tg?.initData || '';
    const tgUser = tg?.initDataUnsafe?.user || null;
    if (initData || tgUser) {
      try {
        const r = await api('/api/admin/auth/telegram', {
          method: 'POST',
          body: { initData, telegram_user: tgUser }
        });
        if (r && r.token) {
          state.token = r.token;
          sessionStorage.setItem('ilink_owner_token', r.token);
          localStorage.setItem('ilink_owner_token', r.token);
        }
      } catch (err) {
        console.warn('[telegram:owner_auto_login]', err.message);
      }
    }
  }

  if (!state.token) return showLogin();
  try {
    await initialize();
  } catch (err) {
    console.error('[initialize_failed]', err);
    if (err && (err.message?.includes('Sesi') || err.message?.includes('401') || err.message?.includes('UNAUTHORIZED'))) {
      logout(false);
    } else {
      showApp();
      $('#content').innerHTML = `
        <div class="empty-product" style="padding:40px 20px;text-align:center">
          <div style="font-size:48px;margin-bottom:14px">⚠️</div>
          <h3 style="font-size:18px;font-weight:800;margin-bottom:8px">Gagal Menghubungkan ke Server Toko</h3>
          <p style="margin:0 auto 20px;max-width:420px;color:var(--muted);font-size:13px;line-height:1.5">${esc(err.message || 'Koneksi ke backend VPS terputus.')}</p>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
            <button type="button" class="neo-btn purple" onclick="window.location.reload()">🔄 Coba Muat Ulang</button>
            <button type="button" class="neo-btn white" onclick="logout(true)">↪ Masuk Ulang</button>
          </div>
        </div>
      `;
    }
  }
})();

