const { config } = require('./config');

const CACHE_MS = 15000;
const cache = { productsAt:0, products:null, statusAt:0, status:null };

function text(v){ return String(v==null?'':v).trim(); }
function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function configured(){ return Boolean(config.jaspayApiKey); }

async function request(path,{method='GET',body,idempotencyKey='',timeoutMs=20000,retries=0}={}){
  if(!configured()) throw new Error('JASPAY_API_KEY belum diatur.');
  const url=`${config.jaspayBaseUrl}${path}`;
  let attempt=0;
  while(true){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const headers={Authorization:`Bearer ${config.jaspayApiKey}`,Accept:'application/json'};
      if(method!=='GET')headers['Content-Type']='application/json';
      if(idempotencyKey)headers['Idempotency-Key']=String(idempotencyKey).slice(0,160);
      const res=await fetch(url,{method,headers,body:body==null?undefined:JSON.stringify(body),signal:controller.signal});
      const data=await res.json().catch(()=>({}));
      if(res.ok)return {data,status:res.status,headers:res.headers};
      const err=new Error(data?.error||data?.message||`HTTP ${res.status}`);
      err.statusCode=res.status;err.code=data?.code||'';err.response=data;err.retryAfter=Math.max(0,Number(res.headers.get('retry-after')||0));
      const retryable=[429,500,502,503,504].includes(res.status);
      if(retryable&&attempt<retries){attempt++;await sleep(Math.min(15000,(err.retryAfter?err.retryAfter*1000:700*attempt)));continue;}
      throw err;
    }catch(e){
      const retryable=e?.name==='AbortError'||['ECONNRESET','ETIMEDOUT','EAI_AGAIN','ENETUNREACH'].includes(e?.cause?.code||e?.code);
      if(retryable&&attempt<retries){attempt++;await sleep(Math.min(8000,600*attempt));continue;}
      if(e?.name==='AbortError'){const err=new Error('Jaspay timeout');err.code='ETIMEDOUT';throw err;}
      throw e;
    }finally{clearTimeout(timer);}
  }
}

