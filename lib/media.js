const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {config}=require('./config');

const uploadDir=path.join(config.dataDir,'uploads');
fs.mkdirSync(uploadDir,{recursive:true});

const MIME_EXT={
  'image/jpeg':'.jpg','image/jpg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif',
  'video/mp4':'.mp4','video/webm':'.webm'
};
const EXT_MIME={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.webm':'video/webm'};
const IMAGE_MAX=8*1024*1024;
const VIDEO_MAX=40*1024*1024;
function safeName(v){return path.basename(String(v||'')).replace(/[^a-zA-Z0-9._-]/g,'_');}
function extFor(name,mime){const fromMime=MIME_EXT[String(mime||'').toLowerCase()];if(fromMime)return fromMime;const ext=path.extname(safeName(name)).toLowerCase();return EXT_MIME[ext]?ext:'';}
function normalizedMime(name,mime){const raw=String(mime||'').toLowerCase();if(MIME_EXT[raw])return raw;return EXT_MIME[path.extname(safeName(name)).toLowerCase()]||'';}
function maxUploadBytes(mime,name=''){const m=normalizedMime(name,mime);return m.startsWith('video/')?VIDEO_MAX:IMAGE_MAX;}
function mediaKey(filename){return `vps://${filename}`;}
function parseKey(value){const raw=String(value||'').trim();if(raw.startsWith('vps://'))return safeName(raw.slice(6));return'';}
function resolveKey(value){const name=parseKey(value);if(!name)return null;const file=path.join(uploadDir,name);if(!file.startsWith(uploadDir+path.sep)||!fs.existsSync(file))return null;return file;}
function contentType(file){return EXT_MIME[path.extname(file).toLowerCase()]||'application/octet-stream';}
function saveBuffer({name,mime,buffer,kind='media'}={}){
  const ext=extFor(name,mime);if(!ext)throw Object.assign(new Error('Format file tidak didukung. Gunakan JPG, PNG, WEBP, GIF, MP4, atau WEBM.'),{statusCode:400});
  if(!Buffer.isBuffer(buffer)||!buffer.length)throw Object.assign(new Error('File kosong.'),{statusCode:400});
  const limit=maxUploadBytes(mime,name);if(buffer.length>limit)throw Object.assign(new Error(`Ukuran file maksimal ${Math.round(limit/1024/1024)} MB.`),{statusCode:413});
  const prefix=safeName(kind||'media').replace(/\.+/g,'').slice(0,30)||'media';
  const filename=`${prefix}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`;
  const target=path.join(uploadDir,filename);fs.writeFileSync(target,buffer);
  return{key:mediaKey(filename),filename,size_bytes:buffer.length,mime:contentType(target)};
}
function saveBase64({name,mime,dataBase64,kind='media'}={}){
  let buffer;try{buffer=Buffer.from(String(dataBase64||''),'base64');}catch{throw Object.assign(new Error('Data file tidak valid.'),{statusCode:400});}
  return saveBuffer({name,mime,buffer,kind});
}
function getPublicFile(name){const safe=safeName(name);if(!safe)return null;const file=path.join(uploadDir,safe);if(!file.startsWith(uploadDir+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return null;return{file,filename:safe,mime:contentType(file),size_bytes:fs.statSync(file).size};}
function deleteKey(value){const file=resolveKey(value);if(!file)return false;try{fs.unlinkSync(file);return true}catch{return false}}
module.exports={uploadDir,mediaKey,parseKey,resolveKey,contentType,saveBuffer,saveBase64,getPublicFile,deleteKey,maxUploadBytes,IMAGE_MAX,VIDEO_MAX};
