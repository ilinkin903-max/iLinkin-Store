const { config, isOwner } = require('./config');
const db = require('./db');
const payments = require('./payments');
const suppliers = require('./suppliers');
const jaspay = require('./jaspay');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const media = require('./media');

const state = { enabled:Boolean(config.botToken), running:false, started_at:null, last_update_at:null, last_error:'', last_poll_error:'', last_api_ok_at:null, last_api_latency_ms:0, network_failures:0, in_flight_chats:0, username:config.botUsername||'', offset:0 };
let stopped=false;
const carts=new Map();
const pendingInput=new Map();
const paymentLocks=new Set();
const broadcastJobs=new Map();
const chatQueues=new Map();
const fallbackEdits=new Set();
function newTelegramAgent(protocol){return protocol==='http:'?new http.Agent({keepAlive:true,maxSockets:16,maxFreeSockets:8,timeout:60000}):new https.Agent({keepAlive:true,maxSockets:16,maxFreeSockets:8,timeout:60000});}
const telegramAgents={http:newTelegramAgent('http:'),https:newTelegramAgent('https:')};
function resetTelegramAgent(protocol){const key=protocol==='http:'?'http':'https';try{telegramAgents[key].destroy()}catch{}telegramAgents[key]=newTelegramAgent(protocol);}

