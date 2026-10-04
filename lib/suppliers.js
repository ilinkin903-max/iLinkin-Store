const { config } = require('./config');

const CACHE_MS = 30000;
const cache = {
  prodseller: { statusAt: 0, status: null, productsAt: 0, products: null },
  aiversehub: { statusAt: 0, status: null, productsAt: 0, products: null },
};

function fresh(at){ return Number(at||0)>0 && Date.now()-Number(at)<CACHE_MS; }
function text(v){ return String(v==null?'':v).trim(); }
function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }

async function jsonFetch(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      const err = new Error(data?.message || data?.error || `HTTP ${res.status}`);
      err.statusCode = res.status;
      throw err;
    }
    return data;
  } finally { clearTimeout(timer); }
}

function sourceConfigured(source) {
  if (source === 'prodseller') return Boolean(config.prodsellerApiKey);
  if (source === 'aiversehub') return Boolean(config.aiverseHubApiKey);
  return false;
}

async function prodSeller(path, { method='GET', body, idempotencyKey }={}) {
  if (!config.prodsellerApiKey) throw new Error('PRODSELLER_API_KEY belum diatur.');
  const headers = { 'X-API-Key': config.prodsellerApiKey, 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey).slice(0,100);
  return jsonFetch(`${config.prodsellerBaseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }, 30000);
}
async function aiverse(path, { method='GET', body }={}) {
  if (!config.aiverseHubApiKey) throw new Error('AIVERSEHUB_API_KEY belum diatur.');
  return jsonFetch(`${config.aiverseHubBaseUrl}${path}`, { method, headers: { 'X-API-Key': config.aiverseHubApiKey, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }, 30000);
}

function normalizeProdSellerProduct(item={}) {
  const stock=item.stock==null?null:Math.max(0,Math.floor(num(item.stock)));
  return {
    id:text(item.id||item.productId||item.product_id),
    name:text(item.name||item.title||item.product_name),
    description:text(item.description),
    price:Math.max(0,num(item.price)),
    publicPrice:Math.max(0,num(item.publicPrice??item.public_price)),
    stock,
    inStock:item.inStock!==false&&(stock==null||stock>0),
    imageUrl:text(item.imageUrl||item.image_url),
    priceUnit:'USDT',
    source:'prodseller',
  };
}
function normalizeAiverseProduct(item={}) {
  const stock=item.stock==null?null:Math.max(0,Math.floor(num(item.stock)));
  return {
    id:text(item.service_id||item.id),
    name:text(item.name||item.service),
    description:text(item.description),
    price:Math.max(0,num(item.price)),
    publicPrice:Math.max(0,num(item.public_price??item.publicPrice)),
    stock,
    inStock:item.inStock!==false&&(stock==null||stock>0),
    imageUrl:text(item.image_url||item.imageUrl),
    priceUnit:'API',
    source:'aiversehub',
  };
}

async function status(source,{force=false}={}) {
  if(!['prodseller','aiversehub'].includes(source)) throw new Error('Supplier tidak dikenal.');
  const c=cache[source];
  if(!force&&fresh(c.statusAt)&&c.status)return c.status;
  let value;
  if (source === 'prodseller') {
    const balance = await prodSeller('/balance');
    value={ ok:true, source, balance:Math.max(0,num(balance.balance)), membership:text(balance.membership), account:text(balance.username||balance.name), balanceUnit:'USDT', raw:balance };
  } else {
    const me = await aiverse('/me');
    value={ ok:true, source, balance:Math.max(0,num(me.wallet_balance)), membership:'', account:text(me.first_name||me.username), balanceUnit:'API', chat_id:me.chat_id??null, raw:me };
  }
  c.status=value;c.statusAt=Date.now();return value;
}

async function listProducts(source,{force=false}={}) {
  if(!['prodseller','aiversehub'].includes(source))return[];
  const c=cache[source];
  if(!force&&fresh(c.productsAt)&&Array.isArray(c.products))return c.products;
  let rows=[];
  if (source === 'prodseller') {
    const data = await prodSeller('/products');
    rows=Array.isArray(data.products)?data.products.map(normalizeProdSellerProduct).filter(x=>x.id):[];
  } else {
    const data = await aiverse('/products');
    rows=Array.isArray(data.services)?data.services.map(normalizeAiverseProduct).filter(x=>x.id):[];
  }
  c.products=rows;c.productsAt=Date.now();return rows;
}

async function getProduct(source, productId,{force=false}={}) {
  const id=text(productId);if(!id)throw new Error('ID produk supplier kosong.');
  if(source==='prodseller'){
    const raw=await prodSeller(`/products/${encodeURIComponent(id)}`);
    const row=normalizeProdSellerProduct(raw.product&&typeof raw.product==='object'?raw.product:raw);
    if(!row.id)row.id=id;return row;
  }
  if(source==='aiversehub'){
    const rows=await listProducts('aiversehub',{force});const row=rows.find(x=>String(x.id)===id);
    if(!row)throw new Error('Produk AIVerseHub tidak ditemukan.');return row;
  }
  throw new Error('Supplier tidak dikenal.');
}

async function availability(source, productId,{force=false}={}) {
  const [account, product] = await Promise.all([status(source,{force}), getProduct(source, productId,{force})]);
  const unitPrice=Math.max(0,num(product.price));
  const supplierStock=product.stock==null?null:Math.max(0,Math.floor(num(product.stock)));
  const balanceStock=unitPrice>0?Math.floor(Math.max(0,num(account.balance))/unitPrice):0;
  const availableStock=product.inStock===false||unitPrice<=0?0:(supplierStock==null?balanceStock:Math.min(balanceStock,supplierStock));
  return {source,account,product,unitPrice,supplierStock,balanceStock,availableStock:Math.max(0,availableStock)};
}

async function createOrder(source, { productId, quantity=1, idempotencyKey='' }={}) {
  const qty=Math.max(1,Math.min(100,Number(quantity||1)));
  if(source==='prodseller'){
    const data=await prodSeller('/orders',{method:'POST',body:{productId:String(productId),quantity:qty},idempotencyKey:idempotencyKey||`ilink-${Date.now()}`});
    return {orderId:text(data.orderId||data.id||data.order_id),status:text(data.status||'delivered').toLowerCase(),delivered:Array.isArray(data.deliveredKeys)?data.deliveredKeys.map(String):(data.deliveredKey?[String(data.deliveredKey)]:[]),amount:num(data.amount||data.total),raw:data};
  }
  if(source==='aiversehub'){
    const data=await aiverse('/order',{method:'POST',body:{service_id:String(productId),quantity:qty}});const row=data.order&&typeof data.order==='object'?data.order:data;const delivered=Array.isArray(row.products)?row.products:(Array.isArray(row.delivered_products)?row.delivered_products:[]);
    return {orderId:text(row.order_id||data.order_id),status:text(row.status||(delivered.length?'delivered':'pending')).toLowerCase(),delivered:delivered.map(String),amount:num(row.total_cost||row.amount),raw:data};
  }
  throw new Error('Supplier tidak dikenal.');
}
async function getOrder(source, orderId) {
  const id=text(orderId);
  if(source==='prodseller'){
    const data=await prodSeller(`/orders/${encodeURIComponent(id)}`);return{orderId:id,status:text(data.status).toLowerCase(),delivered:Array.isArray(data.deliveredKeys)?data.deliveredKeys.map(String):(data.deliveredKey?[String(data.deliveredKey)]:[]),raw:data};
  }
  if(source==='aiversehub'){
    const data=await aiverse(`/order/${encodeURIComponent(id)}`);const row=data.order&&typeof data.order==='object'?data.order:data;const delivered=Array.isArray(row.products)?row.products:(Array.isArray(row.delivered_products)?row.delivered_products:[]);return{orderId:id,status:text(row.status||(delivered.length?'delivered':'pending')).toLowerCase(),delivered:delivered.map(String),raw:data};
  }
  throw new Error('Supplier tidak dikenal.');
}
function clearCache(source=''){
  const sources=source?[source]:Object.keys(cache);for(const key of sources){if(cache[key]){cache[key].statusAt=0;cache[key].productsAt=0;cache[key].status=null;cache[key].products=null;}}
}
module.exports={sourceConfigured,status,listProducts,getProduct,availability,createOrder,getOrder,clearCache,normalizeProdSellerProduct,normalizeAiverseProduct};
