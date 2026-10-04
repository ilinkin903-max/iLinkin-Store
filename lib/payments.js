const { config } = require('./config');

function text(v){return String(v==null?'':v).trim();}
function normalizeStatus(v){const s=text(v).toLowerCase();if(['settlement','completed','complete','paid','success','successful'].includes(s))return'completed';if(['expire','expired'].includes(s))return'expired';if(['cancel','cancelled','canceled'].includes(s))return'canceled';if(['failed','failure','deny','denied'].includes(s))return'failed';return s||'pending';}
function headers(){if(!config.autogopayApiKey)throw new Error('AUTOGOPAY_API_KEY belum diatur.');return{Authorization:`Bearer ${config.autogopayApiKey}`,'Content-Type':'application/json'};}
async function req(path,{method='GET',body,query}={}){const url=new URL(`${config.autogopayBaseUrl}${path}`);for(const[k,v]of Object.entries(query||{}))if(v!=null)url.searchParams.set(k,String(v));const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);try{const res=await fetch(url,{method,headers:headers(),body:body?JSON.stringify(body):undefined,signal:controller.signal});const data=await res.json().catch(()=>({}));if(!res.ok||data?.success===false)throw new Error(data?.message||data?.error||`AutoGoPay HTTP ${res.status}`);return data;}finally{clearTimeout(timer)}}
function parseExpiry(v,minutes=15){if(!v)return new Date(Date.now()+minutes*60000).toISOString();const s=text(v);const d=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(s)?new Date(s.replace(' ','T')+'+07:00'):new Date(s);return Number.isNaN(d.getTime())?new Date(Date.now()+minutes*60000).toISOString():d.toISOString();}

async function create(amount,channel='gopay'){
  const total=Math.max(1,Math.min(10000000,Number(amount||0)));
  const selected=String(channel||'gopay').toLowerCase().includes('shopee')?'shopeepay':'gopay';
  if(selected==='shopeepay'){
    const data=await req('/shopeepay/qris/create',{method:'POST',body:{amount:total}});const row=data.data&&typeof data.data==='object'?data.data:data;const orderSn=text(row.order_sn||row.orderSn||data.order_sn);const qr=text(row.qr_string||data.qr_string);if(!orderSn||!qr)throw new Error('Response ShopeePay tidak lengkap.');return{provider:'autogopay',channel:'shopeepay',transaction_id:orderSn,provider_reference:orderSn,amount:Number(row.amount||total),status:'pending',qr_string:qr,qr_url:text(row.qr_url||data.qr_url),expires_at:parseExpiry(row.expiry_time||row.expires_at),raw:data};
  }
  const data=await req('/qris/generate',{method:'POST',body:{amount:total}});const root=data.data&&typeof data.data==='object'?data.data:data;const trx=root.transaction&&typeof root.transaction==='object'?root.transaction:root;const id=text(trx.transaction_id||trx.transactionId||trx.id||data.transaction_id);const qr=text(trx.qr_string||data.qr_string);if(!id||!qr)throw new Error('Response AutoGoPay GoPay tidak lengkap.');return{provider:'autogopay',channel:'gopay',transaction_id:id,provider_reference:text(trx.order_id||trx.orderId||trx.reference||''),amount:Number(trx.amount||total),status:normalizeStatus(trx.transaction_status||trx.status),qr_string:qr,qr_url:text(trx.qr_url||data.qr_url),expires_at:parseExpiry(trx.expiry_time||trx.expires_at),raw:data};
}

async function verify(payment){
  const channel=String(payment.channel||'gopay').toLowerCase();
  if(channel==='shopeepay'){
    const data=await req('/shopeepay/qris/status',{query:{order_sn:payment.transaction_id}});const root=data.data&&typeof data.data==='object'?data.data:data;const row=root.transaction&&typeof root.transaction==='object'?root.transaction:root;const paid=row.paid===true||String(row.paid).toLowerCase()==='true'||Number(row.order_status)===1;return{status:paid?'completed':normalizeStatus(row.status||(Number(row.order_status)===2?'pending':'')),amount:Number(row.amount||payment.amount||0),transaction_id:text(row.order_sn||payment.transaction_id),provider_reference:text(row.order_sn||payment.provider_reference),raw:data};
  }
  const data=await req('/qris/status',{method:'POST',body:{transaction_id:payment.transaction_id}});const root=data.data&&typeof data.data==='object'?data.data:data;const row=root.transaction&&typeof root.transaction==='object'?root.transaction:root;return{status:normalizeStatus(row.transaction_status||row.status||row.payment_status||row.state),amount:Number(row.amount||payment.amount||0),transaction_id:text(row.transaction_id||payment.transaction_id),provider_reference:text(row.order_id||row.reference||payment.provider_reference),raw:data};
}

async function methodStatus(channel='gopay'){
  const mode=String(channel||'gopay').toLowerCase();
  if(mode==='auto_rotate'){
    if(!config.autogopayApiKey)return{ok:false,configured:false,channel:'auto_rotate',message:'AUTOGOPAY_API_KEY belum diisi.',channels:[]};
    const [gopay,shopeepay]=await Promise.all([methodStatus('gopay').catch(e=>({ok:false,configured:true,channel:'gopay',message:e.message})),methodStatus('shopeepay').catch(e=>({ok:false,configured:true,channel:'shopeepay',message:e.message}))]);
    return{ok:Boolean(gopay.ok||shopeepay.ok),configured:true,channel:'auto_rotate',message:`Auto Rotating · GoPay ${gopay.ok?'siap':'offline'} · ShopeePay ${shopeepay.ok?'siap':'offline'}`,channels:[gopay,shopeepay]};
  }
  const selected=mode.includes('shopee')?'shopeepay':'gopay';
  if(!config.autogopayApiKey)return{ok:false,configured:false,channel:selected,message:'AUTOGOPAY_API_KEY belum diisi.'};
  if(selected==='shopeepay'){
    const data=await req('/shopeepay/status');const row=data.data&&typeof data.data==='object'?data.data:data;const connected=row.connected===true||String(row.connected).toLowerCase()==='true';const tokenValid=row.token_valid===true||String(row.token_valid).toLowerCase()==='true';return{ok:connected&&tokenValid,configured:true,channel:selected,connected,token_valid:tokenValid,store_id:text(row.store_id),message:connected&&tokenValid?'ShopeePay siap.':'ShopeePay belum siap.'};
  }
  try{await req('/transactions',{method:'POST'});return{ok:true,configured:true,channel:selected,message:'AutoGoPay GoPay dapat diakses.'};}catch(e){return{ok:false,configured:true,channel:selected,message:e.message};}
}

module.exports={create,verify,methodStatus,normalizeStatus};