function safeJson(value,depth=0){
  if(depth>8)return null;
  if(value==null||typeof value==='string'||typeof value==='number'||typeof value==='boolean')return value;
  if(Array.isArray(value))return value.slice(0,200).map(v=>safeJson(v,depth+1));
  if(typeof value==='object'){
    const out={};
    for(const [k,v] of Object.entries(value).slice(0,200))out[String(k).slice(0,120)]=safeJson(v,depth+1);
    return out;
  }
  return String(value);
}
function normalizeOptions(options){
  if(!options||typeof options!=='object'||Array.isArray(options))return{};
  // Preserve all option metadata from /v1/products, including pricing maps such as
  // duration.harga_per_mode and auto_renew_duration.harga_per_akun. Older builds
  // kept only `pilihan`/`bawaan`, which made mode-specific expected_total wrong.
  return safeJson(options)||{};
}
function flattenNumericLeaves(value,path=[],out=[]){
  if(typeof value==='number'&&Number.isFinite(value)){out.push({path:path.map(String),value:Number(value)});return out;}
  if(value&&typeof value==='object')for(const [k,v] of Object.entries(value))flattenNumericLeaves(v,[...path,String(k)],out);
  return out;
}
function selectionValues(selections={}){return new Set(Object.values(selections||{}).filter(v=>v!==undefined&&v!==null&&v!=='').map(v=>String(v).toLowerCase()));}
function priceFromMap(map,selections={},preferred=''){
  if(!map||typeof map!=='object')return null;
  const values=selectionValues(selections),pref=String(preferred||'').toLowerCase();
  let best=null;
  for(const leaf of flattenNumericLeaves(map)){
    const tokens=leaf.path.map(x=>x.toLowerCase());
    let score=0;
    for(const t of tokens)if(values.has(t))score+=3;
    if(pref&&tokens.includes(pref))score+=5;
    // Numeric duration keys should match numeric selections as strings.
    if(!best||score>best.score)best={score,value:leaf.value};
  }
  return best&&best.score>0?best.value:null;
}
function conditionMatches(rule,selections={}){
  const raw=text(rule);
  if(!raw)return true;
  const m=raw.match(/^([a-z0-9_]+)\s*:\s*(.+)$/i);
  if(!m)return true;
  const key=m[1],expected=m[2].trim().replace(/^[\"']|[\"']$/g,'').toLowerCase();
  const actual=selections[key];
  if(expected==='true'||expected==='false'){
    const bool=actual===true||String(actual).toLowerCase()==='true'||String(actual)==='1';
    return String(bool)===expected;
  }
  return String(actual??'').toLowerCase()===expected;
}
function resolveUnitPrice(product={},selections={}){
  let price=Math.max(0,num(product.unit_price));
  const options=product.options||{};
  for(const [optionKey,cfg] of Object.entries(options)){
    if(!cfg||typeof cfg!=='object'||!conditionMatches(cfg.hanya_dengan,selections))continue;
    for(const [field,map] of Object.entries(cfg)){
      if(!field.startsWith('harga_per_')||field==='harga_per_akun')continue;
      const preferred=field.slice('harga_per_'.length);
      const found=priceFromMap(map,selections,selections[preferred]??selections[optionKey]??'');
      if(found!=null&&found>0)price=found;
    }
  }
  return Math.max(0,num(price));
}
function resolveAdditionalUnitPrice(product={},selections={}){
  let extra=0;
  const options=product.options||{};
  for(const [optionKey,cfg] of Object.entries(options)){
    if(!cfg||typeof cfg!=='object'||!conditionMatches(cfg.hanya_dengan,selections))continue;
    const map=cfg.harga_per_akun;
    if(!map||typeof map!=='object')continue;
    let selected=selections[optionKey];
    if((selected===undefined||selected===null||selected==='')&&typeof cfg.bawaan==='string'){
      const same=cfg.bawaan.match(/^sama dengan\s+([a-z0-9_]+)$/i);
      if(same)selected=selections[same[1]];
    }
    const found=priceFromMap(map,{...selections,[optionKey]:selected},selected??'');
    if(found!=null&&found>0)extra+=found;
  }
  return Math.max(0,num(extra));
}
function resolveEffectiveUnitPrice(product={},selections={}){
  return Math.max(0,resolveUnitPrice(product,selections)+resolveAdditionalUnitPrice(product,selections));
}
function resolveExpectedTotal(product={},selections={},qty=1){
  return Math.max(0,resolveEffectiveUnitPrice(product,selections)*Math.max(1,Math.floor(num(qty)||1)));
}
function priceMismatch(error){
  if(Number(error?.statusCode||0)!==409)return null;
  const response=error?.response||{},msg=String(response?.error||response?.message||error?.message||'');
  if(!/(harga|expected[_ ]?total|total sebenarnya|price)/i.test(msg))return null;
  const direct=num(response.actual_total||response.total_sebenarnya||response.current_total||response.total_price||0);
  const exact=msg.match(/total\s+sebenarnya\s*(?:rp\s*)?([0-9][0-9.,]*)/i)||msg.match(/(?:harga|total)[^0-9]{0,30}(?:rp\s*)?([0-9][0-9.,]*)/i);
  const parsed=exact?Number(String(exact[1]).replace(/\./g,'').replace(',','.')):0;
  const nums=[...msg.matchAll(/(?:rp\s*)?([0-9][0-9.,]*)/gi)].map(m=>Number(String(m[1]).replace(/\./g,'').replace(',','.'))).filter(Number.isFinite);
  return {message:msg,actualTotal:Math.max(0,direct||parsed||(nums.length?nums[0]:0))};
}
function normalizeProduct(item={},available=true){return{
  key:text(item.key||item.product),name:text(item.name||item.key||item.product),unit_price:item.unit_price==null?null:Math.max(0,num(item.unit_price)),qty_max:item.qty_max==null?null:Math.max(1,Math.floor(num(item.qty_max)||1)),options:item.options==null?null:normalizeOptions(item.options),available:Boolean(available),code:text(item.code),message:text(item.message)
};}

async function products({force=false}={}){
  if(!force&&cache.products&&Date.now()-cache.productsAt<CACHE_MS)return cache.products;
  const {data}=await request('/products',{retries:1});
  const available=Array.isArray(data.products)?data.products.map(x=>normalizeProduct(x,true)):[];
  const unavailable=Array.isArray(data.unavailable)?data.unavailable.map(x=>normalizeProduct(x,false)):[];
  const result={products:available,unavailable};cache.products=result;cache.productsAt=Date.now();return result;
}
async function balance({force=false}={}){
  if(!force&&cache.status&&Date.now()-cache.statusAt<CACHE_MS)return cache.status;
  const [{data:b},q]=await Promise.all([request('/balance',{retries:1}),request('/queue',{retries:0}).catch(e=>({data:{queue_error:e.message}}))]);
  const result={balance:num(b.balance),daily_limit:num(b.daily_limit),daily_spent:num(b.daily_spent),daily_remaining:num(b.daily_remaining),orders_running:num(b.orders_running),orders_last_hour:num(b.orders_last_hour),queue:{in_use:num(q.data?.in_use),max:num(q.data?.max),waiting:num(q.data?.waiting),error:text(q.data?.queue_error)}};
  cache.status=result;cache.statusAt=Date.now();return result;
}
async function createOrder({product,qty=1,options={},idempotencyKey,expectedTotal}={}){
  const payload={product:text(product),qty:Math.max(1,Math.floor(num(qty)||1))};
  if(options&&Object.keys(options).length)payload.options=options;
  if(expectedTotal!=null)payload.expected_total=Math.max(0,num(expectedTotal));
  const {data}=await request('/orders',{method:'POST',body:payload,idempotencyKey,retries:2,timeoutMs:30000});return data;
}
async function getOrder(id){const {data}=await request(`/orders/${encodeURIComponent(text(id))}`,{retries:1});return data;}
async function checkAccounts({product,accounts=[]}={}){const {data,status}=await request('/accounts/check',{method:'POST',body:{product:text(product),accounts:Array.isArray(accounts)?accounts:[]},retries:1,timeoutMs:30000});return {...data,_http_status:status};}
async function getAccountCheck(id){const {data}=await request(`/accounts/check/${encodeURIComponent(text(id))}`,{retries:1,timeoutMs:30000});return data;}
function clearCache(){cache.productsAt=0;cache.products=null;cache.statusAt=0;cache.status=null;}

module.exports={configured,products,balance,createOrder,getOrder,checkAccounts,getAccountCheck,clearCache,normalizeOptions,normalizeProduct,resolveUnitPrice,resolveAdditionalUnitPrice,resolveEffectiveUnitPrice,resolveExpectedTotal,priceMismatch};
