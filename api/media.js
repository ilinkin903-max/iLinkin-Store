module.exports = async function handler(req,res){
  const backend=String(process.env.PTERODACTYL_BACKEND_URL||'').replace(/\/+$/,'');
  const secret=String(process.env.VPS_PROXY_SECRET||'');
  const name=String(req.query&&req.query.name||'').trim();
  if(!backend||!secret)return res.status(503).json({ok:false,error:'GATEWAY_NOT_CONFIGURED'});
  if(!/^[A-Za-z0-9._-]{1,180}$/.test(name))return res.status(400).json({ok:false,error:'INVALID_MEDIA'});
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const upstream=await fetch(`${backend}/media/${encodeURIComponent(name)}`,{headers:{'x-ilink-proxy-secret':secret},signal:controller.signal});
    if(!upstream.ok)return res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
    res.setHeader('content-type',upstream.headers.get('content-type')||'application/octet-stream');
    res.setHeader('cache-control','public, max-age=3600');
    res.setHeader('x-content-type-options','nosniff');
    return res.status(200).send(Buffer.from(await upstream.arrayBuffer()));
  }catch(e){return res.status(e?.name==='AbortError'?504:502).json({ok:false,error:'MEDIA_BACKEND_UNREACHABLE'});}finally{clearTimeout(timer)}
};