function escapeHtml(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function money(v){return `Rp ${Number(v||0).toLocaleString('id-ID')}`;}
function displayName(from={}){return [from.first_name,from.last_name].filter(Boolean).join(' ').trim()||from.username||String(from.id||'User');}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function settingEnabled(v,fallback=true){if(v===undefined||v===null||v==='')return fallback;return !['false','0','off','no'].includes(String(v).toLowerCase());}
function btn(text,callback_data,style=''){return{text,callback_data,...(style?{style}:{})};}
function normalizeUrl(value){
  const raw=String(value||'').trim();
  if(!raw)return'';
  if(/^https?:\/\//i.test(raw)||/^tg:\/\//i.test(raw))return raw;
  if(/^(?:www\.)?t\.me\//i.test(raw))return `https://${raw.replace(/^www\./i,'')}`;
  if(/^(?:www\.)?telegram\.me\//i.test(raw))return `https://${raw.replace(/^www\./i,'').replace(/^telegram\.me/i,'t.me')}`;
  const username=raw.replace(/^@+/, '');
  if(/^[A-Za-z0-9_]{5,32}$/.test(username))return `https://t.me/${username}`;
  if(/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:[/:?#].*)?$/.test(raw))return `https://${raw}`;
  return '';
}
function telegramTimeout(method,requested){
  if(Number(requested)>0)return Number(requested);
  if(method==='answerCallbackQuery')return 2500;
  if(method==='getChatMember'||method==='getMe'||method==='deleteWebhook')return 6000;
  if(method==='editMessageText'||method==='editMessageCaption')return Math.min(6000,config.telegramRequestTimeoutMs||6000);
  if(method==='deleteMessage')return 5000;
  if(method==='getUpdates')return (config.botPollingTimeout+8)*1000;
  return config.telegramRequestTimeoutMs;
}
function telegramNetworkError(error){const code=String(error?.code||error?.cause?.code||'').toUpperCase();const msg=String(error?.message||'').toLowerCase();return ['ETIMEDOUT','ECONNRESET','ECONNREFUSED','EAI_AGAIN','ENETUNREACH','EHOSTUNREACH','UND_ERR_CONNECT_TIMEOUT'].includes(code)||msg.includes('timeout')||msg.includes('fetch failed')||msg.includes('socket hang up');}
function telegramJsonRequest(method,payload={},timeoutMs){
  return new Promise((resolve,reject)=>{
    let url;try{url=new URL(`${config.telegramApiBaseUrl}/bot${config.botToken}/${method}`);}catch(e){reject(e);return;}
    const body=Buffer.from(JSON.stringify(payload||{}));
    const transport=url.protocol==='http:'?http:https;
    const options={protocol:url.protocol,hostname:url.hostname,port:url.port||undefined,path:`${url.pathname}${url.search}`,method:'POST',headers:{'content-type':'application/json','content-length':String(body.length),'connection':'keep-alive'},agent:url.protocol==='http:'?telegramAgents.http:telegramAgents.https};
    if(config.telegramForceIpv4)options.family=4;
    const req=transport.request(options,res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{let data={};try{data=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{}if(res.statusCode<200||res.statusCode>=300||!data.ok){const err=new Error(data.description||`Telegram ${method} HTTP ${res.statusCode}`);err.statusCode=res.statusCode;reject(err);return;}resolve(data.result);});});
    req.setTimeout(timeoutMs,()=>{const err=new Error(`Telegram ${method} timeout setelah ${timeoutMs}ms`);err.code='ETIMEDOUT';req.destroy(err);});
    req.on('error',reject);req.end(body);
  });
}
async function call(method,payload={},timeoutMs=0){
  if(!config.botToken)throw new Error('BOT_TOKEN belum dikonfigurasi');
  const timeout=telegramTimeout(method,timeoutMs);
  const retryable=new Set(['getMe','getChatMember','deleteWebhook','editMessageText','editMessageCaption','deleteMessage']);
  const maxAttempts=retryable.has(method)?2:1;
  let lastError;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    const started=Date.now();
    const attemptTimeout=attempt>1&&['editMessageText','editMessageCaption'].includes(method)?Math.min(timeout,3500):timeout;
    try{
      const result=await telegramJsonRequest(method,payload,attemptTimeout);
      state.last_api_latency_ms=Date.now()-started;state.last_api_ok_at=new Date().toISOString();state.network_failures=0;
      return result;
    }catch(error){
      lastError=error;state.last_api_latency_ms=Date.now()-started;
      if(telegramNetworkError(error)){state.network_failures+=1;resetTelegramAgent(new URL(config.telegramApiBaseUrl).protocol);}
      if(attempt>=maxAttempts||!telegramNetworkError(error))break;
      await sleep(220*attempt);
    }
  }
  throw lastError;
}
async function callMultipart(method,fields,fileField,filePath,timeoutMs=15000){if(!config.botToken)throw new Error('BOT_TOKEN belum dikonfigurasi');const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{const form=new FormData();for(const[k,v]of Object.entries(fields||{})){if(v===undefined||v===null)continue;form.append(k,typeof v==='object'?JSON.stringify(v):String(v));}const buf=fs.readFileSync(filePath);form.append(fileField,new Blob([buf],{type:media.contentType(filePath)}),path.basename(filePath));const res=await fetch(`${config.telegramApiBaseUrl}/bot${config.botToken}/${method}`,{method:'POST',body:form,signal:controller.signal});const data=await res.json().catch(()=>({}));if(!res.ok||!data.ok)throw new Error(data.description||`Telegram ${method} HTTP ${res.status}`);return data.result;}finally{clearTimeout(timer)}}
async function sendMessage(chatId,text,extra={}){return call('sendMessage',{chat_id:chatId,text:String(text||'').slice(0,4096),parse_mode:'HTML',disable_web_page_preview:true,...extra});}
async function sendPhoto(chatId,photo,caption='',extra={}){const local=media.resolveKey(photo);if(local)return callMultipart('sendPhoto',{chat_id:chatId,caption:String(caption||'').slice(0,1024),parse_mode:Object.prototype.hasOwnProperty.call(extra,'parse_mode')?extra.parse_mode:'HTML',reply_markup:extra.reply_markup},'photo',local);return call('sendPhoto',{chat_id:chatId,photo,caption:String(caption||'').slice(0,1024),parse_mode:'HTML',...extra});}
async function sendVideo(chatId,video,caption='',extra={}){const local=media.resolveKey(video);if(local)return callMultipart('sendVideo',{chat_id:chatId,caption:String(caption||'').slice(0,1024),parse_mode:Object.prototype.hasOwnProperty.call(extra,'parse_mode')?extra.parse_mode:'HTML',reply_markup:extra.reply_markup},'video',local,30000);return call('sendVideo',{chat_id:chatId,video,caption:String(caption||'').slice(0,1024),parse_mode:'HTML',...extra});}
async function sendSticker(chatId,sticker,extra={}){return call('sendSticker',{chat_id:chatId,sticker,...extra});}
async function editMessage(query,text,extra={}){
  void answerCallback(query);
  const chatId=query?.message?.chat?.id;
  const messageId=query?.message?.message_id;
  if(!chatId||!messageId)return sendMessage(query?.from?.id||chatId,text,extra);
  const payload={chat_id:chatId,message_id:messageId,reply_markup:extra.reply_markup};
  try{
    if(query.message.photo||query.message.video||query.message.animation||query.message.document){
      return await call('editMessageCaption',{...payload,caption:String(text||'').slice(0,1024),parse_mode:extra.parse_mode===undefined?'HTML':extra.parse_mode});
    }
    return await call('editMessageText',{...payload,text:String(text||'').slice(0,4096),parse_mode:extra.parse_mode===undefined?'HTML':extra.parse_mode,disable_web_page_preview:true});
  }catch(error){
    const m=String(error?.message||'').toLowerCase();
    if(m.includes('message is not modified'))return null;
    if(telegramNetworkError(error)){
      state.last_error=`edit-fallback: ${error.message}`;
      console.warn('[telegram:edit:fallback]',error.message);
      const fallbackKey=`${chatId}:${messageId}`;
      if(!fallbackEdits.has(fallbackKey)){fallbackEdits.add(fallbackKey);setTimeout(async()=>{try{await sendMessage(chatId,text,extra)}catch(e){state.last_error=`edit-fallback-send: ${e.message}`;console.warn('[telegram:edit:fallback-send]',e.message)}finally{fallbackEdits.delete(fallbackKey)}},250);}
      return null;
    }
    await call('deleteMessage',{chat_id:chatId,message_id:messageId},5000).catch(()=>null);
    return sendMessage(chatId,text,extra);
  }
}
function answerCallback(query,text=''){if(!query?.id||query.__callbackAnswered)return Promise.resolve(null);query.__callbackAnswered=true;call('answerCallbackQuery',{callback_query_id:query.id,text:String(text||'').slice(0,180)},2500).catch(()=>null);return Promise.resolve(null);}

function botSettings(){return db.getSettings();}
function startReferralCode(text){const m=String(text||'').trim().split(/\s+/).slice(1).join(' ').match(/^ref[_-]([a-z0-9-]+)$/i);return m?m[1].toUpperCase():'';}
function referralUrl(code){const u=state.username||config.botUsername;return u&&code?`https://t.me/${u}?start=ref_${encodeURIComponent(code)}`:'';}
function topupBounds(settings=botSettings()){const min=Math.max(1000,Number(settings.topup_min_amount||1000));const rawMax=Number(settings.topup_max_amount||5000000);const max=Math.max(min,rawMax||5000000);return{min,max};}

async function touchUser(from,refCode=''){
  const user=db.upsertUser({telegram_id:String(from.id),username:from.username||'',first_name:from.first_name||'',last_name:from.last_name||''});
  if(refCode&&!user.referred_by){try{db.registerReferral(from.id,refCode);}catch{}}
  return db.getUser(from.id);
}

async function joinState(userId,settings){const target=String(settings.required_channel_id||'').trim();if(!target)return{required:false,joined:true};try{const member=await call('getChatMember',{chat_id:target,user_id:userId},6000);const ok=!['left','kicked'].includes(String(member.status||''));return{required:true,joined:ok};}catch(error){state.last_error=`join-check: ${error.message}`;return{required:true,joined:true,degraded:true};}}
async function ensureAccess(from,chatId){
  const s=botSettings();
  if(!isOwner(from.id)&&!settingEnabled(s.bot_enabled,true)){
    const custom=String(s.bot_maintenance_message||'').trim();
    const message=custom||'🛠️ Bot sedang maintenance sementara.\n\nLayanan sedang dinonaktifkan selama proses pemeliharaan. Silakan coba kembali nanti.\n\nTerima kasih atas pengertiannya.';
    await sendMessage(chatId,escapeHtml(message));
    return false;
  }
  if(!isOwner(from.id)){
    const j=await joinState(from.id,s);
    if(j.required&&!j.joined){
      const rows=[];
      const joinUrl=normalizeUrl(s.required_channel_link||s.required_channel_id);
      if(joinUrl)rows.push([{text:'📢 Join Channel',url:joinUrl,style:'primary'}]);
      rows.push([btn('✅ Saya Sudah Join','checkjoin','success')]);
      await sendMessage(chatId,'🔒 <b>JOIN CHANNEL WAJIB</b>\n=======================\nSilakan join channel terlebih dahulu lalu tekan tombol cek.',{reply_markup:{inline_keyboard:rows}});
      return false;
    }
  }
  return true;
}
function homeKeyboard(userId,settings){
  const rows=[];
  const productRow=[btn('‹📦› Daftar Produk','daftarproduk','primary')];
  const nokos=normalizeUrl(settings.nokos_link);
  if(nokos)productRow.push({text:'‹📱› Nokos',url:nokos,style:'primary'});
  rows.push(productRow);
  if(config.jaspayApiKey&&settingEnabled(settings.jaspay_enabled,false))rows.push([btn(String(settings.jaspay_menu_label||'⚡ Produk Fresh'),'freshmenu','primary')]);
  rows.push([btn('‹💰› Saldo & Referral','wallet','success'),btn('‹🎁› Redeem','redeem','success')]);
  rows.push([btn('‹📋› Riwayat Transaksi','riwayattransaksi','primary'),btn('‹❓› Cara Order','caraorder','primary')]);
  rows.push([btn('‹📊› Stok','stok','success')]);
  if(isOwner(userId)&&config.adminDashboardUrl)rows.push([{text:'‹⚙️› Dashboard Owner',web_app:{url:config.adminDashboardUrl},style:'danger'}]);
  const contact=[];
  const cs=normalizeUrl(settings.customer_service_link);
  const group=normalizeUrl(settings.group_link);
  if(cs)contact.push({text:'‹📞› Customer Service',url:cs,style:'primary'});
  if(group)contact.push({text:'‹👥› Grup',url:group,style:'primary'});
  if(contact.length)rows.push(contact);
  return{inline_keyboard:rows};
}
async function homeText(from){const s=botSettings();const o=db.getOverview();const w=db.walletSummary(from.id,3)||{balance_total:0};return`Halo, <b>${escapeHtml(from.first_name||'Kak')}</b> 👋\n\nSelamat datang di <b>${escapeHtml(s.store_name||config.botName)}</b>\n${settingEnabled(s.show_total_users,true)?`- 👥 Total User: <b>${o.users}</b> User\n`:''}- 🛍️ Total Transaksi: <b>${o.orders}</b> Transaksi\n- 📦 Stok Tersedia: <b>${o.total_stock}</b>\n- 📦 Stok Terjual: <b>${o.total_stock_sold||0}</b>\n- 💰 Saldo: <b>${money(w.balance_total)}</b>\n\nSilakan pilih tombol di bawah ini!`;}
async function sendHome(chatId,from,query=null){const s=botSettings();const text=await homeText(from);const reply_markup=homeKeyboard(from.id,s);if(query)return editMessage(query,text,{reply_markup});const mediaType=String(s.start_media_type||'none').toLowerCase();const mediaValue=String(s.start_media_value||'').trim();const mediaCaption=String(s.start_media_caption||'').trim();if(mediaValue&&mediaType==='photo'){try{return await sendPhoto(chatId,mediaValue,mediaCaption||text,{parse_mode:mediaCaption?undefined:'HTML',reply_markup});}catch(e){console.error('[telegram:start_media]',e.message);}}if(mediaValue&&mediaType==='video'){try{return await sendVideo(chatId,mediaValue,mediaCaption||text,{parse_mode:mediaCaption?undefined:'HTML',reply_markup});}catch(e){console.error('[telegram:start_media]',e.message);}}if(mediaValue&&mediaType==='sticker'){try{await sendSticker(chatId,mediaValue);}catch(e){console.error('[telegram:start_media]',e.message);}}return sendMessage(chatId,text,{reply_markup});}


const PRODUCT_PAGE_SIZE=10;
function formatWIB(value){
  if(!value)return'-';
  try{return new Date(value).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',', '');}catch{return String(value);}
}
function productPriceLabel(p){
  return Number(p.price_min)===Number(p.price_max)?money(p.price_min):`${money(p.price_min)} - ${money(p.price_max)}`;
}
function selectionBulkPrices(p,v){return Array.isArray(v?.bulk_prices)?v.bulk_prices:Array.isArray(p?.bulk_prices)?p.bulk_prices:[];}
function selectionPrice(p,v,quantity=1){return db.bulkPriceForQuantity(Number(v?.price??p?.price??0),selectionBulkPrices(p,v),quantity);}
function bulkPriceLines(p,v){return selectionBulkPrices(p,v).map(t=>`Mulai ${t.min_qty} pcs: <b>${money(t.price)}</b> /pcs`).join('\n');}
function cartTotals(cart,p,v){
  const qty=Math.max(1,Number(cart.quantity||1));
  const price=selectionPrice(p,v,qty);
  const subtotal=price*qty;
  let discount=0;
  if(cart.coupon_code){const c=db.validateCoupon(cart.coupon_code,subtotal,p.id);if(c.ok)discount=Number(c.discount||0);}
  return{price,subtotal,discount,total:Math.max(0,subtotal-discount)};
}
function productStockLabel(p){return p.stock>0?`${p.stock} stok`:p.delivery_mode==='preorder'?'PRE-ORDER':'stok 0';}

async function syncFreshCatalog(force=false){
  if(!config.jaspayApiKey)return{products:[],unavailable:[]};
  const live=await jaspay.products({force});
  for(const item of live.products||[])db.upsertJaspayProductSnapshot({...item,available:true});
  for(const item of live.unavailable||[])db.upsertJaspayProductSnapshot({...item,available:false});
  return live;
}
function freshRenewalDuration(selections={}){const raw=selections.duration??selections.auto_renew_duration??'';const n=Number(raw);return Number.isFinite(n)&&n>0?String(Math.round(n)):String(raw||'').trim();}
function freshRenewalConfig(local,selections={}){const mode=String(selections.mode||'');if(mode!=='perpanjang')return null;const duration=freshRenewalDuration(selections);const map=local?.presentation?.renewal_pricing||{};const cfg=map?.[duration];return cfg&&typeof cfg==='object'?cfg:null;}
function freshSellPrice(local,apiPrice,selections={}){const cfg=freshRenewalConfig(local,selections);const override=Number(cfg?.sell_price||0);if(override>0)return Math.round(override);return db.jaspaySellPrice(local,apiPrice);}
function freshFailureRefundPerItem(local,selections={},fallback=0){const cfg=freshRenewalConfig(local,selections);if(cfg&&Object.prototype.hasOwnProperty.call(cfg,'refund_fail')&&cfg.refund_fail!==''&&cfg.refund_fail!=null)return Math.max(0,Math.round(Number(cfg.refund_fail)||0));return Math.max(0,Math.round(Number(fallback)||0));}
function freshAccountSettings(presentation={}){const cfg=presentation.account_settings&&typeof presentation.account_settings==='object'?presentation.account_settings:{};return{allow_user_edit:cfg.allow_user_edit!==false,edit_name:cfg.edit_name!==false,edit_domain:cfg.edit_domain!==false,edit_password:cfg.edit_password!==false,edit_suffix_digits:cfg.edit_suffix_digits!==false};}
function freshOptionChoices(product,key,selections={}){
  const cfg=product?.options?.[key]||{};
  for(const [name,map] of Object.entries(cfg)){
    if(!name.startsWith('pilihan_per_')||!map||typeof map!=='object')continue;
    const dep=name.slice('pilihan_per_'.length);const selected=selections[dep];
    if(selected!=null&&Array.isArray(map[String(selected)]))return map[String(selected)];
  }
  return Array.isArray(cfg.pilihan)?cfg.pilihan:[];
}
function freshOptionEnabled(cfg={},selections={}){
  const rule=String(cfg.hanya_dengan||'').trim();
  if(!rule)return true;
  const m=rule.match(/^([a-z0-9_]+)\s*:\s*(.+)$/i);if(!m)return true;
  const expected=m[2].trim().replace(/^['\"]|['\"]$/g,'').toLowerCase();const actual=String(selections[m[1]]??'').toLowerCase();
  if(['true','false'].includes(expected)){const v=selections[m[1]],b=v===true||String(v).toLowerCase()==='true'||String(v)==='1';return String(b)===expected;}
  return actual===expected;
}
function freshOptionOrder(product){
  const options=product?.options||{},keys=Object.keys(options),done=[],pending=new Set(keys);
  let guard=0;
  while(pending.size&&guard++<keys.length*3){let moved=false;for(const key of [...pending]){const cfg=options[key]||{};const deps=Object.keys(cfg).filter(x=>x.startsWith('pilihan_per_')).map(x=>x.slice('pilihan_per_'.length)).filter(x=>pending.has(x)||keys.includes(x));if(deps.every(x=>done.includes(x)||!pending.has(x))){done.push(key);pending.delete(key);moved=true;}}if(!moved)break;}
  return [...done,...keys.filter(x=>pending.has(x))];
}
function freshOptionTitle(key){const map={variant:'Paket',plan:'Paket',login:'Login',duration:'Durasi',mode:'Mode',domain:'Domain',auto_renew:'Auto Renew',auto_renew_duration:'Durasi Auto Renew'};return map[key]||String(key||'Pilihan').replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase());}
function freshOptionValue(key,v){if(key==='duration'||key==='auto_renew_duration')return `${v} Hari`;const raw=String(v);return raw.replace(/[_-]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase()).replace(/Vipplus/i,'VIP Plus').replace(/Vip/i,'VIP');}
function freshOptionsLabel(options={}){return Object.entries(options).filter(([k])=>!['accounts_token','password','domain','name','suffix_digits','accounts','order_id'].includes(k)).map(([k,v])=>`${freshOptionTitle(k)}: ${freshOptionValue(k,v)}`).join(' · ');}
function defaultFreshPresentation(local,item){
  const key=String(local?.product_key||item?.key||'').toLowerCase(),p=local?.presentation||{},name=String(p.title||local?.name||item?.name||key).trim();
  const modeLabels={...(p.mode_labels||{})},modeDescriptions={...(p.mode_descriptions||{})};
  if(key==='zoom'){
    if(!modeLabels.sendiri)modeLabels.sendiri='Akun Sendiri';
    if(!modeLabels.baru)modeLabels.baru='Akun Baru';
    if(!modeLabels.perpanjang)modeLabels.perpanjang='Perpanjang';
    if(!modeDescriptions.sendiri)modeDescriptions.sendiri='kamu kirim daftar akun Zoom-mu, lalu diproses otomatis oleh Bot (durasi mengikuti pilihan aktif).';
    if(!modeDescriptions.baru)modeDescriptions.baru='Bot buatkan akun Zoom fresh, lalu diproses otomatis sesuai durasi yang kamu pilih.';
    if(!modeDescriptions.perpanjang)modeDescriptions.perpanjang='memperpanjang akun Zoom yang sudah masuk masa perpanjangan.';
  }
  const hidden=Array.isArray(p.hidden_modes)?p.hidden_modes:[];
  const allowedStyle=v=>['success','primary','danger'].includes(String(v))?String(v):'success';
  return{emoji:String(p.emoji||'⚡'),title:name,menu_label:String(p.menu_label||name),short_description:String(p.short_description||'').trim(),description:String(p.description||local?.description||`Produk ${name} dibuat fresh oleh Bot setelah pembayaran berhasil.`).trim(),description_button:String(p.description_button||'☷ Deskripsi'),description_button_style:allowedStyle(p.description_button_style||'primary'),back_button_style:allowedStyle(p.back_button_style||'primary'),mode_labels:modeLabels,mode_descriptions:modeDescriptions,mode_styles:{...(p.mode_styles||{})},mode_order:Array.isArray(p.mode_order)?p.mode_order.map(String):[],order_defaults:p.order_defaults&&typeof p.order_defaults==='object'?{...p.order_defaults}:{},account_settings:freshAccountSettings(p),renewal_pricing:p.renewal_pricing&&typeof p.renewal_pricing==='object'?{...p.renewal_pricing}:{},hidden_modes:hidden};
}
function freshVisibleModes(cart){const choices=freshOptionChoices(cart.fresh_product,'mode',cart.fresh_options),hidden=new Set((cart.fresh_presentation?.hidden_modes||[]).map(String)),order=cart.fresh_presentation?.mode_order||[];const visible=choices.filter(v=>!hidden.has(String(v)));return visible.sort((a,b)=>{const ai=order.indexOf(String(a)),bi=order.indexOf(String(b));return (ai<0?9999:ai)-(bi<0?9999:bi)||choices.indexOf(a)-choices.indexOf(b);});}
function applyFreshOrderDefaults(cart,mode=null){
  const defs=cart?.fresh_presentation?.order_defaults||{};if(!cart||!defs||typeof defs!=='object')return cart;
  const hasMode=Array.isArray(cart.fresh_product?.options?.mode?.pilihan)&&cart.fresh_product.options.mode.pilihan.length>0;
  if(hasMode&&String(mode||cart.fresh_options?.mode||'')!=='baru')return cart;
  for(const key of ['domain','password','name','suffix_digits']){const v=defs[key];const cur=cart.fresh_options[key];if((cur===undefined||cur===null||String(cur).trim()==='')&&v!==undefined&&v!==null&&String(v).trim()!=='')cart.fresh_options[key]=key==='suffix_digits'?Math.max(0,Number(v)||0):String(v).trim();}
  return cart;
}
function refreshFreshCartPricing(cart,product=cart?.fresh_product,local=null){
  if(!cart||!product)return cart;const row=local||db.getJaspayProduct(cart.fresh_product_key);const api=Math.max(0,Number(jaspay.resolveEffectiveUnitPrice(product,cart.fresh_options)||jaspay.resolveUnitPrice(product,cart.fresh_options)||product.unit_price||0));cart.api_unit_price=api;cart.unit_price=freshSellPrice(row,api,cart.fresh_options);cart.fresh_product=product;return cart;
}
function freshLandingText(cart){
  const p=cart.fresh_presentation||defaultFreshPresentation(db.getJaspayProduct(cart.fresh_product_key),cart.fresh_product),modes=freshVisibleModes(cart);let text=`${escapeHtml(p.emoji)} <b>${escapeHtml(p.title)}</b>${modes.length?' — Pilih Mode':''}\n────────────────────`;
  if(p.short_description)text+=`\n${escapeHtml(p.short_description)}`;
  if(modes.length){text+='\n';for(const mode of modes){const label=p.mode_labels?.[mode]||freshOptionValue('mode',mode),desc=p.mode_descriptions?.[mode]||'';const icon=String(mode)==='sendiri'?'◌':String(mode)==='baru'?'✦':'◆';text+=`\n${icon} <b>${escapeHtml(label)}</b>${desc?` — ${escapeHtml(desc)}`:''}`;}}
  else text+=`\n\nAkun dibuat fresh oleh <b>Bot</b> setelah pembayaran berhasil.`;
  text+='\n\nPilih opsi:';return text;
}
async function renderFreshLanding(query){
  const cart=carts.get(String(query.from.id));if(!cart||cart.kind!=='fresh')return editMessage(query,'⚠️ Pilihan sudah kedaluwarsa.',{reply_markup:{inline_keyboard:[[btn('⚡ Produk Fresh','freshmenu','primary')]]}});
  const modes=freshVisibleModes(cart),rows=[];
  if(modes.length){for(let i=0;i<modes.length;i+=2){rows.push(modes.slice(i,i+2).map((mode,j)=>{const st=['success','primary','danger'].includes(String(cart.fresh_presentation.mode_styles?.[mode]))?String(cart.fresh_presentation.mode_styles[mode]):'success';return btn(cart.fresh_presentation.mode_labels?.[mode]||freshOptionValue('mode',mode),`freshmode:${i+j}`,st);}));}}
  else rows.push([btn('✅ Lanjut','freshcontinue','success')]);
  rows.push([btn(cart.fresh_presentation.description_button||'☷ Deskripsi','freshdesc',cart.fresh_presentation.description_button_style||'primary')]);
  rows.push([btn('◂ Kembali','freshmenu',cart.fresh_presentation.back_button_style||'primary')]);
  return editMessage(query,freshLandingText(cart),{reply_markup:{inline_keyboard:rows}});
}
async function showFreshDescription(query){const cart=carts.get(String(query.from.id));if(!cart||cart.kind!=='fresh')return answerCallback(query,'Pilihan kedaluwarsa.');await answerCallback(query);const p=cart.fresh_presentation;return editMessage(query,`${escapeHtml(p.emoji)} <b>${escapeHtml(p.title)} — Deskripsi</b>\n────────────────────\n${escapeHtml(p.description||'Belum ada deskripsi.')}`,{reply_markup:{inline_keyboard:[[btn('◂ Kembali','freshlanding','primary')]]}});}
function freshAccountSummaryText(cart,editing=false){
  const p=cart.fresh_presentation||{},defs=p.order_defaults||{},o=cart.fresh_options||{};
  const name=String(o.name??defs.name??'-').trim()||'-',domain=String(o.domain??defs.domain??'-').trim()||'-',password=String(o.password??defs.password??'-').trim()||'-',digits=Math.max(0,Number(o.suffix_digits??defs.suffix_digits??0)||0);
  let text=`✦ <b>${escapeHtml(cart.fresh_product_name)} — ${editing?'Setting Akun':'Akun Baru'}</b>\n────────────────────\n\nNama     : <b>${escapeHtml(name)}</b>\nDomain   : <b>${escapeHtml(domain)}</b>\nPassword : <code>${escapeHtml(password)}</code>\nAngka    : <b>${digits} digit</b>`;
  if(!editing)text+=`\n\n<i>Bot membuat akun fresh (namaAcak@domain) lalu diproses otomatis.</i>\nContoh: <code>nama${digits?'1234':''}@${escapeHtml(domain==='-'?'domain.com':domain)}</code>\n\nSiap — tekan Lanjut order.`;
  else text+=`\n\nUbah data yang diizinkan owner. Nilai awal berasal dari default admin.`;
  return text;
}
async function renderFreshNewAccountSummary(query,editing=false){
  const cart=carts.get(String(query.from.id));if(!cart||cart.kind!=='fresh')return answerCallback(query,'Pilihan kedaluwarsa.');
  applyFreshOrderDefaults(cart,'baru');refreshFreshCartPricing(cart);
  const cfg=freshAccountSettings(cart.fresh_presentation),rows=[];
  if(editing&&cfg.allow_user_edit){const a=[];if(cfg.edit_name)a.push(btn('✏️ Nama','freshacctedit:name','primary'));if(cfg.edit_domain)a.push(btn('🌐 Domain','freshacctedit:domain','primary'));if(a.length)rows.push(a);const b=[];if(cfg.edit_password)b.push(btn('🔐 Password','freshacctedit:password','primary'));if(cfg.edit_suffix_digits)b.push(btn('🔢 Angka','freshacctedit:suffix_digits','primary'));if(b.length)rows.push(b);rows.push([btn('↺ Default Admin','freshacctreset','primary')]);}
  if(editing)rows.push([btn('✅ Selesai','freshacctback','success')]);else{if(cfg.allow_user_edit)rows.push([btn('⚙️ Setting Akun','freshacctsettings','primary')]);rows.push([btn('▶ Lanjut order','freshacctcontinue','success')]);rows.push([btn('◂ Kembali','freshlanding','primary')]);}
  return editMessage(query,freshAccountSummaryText(cart,editing),{reply_markup:{inline_keyboard:rows}});
}
async function promptFreshAccountField(query,field){
  const cart=carts.get(String(query.from.id));if(!cart||cart.kind!=='fresh')return answerCallback(query,'Pilihan kedaluwarsa.');const cfg=freshAccountSettings(cart.fresh_presentation);
  const allowed={name:cfg.edit_name,domain:cfg.edit_domain,password:cfg.edit_password,suffix_digits:cfg.edit_suffix_digits};if(!cfg.allow_user_edit||!allowed[field])return answerCallback(query,'Pengaturan ini dikunci owner.');
  pendingInput.set(String(query.from.id),{type:'fresh_account_setting',field});await answerCallback(query);const label={name:'Nama',domain:'Domain',password:'Password',suffix_digits:'Angka / jumlah digit'}[field]||field;
  return editMessage(query,`⚙️ <b>Setting Akun — ${escapeHtml(label)}</b>\n────────────────────\nKirim nilai baru untuk <b>${escapeHtml(label)}</b>.${field==='suffix_digits'?'\nContoh: <code>4</code>':''}${field==='domain'?'\nContoh: <code>ilinkin.store</code>':''}`,{reply_markup:{inline_keyboard:[[btn('◂ Batal','freshacctsettings','primary')]]}});
}
async function showFreshProducts(chatId,query=null,force=false){
  if(!config.jaspayApiKey){const t='⚠️ Produk Fresh belum dikonfigurasi oleh owner.';return query?editMessage(query,t,{reply_markup:{inline_keyboard:[[btn('🔙 Kembali','kembaliawal','primary')]]}}):sendMessage(chatId,t);}
  const settings=botSettings();if(!settingEnabled(settings.jaspay_enabled,false)){const t='⚠️ Produk Fresh sedang dinonaktifkan.';return query?editMessage(query,t,{reply_markup:{inline_keyboard:[[btn('🔙 Kembali','kembaliawal','primary')]]}}):sendMessage(chatId,t);}
  let live;try{live=await syncFreshCatalog(force);}catch(e){const t='⚠️ Produk Fresh sedang sulit diakses. Silakan coba lagi sebentar.';return query?editMessage(query,t,{reply_markup:{inline_keyboard:[[btn('🔄 Coba Lagi','freshmenu','success')],[btn('🔙 Kembali','kembaliawal','primary')]]}}):sendMessage(chatId,t);}
  const map=new Map([...(live.products||[]),...(live.unavailable||[])].map(x=>[String(x.key),x]));
  const rows=[];for(const local of db.listJaspayProducts({enabled:true})){
    const liveItem=map.get(String(local.product_key));const item=liveItem||local;const available=Boolean(liveItem)&&liveItem.available!==false&&local.available!==false;const p=defaultFreshPresentation(local,item);const sell=freshSellPrice(local,jaspay.resolveUnitPrice(item,{}),{});
    rows.push([btn(`${available?'🟢':'🔴'} ${p.menu_label} | mulai ${money(sell)} | ${available?'FRESH':'TIDAK TERSEDIA'}`,`freshprod:${encodeURIComponent(local.product_key)}`,available?'success':'danger')]);
  }
  if(!rows.length)rows.push([btn('Belum ada produk fresh aktif','noop','primary')]);
  rows.push([btn('🔄 Refresh','freshrefresh','success'),btn('🔙 Kembali','kembaliawal','primary')]);
  const text=`⚡ <b>PRODUK FRESH</b>\n=======================\nAkun dibuat fresh oleh <b>Bot</b> setelah pembayaran berhasil.\nPilih produk di bawah ini.`;
  const extra={reply_markup:{inline_keyboard:rows}};return query?editMessage(query,text,extra):sendMessage(chatId,text,extra);
}
async function chooseFreshProduct(query,key){
  const productKey=decodeURIComponent(String(key||''));let live;try{live=await syncFreshCatalog(true);}catch(e){return answerCallback(query,'Produk fresh sedang sulit diakses.');}
  const item=(live.products||[]).find(x=>String(x.key)===productKey);const local=db.getJaspayProduct(productKey);
  if(!item||!local||!local.enabled)return answerCallback(query,'Produk fresh sedang tidak tersedia.');
  const cart={kind:'fresh',fresh_product_key:productKey,fresh_product_name:local.name||item.name,fresh_product:item,fresh_presentation:defaultFreshPresentation(local,item),fresh_options:{},fresh_option_keys:freshOptionOrder(item),fresh_option_index:0,quantity:1,api_unit_price:0,unit_price:0,qty_max:Math.max(1,Number(item.qty_max||1)),created_at:Date.now()};applyFreshOrderDefaults(cart,null);refreshFreshCartPricing(cart,item,local);
  carts.set(String(query.from.id),cart);await answerCallback(query);return renderFreshLanding(query);
}
async function promptFreshOwnAccounts(query){const cart=carts.get(String(query.from.id));if(!cart)return answerCallback(query,'Pilihan kedaluwarsa.');pendingInput.set(String(query.from.id),{type:'fresh_accounts'});await answerCallback(query);const renew=String(cart.fresh_options?.mode||'')==='perpanjang';return editMessage(query,`👤 <b>${escapeHtml(cart.fresh_product_name)} — ${renew?'Perpanjang':'Akun Sendiri'}</b>\n────────────────────\nKirim daftar akun yang ${renew?'ingin diperpanjang':'ingin diproses'}, satu akun per baris:\n\n<code>email1@example.com|password1\nemail2@example.com|password2</code>\n\nBot akan memeriksa akun terlebih dahulu. Akun yang tidak memenuhi syarat tidak akan ditagih.`,{reply_markup:{inline_keyboard:[[btn('◂ Kembali','freshlanding','primary')]]}});}
async function applyFreshAccountCheck(userId,chatId,result){const cart=carts.get(String(userId));if(!cart||cart.kind!=='fresh')return;const accounts=Array.isArray(result?.accounts)?result.accounts:[],eligible=Number((result?.eligible ?? accounts.filter(x=>x.eligible).length) || 0),token=String(result?.accounts_token||'');if(!eligible||!token){await sendMessage(chatId,'⚠️ Tidak ada akun yang dapat diproses. Periksa status akun lalu coba lagi.');return;}cart.fresh_options.accounts_token=token;cart.quantity=eligible;cart.qty_max=eligible;cart.qty_locked=true;refreshFreshCartPricing(cart);await sendMessage(chatId,`✅ <b>PEMERIKSAAN SELESAI</b>\nAkun diperiksa: <b>${Number(result.checked||accounts.length||eligible)}</b>\nAkun yang dapat diproses: <b>${eligible}</b>\n\nTekan Lanjut untuk memilih paket/durasi.`,{reply_markup:{inline_keyboard:[[btn('✅ Lanjut','freshcheckcontinue','success')],[btn('◂ Kembali','freshlanding','primary')]]}});}
async function pollFreshAccountCheck(userId,chatId,checkId){for(let i=0;i<16;i++){await sleep(15000);const cart=carts.get(String(userId));if(!cart||cart.fresh_check_id!==checkId)return;try{const result=await jaspay.getAccountCheck(checkId);if(String(result.status)==='checking')continue;if(String(result.status)==='done'){cart.fresh_check_id='';return applyFreshAccountCheck(userId,chatId,result);}cart.fresh_check_id='';return sendMessage(chatId,'⚠️ Pemeriksaan akun belum berhasil. Silakan coba lagi.');}catch(e){if(i===15)return sendMessage(chatId,'⚠️ Pemeriksaan akun membutuhkan waktu lebih lama. Silakan buka Produk Fresh dan coba lagi.').catch(()=>null);}}}
async function continueFreshOptions(query){
  const cart=carts.get(String(query.from.id));if(!cart||cart.kind!=='fresh')return answerCallback(query,'Pilihan sudah kedaluwarsa.');
  while(cart.fresh_option_index<cart.fresh_option_keys.length){
    const key=cart.fresh_option_keys[cart.fresh_option_index],cfg=cart.fresh_product.options?.[key]||{};
    if(key==='mode'&&cart.fresh_options.mode!==undefined){cart.fresh_option_index++;continue;}
    if(['accounts','accounts_token','password','domain','name','order_id','suffix_digits'].includes(key)){cart.fresh_option_index++;continue;}
    if(!freshOptionEnabled(cfg,cart.fresh_options)){cart.fresh_option_index++;continue;}
    const choices=freshOptionChoices(cart.fresh_product,key,cart.fresh_options);
    if(choices.length===1){cart.fresh_options[key]=choices[0];cart.fresh_option_index++;refreshFreshCartPricing(cart);continue;}
    if(!choices.length&&cfg.bawaan!==undefined&&typeof cfg.bawaan!=='object'&&!String(cfg.bawaan).includes('sama dengan')){cart.fresh_options[key]=cfg.bawaan;cart.fresh_option_index++;refreshFreshCartPricing(cart);continue;}
    if(!choices.length){cart.fresh_option_index++;continue;}
    const rows=[];for(let i=0;i<choices.length;i+=2)rows.push(choices.slice(i,i+2).map((v,j)=>btn(freshOptionValue(key,v),`freshopt:${cart.fresh_option_index}:${i+j}`,'success')));rows.push([btn('◂ Kembali','freshlanding','primary')]);
    return editMessage(query,`${escapeHtml(cart.fresh_presentation.emoji)} <b>${escapeHtml(cart.fresh_product_name)} — Pilih ${escapeHtml(freshOptionTitle(key))}</b>\n────────────────────`,{reply_markup:{inline_keyboard:rows}});
  }
  return renderFreshCart(query);
}
async function renderFreshCart(query){
  const cart=carts.get(String(query.from.id));if(!cart||cart.kind!=='fresh')return editMessage(query,'⚠️ Pilihan sudah kedaluwarsa.',{reply_markup:{inline_keyboard:[[btn('⚡ Produk Fresh','freshmenu','primary')]]}});refreshFreshCartPricing(cart);
  const qty=Math.max(1,Math.min(cart.qty_max,Number(cart.quantity||1)));cart.quantity=qty;const total=cart.unit_price*qty;const options=freshOptionsLabel(cart.fresh_options);
  const local=db.getJaspayProduct(cart.fresh_product_key),renewRefund=String(cart.fresh_options?.mode||'')==='perpanjang'?freshFailureRefundPerItem(local,cart.fresh_options,cart.unit_price):null;
  const text=`<b>KONFIRMASI PRODUK FRESH</b>
=======================
Produk: <b>${escapeHtml(cart.fresh_product_name)}</b>${options?`
${escapeHtml(options)}`:''}

Harga Satuan: <b>${money(cart.unit_price)}</b>
Jumlah: <b>${qty}</b>
Total: <b>${money(total)}</b>${renewRefund!=null?`
Refund jika gagal: <b>${money(renewRefund)}</b> / akun`:''}
=======================
⏳ Akun akan dibuat fresh oleh <b>Bot</b> setelah pembayaran berhasil.`;
  const rows=[];if(!cart.qty_locked)rows.push([btn('−','freshqty:-1','danger'),btn('+','freshqty:1','success')],[btn('+5','freshqty:5','success'),btn('+10','freshqty:10','success')],[btn('🔄 Reset','freshqty:reset','primary')]);rows.push([btn('◂ Kembali','freshlanding','primary'),btn('✅ Konfirmasi','freshconfirm','success')]);
  return editMessage(query,text,{reply_markup:{inline_keyboard:rows}});
}
async function refreshFreshCartLive(userId){const cart=carts.get(String(userId));if(!cart||cart.kind!=='fresh')throw new Error('Pilihan produk fresh kedaluwarsa.');const oldSell=Number(cart.unit_price||0);const live=await syncFreshCatalog(true),product=(live.products||[]).find(x=>String(x.key)===String(cart.fresh_product_key)),local=db.getJaspayProduct(cart.fresh_product_key);if(!product||!local||!local.enabled)throw new Error('Produk fresh sedang tidak tersedia.');cart.qty_max=cart.qty_locked?cart.qty_max:Math.max(1,Number(product.qty_max||1));refreshFreshCartPricing(cart,product,local);return{cart,product,local,oldSell,newSell:Number(cart.unit_price||0)};}
async function showFreshPaymentMethods(query,acceptedPrice=false){
  let refreshed;try{refreshed=await refreshFreshCartLive(query.from.id);}catch(e){return editMessage(query,`⚠️ ${escapeHtml(e.message)}`,{reply_markup:{inline_keyboard:[[btn('◂ Kembali','freshmenu','primary')]]}});}const{cart,oldSell,newSell}=refreshed;const total=cart.unit_price*cart.quantity;
  if(!acceptedPrice&&oldSell>0&&newSell!==oldSell)return editMessage(query,`🔄 <b>HARGA DIPERBARUI</b>\n=======================\nHarga sebelumnya: <b>${money(oldSell)}</b>\nHarga terbaru: <b>${money(newSell)}</b>\nJumlah: <b>${cart.quantity}</b>\nTotal terbaru: <b>${money(total)}</b>\n\nHarga diperbarui otomatis mengikuti pilihan produk terbaru. Silakan konfirmasi total terbaru.`,{reply_markup:{inline_keyboard:[[btn('◂ Kembali','freshcart','primary'),btn('✅ Lanjut Pembayaran','freshconfirm:accept','success')]]}});
  const wallet=db.walletSummary(query.from.id,1)||{balance_total:0,balance_main:0,balance_referral:0};const s=botSettings();const rows=[];
  if(settingEnabled(s.wallet_payment_enabled,true)&&Number(wallet.balance_total||0)>=total)rows.push([btn('💰 Bayar dengan Saldo','freshpay:balance','success')]);
  if(config.autogopayApiKey)rows.push([btn('📱 Bayar dengan QRIS','freshpay:qris','success')]);
  if(settingEnabled(s.topup_enabled,true))rows.push([btn('➕ Top Up Saldo','topup','primary')]);rows.push([btn('◂ Kembali','freshcart','primary'),btn('❌ Batal','freshcancel','danger')]);
  return editMessage(query,`💳 <b>PEMBAYARAN PRODUK FRESH</b>\n=======================\nProduk: <b>${escapeHtml(cart.fresh_product_name)}</b>\nJumlah: <b>${cart.quantity}</b>\nTotal: <b>${money(total)}</b>\n\nSaldo Bot: <b>${money(wallet.balance_total)}</b>`,{reply_markup:{inline_keyboard:rows}});
}
async function createFreshLocalOrder(userId,paymentMethod){
  const{cart,product,local}=await refreshFreshCartLive(userId);const qty=Math.max(1,Math.min(Number(cart.qty_max||product.qty_max||1),Number(cart.quantity||1)));const apiUnit=Math.max(0,Number(jaspay.resolveEffectiveUnitPrice(product,cart.fresh_options)||jaspay.resolveUnitPrice(product,cart.fresh_options)||product.unit_price||0));const sellUnit=freshSellPrice(local,apiUnit,cart.fresh_options);if(sellUnit<=0)throw new Error('Harga produk fresh belum diatur.');
  for(const key of Object.keys(product.options||{})){if(['accounts_token','password','domain','name','order_id','suffix_digits'].includes(key))continue;const cfg=product.options[key]||{};if(!freshOptionEnabled(cfg,cart.fresh_options))continue;const choices=freshOptionChoices(product,key,cart.fresh_options);if(choices.length&&cart.fresh_options[key]!==undefined&&!choices.map(String).includes(String(cart.fresh_options[key])))throw new Error(`Pilihan ${freshOptionTitle(key)} sudah berubah. Silakan pilih ulang.`);}
  const total=sellUnit*qty,u=db.getUser(userId),ref=db.makeRef('FRESH');const order=db.createOrder({order_ref:ref,telegram_id:String(userId),buyer_name:u?[u.first_name,u.last_name].filter(Boolean).join(' '):'',product_code:`FRESH:${product.key}`,product_name:local.name||product.name,variant_name:freshOptionsLabel(cart.fresh_options),quantity:qty,unit_price:sellUnit,subtotal:total,total_price:total,cost_amount:apiUnit*qty,profit_amount:total-(apiUnit*qty),status:paymentMethod==='balance'?'paid':'pending_payment',payment_method:paymentMethod,delivery_mode:'fresh',supplier_source:'jaspay',note:'Fresh order'});
  db.createJaspayOrderRecord({order_ref:order.order_ref,product_key:product.key,product_name:local.name||product.name,options:cart.fresh_options,qty,sell_unit_price:sellUnit,api_unit_price:apiUnit,api_total_price:apiUnit*qty,status:'local_pending',progress_total:qty,raw:{idempotency_key:order.order_ref,price_retry_count:0}});return order;
}
async function activateFreshOrder(order){const updated=db.updateOrder(order.id,{status:'fresh_processing',supplier_source:'jaspay'});await sendFreshProcessingMessage(updated.telegram_id,updated);return updated;}
async function sendFreshProcessingMessage(chatId,order){const rec=db.getJaspayOrder(order.order_ref);const options=rec?freshOptionsLabel(rec.options):order.variant_name;return sendMessage(chatId,`⏳ <b>PESANAN SEDANG DIPROSES</b>\n=======================\nInvoice: <code>${escapeHtml(order.order_ref)}</code>\nProduk: <b>${escapeHtml(order.product_name)}</b>${options?`\nPilihan: <b>${escapeHtml(options)}</b>`:''}\nJumlah: <b>${Number(rec?.qty||order.quantity||1)}</b>\n\nAkun sedang dibuat fresh oleh <b>Bot</b>.\nHasil akan dikirim otomatis setelah selesai.\nKamu tidak perlu melakukan pembayaran ulang.`);}
function formatFreshAccounts(accounts=[]){return accounts.map((a,i)=>{const lines=[];for(const [k,v] of Object.entries(a||{})){if(['index','status'].includes(k)||v==null||v==='')continue;lines.push(`${k.replace(/_/g,' ')}: ${v}`);}return `${i+1}.\n${lines.join('\n')}`;}).join('\n\n');}
async function sendFreshFinalMessage(chatId,order,rec){const results=Array.isArray(rec.results)?rec.results:[];const success=results.filter(x=>String(x.status||'success')==='success');const originalQty=Math.max(1,Number(rec.qty||order.quantity||1));const failed=Math.max(0,originalQty-success.length);let title='✅ <b>PESANAN FRESH SELESAI</b>';if(success.length&&failed)title='⚠️ <b>PESANAN FRESH SELESAI SEBAGIAN</b>';if(!success.length)title='❌ <b>PEMBUATAN AKUN TIDAK BERHASIL</b>';let text=`${title}\n=======================\nInvoice: <code>${escapeHtml(order.order_ref)}</code>\nProduk: <b>${escapeHtml(rec.product_name||order.product_name)}</b>\nPesanan: <b>${originalQty}</b>\nBerhasil: <b>${success.length}</b>${failed?`\nTidak berhasil: <b>${failed}</b>`:''}`;if(rec.customer_refund_amount>0)text+=`\nRefund ke Saldo Bot: <b>${money(rec.customer_refund_amount)}</b>`;if(success.length)text+=`\n\n<b>PRODUK YANG DIDAPAT</b>\n<pre><code>${escapeHtml(formatFreshAccounts(success))}</code></pre>\n<i>Ketuk blok produk di atas untuk menyalin/copy.</i>`;else text+='\n\nRefund sesuai ketentuan telah dikembalikan ke Saldo Bot.';return sendMessage(chatId,text);}
async function payFreshBalance(query){await answerCallback(query);let order;try{order=await createFreshLocalOrder(query.from.id,'balance');const wallet=db.walletSummary(query.from.id);if(!wallet||wallet.balance_total<order.total_price){db.updateOrder(order.id,{status:'canceled'});return sendMessage(query.from.id,'⚠️ Saldo tidak cukup.');}db.debitWalletTotal(query.from.id,order.total_price,'Pembayaran produk fresh',order.order_ref);carts.delete(String(query.from.id));return activateFreshOrder(order);}catch(e){return sendMessage(query.from.id,`❌ ${escapeHtml(e.message)}`);}}
async function createFreshQris(query){await answerCallback(query);if(!config.autogopayApiKey)return sendMessage(query.from.id,'⚠️ QRIS belum dikonfigurasi oleh owner.');try{const order=await createFreshLocalOrder(query.from.id,'qris');const pay=await createQrisPayment(order.total_price,botSettings());const payment=db.createPayment({ref:db.makeRef('PAY'),kind:'order',order_ref:order.order_ref,telegram_id:String(query.from.id),provider:'autogopay',channel:pay.channel,transaction_id:pay.transaction_id,provider_reference:pay.provider_reference,amount:order.total_price,status:'pending',qr_string:pay.qr_string,qr_url:pay.qr_url,expires_at:pay.expires_at,raw:pay.raw});carts.delete(String(query.from.id));return sendPaymentInstructions(query.from.id,payment,`Pembayaran ${order.order_ref}`);}catch(e){return sendMessage(query.from.id,`❌ Gagal membuat QRIS: ${escapeHtml(e.message)}`);}}
async function sweepFreshOrders(){if(!config.jaspayApiKey)return;for(const rec0 of db.listPendingJaspayOrders(100)){let rec=db.getJaspayOrder(rec0.order_ref),order=db.getOrder(rec.order_ref);if(!order)continue;try{
    if(rec.status==='notify_pending'){await sendFreshFinalMessage(order.telegram_id,order,rec);db.updateJaspayOrder(rec.order_ref,{status:String(rec.raw?.status||'completed'),customer_notified_at:new Date().toISOString()});continue;}
    let result;
    if(!rec.api_order_id){const live=await syncFreshCatalog(true),product=(live.products||[]).find(x=>String(x.key)===String(rec.product_key));if(!product)throw Object.assign(new Error('Produk fresh sedang tidak tersedia.'),{statusCode:503});const expected=Math.max(0,Number(rec.api_total_price||0))||Math.max(0,Number(rec.api_unit_price||0))*Math.max(1,Number(rec.qty||1));result=await jaspay.createOrder({product:rec.product_key,qty:rec.qty,options:rec.options,idempotencyKey:String(rec.raw?.idempotency_key||rec.order_ref),expectedTotal:expected});rec=db.updateJaspayOrder(rec.order_ref,{api_order_id:result.id||'',api_unit_price:Number((result.credits_total?Number(result.credits_total)*1000/Math.max(1,Number(rec.qty||1)):0)||rec.api_unit_price||jaspay.resolveEffectiveUnitPrice(product,rec.options)||jaspay.resolveUnitPrice(product,rec.options)||product.unit_price||0),api_total_price:Number((result.credits_total?Number(result.credits_total)*1000:0)||result.total_price||expected),status:String(result.status||'processing'),phase:result.phase||null,queue_position:result.queue_position,progress_success:result.progress?.selesai||0,progress_processed:result.progress?.diproses||0,progress_total:result.progress?.total||rec.qty,raw:{...result,idempotency_key:String(rec.raw?.idempotency_key||rec.order_ref),price_retry_count:Number(rec.raw?.price_retry_count||0)}});db.updateOrder(order.id,{supplier_order_id:result.id||'',cost_amount:Number((result.credits_total?Number(result.credits_total)*1000:0)||result.total_price||expected),profit_amount:Number(order.total_price||0)-Number((result.credits_total?Number(result.credits_total)*1000:0)||result.total_price||expected),status:'fresh_processing'});}
    else result=await jaspay.getOrder(rec.api_order_id);
    if(!result)continue;const status=String(result.status||'processing').toLowerCase();if(status==='processing'){db.updateJaspayOrder(rec.order_ref,{status:'processing',phase:result.phase||null,queue_position:result.queue_position,progress_success:result.progress?.selesai||0,progress_processed:result.progress?.diproses||0,progress_total:result.progress?.total||rec.qty,raw:result});continue;}
    const accounts=Array.isArray(result.accounts)?result.accounts:[];const success=accounts.filter(x=>String(x.status||'')==='success');const failed=Math.max(0,Number(rec.qty||1)-success.length);const localCfg=db.getJaspayProduct(rec.product_key);const refundPerFailed=freshFailureRefundPerItem(localCfg,rec.options,Number(rec.sell_unit_price||order.unit_price||0));const refund=Math.max(0,refundPerFailed*failed);const cost=Math.max(0,Number(rec.api_unit_price||0)*success.length);
    const current=db.getJaspayOrder(rec.order_ref);if(refund>0&&!current.customer_refund_amount){db.adjustWallet(order.telegram_id,{mainDelta:refund,reason:'Refund produk fresh',reference:order.order_ref});}
    order=db.finalizeJaspayLocalOrder(order.order_ref,{success_qty:success.length,delivery_text:formatFreshAccounts(success),cost_amount:cost,customer_refund_amount:refund,status:success.length?'completed':'failed',note:failed?`Fresh ${success.length}/${rec.qty}; refund ${refund}`:'Fresh completed'});
    rec=db.updateJaspayOrder(rec.order_ref,{status:status,phase:null,queue_position:null,progress_success:success.length,progress_processed:Number(rec.qty||1),progress_total:Number(rec.qty||1),api_refunded_total:Number(result.refunded_total||0),customer_refund_amount:refund,results:accounts,raw:result,completed_at:new Date().toISOString()});
    try{await sendFreshFinalMessage(order.telegram_id,order,rec);db.updateJaspayOrder(rec.order_ref,{customer_notified_at:new Date().toISOString()});}catch(e){db.updateJaspayOrder(rec.order_ref,{status:'notify_pending'});throw e;}await notifyOwnerOrder(order).catch(()=>null);
  }catch(e){
    const latest=db.getJaspayOrder(rec.order_ref);
    if(latest?.status==='notify_pending'){db.updateJaspayOrder(rec.order_ref,{raw:{...(latest.raw||{}),last_notify_error:e.message}});state.last_error=`fresh-notify: ${e.message}`;continue;}
    const mismatch=jaspay.priceMismatch(e);
    if(mismatch){
      try{
        jaspay.clearCache();
        const live=await syncFreshCatalog(true),product=(live.products||[]).find(x=>String(x.key)===String(rec.product_key));
        const qty=Math.max(1,Number(rec.qty||1));
        const calculated=product?Math.max(0,Number(jaspay.resolveExpectedTotal(product,rec.options,qty)||0)):0;
        const actual=Math.max(0,Number(mismatch.actualTotal||0))||calculated;
        const raw0={...(latest?.raw||rec.raw||{})},attempt=Math.max(0,Number(raw0.price_retry_count||0))+1;
        if(actual>0&&attempt<=3){
          const apiUnit=Math.max(0,Math.round(actual/qty));
          const nextKey=`${rec.order_ref}-P${attempt}`;
          db.updateJaspayOrder(rec.order_ref,{status:'retry',api_unit_price:apiUnit,api_total_price:actual,raw:{...raw0,price_retry_count:attempt,idempotency_key:nextKey,last_price_change:{from:Number(rec.api_total_price||0),to:actual,at:new Date().toISOString()}}});
          db.updateOrder(order.id,{cost_amount:actual,profit_amount:Number(order.total_price||0)-actual,note:`Harga API diperbarui otomatis ${Number(rec.api_total_price||0)} -> ${actual}`});
          state.last_error=`fresh-price-refresh: ${Number(rec.api_total_price||0)} -> ${actual}`;
          continue;
        }
      }catch(priceErr){state.last_error=`fresh-price-refresh: ${priceErr.message}`;}
    }
    const code=Number(e.statusCode||0);const retryable=!code||[429,500,502,503,504].includes(code);const raw={...(latest?.raw||rec.raw||{}),last_error:e.message,last_error_code:code};db.updateJaspayOrder(rec.order_ref,{status:retryable?'retry':'attention',raw});if(!retryable){db.updateOrder(order.id,{status:'fresh_attention',note:e.message});if(!raw.attention_notified){await sendMessage(order.telegram_id,`⚠️ <b>PROSES AKUN TERTUNDA</b>
=======================
Invoice: <code>${escapeHtml(order.order_ref)}</code>
Produk: <b>${escapeHtml(order.product_name)}</b>

Pembayaran sudah diterima, tetapi proses akun perlu diperiksa oleh owner.
Kamu tidak perlu melakukan pembayaran ulang.`).catch(()=>null);db.updateJaspayOrder(rec.order_ref,{raw:{...raw,attention_notified:true}});}}state.last_error=`fresh: ${e.message}`;}}
}
async function showProducts(chatId,query=null,requestedPage=0){
  const items=db.listProducts({limit:1000,active:true});
  if(!items.length){
    const extra={reply_markup:{inline_keyboard:[[btn('🔙 Kembali','kembaliawal','primary')]]}};
    return query?editMessage(query,'📭 Belum ada produk aktif.',extra):sendMessage(chatId,'📭 Belum ada produk aktif.',extra);
  }
  const totalPages=Math.max(1,Math.ceil(items.length/PRODUCT_PAGE_SIZE));
  const page=Math.max(0,Math.min(totalPages-1,Number(requestedPage||0)));
  const visible=items.slice(page*PRODUCT_PAGE_SIZE,page*PRODUCT_PAGE_SIZE+PRODUCT_PAGE_SIZE);
  const rows=[];
  for(const p of visible){
    const variants=(p.variants||[]).filter(v=>v.active);
    const hasPo=p.delivery_mode==='preorder'||variants.some(v=>v.delivery_mode==='preorder');
    const stock=Number(p.sale_stock??p.stock??0);
    const availability=stock>0?`Stok ${stock}`:hasPo?'PRE-ORDER':'HABIS';
    const ready=stock>0||hasPo;
    const style=ready?'success':'danger';
    const dot=ready?'🟢':'🔴';
    rows.push([btn(`${dot} ${p.name} | mulai ${money(p.price_min)} | ${availability}`,`item:${p.code}:${page}`,style)]);
  }
  if(totalPages>1){
    const nav=[];
    if(page>0)nav.push(btn('⬅️ Sebelumnya',`produkpage:${page-1}`,'primary'));
    nav.push(btn(`(${page+1}/${totalPages})`,'noop','success'));
    if(page<totalPages-1)nav.push(btn('Selanjutnya ➡️',`produkpage:${page+1}`,'primary'));
    rows.push(nav);
  }
  rows.push([btn('🔙 Kembali','kembaliawal','primary')]);
  const text=`<b>DAFTAR PRODUK</b>\n=======================\nPilih produk yang ingin dibeli.\nHalaman <b>${page+1}/${totalPages}</b> · maksimal <b>${PRODUCT_PAGE_SIZE} produk</b> per halaman.`;
  const extra={reply_markup:{inline_keyboard:rows}};
  return query?editMessage(query,text,extra):sendMessage(chatId,text,extra);
}
async function liveStockForSelection(product,variant){const source=variant?.supplier_source||'';if(source&&variant?.supplier_product_id){try{return (await suppliers.availability(source,variant.supplier_product_id)).availableStock;}catch{return 0;}}return variant?db.stockCount(product.id,variant.id):db.stockCount(product.id,null)||product.stock;}
async function showProduct(query,productKey,listPage=0){
  const p=db.getProduct(productKey);
  if(!p||!p.active)return answerCallback(query,'Produk tidak ditemukan / nonaktif.');
  const variants=(p.variants||[]).filter(v=>v.active);
  if(variants.length){
    const rows=[];
    for(const v of variants){
      const st=await liveStockForSelection(p,v);
      const isPreorder=v.delivery_mode==='preorder';
      const ready=isPreorder||st>0;
      const stockText=isPreorder?'PRE-ORDER':st>0?`Stok ${st}`:'HABIS';
      const style=ready?'success':'danger';
      const dot=ready?'🟢':'🔴';
      rows.push([btn(`${dot} ${v.name} | ${money(v.price)} | ${stockText}`,`variant:${p.code}:${v.id}:${Math.max(0,Number(listPage||0))}`,style)]);
    }
    rows.push([btn('🔙 Kembali',`produkpage:${Math.max(0,Number(listPage||0))}`,'primary')]);
    await answerCallback(query);
    return editMessage(query,`📦 <b>${escapeHtml(p.name)}</b>\n=======================\nPilih varian produk yang ingin dibeli. Setelah memilih varian, deskripsi produk akan tampil di halaman konfirmasi sebelum pembayaran.`,{reply_markup:{inline_keyboard:rows}});
  }
  return chooseVariant(query,p.id,0,listPage);
}
async function chooseVariant(query,productId,variantId,listPage=0){
  const p=db.getProduct(productId);
  if(!p||!p.active)return answerCallback(query,'Produk tidak ditemukan / nonaktif.');
  const v=Number(variantId)?db.getVariant(variantId):null;
  if(v&&!v.active)return answerCallback(query,'Varian ini sedang OFF.');
  const stock=await liveStockForSelection(p,v);
  const mode=v?.delivery_mode||p.delivery_mode;
  const price=v?.price??p.price;
  if(mode!=='preorder'&&stock<1)return answerCallback(query,'Stok produk/varian kosong.');
  carts.set(String(query.from.id),{product_id:p.id,variant_id:v?.id||null,quantity:1,coupon_code:'',discount:0,list_page:Math.max(0,Number(listPage||0)),created_at:Date.now()});
  await answerCallback(query);
  return renderCart(query,p,v,stock,price);
}
async function renderCart(query,p=null,v=null,knownStock=null,knownPrice=null){
  const cart=carts.get(String(query.from.id));
  if(!cart)return editMessage(query,'⚠️ Keranjang sudah kedaluwarsa. Silakan pilih produk kembali.',{reply_markup:{inline_keyboard:[[btn('📦 Daftar Produk','daftarproduk','primary')]]}});
  p=p||db.getProduct(cart.product_id);v=v||(cart.variant_id?db.getVariant(cart.variant_id):null);
  if(!p)return editMessage(query,'⚠️ Produk tidak ditemukan.',{reply_markup:{inline_keyboard:[[btn('🔙 Kembali','daftarproduk','primary')]]}});
  const stock=knownStock==null?await liveStockForSelection(p,v):knownStock;
  const totals=cartTotals(cart,p,v);cart.discount=totals.discount;
  const mode=v?.delivery_mode||p.delivery_mode;
  const rawDesc=String(v?.description||p.description||'-').trim();
  const desc=rawDesc.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>/^[•▪▫‣*-]/.test(line)?escapeHtml(line):`•${escapeHtml(line)}`).join('\n')||'-';
  const bulk=bulkPriceLines(p,v);
  const discountLine=totals.discount?`\nVoucher: <b>${escapeHtml(cart.coupon_code)}</b> (-${money(totals.discount)})`:'';
  const text=`<b>KONFIRMASI PESANAN</b>\n=======================\nProduk: <b>${escapeHtml(p.name)}</b>\nVarian: <b>${escapeHtml(v?.name||'Default')}</b>\n\n<b>DESKRIPSI PRODUK</b>\n${desc}\n-----------------------\nHarga Satuan: <b>${money(totals.price)}</b>${bulk?`\nHarga Grosir:\n${bulk}`:''}\n-----------------------\n${mode==='preorder'?'Status Produk: <b>PRE-ORDER</b>':`Stok Tersedia: <b>${stock}</b>`}\nJumlah Pesanan: <b>${cart.quantity}</b>\nSubtotal: <b>${money(totals.subtotal)}</b>${discountLine}\nTotal Dibayar: <b>${money(totals.total)}</b>\n=======================\nKlik ✅ Konfirmasi untuk melakukan pembayaran`;
  const rows=[
    [btn('−','min:1','danger'),btn('+','plus:1','success')],
    [btn('+5','plus:5','success'),btn('+10','plus:10','success'),btn('+25','plus:25','success'),btn('+50','plus:50','success')],
    [btn('🔄 Reset','reset','primary')],
    [btn('🔙 Kembali',`produkpage:${cart.list_page||0}`,'primary'),btn('✅ Konfirmasi','konfirmasi','success')]
  ];
  return editMessage(query,text,{reply_markup:{inline_keyboard:rows}});
}

async function showPaymentMethods(query){
  const cart=carts.get(String(query.from.id));
  if(!cart)return editMessage(query,'⚠️ Keranjang sudah kedaluwarsa.',{reply_markup:{inline_keyboard:[[btn('📦 Daftar Produk','daftarproduk','primary')]]}});
  const p=db.getProduct(cart.product_id);const v=cart.variant_id?db.getVariant(cart.variant_id):null;
  if(!p)return editMessage(query,'⚠️ Produk tidak ditemukan.');
  const totals=cartTotals(cart,p,v);const wallet=db.walletSummary(query.from.id,1)||{balance_main:0,balance_referral:0,balance_total:0};
  const s=botSettings();const shortage=Math.max(0,totals.total-Number(wallet.balance_total||0));
  const text=`💳 <b>PILIH METODE PEMBAYARAN</b>\n=======================\nProduk: <b>${escapeHtml(p.name)}${v?' - '+escapeHtml(v.name):''}</b>\nTotal Produk: <b>${money(totals.total)}</b>\n\nSaldo Utama: <b>${money(wallet.balance_main)}</b>\nSaldo Referral: <b>${money(wallet.balance_referral)}</b>\nTotal Saldo: <b>${money(wallet.balance_total)}</b>\n${shortage>0?`Kekurangan Saldo: <b>${money(shortage)}</b>\n`:''}\nSaldo Utama dipakai lebih dahulu, kemudian Saldo Referral.`;
  const rows=[];
  if(settingEnabled(s.wallet_payment_enabled,true)&&Number(wallet.balance_total||0)>=totals.total)rows.push([btn('💰 Bayar dengan Saldo','bayarsaldo','success')]);
  if(config.autogopayApiKey){const mode=String(s.autogopay_payment_method||'gopay').toLowerCase();const qrisLabel=mode==='shopeepay'?'🛍️ QRIS ShopeePay':mode==='auto_rotate'?'🔄 QRIS Auto Rotating':'📱 QRIS GoPay';rows.push([btn(qrisLabel,'bayarqris','success')]);}
  if(settingEnabled(s.topup_enabled,true))rows.push([btn(shortage>0?`➕ Top Up (kurang ${money(shortage)})`:'➕ Top Up Saldo','topup','primary')]);
  rows.push([btn('🔙 Kembali','konfirmasi','primary'),btn('❌ Batalkan','batalbeli','danger')]);
  return editMessage(query,text,{reply_markup:{inline_keyboard:rows}});
}
async function createOrderFromCart(userId,paymentMethod){const cart=carts.get(String(userId));if(!cart)throw new Error('Keranjang kedaluwarsa.');const p=db.getProduct(cart.product_id);const v=cart.variant_id?db.getVariant(cart.variant_id):null;if(!p||!p.active||v&& !v.active)throw new Error('Produk/varian tidak aktif.');const stock=await liveStockForSelection(p,v);const mode=v?.delivery_mode||p.delivery_mode;if(mode!=='preorder'&&stock<cart.quantity)throw new Error('Stok tidak mencukupi.');const price=selectionPrice(p,v,cart.quantity);const subtotal=price*cart.quantity;let discount=0;if(cart.coupon_code){const c=db.validateCoupon(cart.coupon_code,subtotal,p.id);if(!c.ok)throw new Error(c.message);discount=c.discount;}const total=Math.max(0,subtotal-discount);const u=db.getUser(userId);return db.createOrder({telegram_id:String(userId),buyer_name:u?[u.first_name,u.last_name].filter(Boolean).join(' '):'',product_id:p.id,variant_id:v?.id||null,product_code:p.code,product_name:p.name,variant_name:v?.name||'',quantity:cart.quantity,unit_price:price,subtotal,discount_amount:discount,total_price:total,cost_amount:(v?.cost??p.cost)*cart.quantity,profit_amount:total-((v?.cost??p.cost)*cart.quantity),status:paymentMethod==='balance'?'paid':'pending_payment',payment_method:paymentMethod,delivery_mode:mode,coupon_code:cart.coupon_code,supplier_source:v?.supplier_source||''});}
async function fulfillPaidOrder(order){if(!order)throw new Error('Order tidak ditemukan');if(['completed','waiting_delivery'].includes(order.status))return order;const p=db.getProduct(order.product_id);const v=order.variant_id?db.getVariant(order.variant_id):null;const source=v?.supplier_source||order.supplier_source||'';if(source&&v?.supplier_product_id){const result=await suppliers.createOrder(source,{productId:v.supplier_product_id,quantity:order.quantity,idempotencyKey:order.order_ref});if(!result.delivered.length&&['pending','processing'].includes(result.status)){db.updateOrder(order.id,{status:'supplier_pending',supplier_order_id:result.orderId,supplier_source:source});return db.getOrder(order.id);}if(!result.delivered.length)throw new Error('Produk belum siap dikirim.');db.updateOrder(order.id,{status:'completed',delivery_text:result.delivered.join('\n'),supplier_order_id:result.orderId,supplier_source:source});if(order.coupon_code)db.markCouponUsed(order.coupon_code);return db.getOrder(order.id);}return db.completeLocalOrder(order.order_ref);}
function paymentLabel(order,payment){const method=String(order?.payment_method||'').toLowerCase();if(method==='balance')return'Saldo Bot';if(method==='redeem')return'Redeem';if(method==='manual')return'Manual';if(method==='qris'){const channel=String(payment?.channel||'').toLowerCase();return channel==='shopeepay'?'QRIS ShopeePay':channel==='gopay'?'QRIS GoPay':'QRIS';}return order?.payment_method||'-';}
async function sendOrderReceipt(chatId,order){
  const done=db.getOrder(order.id||order.order_ref)||order;
  const product=done.product_id?db.getProduct(done.product_id):null;
  const variant=done.variant_id?db.getVariant(done.variant_id):null;
  const payment=db.getPaymentByOrder(done.order_ref);
  const terms=String(variant?.terms||product?.terms||'Ikuti ketentuan penggunaan produk yang berlaku.').trim();
  const productName=done.variant_name?`${done.product_name} - ${done.variant_name}`:done.product_name;
  let text=`✅ <b>PEMBAYARAN BERHASIL</b>\n=======================\nInvoice: <b>${escapeHtml(done.order_ref)}</b>\nProduk: <b>${escapeHtml(productName)}</b>\nHarga: <b>${money(done.unit_price)}</b>\nJumlah Beli: <b>${done.quantity}</b>\nMetode: <b>${escapeHtml(paymentLabel(done,payment))}</b>\nFee: <b>Rp 0</b>\nTotal Dibayar: <b>${money(done.total_price)}</b>\nTanggal: <b>${escapeHtml(formatWIB(done.completed_at||done.paid_at||done.created_at))}</b>\n=======================\n\n<b>SYARAT &amp; KETENTUAN</b>\n${escapeHtml(terms)}\n\n<b>PRODUK YANG DIDAPAT</b>`;
  if(done.status==='waiting_delivery')text+='\n⏳ PRE-ORDER sudah diterima. Produk akan dikirim owner melalui bot setelah siap.';
  else if(done.status==='supplier_pending')text+='\n⏳ Bot sedang memproses pesanan. Produk akan dikirim otomatis setelah tersedia.';
  else if(done.delivery_text)text+=`\n<pre><code>${escapeHtml(done.delivery_text)}</code></pre>\n<i>Ketuk blok produk di atas untuk menyalin/copy.</i>`;
  else text+='\n<i>Produk belum tersedia untuk dikirim.</i>';
  await sendMessage(chatId,text);
  await notifyOwnerOrder(done).catch(()=>null);
  return done;
}
async function sendTransactionNotification(kind,payload={}){
  const settings=botSettings();
  if(!settingEnabled(settings.transaction_notifications_enabled,true))return false;
  const target=String(settings.transaction_channel_id||'').trim();
  if(!target)return false;
  if(kind==='order'&&!settingEnabled(settings.transaction_notify_orders,true))return false;
  if(kind==='topup'&&!settingEnabled(settings.transaction_notify_topups,true))return false;
  let text='';
  if(kind==='topup')text=`💰 <b>TOP UP BERHASIL</b>
User: <code>${escapeHtml(payload.telegram_id||'-')}</code>
Nominal: <b>${money(payload.amount)}</b>
Ref: <code>${escapeHtml(payload.ref||'-')}</code>`;
  else text=`🛒 <b>TRANSAKSI BARU</b>
Invoice: <code>${escapeHtml(payload.order_ref)}</code>
User: <code>${escapeHtml(payload.telegram_id)}</code>
Produk: <b>${escapeHtml(payload.product_name)}</b>${payload.variant_name?` · ${escapeHtml(payload.variant_name)}`:''}
Qty: <b>${payload.quantity}</b>
Total: <b>${money(payload.total_price)}</b>
Status: <b>${escapeHtml(payload.status)}</b>`;
  await sendMessage(target,text).catch(error=>{state.last_error=`transaction-notification: ${error.message}`;});
  return true;
}
async function notifyOwnerOrder(order){const ids=[config.ownerId,...config.ownerIds].filter(Boolean);for(const id of new Set(ids)){await sendMessage(id,`🛒 <b>TRANSAKSI BARU</b>
Invoice: <code>${escapeHtml(order.order_ref)}</code>
User: <code>${escapeHtml(order.telegram_id)}</code>
Produk: <b>${escapeHtml(order.product_name)}</b>${order.variant_name?` · ${escapeHtml(order.variant_name)}`:''}
Qty: <b>${order.quantity}</b>
Total: <b>${money(order.total_price)}</b>
Status: <b>${escapeHtml(order.status)}</b>`).catch(()=>null);}await sendTransactionNotification('order',order).catch(()=>null);}

async function payBalance(query){await answerCallback(query);let order;try{order=await createOrderFromCart(query.from.id,'balance');const wallet=db.walletSummary(query.from.id);if(!wallet||wallet.balance_total<order.total_price){db.updateOrder(order.id,{status:'canceled',note:'Saldo tidak cukup'});return sendMessage(query.from.id,`⚠️ Saldo tidak cukup.\nSaldo: <b>${money(wallet?.balance_total||0)}</b>\nTotal: <b>${money(order.total_price)}</b>`,{reply_markup:{inline_keyboard:[[btn('➕ Top Up','topup','primary')],[btn('💰 Saldo','wallet','success')]]}});}const before={main:wallet.balance_main,referral:wallet.balance_referral};db.debitWalletTotal(query.from.id,order.total_price,'Pembayaran order',order.order_ref);try{order=await fulfillPaidOrder(order);}catch(e){db.updateUser(query.from.id,{balance_main:before.main,balance_referral:before.referral});db.updateOrder(order.id,{status:'failed',note:e.message});throw e;}carts.delete(String(query.from.id));return sendOrderReceipt(query.from.id,order);}catch(e){return sendMessage(query.from.id,`❌ ${escapeHtml(e.message)}`);}}

async function createQrisPayment(amount,settings){
  const mode=String(settings.autogopay_payment_method||'gopay').toLowerCase();
  if(mode!=='auto_rotate')return payments.create(amount,mode);
  const preferred=String(settings.qris_rotation_next||'gopay')==='shopeepay'?'shopeepay':'gopay';
  const fallback=preferred==='gopay'?'shopeepay':'gopay';
  try{const result=await payments.create(amount,preferred);db.saveSettings({qris_rotation_next:fallback});return result;}catch(firstError){
    try{const result=await payments.create(amount,fallback);db.saveSettings({qris_rotation_next:preferred});return result;}catch(secondError){throw new Error(`Auto Rotating gagal. ${preferred}: ${firstError.message}; ${fallback}: ${secondError.message}`);}
  }
}
async function createQrisForOrder(query){await answerCallback(query);const settings=botSettings();if(!config.autogopayApiKey)return sendMessage(query.from.id,'⚠️ QRIS belum dikonfigurasi oleh owner.');try{const order=await createOrderFromCart(query.from.id,'qris');const pay=await createQrisPayment(order.total_price,settings);const payment=db.createPayment({ref:db.makeRef('PAY'),kind:'order',order_ref:order.order_ref,telegram_id:String(query.from.id),provider:'autogopay',channel:pay.channel,transaction_id:pay.transaction_id,provider_reference:pay.provider_reference,amount:order.total_price,status:'pending',qr_string:pay.qr_string,qr_url:pay.qr_url,expires_at:pay.expires_at,raw:pay.raw});carts.delete(String(query.from.id));return sendPaymentInstructions(query.from.id,payment,`Pembayaran ${order.order_ref}`);}catch(e){return sendMessage(query.from.id,`❌ Gagal membuat QRIS: ${escapeHtml(e.message)}`);}}
async function sendPaymentInstructions(chatId,payment,title='Pembayaran'){
  const text=`📱 <b>${escapeHtml(title)}</b>\n━━━━━━━━━━━━━━━━━━\nNominal: <b>${money(payment.amount)}</b>\nMetode: <b>QRIS ${escapeHtml(payment.channel)}</b>\nBerlaku sampai: <b>${payment.expires_at?new Date(payment.expires_at).toLocaleString('id-ID'):'-'}</b>\n\nQRIS akan dihapus otomatis setelah pembayaran berhasil atau kedaluwarsa.`;
  const kb={inline_keyboard:[[btn('🔄 Cek Pembayaran',`cekbayar:${payment.ref}`,'success')],[btn('🏠 Menu Utama','kembaliawal','primary')]]};
  let sent=null;
  if(payment.qr_url){try{sent=await sendPhoto(chatId,payment.qr_url,text,{reply_markup:kb});}catch{}}
  if(!sent)sent=await sendMessage(chatId,`${text}\n\n<code>${escapeHtml(payment.qr_string)}</code>`,{reply_markup:kb});
  if(sent?.message_id)db.updatePayment(payment.ref,{qr_chat_id:String(sent.chat?.id||chatId),qr_message_id:Number(sent.message_id)});
  return sent;
}
async function deletePaymentQris(payment){
  const latest=payment?.ref?db.getPayment(payment.ref):payment;if(!latest)return false;
  const chatId=latest.qr_chat_id||latest.telegram_id;const messageId=Number(latest.qr_message_id||0);
  if(!chatId||!messageId)return false;
  await call('deleteMessage',{chat_id:chatId,message_id:messageId},5000).catch(()=>null);
  db.updatePayment(latest.ref,{qr_chat_id:'',qr_message_id:0});
  return true;
}

async function createTopup(userId,amount){if(!config.autogopayApiKey)throw new Error('QRIS belum dikonfigurasi.');const settings=botSettings();const pay=await createQrisPayment(amount,settings);return db.createPayment({ref:db.makeRef('TOP'),kind:'topup',telegram_id:String(userId),provider:'autogopay',channel:pay.channel,transaction_id:pay.transaction_id,provider_reference:pay.provider_reference,amount,status:'pending',qr_string:pay.qr_string,qr_url:pay.qr_url,expires_at:pay.expires_at,raw:pay.raw});}
async function processPaidPayment(payment,verification=null){if(!payment||payment.status==='completed')return payment;if(paymentLocks.has(payment.ref))return payment;paymentLocks.add(payment.ref);try{const check=verification||await payments.verify(payment);if(check.amount&&Number(check.amount)!==Number(payment.amount))throw new Error('Nominal pembayaran tidak cocok.');db.updatePayment(payment.ref,{status:check.status,transaction_id:check.transaction_id,provider_reference:check.provider_reference,raw:check.raw});if(check.status!=='completed'){if(['expired','failed','canceled'].includes(String(check.status)))await deletePaymentQris(payment);return db.getPayment(payment.ref);}await deletePaymentQris(payment);if(payment.kind==='topup'){db.adjustWallet(payment.telegram_id,{mainDelta:payment.amount,reason:'Top up QRIS',reference:payment.ref});db.updatePayment(payment.ref,{status:'completed',raw:check.raw});await sendMessage(payment.telegram_id,`✅ <b>TOP UP BERHASIL</b>\nSaldo bertambah <b>${money(payment.amount)}</b>.`).catch(()=>null);await sendTransactionNotification('topup',payment).catch(()=>null);return db.getPayment(payment.ref);}const order=db.getOrder(payment.order_ref);if(!order)return db.getPayment(payment.ref);db.updateOrder(order.id,{status:'paid'});if(order.delivery_mode==='fresh'||order.supplier_source==='jaspay'){const done=await activateFreshOrder(db.getOrder(order.id));return db.getPayment(payment.ref);}let done;try{done=await fulfillPaidOrder(db.getOrder(order.id));}catch(e){db.updateOrder(order.id,{status:'failed',note:e.message});await sendMessage(payment.telegram_id,`⚠️ Pembayaran diterima, tetapi proses produk belum berhasil. Owner dapat memeriksa invoice <code>${escapeHtml(order.order_ref)}</code>.`).catch(()=>null);throw e;}await sendOrderReceipt(payment.telegram_id,done).catch(()=>null);return db.getPayment(payment.ref);}finally{paymentLocks.delete(payment.ref);}}
async function checkPayment(query,ref){await answerCallback(query);const p=db.getPayment(ref);if(!p)return sendMessage(query.from.id,'Pembayaran tidak ditemukan.');try{const check=await payments.verify(p);await processPaidPayment(p,check);const latest=db.getPayment(ref);if(latest.status==='completed')return latest;return sendMessage(query.from.id,`⏳ Status pembayaran: <b>${escapeHtml(latest.status)}</b>`);}catch(e){return sendMessage(query.from.id,`⚠️ Gagal mengecek pembayaran: ${escapeHtml(e.message)}`);}}
async function sweepPayments(){if(!config.autogopayApiKey)return;for(const p of db.pendingPayments(100)){if(p.expires_at&&new Date(p.expires_at).getTime()<Date.now()){db.updatePayment(p.ref,{status:'expired'});await deletePaymentQris(p);if(p.order_ref){const o=db.getOrder(p.order_ref);if(o&&o.status==='pending_payment')db.updateOrder(o.id,{status:'expired'});}continue;}try{const check=await payments.verify(p);if(check.status==='completed')await processPaidPayment(p,check);else if(['expired','failed','canceled'].includes(check.status)){db.updatePayment(p.ref,{status:check.status,raw:check.raw});await deletePaymentQris(p);if(p.order_ref){const o=db.getOrder(p.order_ref);if(o)db.updateOrder(o.id,{status:check.status});}}else db.updatePayment(p.ref,{status:'pending',raw:check.raw});}catch(e){state.last_error=`payment: ${e.message}`;}}}

async function showWallet(chatId,userId,query=null){
  const w=db.walletSummary(userId,8);if(!w)return sendMessage(chatId,'⚠️ Data saldo belum tersedia.');
  const s=botSettings();const link=referralUrl(w.referral_code);const reward=Math.max(0,Number(s.referral_reward_amount||0));
  const referralActive=settingEnabled(s.referral_enabled,true);const topupActive=settingEnabled(s.topup_enabled,true);const walletActive=settingEnabled(s.wallet_payment_enabled,true);
  const history=(w.ledger||[]).slice(0,5).map(x=>`${x.direction==='credit'?'+':'-'}${money(x.amount)} · ${x.wallet_type==='referral'?'Referral':'Utama'} · ${String(x.reason||'-').slice(0,46)}`).join('\n')||'Belum ada mutasi saldo.';
  const text=`💰 <b>SALDO & REFERRAL</b>\n=======================\nSaldo Utama: <b>${money(w.balance_main)}</b>\nSaldo Referral: <b>${money(w.balance_referral)}</b>\nTotal Saldo: <b>${money(w.balance_total)}</b>\n\n👥 <b>REFERRAL</b>\nBerhasil mengundang: <b>${w.invited_total||0}</b>\nHadiah per undangan: <b>${money(reward)}</b>\n${referralActive?`Link referral kamu:\n<code>${escapeHtml(link||'BOT_USERNAME belum diatur')}</code>`:'Program referral sedang dinonaktifkan.'}\n\n📒 <b>MUTASI TERAKHIR</b>\n<pre>${escapeHtml(history)}</pre>`;
  const rows=[];
  if(topupActive)rows.push([btn('➕ Top Up Saldo','topup','primary')]);
  if(referralActive&&link)rows.push([{text:'🔗 Bagikan Link Referral',url:`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Daftar melalui link saya dan belanja produk digital secara otomatis.')}`,style:'primary'}]);
  if(walletActive)rows.push([btn('🛍️ Belanja dengan Saldo','daftarproduk','success')]);
  rows.push([btn('🔄 Perbarui','wallet','success'),btn('🔙 Menu Utama','kembaliawal','primary')]);
  const extra={reply_markup:{inline_keyboard:rows}};return query?editMessage(query,text,extra):sendMessage(chatId,text,extra);
}
async function showHistory(chatId,userId,query=null){
  const rows=db.listOrdersByUser(userId,8);
  if(!rows.length){const extra={reply_markup:{inline_keyboard:[[btn('🔙 Kembali','kembaliawal','primary')]]}};return query?editMessage(query,'📭 Kamu belum memiliki riwayat transaksi.',extra):sendMessage(chatId,'📭 Kamu belum memiliki riwayat transaksi.',extra);}
  const text='<b>RIWAYAT TRANSAKSI</b>\n=======================\n'+rows.map((o,i)=>`${i+1}. <b>${escapeHtml(o.product_name)}</b>${o.variant_name?' - '+escapeHtml(o.variant_name):''}\n   Invoice: <code>${escapeHtml(o.order_ref)}</code>\n   Jumlah: <b>${o.quantity}</b>\n   Harga: <b>${money(o.total_price)}</b>\n   Status: <b>${escapeHtml(String(o.status||'completed').toUpperCase())}</b>\n   Tanggal: <b>${escapeHtml(formatWIB(o.created_at))}</b>`).join('\n\n');
  const extra={reply_markup:{inline_keyboard:[[btn('🔙 Kembali','kembaliawal','primary')]]}};return query?editMessage(query,text,extra):sendMessage(chatId,text,extra);
}
const STOCK_PAGE_SIZE=5;
async function showStock(chatId,query=null,requestedPage=0){
  const rows=db.listProducts({active:true,limit:1000});
  if(!rows.length){const extra={reply_markup:{inline_keyboard:[[btn('🔙 Kembali','kembaliawal','primary')]]}};return query?editMessage(query,'📭 Belum ada produk aktif.',extra):sendMessage(chatId,'📭 Belum ada produk aktif.',extra);}
  const summary={ready:0,preorder:0,empty:0};for(const p of rows){const st=String(p.stock_status||'empty');if(st==='ready')summary.ready++;else if(st==='preorder')summary.preorder++;else summary.empty++;}
  const totalPages=Math.max(1,Math.ceil(rows.length/STOCK_PAGE_SIZE));const page=Math.max(0,Math.min(totalPages-1,Number(requestedPage||0)));const visible=rows.slice(page*STOCK_PAGE_SIZE,page*STOCK_PAGE_SIZE+STOCK_PAGE_SIZE);
  const parts=[];
  for(let i=0;i<visible.length;i++){
    const p=visible[i];const variants=(p.variants||[]).filter(v=>v.active);const isPo=p.delivery_mode==='preorder'&&!variants.length;const ownStock=Number(p.sale_stock??p.stock??0);const ready=isPo||ownStock>0;let block=`${ready?'🟢':'🔴'} <b>${escapeHtml(p.name)}</b>\n`;
    if(variants.length){block+=`Terjual: <b>${Number(p.sold_total||0)}</b>`;for(const v of variants){const po=v.delivery_mode==='preorder';const st=Number(v.stock||0);const ok=po||st>0;block+=`\n${ok?'🟢':'🔴'} ${escapeHtml(v.name)} · ${po?'PRE-ORDER':st>0?`Stok ${st}`:'HABIS'} · ${money(v.price)}`;}}
    else block+=`${isPo?'Status: <b>PRE-ORDER</b>':ownStock>0?`Stok: <b>${ownStock}</b>`:'Status: <b>HABIS</b>'} · Terjual: <b>${Number(p.sold_total||0)}</b> · ${money(p.price)}`;
    parts.push(block);
  }
  const nav=[];if(page>0)nav.push(btn('⬅️ Sebelumnya',`stokpage:${page-1}`,'primary'));nav.push(btn(`${page+1}/${totalPages}`,'noop','success'));if(page<totalPages-1)nav.push(btn('Selanjutnya ➡️',`stokpage:${page+1}`,'primary'));
  const keyboard=[];if(totalPages>1)keyboard.push(nav);keyboard.push([btn('🔄 Refresh',`stokpage:${page}`,'success'),btn('🔙 Kembali','kembaliawal','primary')]);
  const text=`📦 <b>STOK PRODUK</b>\n=======================\nProduk: <b>${rows.length}</b> · 🟢 Ready <b>${summary.ready}</b> · 🔴 Habis <b>${summary.empty}</b> · 🟢 PO <b>${summary.preorder}</b>\nHalaman <b>${page+1}/${totalPages}</b>\n\n${parts.join('\n\n-----------------------\n\n')}`;
  const extra={reply_markup:{inline_keyboard:keyboard}};return query?editMessage(query,text,extra):sendMessage(chatId,text,extra);
}

async function showHelp(chatId,query=null,from=null){
  const ownerLine=from&&isOwner(from.id)?'\n\n<b>Owner/Admin:</b>\n/ownermenu - Buka menu owner\n/dashboard - Buka Dashboard Owner\n/reseller - Alias Dashboard Owner\n/stats - Statistik bot\n/lisensi - Status build\n/rekap - Rekap penjualan bulanan':'';
  const text=`❓ <b>BANTUAN BOT</b>\n=======================\n<b>Command User:</b>\n/start - Buka menu utama\n/produk - Lihat daftar produk\n/redeem KODE - Tukarkan kode redeem\n/cekorder - Cek pesanan/riwayat transaksi\n/saldo - Saldo & referral\n/help - Tampilkan bantuan\n\n<b>Cara Order:</b>\n1. Ketik /start atau /produk\n2. Pilih produk/varian\n3. Atur jumlah pesanan\n4. Klik Konfirmasi\n5. Pilih voucher bila ada\n6. Pilih pembayaran Saldo atau QRIS\n7. Produk ready diproses otomatis; PRE-ORDER dikirim owner setelah disiapkan${ownerLine}`;
  const extra={reply_markup:{inline_keyboard:[[btn('🔙 Kembali','kembaliawal','primary')]]}};return query?editMessage(query,text,extra):sendMessage(chatId,text,extra);
}
async function handleCallback(query){
  const from=query.from;const chatId=query.message?.chat?.id||from.id;await touchUser(from);const data=String(query.data||'');
  if(['checkjoin','joincheck'].includes(data)){
    const s=botSettings();const j=await joinState(from.id,s);if(!j.joined)return answerCallback(query,'Kamu belum terdeteksi join.');await answerCallback(query,'Berhasil');return sendHome(chatId,from,query);
  }
  if(!(await ensureAccess(from,chatId)))return;
  if(data==='noop')return answerCallback(query);
  if(['home','kembaliawal'].includes(data))return sendHome(chatId,from,query);
  if(['products','daftarproduk'].includes(data))return showProducts(chatId,query,0);
  if(data==='freshmenu')return showFreshProducts(chatId,query,false);
  if(data==='freshrefresh')return showFreshProducts(chatId,query,true);
  if(data.startsWith('freshprod:'))return chooseFreshProduct(query,data.slice('freshprod:'.length));
  if(data==='freshlanding'){pendingInput.delete(String(from.id));const cart=carts.get(String(from.id));if(cart){cart.fresh_check_id='';}await answerCallback(query);return renderFreshLanding(query);}
  if(data==='freshdesc')return showFreshDescription(query);
  if(data==='freshcontinue'){const cart=carts.get(String(from.id));if(!cart||cart.kind!=='fresh')return answerCallback(query,'Pilihan kedaluwarsa.');await answerCallback(query);return continueFreshOptions(query);}
  if(data.startsWith('freshmode:')){const cart=carts.get(String(from.id));if(!cart||cart.kind!=='fresh')return answerCallback(query,'Pilihan kedaluwarsa.');const idx=Number(data.split(':')[1]),modes=freshVisibleModes(cart);if(!Number.isInteger(idx)||idx<0||idx>=modes.length)return answerCallback(query,'Mode tidak valid.');pendingInput.delete(String(from.id));cart.fresh_check_id='';cart.fresh_options={mode:modes[idx]};cart.fresh_option_index=0;cart.quantity=1;cart.qty_locked=false;cart.qty_max=Math.max(1,Number(cart.fresh_product?.qty_max||1));applyFreshOrderDefaults(cart,modes[idx]);refreshFreshCartPricing(cart);const mode=String(modes[idx]);if(mode==='sendiri'||mode==='perpanjang')return promptFreshOwnAccounts(query);if(mode==='baru'){await answerCallback(query);return renderFreshNewAccountSummary(query,false);}await answerCallback(query);return continueFreshOptions(query);}
  if(data==='freshacctsettings'){pendingInput.delete(String(from.id));await answerCallback(query);return renderFreshNewAccountSummary(query,true);}if(data==='freshacctback'){pendingInput.delete(String(from.id));await answerCallback(query);return renderFreshNewAccountSummary(query,false);}if(data==='freshacctreset'){pendingInput.delete(String(from.id));const cart=carts.get(String(from.id));if(!cart||cart.kind!=='fresh')return answerCallback(query,'Pilihan kedaluwarsa.');const mode=cart.fresh_options?.mode;cart.fresh_options={mode};applyFreshOrderDefaults(cart,'baru');refreshFreshCartPricing(cart);await answerCallback(query,'Default admin dipulihkan');return renderFreshNewAccountSummary(query,true);}if(data.startsWith('freshacctedit:'))return promptFreshAccountField(query,data.slice('freshacctedit:'.length));if(data==='freshacctcontinue'){pendingInput.delete(String(from.id));const cart=carts.get(String(from.id));if(!cart||cart.kind!=='fresh')return answerCallback(query,'Pilihan kedaluwarsa.');await answerCallback(query);return continueFreshOptions(query);}if(data==='freshcheckcontinue'){const cart=carts.get(String(from.id));if(!cart||cart.kind!=='fresh')return answerCallback(query,'Pilihan kedaluwarsa.');await answerCallback(query);return continueFreshOptions(query);}
  if(data.startsWith('freshopt:')){const cart=carts.get(String(from.id));if(!cart||cart.kind!=='fresh')return answerCallback(query,'Pilihan kedaluwarsa.');const[,stepRaw,idxRaw]=data.split(':');const step=Number(stepRaw),idx=Number(idxRaw),key=cart.fresh_option_keys[step],choices=freshOptionChoices(cart.fresh_product,key,cart.fresh_options);if(!key||!Number.isInteger(idx)||idx<0||idx>=choices.length)return answerCallback(query,'Pilihan tidak valid.');cart.fresh_options[key]=choices[idx];cart.fresh_option_index=step+1;refreshFreshCartPricing(cart);await answerCallback(query);return continueFreshOptions(query);}
  if(data.startsWith('freshqty:')){const cart=carts.get(String(from.id));if(!cart||cart.kind!=='fresh')return answerCallback(query,'Pilihan kedaluwarsa.');if(cart.qty_locked)return answerCallback(query,'Jumlah mengikuti akun yang lolos pemeriksaan.');const raw=data.slice('freshqty:'.length);cart.quantity=raw==='reset'?1:Math.max(1,Math.min(cart.qty_max,Number(cart.quantity||1)+Number(raw||0)));await answerCallback(query);return renderFreshCart(query);}
  if(data==='freshcart'){await answerCallback(query);return renderFreshCart(query);}
  if(data==='freshconfirm'){await answerCallback(query);return showFreshPaymentMethods(query,false);}
  if(data==='freshconfirm:accept'){await answerCallback(query);return showFreshPaymentMethods(query,true);}
  if(data==='freshpay:balance')return payFreshBalance(query);
  if(data==='freshpay:qris')return createFreshQris(query);
  if(data==='freshcancel'){carts.delete(String(from.id));await answerCallback(query,'Pesanan dibatalkan');return sendHome(chatId,from,query);}
  if(data.startsWith('produkpage:'))return showProducts(chatId,query,Number(data.split(':')[1]||0));
  if(data.startsWith('prod:'))return showProduct(query,data.split(':')[1],0);
  if(data.startsWith('item:')){const parts=data.split(':');return showProduct(query,parts[1],Number(parts[2]||0));}
  if(data.startsWith('var:')){const[,p,v]=data.split(':');return chooseVariant(query,p,v,0);}
  if(data.startsWith('variant:')){const parts=data.split(':');const p=db.getProduct(parts[1]);return chooseVariant(query,p?.id||parts[1],parts[2],Number(parts[3]||0));}
  if(data.startsWith('qty:')||data.startsWith('plus:')||data.startsWith('min:')||data==='reset'){
    const cart=carts.get(String(from.id));if(!cart)return answerCallback(query,'Keranjang kedaluwarsa.');
    if(data==='reset'||data==='qty:reset')cart.quantity=1;else if(data.startsWith('plus:'))cart.quantity+=Math.max(1,Number(data.split(':')[1]||1));else if(data.startsWith('min:'))cart.quantity=Math.max(1,cart.quantity-Math.max(1,Number(data.split(':')[1]||1)));else cart.quantity=Math.max(1,cart.quantity+Number(data.slice(4)||0));
    const p=db.getProduct(cart.product_id);const v=cart.variant_id?db.getVariant(cart.variant_id):null;const st=await liveStockForSelection(p,v);if((v?.delivery_mode||p.delivery_mode)!=='preorder')cart.quantity=Math.min(cart.quantity,Math.max(1,st));await answerCallback(query);return renderCart(query,p,v,st);
  }
  if(data==='konfirmasi'){
    await answerCallback(query);return editMessage(query,'🎟 <b>APAKAH KAMU MEMILIKI VOUCHER?</b>\n=======================\nPilih salah satu opsi di bawah.',{reply_markup:{inline_keyboard:[[btn('Tidak','bayar','primary'),btn('Punya Voucher','punya','success')],[btn('🔙 Kembali','daftarproduk','primary'),btn('❌ Batal','batalbeli','danger')]]}});
  }
  if(['punya','coupon_input'].includes(data)){pendingInput.set(String(from.id),{type:'coupon'});await answerCallback(query);return sendMessage(chatId,'🎟 <b>MASUKKAN KODE VOUCHER</b>\n=======================\nKirim kode voucher sekarang.');}
  if(data==='bayar')return showPaymentMethods(query);
  if(['pay:balance','bayarsaldo'].includes(data))return payBalance(query);
  if(['pay:qris','bayarqris'].includes(data))return createQrisForOrder(query);
  if(data==='batalbeli'){carts.delete(String(from.id));await answerCallback(query,'Pesanan dibatalkan');return editMessage(query,'❌ Pesanan dibatalkan.',{reply_markup:{inline_keyboard:[[btn('🏠 Menu Utama','kembaliawal','primary')]]}});}
  if(data.startsWith('paycheck:')||data.startsWith('cekbayar:'))return checkPayment(query,data.split(':').slice(1).join(':'));
  if(data==='wallet'){await answerCallback(query);return showWallet(chatId,from.id,query);}
  if(['history','riwayattransaksi'].includes(data)){await answerCallback(query);return showHistory(chatId,from.id,query);}
  if(['stock','stok'].includes(data)){await answerCallback(query);return showStock(chatId,query,0);}
  if(data.startsWith('stokpage:')){await answerCallback(query);return showStock(chatId,query,Number(data.split(':')[1]||0));}
  if(['help','caraorder'].includes(data)){await answerCallback(query);return showHelp(chatId,query,from);}
  if(data==='redeem'){pendingInput.set(String(from.id),{type:'redeem'});await answerCallback(query);return sendMessage(chatId,'🎁 <b>REDEEM KODE</b>\n=======================\nMasukkan kode redeem yang kamu dapatkan. Kode valid akan langsung diproses.\n\nKetik kodenya sekarang atau gunakan format:\n<code>/redeem KODE</code>');}
  if(data==='topup'){const s=botSettings();if(!settingEnabled(s.topup_enabled,true)){await answerCallback(query,'Top Up sedang dinonaktifkan.');return null;}const b=topupBounds(s);pendingInput.set(String(from.id),{type:'topup'});await answerCallback(query);return sendMessage(chatId,`➕ <b>TOP UP SALDO</b>\n=======================\nKirim nominal top up.\nMinimal: <b>${money(b.min)}</b>\nMaksimal: <b>${money(b.max)}</b>\nContoh: <code>50000</code>.`);}
  return answerCallback(query,'Tombol ini sudah tidak berlaku. Buka /start lalu coba lagi.');
}
async function handlePendingInput(message,text){const key=String(message.from.id);const pending=pendingInput.get(key);if(!pending)return false;pendingInput.delete(key);if(pending.type==='fresh_accounts'){const cart=carts.get(key);if(!cart||cart.kind!=='fresh'){await sendMessage(message.chat.id,'Pilihan produk fresh sudah kedaluwarsa.');return true;}const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),accounts=[];for(const line of lines){const m=line.split(/[|;]/);if(m.length<2||!m[0].includes('@')||!m[1].trim())continue;accounts.push({email:m[0].trim(),password:m.slice(1).join('|').trim()});}if(!accounts.length){pendingInput.set(key,{type:'fresh_accounts'});await sendMessage(message.chat.id,'⚠️ Format akun belum terbaca. Gunakan satu akun per baris: <code>email|password</code>.');return true;}if(accounts.length>Math.max(1,Number(cart.fresh_product?.qty_max||20))){pendingInput.set(key,{type:'fresh_accounts'});await sendMessage(message.chat.id,`⚠️ Maksimal ${Math.max(1,Number(cart.fresh_product?.qty_max||20))} akun untuk produk ini.`);return true;}try{const result=await jaspay.checkAccounts({product:cart.fresh_product_key,accounts});if(String(result.status)==='checking'||result._http_status===202){cart.fresh_check_id=String(result.check_id||'');await sendMessage(message.chat.id,`⏳ <b>AKUN SEDANG DIPERIKSA</b>\nBot sedang memeriksa <b>${accounts.length}</b> akun. Hasil akan dikirim otomatis setelah selesai.`);void pollFreshAccountCheck(message.from.id,message.chat.id,cart.fresh_check_id);return true;}await applyFreshAccountCheck(message.from.id,message.chat.id,result);}catch(e){await sendMessage(message.chat.id,`⚠️ Pemeriksaan akun belum berhasil: ${escapeHtml(e.message)}`);}return true;}if(pending.type==='fresh_account_setting'){
  const cart=carts.get(key);if(!cart||cart.kind!=='fresh'){await sendMessage(message.chat.id,'Pilihan produk fresh sudah kedaluwarsa.');return true;}
  const field=String(pending.field||''),value=String(text||'').trim();
  if(field==='domain'){if(!value||/\s|https?:\/\//i.test(value)){pendingInput.set(key,pending);await sendMessage(message.chat.id,'⚠️ Domain tidak valid. Contoh: <code>ilinkin.store</code>.');return true;}cart.fresh_options.domain=value.replace(/^@/,'').replace(/\/+$/,'');}
  else if(field==='password'){if(value.length<4){pendingInput.set(key,pending);await sendMessage(message.chat.id,'⚠️ Password minimal 4 karakter.');return true;}cart.fresh_options.password=value.slice(0,120);}
  else if(field==='name'){if(!value){pendingInput.set(key,pending);await sendMessage(message.chat.id,'⚠️ Nama tidak boleh kosong.');return true;}cart.fresh_options.name=value.slice(0,80);}
  else if(field==='suffix_digits'){const digits=Math.max(0,Math.min(12,Number(value.replace(/[^0-9]/g,''))||0));cart.fresh_options.suffix_digits=digits;}
  else return true;
  refreshFreshCartPricing(cart);await sendMessage(message.chat.id,freshAccountSummaryText(cart,true),{reply_markup:{inline_keyboard:[[btn('⚙️ Lanjut Setting','freshacctsettings','primary')],[btn('✅ Selesai','freshacctback','success')]]}});return true;
}if(pending.type==='coupon'){const cart=carts.get(key);if(!cart){await sendMessage(message.chat.id,'Keranjang sudah kedaluwarsa.');return true;}const p=db.getProduct(cart.product_id);const v=cart.variant_id?db.getVariant(cart.variant_id):null;const subtotal=(v?.price??p.price)*cart.quantity;const val=db.validateCoupon(text,subtotal,p.id);if(!val.ok){await sendMessage(message.chat.id,`⚠️ ${escapeHtml(val.message)}`);return true;}cart.coupon_code=String(text).trim().toUpperCase();cart.discount=val.discount;await sendMessage(message.chat.id,`✅ Kupon <b>${escapeHtml(cart.coupon_code)}</b> diterapkan. Diskon ${money(val.discount)}.`);return true;}if(pending.type==='redeem'){try{const result=db.redeemByCode(text,message.from.id);if(result.order)await sendOrderReceipt(message.chat.id,result.order);else await sendMessage(message.chat.id,`✅ Redeem berhasil. Saldo bertambah <b>${money(result.value)}</b>.`);}catch(e){await sendMessage(message.chat.id,`❌ ${escapeHtml(e.message)}`);}return true;}if(pending.type==='topup'){const amount=Math.max(0,Number(String(text).replace(/[^0-9]/g,''))),b=topupBounds();if(amount<b.min){await sendMessage(message.chat.id,`Minimal top up <b>${money(b.min)}</b>.`);return true;}if(amount>b.max){await sendMessage(message.chat.id,`Maksimal top up <b>${money(b.max)}</b>.`);return true;}try{const p=await createTopup(message.from.id,amount);await sendPaymentInstructions(message.chat.id,p,'Top Up Saldo');}catch(e){await sendMessage(message.chat.id,`❌ ${escapeHtml(e.message)}`);}return true;}return false;}

function ownerOnly(){return'⛔ Perintah ini khusus owner.';}
async function ownerMenu(chatId){
  const text=`<b>⚙️ OWNER MENU</b>\n`+
    `=======================\n`+
    `/addproduk <i>( Tambah Produk )</i>\n`+
    `/delproduk <i>( Hapus Produk )</i>\n`+
    `/addstok <i>( Tambah Stok Produk )</i>\n`+
    `/editstok <i>( Edit Stok Produk )</i>\n`+
    `/editnama <i>( Edit Nama Produk )</i>\n`+
    `/editkode <i>( Edit Kode Produk )</i>\n`+
    `/editharga <i>( Edit Harga Produk )</i>\n`+
    `/editdeskripsi <i>( Edit Deskripsi Produk )</i>\n`+
    `/editsnk <i>( Edit Syarat & Ketentuan Produk )</i>\n`+
    `/listuser <i>( List User )</i>\n`+
    `/deluser <i>( Delete User )</i>\n`+
    `/bc <i>( Broadcast Teks )</i>\n`+
    `/bcphoto <i>( Broadcast Gambar )</i>\n`+
    `/bcsticker <i>( Broadcast Stiker )</i>\n`+
    `/bcpoll <i>( Broadcast Polling )</i>\n`+
    `/addvoucher <i>( Tambah Voucher Bot )</i>\n`+
    `/editvoucher <i>( Edit Voucher Bot )</i>\n`+
    `/delvoucher <i>( Hapus Voucher Bot )</i>\n`+
    `/rekap <i>( Rekap Bulanan )</i>\n`+
    `/dashboard <i>( Dashboard Owner )</i>\n`+
    `/reseller <i>( Alias Dashboard Owner )</i>\n`+
    `/stats <i>( Statistik Bot )</i>\n`+
    `/maintenance on|off\n`+
    `/lisensi <i>( Status build self-hosted )</i>\n`+
    `=======================\n\n`+
    `<b>Format cepat:</b>\n`+
    `<code>/addproduk Nama|Kode|Harga|Deskripsi|SnK</code>\n`+
    `<code>/addstok Kode|stok1\\nstok2</code>\n`+
    `<code>/editstok Kode|stok1\\nstok2</code>\n`+
    `<code>/addvoucher KODE|semua|POTONGAN|LIMIT</code>\n`+
    `<code>/bc Pesan broadcast</code>`;
  const kb=config.adminDashboardUrl?{inline_keyboard:[[{text:'⚙️ Buka Dashboard Owner',web_app:{url:config.adminDashboardUrl},style:'danger'}]]}:undefined;
  return sendMessage(chatId,text,kb?{reply_markup:kb}:{});
}
async function handleOwnerCommand(message,text,command){
  const from=message.from;const chatId=message.chat.id;if(!isOwner(from.id))return false;
  if(command==='/ownermenu'){await ownerMenu(chatId);return true;}
  if(['/panel','/dashboard','/reseller'].includes(command)){if(!config.adminDashboardUrl)await sendMessage(chatId,'Dashboard URL belum diisi.');else await sendMessage(chatId,'⚙️ <b>Dashboard Owner</b>',{reply_markup:{inline_keyboard:[[{text:'Buka Dashboard',web_app:{url:config.adminDashboardUrl},style:'danger'}]]}});return true;}
  if(command==='/debugowner'){await sendMessage(chatId,`<b>🔧 DEBUG OWNER</b>\nOwner ID: <code>${escapeHtml(config.ownerId||'-')}</code>\nDashboard: <code>${escapeHtml(config.adminDashboardUrl||'-')}</code>\nBot username: <code>${escapeHtml(state.username||config.botUsername||'-')}</code>`);return true;}
  if(['/lisensi','/license','/masaaktif'].includes(command)){await sendMessage(chatId,'✅ <b>SELF-HOSTED BUILD</b>\nBuild ini berjalan lokal di Pterodactyl dan tidak memakai sistem lisensi/rental eksternal.');return true;}
  if(command==='/stats'){const o=db.getOverview();await sendMessage(chatId,`<b>📊 STATISTIK</b>\nUser: <b>${o.users}</b>\nProduk: <b>${o.products}</b>\nStok: <b>${o.total_stock}</b>\nPesanan: <b>${o.orders}</b>\nOmzet: <b>${money(o.revenue)}</b>\nProfit: <b>${money(o.profit)}</b>`);return true;}
  if(command==='/addproduk'){const raw=text.replace(/^\/addproduk(?:@\w+)?\s*/i,'');const[nama,kode,harga,deskripsi,snk]=raw.split('|').map(x=>x?.trim());if(!nama||!kode||!harga){await sendMessage(chatId,'Format: <code>/addproduk Nama|Kode|Harga|Deskripsi|SnK</code>');return true;}try{const p=db.createProduct({name:nama,code:kode,price:Number(harga),description:deskripsi||'',terms:snk||'',active:true});await sendMessage(chatId,`✅ Produk ${escapeHtml(p.name)} dibuat.`);}catch(e){await sendMessage(chatId,`❌ ${escapeHtml(e.message)}`);}return true;}
  if(command==='/delproduk'){const code=text.split(/\s+/).slice(1).join(' ').trim();const p=db.getProduct(code);if(!p){await sendMessage(chatId,'Produk tidak ditemukan.');return true;}db.deleteProduct(p.id);await sendMessage(chatId,'✅ Produk dihapus.');return true;}
  if(command==='/addstok'||command==='/editstok'){const cmd=command.slice(1);const raw=text.replace(new RegExp(`^\\/${cmd}(?:@\\w+)?\\s*`,'i'),'');const sep=raw.indexOf('|');if(sep<1){await sendMessage(chatId,`Format: <code>/${cmd} KODE|stok1\\nstok2</code>`);return true;}const code=raw.slice(0,sep).trim();const stock=raw.slice(sep+1);const p=db.getProduct(code);if(!p){await sendMessage(chatId,'Produk tidak ditemukan.');return true;}try{const r=command==='/addstok'?db.addStock(p.id,null,stock):db.replaceAvailableStock(p.id,null,stock);await sendMessage(chatId,`✅ Stok ${command==='/addstok'?'ditambahkan':'diganti'}. Total ready: ${r.stock}.`);}catch(e){await sendMessage(chatId,`❌ ${escapeHtml(e.message)}`);}return true;}
  const editMap={'/editnama':['name','Format: /editnama KODE|Nama Baru'],'/editkode':['code','Format: /editkode KODE_LAMA|KODE_BARU'],'/editharga':['price','Format: /editharga KODE|HARGA'],'/editdeskripsi':['description','Format: /editdeskripsi KODE|Deskripsi Baru'],'/editsnk':['terms','Format: /editsnk KODE|Syarat & Ketentuan']};
  if(editMap[command]){const raw=text.replace(new RegExp(`^\\/${command.slice(1)}(?:@\\w+)?\\s*`,'i'),'');const sep=raw.indexOf('|');if(sep<1){await sendMessage(chatId,editMap[command][1]);return true;}const code=raw.slice(0,sep).trim();const value=raw.slice(sep+1).trim();const p=db.getProduct(code);if(!p){await sendMessage(chatId,'Produk tidak ditemukan.');return true;}try{const field=editMap[command][0];db.updateProduct(p.id,{[field]:field==='price'?Number(value):value});await sendMessage(chatId,'✅ Produk diperbarui.');}catch(e){await sendMessage(chatId,`❌ ${escapeHtml(e.message)}`);}return true;}
  if(command==='/listuser'){const users=db.listUsers({limit:50});await sendMessage(chatId,`<b>👥 USER TERBARU</b>\n${users.map(u=>`${escapeHtml(u.first_name||u.username||'-')} · <code>${u.telegram_id}</code> · ${money(u.balance_total)}`).join('\n')||'-'}`);return true;}
  if(command==='/deluser'){const id=text.split(/\s+/)[1];if(!id){await sendMessage(chatId,'Format: /deluser ID');return true;}await sendMessage(chatId,db.deleteUser(id)?'✅ User dihapus.':'User tidak ditemukan.');return true;}
  if(command==='/bc'){const body=text.replace(/^\/bc(?:@\w+)?\s*/i,'').trim();if(!body){await sendMessage(chatId,'Format: /bc Pesan broadcast');return true;}const job=startBroadcast({type:'text',message:body});await sendMessage(chatId,`📢 Broadcast dimulai. Job <code>${job.id}</code>.`);return true;}
  if(command==='/bcphoto'){const raw=text.replace(/^\/bcphoto(?:@\w+)?\s*/i,'');const sep=raw.indexOf('|');const media=(sep<0?raw:raw.slice(0,sep)).trim();const caption=sep<0?'':raw.slice(sep+1).trim();if(!media){await sendMessage(chatId,'Format: /bcphoto URL_OR_FILE_ID|Caption');return true;}const job=startBroadcast({type:'photo',media,message:caption});await sendMessage(chatId,`📢 Broadcast foto dimulai. Job <code>${job.id}</code>.`);return true;}
  if(command==='/bcsticker'){const media=text.replace(/^\/bcsticker(?:@\w+)?\s*/i,'').trim();if(!media){await sendMessage(chatId,'Format: /bcsticker FILE_ID');return true;}const job=startBroadcast({type:'sticker',media});await sendMessage(chatId,`📢 Broadcast sticker dimulai. Job <code>${job.id}</code>.`);return true;}
  if(command==='/bcpoll'){const parts=text.replace(/^\/bcpoll(?:@\w+)?\s*/i,'').split('|').map(x=>x.trim()).filter(Boolean);if(parts.length<3){await sendMessage(chatId,'Format: /bcpoll Pertanyaan|Opsi 1|Opsi 2[|Opsi 3...]');return true;}const job=startBroadcast({type:'poll',message:parts[0],options:parts.slice(1,11)});await sendMessage(chatId,`📊 Broadcast polling dimulai. Job <code>${job.id}</code>.`);return true;}
  if(command==='/addvoucher'){const raw=text.replace(/^\/addvoucher(?:@\w+)?\s*/i,'');const[code,target,disc,limit]=raw.split('|').map(x=>x?.trim());if(!code||!disc){await sendMessage(chatId,'Format: /addvoucher KODE|semua|POTONGAN|LIMIT');return true;}try{db.saveCoupon({code,name:code,discount_type:'fixed',discount_value:Number(disc),usage_limit:Number(limit||0),active:true});await sendMessage(chatId,'✅ Voucher dibuat.');}catch(e){await sendMessage(chatId,`❌ ${escapeHtml(e.message)}`);}return true;}
  if(command==='/editvoucher'){const raw=text.replace(/^\/editvoucher(?:@\w+)?\s*/i,'');const[oldCode,newCode,target,disc,limit]=raw.split('|').map(x=>x?.trim());const c=db.listCoupons({search:oldCode,limit:50}).find(x=>x.code===String(oldCode||'').toUpperCase());if(!c||!newCode||!disc){await sendMessage(chatId,'Format: /editvoucher KODE_LAMA|KODE_BARU|semua|POTONGAN|LIMIT');return true;}try{db.saveCoupon({...c,id:c.id,code:newCode,name:newCode,discount_value:Number(disc),usage_limit:Number(limit||0)});await sendMessage(chatId,'✅ Voucher diperbarui.');}catch(e){await sendMessage(chatId,`❌ ${escapeHtml(e.message)}`);}return true;}
  if(command==='/delvoucher'){const code=text.split(/\s+/)[1];const c=db.listCoupons({search:code,limit:20}).find(x=>x.code===String(code||'').toUpperCase());if(!c){await sendMessage(chatId,'Voucher tidak ditemukan.');return true;}db.deleteCoupon(c.id);await sendMessage(chatId,'✅ Voucher dihapus.');return true;}
  if(command==='/rekap'){const r=db.getReports();await sendMessage(chatId,`<b>📈 REKAP ${String(r.month).padStart(2,'0')}/${r.year}</b>\nPesanan: <b>${r.summary.total_orders||0}</b>\nOmzet: <b>${money(r.summary.revenue)}</b>\nProfit: <b>${money(r.summary.profit)}</b>`);return true;}
  if(command==='/maintenance'){const val=text.split(/\s+/)[1];if(!['on','off'].includes(String(val))){await sendMessage(chatId,'Format: /maintenance on|off');return true;}db.saveSettings({bot_enabled:val==='off'});await sendMessage(chatId,`✅ Bot ${val==='off'?'diaktifkan':'dinonaktifkan'} dari maintenance.`);return true;}
  return false;
}

async function handleMessage(message={}){
  const from=message.from||{};if(!from.id)return;const text=String(message.text||message.caption||'').trim();const refCode=text.toLowerCase().startsWith('/start')?startReferralCode(text):'';await touchUser(from,refCode);if(!text)return;
  if(await handlePendingInput(message,text))return;
  const command=text.startsWith('/')?text.split(/\s+/)[0].split('@')[0].toLowerCase():'';
  if(command&&await handleOwnerCommand(message,text,command))return;
  if(command==='/getid'||command==='/id')return sendMessage(message.chat.id,`ID Telegram kamu: <code>${from.id}</code>`);
  if(command==='/start'||command==='/menu'){if(!(await ensureAccess(from,message.chat.id)))return;return sendHome(message.chat.id,from);}
  if(!(await ensureAccess(from,message.chat.id)))return;
  if(command==='/help'||command==='/bantuan')return showHelp(message.chat.id,null,from);
  if(command==='/produk'||command==='/listproduk')return showProducts(message.chat.id,null,0);
  if(command==='/fresh'||command==='/produkfresh')return showFreshProducts(message.chat.id,null,false);
  if(command==='/saldo'||command==='/wallet'||command==='/referral')return showWallet(message.chat.id,from.id);
  if(command==='/riwayat'||command==='/cekorder'||command==='/cekpesanan')return showHistory(message.chat.id,from.id);
  if(command==='/topup'){const s=botSettings();if(!settingEnabled(s.topup_enabled,true))return sendMessage(message.chat.id,'⚠️ Top Up sedang dinonaktifkan.');const b=topupBounds(s);pendingInput.set(String(from.id),{type:'topup'});return sendMessage(message.chat.id,`➕ <b>TOP UP SALDO</b>\n=======================\nKirim nominal top up.\nMinimal: <b>${money(b.min)}</b>\nMaksimal: <b>${money(b.max)}</b>\nContoh: <code>50000</code>.`);}
  if(command==='/redeem'){const code=text.replace(/^\/redeem(?:@\w+)?\s*/i,'').trim();if(!code){pendingInput.set(String(from.id),{type:'redeem'});return sendMessage(message.chat.id,'🎁 <b>REDEEM KODE</b>\n=======================\nMasukkan kode redeem yang kamu dapatkan.\n\nKetik kodenya sekarang atau gunakan format:\n<code>/redeem KODE</code>');}try{const result=db.redeemByCode(code,from.id);if(result.order)return sendOrderReceipt(message.chat.id,result.order);return sendMessage(message.chat.id,`✅ Redeem saldo ${money(result.value)} berhasil.`);}catch(e){return sendMessage(message.chat.id,`❌ ${escapeHtml(e.message)}`);}}
  if(!command){const plain=String(text).trim().toUpperCase().replace(/\s+/g,'');if(/^[A-Z0-9-]{4,64}$/.test(plain)){const found=db.listRedeemCodes({limit:1000,search:plain}).find(x=>x.code===plain);if(found){try{const result=db.redeemByCode(plain,from.id);if(result.order)return sendOrderReceipt(message.chat.id,result.order);return sendMessage(message.chat.id,`✅ Redeem saldo ${money(result.value)} berhasil.`);}catch(e){return sendMessage(message.chat.id,`❌ ${escapeHtml(e.message)}`);}}}}
  return sendMessage(message.chat.id,'Perintah tidak dikenal. Ketik /start untuk membuka menu.');
}
function updateQueueKey(update){return String(update?.message?.chat?.id||update?.callback_query?.message?.chat?.id||update?.callback_query?.from?.id||update?.update_id||'global');}
async function processUpdate(update){try{if(update.message)await handleMessage(update.message);if(update.callback_query)await handleCallback(update.callback_query);state.last_error='';}catch(e){state.last_error=e.message;if(telegramNetworkError(e))console.warn('[telegram:update:network]',e.message);else console.error('[telegram:update]',e);}}
function enqueueUpdate(update){const key=updateQueueKey(update);const prev=chatQueues.get(key)||Promise.resolve();let task;task=prev.catch(()=>null).then(()=>processUpdate(update)).finally(()=>{if(chatQueues.get(key)===task)chatQueues.delete(key);state.in_flight_chats=chatQueues.size;});chatQueues.set(key,task);state.in_flight_chats=chatQueues.size;return task;}
async function pollingLoop(){state.running=true;state.started_at=new Date().toISOString();let failures=0;while(!stopped&&config.botToken){try{const updates=await call('getUpdates',{offset:state.offset,timeout:config.botPollingTimeout,allowed_updates:['message','callback_query']},(config.botPollingTimeout+8)*1000);failures=0;state.last_poll_error='';for(const update of updates||[]){state.offset=Math.max(state.offset,Number(update.update_id||0)+1);state.last_update_at=new Date().toISOString();enqueueUpdate(update);}}catch(e){failures+=1;state.last_poll_error=String(e.message||e);state.last_error=state.last_poll_error;const wait=Math.min(10000,750*Math.pow(2,Math.min(failures-1,4)));console.error('[telegram:poll]',state.last_poll_error,`retry ${wait}ms`);await sleep(wait);}}state.running=false;}
async function start(){if(!config.botToken||state.running)return state;stopped=false;try{const me=await call('getMe');state.username=me.username||state.username;await call('deleteWebhook',{drop_pending_updates:false}).catch(()=>null);}catch(e){state.last_error=e.message;}pollingLoop().catch(e=>{state.last_error=e.message;state.running=false;});return state;}
function stop(){stopped=true;}
function getState(){return{...state,transport:config.telegramForceIpv4?'ipv4-keepalive':'keepalive',request_timeout_ms:config.telegramRequestTimeoutMs,polling_timeout_seconds:config.botPollingTimeout};}

async function runBroadcast(jobId,payload){
  const job=broadcastJobs.get(jobId);let offset=0,total=0,sent=0,failed=0;
  try{
    while(true){
      const users=db.listUsers({limit:500,offset});if(!users.length)break;total+=users.length;
      for(const u of users){
        if(u.status==='blocked')continue;
        try{
          if(payload.type==='photo')await sendPhoto(u.telegram_id,payload.media,payload.message||'');
          else if(payload.type==='sticker')await call('sendSticker',{chat_id:u.telegram_id,sticker:payload.media});
          else if(payload.type==='poll')await call('sendPoll',{chat_id:u.telegram_id,question:String(payload.message||'').slice(0,300),options:(payload.options||[]).slice(0,10).map(x=>({text:String(x).slice(0,100)})),is_anonymous:true});
          else await sendMessage(u.telegram_id,escapeHtml(payload.message));
          sent++;
        }catch(e){failed++;const m=String(e.message||'').toLowerCase();if(m.includes('blocked')||m.includes('chat not found')||m.includes('deactivated'))db.updateUser(u.telegram_id,{status:'blocked'});}
        job.total=total;job.sent=sent;job.failed=failed;await sleep(45);
      }
      offset+=users.length;if(users.length<500)break;
    }
    job.status='completed';job.completed_at=new Date().toISOString();db.addBroadcastLog({type:payload.type,message:payload.message,media:payload.type==='poll'?(payload.options||[]).join(' | '):payload.media,total,sent,failed});
  }catch(e){job.status='failed';job.error=e.message;job.completed_at=new Date().toISOString();}
}
function startBroadcast(payload={}){
  const data=typeof payload==='string'?{type:'text',message:payload}:payload;
  const type=['text','photo','sticker','poll'].includes(String(data.type))?String(data.type):'text';
  if(type==='text'&&!String(data.message||'').trim())throw new Error('Pesan broadcast kosong');
  if(['photo','sticker'].includes(type)&&!String(data.media||'').trim())throw new Error('Media broadcast kosong');
  if(type==='poll'&&(!String(data.message||'').trim()||!Array.isArray(data.options)||data.options.filter(Boolean).length<2))throw new Error('Polling membutuhkan pertanyaan dan minimal 2 opsi');
  const id=`bc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
  const job={id,status:'running',type,total:0,sent:0,failed:0,created_at:new Date().toISOString(),completed_at:null,error:''};
  broadcastJobs.set(id,job);
  runBroadcast(id,{type,message:String(data.message||''),media:String(data.media||''),options:Array.isArray(data.options)?data.options.map(String):[]}).catch(e=>{job.status='failed';job.error=e.message;});
  setTimeout(()=>broadcastJobs.delete(id),6*3600000).unref();return{...job};
}
function getBroadcastJob(id){const j=broadcastJobs.get(String(id||''));return j?{...j}:null;}

module.exports={call,sendMessage,sendPhoto,sendVideo,sendSticker,start,stop,getState,startBroadcast,getBroadcastJob,sweepPayments,sweepFreshOrders,processPaidPayment,createQrisPayment,sendTransactionNotification,escapeHtml,normalizeUrl};
