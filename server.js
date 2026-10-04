require('./lib/env');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config, validateConfig } = require('./lib/config');
const auth = require('./lib/auth');
const db = require('./lib/db');
const telegram = require('./lib/telegram');
const payments = require('./lib/payments');
const suppliers = require('./lib/suppliers');
const jaspay = require('./lib/jaspay');
const media = require('./lib/media');

validateConfig();
db.initDb();

function json(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(body);}
function clientIp(req){return String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();}
function safeEq(a,b){const aa=Buffer.from(String(a||''));const bb=Buffer.from(String(b||''));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
async function body(req,limit=2*1024*1024){return new Promise((resolve,reject)=>{let size=0;const chunks=[];req.on('data',c=>{size+=c.length;if(size>limit){reject(Object.assign(new Error('Payload terlalu besar.'),{statusCode:413}));req.destroy();return;}chunks.push(c);});req.on('end',()=>{if(!chunks.length)return resolve({});const raw=Buffer.concat(chunks).toString('utf8');try{resolve(JSON.parse(raw));}catch{reject(Object.assign(new Error('JSON tidak valid.'),{statusCode:400}));}});req.on('error',reject);});}
function bearer(req){const h=String(req.headers.authorization||'');return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():'';}
function requireProxy(req,res){const got=String(req.headers['x-ilink-proxy-secret']||'');if(!safeEq(got,config.vpsProxySecret)){json(res,403,{ok:false,error:'PROXY_FORBIDDEN',message:'Request harus melalui gateway Vercel.'});return false;}return true;}
function requireSession(req,res){const s=auth.verifySession(bearer(req));if(!s){json(res,401,{ok:false,error:'UNAUTHORIZED',message:'Sesi admin tidak valid atau kedaluwarsa.'});return null;}return s;}
function audit(req,session,action,detail=''){db.addAudit({actor:session?.sub||'admin',action,detail,ip:clientIp(req)});}
const backupUploads=new Map();
const mediaUploads=new Map();
const legacyUploads=new Map();
const legacyReady=new Map();
function cleanupMediaUploads(){const cutoff=Date.now()-30*60*1000;for(const[id,u]of mediaUploads){if(u.created<cutoff){try{fs.unlinkSync(u.part)}catch{}mediaUploads.delete(id);}}}
function cleanupLegacyImports(){const cutoff=Date.now()-60*60*1000;for(const[id,u]of legacyUploads){if(u.created<cutoff){try{fs.unlinkSync(u.part)}catch{}legacyUploads.delete(id);}}for(const[id,u]of legacyReady){if(u.created<cutoff){try{fs.unlinkSync(u.part)}catch{}legacyReady.delete(id);}}}

async function route(req,res){
  const url=new URL(req.url,'http://localhost');const pathname=url.pathname;
  if(req.method==='GET'&&pathname==='/health')return json(res,200,{ok:true,service:'iLink Auto Order VPS',version:'2.6.2',database:'sqlite',bot:telegram.getState().running});
  if(req.method==='GET'&&pathname.startsWith('/media/')){
    if(!requireProxy(req,res))return;
    const file=media.getPublicFile(decodeURIComponent(pathname.slice('/media/'.length)));
    if(!file)return json(res,404,{ok:false,message:'Media tidak ditemukan.'});
    res.writeHead(200,{'content-type':file.mime,'content-length':file.size_bytes,'cache-control':'public, max-age=3600','x-content-type-options':'nosniff'});
    return fs.createReadStream(file.file).pipe(res);
  }
  if(!pathname.startsWith('/api/admin/'))return json(res,404,{ok:false,error:'NOT_FOUND'});
  if(!requireProxy(req,res))return;

  if(req.method==='POST'&&pathname==='/api/admin/auth/login'){
    const input=await body(req);if(!auth.checkCredentials(input.username,input.password)){db.addAudit({actor:String(input.username||'unknown'),action:'login_failed',detail:'',ip:clientIp(req)});return json(res,401,{ok:false,error:'INVALID_CREDENTIALS',message:'Username atau password salah.'});}
    const token=auth.issueSession(String(input.username));db.addAudit({actor:String(input.username),action:'login_success',detail:'',ip:clientIp(req)});return json(res,200,{ok:true,token,expires_in:config.sessionHours*3600});
  }
  const session=requireSession(req,res);if(!session)return;

  if(req.method==='POST'&&pathname==='/api/admin/legacy-import/upload/init'){
    cleanupLegacyImports();const input=await body(req);const size=Number(input.size||0),name=path.basename(String(input.name||'backup.json'));if(size<=0||size>50*1024*1024)return json(res,413,{ok:false,message:'Ukuran backup JSON harus 1 byte sampai 50 MB.'});if(!/\.json$/i.test(name))return json(res,400,{ok:false,message:'File migrasi harus berformat .json'});const id=crypto.randomBytes(12).toString('hex');const part=path.join(config.backupDir,`.legacy-${id}.json.part`);fs.mkdirSync(config.backupDir,{recursive:true});fs.writeFileSync(part,Buffer.alloc(0));legacyUploads.set(id,{name,size,received:0,part,created:Date.now()});return json(res,201,{ok:true,upload_id:id,chunk_bytes:512*1024});
  }
  if(req.method==='POST'&&pathname==='/api/admin/legacy-import/upload/chunk'){
    const input=await body(req,1200*1024),id=String(input.upload_id||''),u=legacyUploads.get(id);if(!u)return json(res,404,{ok:false,message:'Sesi upload JSON tidak ditemukan atau sudah kedaluwarsa.'});const offset=Number(input.offset||0);if(offset!==u.received)return json(res,409,{ok:false,message:`Offset upload tidak sesuai. Server ${u.received}, client ${offset}.`,received:u.received});let chunk;try{chunk=Buffer.from(String(input.data_base64||''),'base64')}catch{return json(res,400,{ok:false,message:'Chunk JSON tidak valid.'})}if(!chunk.length||u.received+chunk.length>u.size)return json(res,400,{ok:false,message:'Ukuran chunk JSON tidak valid.'});fs.appendFileSync(u.part,chunk);u.received+=chunk.length;return json(res,200,{ok:true,received:u.received,total:u.size});
  }
  if(req.method==='POST'&&pathname==='/api/admin/legacy-import/upload/complete'){
    const input=await body(req),id=String(input.upload_id||''),u=legacyUploads.get(id);if(!u)return json(res,404,{ok:false,message:'Sesi upload JSON tidak ditemukan.'});if(u.received!==u.size)return json(res,400,{ok:false,message:`Upload belum lengkap (${u.received}/${u.size}).`});let parsed;try{parsed=JSON.parse(fs.readFileSync(u.part,'utf8'))}catch(e){try{fs.unlinkSync(u.part)}catch{}legacyUploads.delete(id);return json(res,400,{ok:false,message:'Isi file bukan JSON yang valid.'})}const preview=db.analyzeLegacyBackup(parsed,u.name);if(!Object.values(preview.counts||{}).some(x=>Number(x)>0)){try{fs.unlinkSync(u.part)}catch{}legacyUploads.delete(id);return json(res,400,{ok:false,message:'Format backup JSON tidak dikenali atau tidak berisi data yang didukung.'})}legacyUploads.delete(id);legacyReady.set(id,{...u,created:Date.now(),preview});audit(req,session,'legacy_json_preview',`${u.name}:${JSON.stringify(preview.counts)}`);return json(res,200,{ok:true,migration_id:id,preview});
  }
  if(req.method==='POST'&&pathname==='/api/admin/legacy-import/apply'){
    cleanupLegacyImports();const input=await body(req),id=String(input.migration_id||''),u=legacyReady.get(id);if(!u)return json(res,404,{ok:false,message:'Sesi migrasi JSON tidak ditemukan atau sudah kedaluwarsa.'});let parsed;try{parsed=JSON.parse(fs.readFileSync(u.part,'utf8'))}catch{return json(res,400,{ok:false,message:'File migrasi tidak dapat dibaca.'})}const rollback=await db.createBackup('before-json-import');const result=db.importLegacyBackup(parsed,input.options||{},u.name);audit(req,session,'legacy_json_import',`${u.name}:${JSON.stringify(result)}`);legacyReady.delete(id);try{fs.unlinkSync(u.part)}catch{}return json(res,200,{ok:true,result,rollback});
  }
  if(req.method==='POST'&&pathname==='/api/admin/legacy-import/cancel'){
    const input=await body(req),id=String(input.migration_id||input.upload_id||''),u=legacyReady.get(id)||legacyUploads.get(id);if(u){legacyReady.delete(id);legacyUploads.delete(id);try{fs.unlinkSync(u.part)}catch{}}return json(res,200,{ok:true});
  }

  if(req.method==='POST'&&pathname==='/api/admin/media/upload/init'){
    cleanupMediaUploads();const input=await body(req);const size=Number(input.size||0),name=path.basename(String(input.name||'media')),mime=String(input.mime||''),kind=String(input.kind||'media');const max=media.maxUploadBytes(mime,name);if(size<=0||size>max)return json(res,413,{ok:false,message:`Ukuran file harus 1 byte sampai ${Math.round(max/1024/1024)} MB.`});const id=crypto.randomBytes(12).toString('hex');const part=path.join(media.uploadDir,`.upload-${id}.part`);fs.mkdirSync(media.uploadDir,{recursive:true});fs.writeFileSync(part,Buffer.alloc(0));mediaUploads.set(id,{name,mime,kind,size,received:0,part,created:Date.now()});return json(res,201,{ok:true,upload_id:id,max_bytes:max,chunk_bytes:512*1024});
  }
  if(req.method==='POST'&&pathname==='/api/admin/media/upload/chunk'){
    const input=await body(req,1200*1024);const id=String(input.upload_id||''),u=mediaUploads.get(id);if(!u)return json(res,404,{ok:false,message:'Sesi upload media tidak ditemukan atau sudah kedaluwarsa.'});const offset=Number(input.offset||0);if(offset!==u.received)return json(res,409,{ok:false,message:`Offset upload tidak sesuai. Server ${u.received}, client ${offset}.`,received:u.received});let chunk;try{chunk=Buffer.from(String(input.data_base64||''),'base64')}catch{return json(res,400,{ok:false,message:'Chunk media tidak valid.'})}if(!chunk.length||u.received+chunk.length>u.size)return json(res,400,{ok:false,message:'Ukuran chunk media tidak valid.'});fs.appendFileSync(u.part,chunk);u.received+=chunk.length;return json(res,200,{ok:true,received:u.received,total:u.size});
  }
  if(req.method==='POST'&&pathname==='/api/admin/media/upload/complete'){
    const input=await body(req);const id=String(input.upload_id||''),u=mediaUploads.get(id);if(!u)return json(res,404,{ok:false,message:'Sesi upload media tidak ditemukan.'});if(u.received!==u.size)return json(res,400,{ok:false,message:`Upload belum lengkap (${u.received}/${u.size}).`});try{const item=media.saveBuffer({name:u.name,mime:u.mime,buffer:fs.readFileSync(u.part),kind:u.kind});audit(req,session,'media_upload',item.filename);return json(res,201,{ok:true,item});}finally{mediaUploads.delete(id);try{fs.unlinkSync(u.part)}catch{}}
  }
  if(req.method==='POST'&&pathname==='/api/admin/media/upload/cancel'){
    const input=await body(req);const id=String(input.upload_id||''),u=mediaUploads.get(id);if(u){mediaUploads.delete(id);try{fs.unlinkSync(u.part)}catch{}}return json(res,200,{ok:true});
  }
  if(req.method==='POST'&&pathname==='/api/admin/media/upload'){
    const input=await body(req,12*1024*1024);const item=media.saveBase64({name:input.name,mime:input.mime,dataBase64:input.data_base64,kind:input.kind||'media'});audit(req,session,'media_upload',item.filename);return json(res,201,{ok:true,item});
  }
  if(req.method==='DELETE'&&pathname==='/api/admin/media'){
    const key=url.searchParams.get('key')||'';const changed=media.deleteKey(key);audit(req,session,'media_delete',key);return json(res,changed?200:404,{ok:changed});
  }

  if(req.method==='GET'&&pathname==='/api/admin/me'){
    const s=db.getSettings();return json(res,200,{ok:true,user:{username:session.sub,role:'owner',display_name:s.owner_display_name||'Owner',owner_username:s.owner_username||''},dashboard_url:config.adminDashboardUrl,bot:telegram.getState()});
  }
  if(req.method==='GET'&&pathname==='/api/admin/overview'){
    const stats=db.getOverview();const products=db.listProducts({limit:20});const recent=db.listOrders({limit:8});return json(res,200,{ok:true,stats,products,recent_orders:recent,bot:telegram.getState(),settings:db.getSettings()});
  }
  if(req.method==='GET'&&pathname==='/api/admin/dashboard'){
    return json(res,200,{ok:true,data:db.getDashboardSummary(),bot:telegram.getState(),settings:db.getSettings()});
  }
  if(req.method==='GET'&&pathname==='/api/admin/historical-stats'){
    return json(res,200,{ok:true,...db.getSalesCounterStatus()});
  }
  if(req.method==='PATCH'&&pathname==='/api/admin/historical-stats'){
    const input=await body(req);const rollback=await db.createBackup('before-stats-repair');const data=db.setHistoricalStatsBaseline({orders_total:Math.max(0,Number(input.orders_total||0)),quantity_sold:Math.max(0,Number(input.quantity_sold||0)),revenue_total:Math.max(0,Number(input.revenue_total||0)),cost_total:Math.max(0,Number(input.cost_total||0)),profit_total:Number(input.profit_total||0)},{source:'manual-repair'});audit(req,session,'historical_stats_repair',JSON.stringify({orders_total:input.orders_total,quantity_sold:input.quantity_sold,rollback:rollback.name}));return json(res,200,{ok:true,...data,rollback});
  }
  if(req.method==='GET'&&pathname==='/api/admin/system'){
    const s=db.getSettings();return json(res,200,{ok:true,node:process.version,uptime_seconds:Math.floor(process.uptime()),database:{engine:'SQLite',file:path.basename(config.dbFile),size_bytes:fs.existsSync(config.dbFile)?fs.statSync(config.dbFile).size:0,backups:db.listBackups().length},integrations:{telegram:{configured:Boolean(config.botToken),...telegram.getState()},autogopay:{configured:Boolean(config.autogopayApiKey),channel:s.autogopay_payment_method||'gopay'},prodseller:{configured:Boolean(config.prodsellerApiKey)},aiversehub:{configured:Boolean(config.aiverseHubApiKey)},jaspay:{configured:Boolean(config.jaspayApiKey),enabled:Boolean(s.jaspay_enabled)}}});
  }
  if(req.method==='GET'&&pathname==='/api/admin/notifications'){
    const data=db.syncAdminNotifications({bot:telegram.getState()});return json(res,200,{ok:true,...data});
  }
  if(req.method==='POST'&&pathname==='/api/admin/notifications/read'){
    const input=await body(req);const data=db.markAdminNotificationsRead(input.all?[]:(Array.isArray(input.keys)?input.keys:[]));audit(req,session,'notifications_read',input.all?'all':String((input.keys||[]).length));return json(res,200,{ok:true,...data});
  }

  if(pathname==='/api/admin/products'&&req.method==='GET')return json(res,200,{ok:true,items:db.listProducts({limit:url.searchParams.get('limit'),search:url.searchParams.get('search')||'',active:url.searchParams.has('active')?url.searchParams.get('active'):null})});
  if(pathname==='/api/admin/products'&&req.method==='POST'){const input=await body(req);const item=db.createProduct(input);audit(req,session,'product_create',item.code);return json(res,201,{ok:true,item});}
  let m=pathname.match(/^\/api\/admin\/products\/(\d+)$/);
  if(m&&req.method==='PATCH'){const input=await body(req);const item=db.updateProduct(m[1],input);if(!item)return json(res,404,{ok:false,message:'Produk tidak ditemukan.'});audit(req,session,'product_update',item.code);return json(res,200,{ok:true,item});}
  if(m&&req.method==='DELETE'){const old=db.getProduct(m[1]);const changed=db.deleteProduct(m[1]);audit(req,session,'product_delete',old?.code||m[1]);return json(res,changed?200:404,{ok:changed});}
  m=pathname.match(/^\/api\/admin\/products\/(\d+)\/toggle$/);
  if(m&&req.method==='POST'){const input=await body(req);const item=db.toggleProduct(m[1],input.active);audit(req,session,'product_toggle',`${item?.code}:${item?.active}`);return json(res,item?200:404,{ok:Boolean(item),item});}
  m=pathname.match(/^\/api\/admin\/products\/(\d+)\/variants$/);
  if(m&&req.method==='POST'){const item=db.createVariant(m[1],await body(req));audit(req,session,'variant_create',`${m[1]}:${item.variant_key}`);return json(res,201,{ok:true,item});}
  m=pathname.match(/^\/api\/admin\/variants\/(\d+)$/);
  if(m&&req.method==='PATCH'){const item=db.updateVariant(m[1],await body(req));audit(req,session,'variant_update',m[1]);return json(res,item?200:404,{ok:Boolean(item),item});}
  if(m&&req.method==='DELETE'){const changed=db.deleteVariant(m[1]);audit(req,session,'variant_delete',m[1]);return json(res,changed?200:404,{ok:changed});}
  m=pathname.match(/^\/api\/admin\/products\/(\d+)\/stock$/);
  if(m&&req.method==='GET'){const variantId=url.searchParams.get('variant_id');const status=url.searchParams.get('status')||'';return json(res,200,{ok:true,items:db.listStock(m[1],variantId||null,{limit:url.searchParams.get('limit')||2000,status}),count:db.stockCount(m[1],variantId||null)});}
  if(m&&req.method==='POST'){const input=await body(req);const variantId=input.variant_id||null;const result=input.mode==='replace'?db.replaceAvailableStock(m[1],variantId,input.items||input.text||[]):db.addStock(m[1],variantId,input.items||input.text||[]);audit(req,session,'stock_update',`${m[1]}:${variantId||'default'}:${input.mode||'add'}`);return json(res,200,{ok:true,...result});}
  m=pathname.match(/^\/api\/admin\/stock\/(\d+)$/);
  if(m&&req.method==='PATCH'){const input=await body(req);const item=db.updateStockItem(m[1],input.value);audit(req,session,'stock_item_update',m[1]);return json(res,item?200:404,{ok:Boolean(item),item});}
  if(m&&req.method==='DELETE'){const changed=db.deleteStockItem(m[1]);audit(req,session,'stock_item_delete',m[1]);return json(res,changed?200:404,{ok:changed});}

  if(pathname==='/api/admin/orders'&&req.method==='GET')return json(res,200,{ok:true,items:db.listOrders({limit:url.searchParams.get('limit'),offset:url.searchParams.get('offset'),search:url.searchParams.get('search')||'',status:url.searchParams.get('status')||'',month:url.searchParams.get('month')||'',year:url.searchParams.get('year')||''})});
  if(pathname==='/api/admin/orders/manual'&&req.method==='POST'){const item=db.createManualOrder(await body(req));if(['completed','waiting_delivery','supplier_pending'].includes(String(item.status)))telegram.sendTransactionNotification('order',item).catch(()=>null);audit(req,session,'order_manual_create',item.order_ref);return json(res,201,{ok:true,item});}
  if(pathname==='/api/admin/orders'&&req.method==='POST'){const item=db.createOrder(await body(req));audit(req,session,'order_create',item.order_ref);return json(res,201,{ok:true,item});}
  m=pathname.match(/^\/api\/admin\/orders\/(\d+)\/detail$/);
  if(m&&req.method==='GET'){const item=db.getOrderDetail(m[1]);return json(res,item?200:404,{ok:Boolean(item),item});}
  m=pathname.match(/^\/api\/admin\/orders\/(\d+)$/);
  if(m&&req.method==='PATCH'){const item=db.updateOrder(m[1],await body(req));audit(req,session,'order_update',item?.order_ref||m[1]);return json(res,item?200:404,{ok:Boolean(item),item});}
  if(m&&req.method==='DELETE'){const old=db.getOrder(m[1]);const changed=db.deleteOrder(m[1]);audit(req,session,'order_delete',old?.order_ref||m[1]);return json(res,changed?200:404,{ok:changed});}
  m=pathname.match(/^\/api\/admin\/orders\/(\d+)\/fulfill$/);
  if(m&&req.method==='POST'){const input=await body(req);const item=db.fulfillPreorder(m[1],input.delivery_text||'');await telegram.sendMessage(item.telegram_id,`✅ <b>PESANAN PRE-ORDER DIKIRIM</b>\nInvoice: <code>${telegram.escapeHtml(item.order_ref)}</code>\n\n<code>${telegram.escapeHtml(item.delivery_text)}</code>`).catch(()=>null);audit(req,session,'order_fulfill',item.order_ref);return json(res,200,{ok:true,item});}

  if(pathname==='/api/admin/customers'&&req.method==='GET')return json(res,200,{ok:true,items:db.customerSummary({limit:url.searchParams.get('limit'),search:url.searchParams.get('search')||''})});
  if(pathname==='/api/admin/users'&&req.method==='GET')return json(res,200,{ok:true,items:db.listUsers({limit:url.searchParams.get('limit'),offset:url.searchParams.get('offset'),search:url.searchParams.get('search')||'',status:url.searchParams.get('status')||''})});
  m=pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if(m&&req.method==='PATCH'){const id=decodeURIComponent(m[1]);const item=db.updateUser(id,await body(req));audit(req,session,'user_update',id);return json(res,item?200:404,{ok:Boolean(item),item});}
  if(m&&req.method==='DELETE'){const id=decodeURIComponent(m[1]);const changed=db.deleteUser(id);audit(req,session,'user_delete',id);return json(res,changed?200:404,{ok:changed});}
  m=pathname.match(/^\/api\/admin\/users\/([^/]+)\/wallet$/);
  if(m&&req.method==='POST'){const id=decodeURIComponent(m[1]);const input=await body(req);const current=db.getUser(id);if(!current)return json(res,404,{ok:false,message:'User tidak ditemukan.'});const main=Number(input.balance_main??current.balance_main);const ref=Number(input.balance_referral??current.balance_referral);const item=db.updateUser(id,{balance_main:main,balance_referral:ref});db.addAudit({actor:session.sub,action:'wallet_set',detail:`${id}: main=${main}, referral=${ref}`,ip:clientIp(req)});return json(res,200,{ok:true,item});}

  if(pathname==='/api/admin/reports'&&req.method==='GET')return json(res,200,{ok:true,data:db.getReports({type:url.searchParams.get('type')||'monthly',date:url.searchParams.get('date')||'',month:url.searchParams.get('month')||'',year:url.searchParams.get('year')||''})});

  if(pathname==='/api/admin/coupons'&&req.method==='GET')return json(res,200,{ok:true,items:db.listCoupons({limit:url.searchParams.get('limit'),search:url.searchParams.get('search')||''})});
  if(pathname==='/api/admin/coupons'&&req.method==='POST'){const item=db.saveCoupon(await body(req));audit(req,session,'coupon_create',item.code);return json(res,201,{ok:true,item});}
  m=pathname.match(/^\/api\/admin\/coupons\/(\d+)$/);
  if(m&&req.method==='PATCH'){const input=await body(req);input.id=Number(m[1]);const item=db.saveCoupon(input);audit(req,session,'coupon_update',item.code);return json(res,200,{ok:true,item});}
  if(m&&req.method==='DELETE'){const changed=db.deleteCoupon(m[1]);audit(req,session,'coupon_delete',m[1]);return json(res,changed?200:404,{ok:changed});}

  if(pathname==='/api/admin/redeem'&&req.method==='GET')return json(res,200,{ok:true,items:db.listRedeemCodes({limit:url.searchParams.get('limit'),search:url.searchParams.get('search')||''})});
  if(pathname==='/api/admin/redeem'&&req.method==='POST'){const items=db.createRedeemCodes(await body(req));audit(req,session,'redeem_generate',items.map(x=>x.code).join(','));return json(res,201,{ok:true,items});}
  m=pathname.match(/^\/api\/admin\/redeem\/(\d+)$/);
  if(m&&req.method==='PATCH'){const item=db.updateRedeemCode(m[1],await body(req));audit(req,session,'redeem_update',m[1]);return json(res,item?200:404,{ok:Boolean(item),item});}
  if(m&&req.method==='DELETE'){const changed=db.deleteRedeemCode(m[1]);audit(req,session,'redeem_delete',m[1]);return json(res,changed?200:404,{ok:changed});}

  if(pathname==='/api/admin/settings'&&req.method==='GET')return json(res,200,{ok:true,settings:db.getSettings()});
  if(pathname==='/api/admin/settings'&&req.method==='PATCH'){const settings=db.saveSettings(await body(req));audit(req,session,'settings_save','dashboard');return json(res,200,{ok:true,settings});}

  if(pathname==='/api/admin/broadcasts'&&req.method==='GET')return json(res,200,{ok:true,items:db.listBroadcasts({limit:url.searchParams.get('limit')})});
  if(pathname==='/api/admin/broadcast'&&req.method==='POST'){const input=await body(req);const job=telegram.startBroadcast({type:input.type||'text',message:input.message||'',media:input.media||'',options:Array.isArray(input.options)?input.options:String(input.options||'').split('|').map(x=>x.trim()).filter(Boolean)});audit(req,session,'broadcast_start',job.id);return json(res,202,{ok:true,job});}
  if(pathname==='/api/admin/broadcast/status'&&req.method==='GET'){const job=telegram.getBroadcastJob(url.searchParams.get('id'));return json(res,job?200:404,{ok:Boolean(job),job});}
  if(pathname==='/api/admin/bot/send'&&req.method==='POST'){const input=await body(req);await telegram.sendMessage(input.chat_id,input.message||'');audit(req,session,'bot_send',String(input.chat_id||''));return json(res,200,{ok:true});}
  if(pathname==='/api/admin/bot/test-transaction-notification'&&req.method==='POST'){const settings=db.getSettings(),target=String(settings.transaction_channel_id||'').trim();if(!target)return json(res,400,{ok:false,message:'Tujuan notifikasi transaksi belum diisi.'});await telegram.sendMessage(target,'✅ <b>TEST NOTIFIKASI TRANSAKSI</b>\nKoneksi tujuan notifikasi transaksi berhasil.');audit(req,session,'transaction_notification_test',target);return json(res,200,{ok:true,target});}

  if(pathname==='/api/admin/integrations/payment-status'&&req.method==='GET'){try{return json(res,200,{ok:true,data:await payments.methodStatus(url.searchParams.get('channel')||db.getSettings().autogopay_payment_method||'gopay')});}catch(e){return json(res,502,{ok:false,message:e.message});}}
  if(pathname==='/api/admin/integrations/supplier-status'&&req.method==='GET'){const source=String(url.searchParams.get('source')||'');const force=url.searchParams.get('force')==='1';try{return json(res,200,{ok:true,data:await suppliers.status(source,{force})});}catch(e){return json(res,502,{ok:false,message:e.message});}}
  if(pathname==='/api/admin/integrations/supplier-products'&&req.method==='GET'){const source=String(url.searchParams.get('source')||'');const force=url.searchParams.get('force')==='1';try{return json(res,200,{ok:true,items:await suppliers.listProducts(source,{force})});}catch(e){return json(res,502,{ok:false,message:e.message});}}
  if(pathname==='/api/admin/integrations/supplier-product'&&req.method==='GET'){const source=String(url.searchParams.get('source')||''),id=String(url.searchParams.get('id')||'');try{return json(res,200,{ok:true,item:await suppliers.getProduct(source,id,{force:url.searchParams.get('force')==='1'})});}catch(e){return json(res,502,{ok:false,message:e.message});}}
  if(pathname==='/api/admin/integrations/jaspay/status'&&req.method==='GET'){
    try{const data=await jaspay.balance({force:url.searchParams.get('force')==='1'});return json(res,200,{ok:true,configured:jaspay.configured(),enabled:Boolean(db.getSettings().jaspay_enabled),data});}catch(e){return json(res,502,{ok:false,message:e.message});}
  }
  if(pathname==='/api/admin/integrations/jaspay/products'&&req.method==='GET'){
    try{const live=await jaspay.products({force:url.searchParams.get('force')==='1'});for(const item of live.products||[])db.upsertJaspayProductSnapshot({...item,available:true});for(const item of live.unavailable||[])db.upsertJaspayProductSnapshot({...item,available:false});const items=db.listJaspayProducts().map(x=>({...x,sell_price:db.jaspaySellPrice(x,x.api_unit_price)}));return json(res,200,{ok:true,items});}catch(e){return json(res,502,{ok:false,message:e.message});}
  }
  m=pathname.match(/^\/api\/admin\/integrations\/jaspay\/products\/([^/]+)$/);
  if(m&&req.method==='PATCH'){const key=decodeURIComponent(m[1]);const item=db.updateJaspayProduct(key,await body(req));if(!item)return json(res,404,{ok:false,message:'Produk fresh tidak ditemukan. Tekan Refresh Jaspay terlebih dahulu.'});audit(req,session,'jaspay_product_update',key);return json(res,200,{ok:true,item:{...item,sell_price:db.jaspaySellPrice(item,item.api_unit_price)}});}
  if(pathname==='/api/admin/integrations/jaspay/orders'&&req.method==='GET')return json(res,200,{ok:true,items:db.listJaspayOrders(100)});
  m=pathname.match(/^\/api\/admin\/variants\/(\d+)\/supplier-sync$/);
  if(m&&req.method==='POST'){const v=db.getVariant(m[1]);if(!v)return json(res,404,{ok:false,message:'Varian tidak ditemukan.'});if(!v.supplier_source||!v.supplier_product_id)return json(res,400,{ok:false,message:'Varian belum terhubung ke supplier.'});try{const [product,availability]=await Promise.all([suppliers.getProduct(v.supplier_source,v.supplier_product_id,{force:true}),suppliers.availability(v.supplier_source,v.supplier_product_id,{force:true})]);const item=db.updateVariant(v.id,{supplier_price:product.price,supplier_public_price:product.publicPrice,supplier_stock:availability.availableStock,supplier_synced_at:new Date().toISOString()});audit(req,session,'variant_supplier_sync',`${v.id}:${v.supplier_source}:${v.supplier_product_id}`);return json(res,200,{ok:true,item,supplier:{product,availability}});}catch(e){return json(res,502,{ok:false,message:e.message});}}

  if(pathname==='/api/admin/audit'&&req.method==='GET')return json(res,200,{ok:true,items:db.listAudit({limit:url.searchParams.get('limit')})});
  if(pathname==='/api/admin/backups'&&req.method==='GET')return json(res,200,{ok:true,items:db.listBackups(),settings:db.currentBackupSettings()});
  if(pathname==='/api/admin/backups'&&req.method==='POST'){const item=await db.createBackup('manual');audit(req,session,'backup_create',item.name);return json(res,201,{ok:true,item});}
  if(pathname==='/api/admin/backups/upload'&&req.method==='POST'){const input=await body(req,70*1024*1024);if(!input.data_base64)return json(res,400,{ok:false,message:'File backup wajib dipilih.'});let buffer;try{buffer=Buffer.from(String(input.data_base64),'base64');}catch{return json(res,400,{ok:false,message:'File backup tidak valid.'});}if(!buffer.length||buffer.length>50*1024*1024)return json(res,413,{ok:false,message:'Ukuran backup maksimal 50 MB.'});const item=db.importBackupFile(input.name||'backup.sqlite',buffer);audit(req,session,'backup_upload',item.name);return json(res,201,{ok:true,item});}
  if(pathname==='/api/admin/backups/upload/init'&&req.method==='POST'){const input=await body(req);const size=Number(input.size||0);if(size<=0||size>50*1024*1024)return json(res,413,{ok:false,message:'Ukuran backup harus 1 byte sampai 50 MB.'});const id=crypto.randomBytes(12).toString('hex');const part=path.join(config.backupDir,`.upload-${id}.part`);fs.mkdirSync(config.backupDir,{recursive:true});fs.writeFileSync(part,Buffer.alloc(0));backupUploads.set(id,{name:path.basename(String(input.name||'backup.sqlite')),size,received:0,part,created:Date.now()});return json(res,201,{ok:true,upload_id:id});}
  if(pathname==='/api/admin/backups/upload/chunk'&&req.method==='POST'){const input=await body(req,2*1024*1024);const u=backupUploads.get(String(input.upload_id||''));if(!u)return json(res,404,{ok:false,message:'Sesi upload tidak ditemukan.'});const chunk=Buffer.from(String(input.data_base64||''),'base64');if(!chunk.length||u.received+chunk.length>u.size||u.received+chunk.length>50*1024*1024)return json(res,400,{ok:false,message:'Chunk upload tidak valid.'});fs.appendFileSync(u.part,chunk);u.received+=chunk.length;return json(res,200,{ok:true,received:u.received,total:u.size});}
  if(pathname==='/api/admin/backups/upload/complete'&&req.method==='POST'){const input=await body(req);const id=String(input.upload_id||'');const u=backupUploads.get(id);if(!u)return json(res,404,{ok:false,message:'Sesi upload tidak ditemukan.'});if(u.received!==u.size)return json(res,400,{ok:false,message:`Upload belum lengkap (${u.received}/${u.size}).`});try{const item=db.importBackupFile(u.name,fs.readFileSync(u.part));audit(req,session,'backup_upload',item.name);return json(res,201,{ok:true,item});}finally{backupUploads.delete(id);try{fs.unlinkSync(u.part)}catch{}}}
  if(pathname==='/api/admin/backups/restore'&&req.method==='POST'){const input=await body(req);if(String(input.confirm||'')!=='RESTORE')return json(res,400,{ok:false,message:'Konfirmasi restore tidak valid.'});const result=db.restoreBackup(input.name||'');audit(req,session,'backup_restore',result.restored);return json(res,200,{ok:true,...result});}
  if(pathname==='/api/admin/backups/download'&&req.method==='GET'){const file=db.getBackupPath(url.searchParams.get('name')||'');if(!file)return json(res,404,{ok:false,message:'Backup tidak ditemukan.'});const stat=fs.statSync(file);res.writeHead(200,{'content-type':'application/octet-stream','content-length':stat.size,'content-disposition':`attachment; filename="${path.basename(file)}"`,'cache-control':'no-store'});return fs.createReadStream(file).pipe(res);}
  if(pathname==='/api/admin/backups'&&req.method==='DELETE'){const name=url.searchParams.get('name')||'';const changed=db.deleteBackup(name);audit(req,session,'backup_delete',name);return json(res,changed?200:404,{ok:changed});}

  return json(res,404,{ok:false,error:'NOT_FOUND'});
}

const server=http.createServer((req,res)=>route(req,res).catch(error=>{const status=Number(error?.statusCode)||500;console.error('[http]',req.method,req.url,error);if(!res.headersSent)json(res,status,{ok:false,error:status>=500?'INTERNAL_ERROR':error.message,message:status>=500?error.message:error.message});else res.end();}));

server.listen(config.port,config.host,async()=>{
  console.log('================================================');
  console.log(' iLink Auto Order v2.6.2 - Pterodactyl Backend');
  console.log('================================================');
  console.log(`Listen      : http://${config.host}:${config.port}`);
  console.log(`Database    : ${config.dbFile}`);
  console.log(`Bot         : ${config.botToken?'configured (long polling)':'disabled'}`);
  console.log(`AutoGoPay   : ${config.autogopayApiKey?'configured':'disabled'}`);
  console.log(`Jaspay Fresh: ${config.jaspayApiKey?'configured':'disabled'}`);
  {const b=db.currentBackupSettings();console.log(`Backup      : ${b.enabled?`every ${b.intervalHours}h · keep ${b.retention}`:'disabled'}`);}
  console.log('Marketplace : disabled (Telegram Auto Order active)');
  console.log('================================================');
  if(config.botToken)telegram.start().catch(e=>console.error('[telegram:start]',e));
});

let backupRunning=false;
let backupTimer=setInterval(async()=>{
  if(backupRunning)return;
  try{
    const cfg=db.currentBackupSettings();if(!cfg.enabled)return;
    const last=db.listBackups().find(x=>x.name.includes('-auto-'));
    const due=!last||(Date.now()-new Date(last.created_at).getTime()>=cfg.intervalHours*3600000);
    if(!due)return;backupRunning=true;
    const x=await db.createBackup('auto');db.addAudit({actor:'scheduler',action:'backup_auto',detail:x.name});console.log('[backup]',x.name);
  }catch(e){console.error('[backup]',e)}finally{backupRunning=false}
},60000);backupTimer.unref();
let paymentTimer=setInterval(()=>telegram.sweepPayments().catch(e=>console.error('[payment-sweep]',e)),config.paymentPollIntervalSeconds*1000);paymentTimer.unref();
let freshTimer=setInterval(()=>telegram.sweepFreshOrders().catch(e=>console.error('[fresh-sweep]',e)),config.jaspayPollIntervalSeconds*1000);freshTimer.unref();
let supplierTimer=setInterval(async()=>{for(const order of db.listOrders({limit:100,status:'supplier_pending'})){if(!order.supplier_source||!order.supplier_order_id)continue;try{const r=await suppliers.getOrder(order.supplier_source,order.supplier_order_id);if(r.delivered?.length){const item=db.updateOrder(order.id,{status:'completed',delivery_text:r.delivered.join('\n')});await telegram.sendMessage(item.telegram_id,`✅ <b>PRODUK SIAP</b>\nInvoice: <code>${telegram.escapeHtml(item.order_ref)}</code>\n\n<code>${telegram.escapeHtml(item.delivery_text)}</code>`).catch(()=>null);}}catch(e){console.error('[supplier-sweep]',order.order_ref,e.message);}}},60000);supplierTimer.unref();

function shutdown(sig){console.log('[shutdown]',sig);telegram.stop();if(backupTimer)clearInterval(backupTimer);if(paymentTimer)clearInterval(paymentTimer);if(supplierTimer)clearInterval(supplierTimer);if(freshTimer)clearInterval(freshTimer);server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));process.on('unhandledRejection',e=>console.error('[unhandledRejection]',e));process.on('uncaughtException',e=>console.error('[uncaughtException]',e));
