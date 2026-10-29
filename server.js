import http from 'node:http';
import {readFileSync, mkdirSync} from 'node:fs';
import {join, extname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes, scryptSync, timingSafeEqual, createHash} from 'node:crypto';

const PORT=Number(process.env.PORT || 3000);
const DATA_DIR=process.env.DATA_DIR || './data';
mkdirSync(DATA_DIR,{recursive:true});
const db=new DatabaseSync(join(DATA_DIR,'beta.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,passhash TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('personal','comercial')),balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0),UNIQUE(user_id,kind),FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS sessions(tokenhash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS entries(id INTEGER PRIMARY KEY,account_id INTEGER NOT NULL,amount INTEGER NOT NULL,kind TEXT NOT NULL,detail TEXT NOT NULL,reference TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(account_id) REFERENCES accounts(id));
CREATE TABLE IF NOT EXISTS demo_grants(user_id INTEGER PRIMARY KEY,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));`);
const sql={
 user:db.prepare('SELECT id,email,display_name,passhash FROM users WHERE email=?'),
 byid:db.prepare('SELECT id,email,display_name FROM users WHERE id=?'),
 accounts:db.prepare('SELECT id,kind,balance FROM accounts WHERE user_id=? ORDER BY kind DESC'),
 account:db.prepare('SELECT id,balance FROM accounts WHERE user_id=? AND kind=?'),
};
const hashPwd=(p)=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(p,salt,64).toString('hex');};
const checkPwd=(p,h)=>{const [salt,hex]=h.split(':');if(!salt||!hex)return false;const a=Buffer.from(hex,'hex'),b=scryptSync(p,salt,64);return a.length===b.length&&timingSafeEqual(a,b);};
const hashToken=(t)=>createHash('sha256').update(t).digest('hex');
const json=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));};
const fail=(res,status,msg)=>json(res,status,{error:msg});
const limits=new Map();
function limited(ip){const now=Date.now();const rec=limits.get(ip)||{n:0,t:now};if(now-rec.t>60000){rec.t=now;rec.n=0;}rec.n++;limits.set(ip,rec);return rec.n>20;}
const auth=(req)=>{const match=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'');if(!match)return null;const s=db.prepare('SELECT user_id FROM sessions WHERE tokenhash=? AND expires_at>?').get(hashToken(match[1]),Date.now());return s?sql.byid.get(s.user_id):null;};
const createSession=(userId)=>{const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions(tokenhash,user_id,expires_at) VALUES(?,?,?)').run(hashToken(token),userId,Date.now()+7*86400000);return token;};
function tx(fn){db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}}
function entry(account,amount,kind,detail,ref){db.prepare('INSERT INTO entries(account_id,amount,kind,detail,reference) VALUES(?,?,?,?,?)').run(account,amount,kind,detail,ref);}
const types=['personal','comercial'];
const getBody=async req=>{let data='';for await(const chunk of req){data+=chunk.toString();if(data.length>10000)throw Error('Solicitud demasiado grande');}try{return JSON.parse(data||'{}');}catch{throw Error('JSON inválido');}};
const serve=(url,res)=>{const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css'};const filename=files[url];if(!filename)return fail(res,404,'No encontrado');const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[extname(filename)];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'"});res.end(readFileSync(join('public',filename)));};
const handler=async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(req.method==='GET'&&!pathname.startsWith('/api/'))return serve(pathname,res);
 if(pathname==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,mode:'DEMO'});
 if(!pathname.startsWith('/api/')||!['GET','POST'].includes(req.method))return fail(res,404,'No encontrado');
 try{
  if(['/api/register','/api/login'].includes(pathname)&&req.method==='POST'){
   if(limited(req.socket.remoteAddress||'unknown'))return fail(res,429,'Demasiados intentos. Probá más tarde.');
   const body=await getBody(req);const email=String(body.email||'').trim().toLowerCase();const password=String(body.password||'');
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>150)return fail(res,400,'Correo inválido');
   if(pathname==='/api/register'){
    const name=String(body.name||'').trim();if(name.length<2||name.length>80||password.length<10||password.length>128)return fail(res,400,'Nombre (2–80 caracteres) y contraseña (10–128 caracteres) requeridos');
    if(sql.user.get(email))return fail(res,409,'El correo ya está registrado');
    const uid=tx(()=>{const id=Number(db.prepare('INSERT INTO users(email,display_name,passhash) VALUES(?,?,?)').run(email,name,hashPwd(password)).lastInsertRowid);db.prepare('INSERT INTO accounts(user_id,kind) VALUES(?,?)').run(id,'personal');db.prepare('INSERT INTO accounts(user_id,kind) VALUES(?,?)').run(id,'comercial');return id;});
    return json(res,201,{token:createSession(uid)});
   }
   const user=sql.user.get(email);if(!user||!checkPwd(password,user.passhash))return fail(res,401,'Correo o contraseña incorrectos');
   return json(res,200,{token:createSession(user.id)});
  }
  const user=auth(req);if(!user)return fail(res,401,'Iniciá sesión');
  if(pathname==='/api/me'&&req.method==='GET')return json(res,200,{user,accounts:sql.accounts.all(user.id),demo:true});
  if(pathname==='/api/logout'&&req.method==='POST'){
    const t=(req.headers.authorization||'').replace(/^Bearer /,'');db.prepare('DELETE FROM sessions WHERE tokenhash=?').run(hashToken(t));return json(res,200,{ok:true});
  }
  if(pathname==='/api/entries'&&req.method==='GET'){
   const records=db.prepare('SELECT e.amount,e.kind,e.detail,e.reference,e.created_at,a.kind AS account FROM entries e JOIN accounts a ON a.id=e.account_id WHERE a.user_id=? ORDER BY e.id DESC LIMIT 100').all(user.id);
   return json(res,200,{entries:records});
  }
  if(pathname==='/api/demo-credit'&&req.method==='POST'){
   try{tx(()=>{if(db.prepare('SELECT user_id FROM demo_grants WHERE user_id=?').get(user.id))throw Error('Ya recibiste tu única carga de prueba');const account=sql.account.get(user.id,'personal');db.prepare('INSERT INTO demo_grants(user_id) VALUES(?)').run(user.id);db.prepare('UPDATE accounts SET balance=balance+5000000 WHERE id=?').run(account.id);entry(account.id,5000000,'carga de prueba','Saldo ficticio de bienvenida','DEMO-'+user.id);});return json(res,200,{ok:true,amount:5000000});}catch(e){return fail(res,409,e.message);}
  }
  if(pathname==='/api/transfer'&&req.method==='POST'){
   const b=await getBody(req);const from=String(b.from||'');const to=String(b.to||'');const email=String(b.email||'').trim().toLowerCase();const cents=b.cents;
   if(!types.includes(from)||!types.includes(to)||!Number.isSafeInteger(cents)||cents<100||cents>500000000)return fail(res,400,'Datos inválidos. Importe entre $1 y $5.000.000');
   const recipient=sql.user.get(email);if(!recipient)return fail(res,404,'Destinatario no registrado');
   if(recipient.id===user.id&&from===to)return fail(res,400,'Elegí otra sección para mover fondos propios');
   try{tx(()=>{
    const src=sql.account.get(user.id,from),dst=sql.account.get(recipient.id,to);if(src.balance<cents)throw Error('Saldo insuficiente');
    db.prepare('UPDATE accounts SET balance=balance-? WHERE id=?').run(cents,src.id);
    db.prepare('UPDATE accounts SET balance=balance+? WHERE id=?').run(cents,dst.id);
    const ref='SIM-'+randomBytes(7).toString('hex').toUpperCase();
    entry(src.id,-cents,'transferencia enviada',`A ${recipient.display_name} (${email}) · ${to}`,ref);
    entry(dst.id,cents,'transferencia recibida',`De ${user.display_name} (${user.email}) · ${from}`,ref);
   });return json(res,200,{ok:true});}catch(e){return fail(res,409,e.message);}
  }
  return fail(res,404,'Operación no disponible');
 }catch(e){console.error(e);return fail(res,400,e.message||'Error de solicitud');}
};
if(process.env.NODE_ENV!=='test')http.createServer(handler).listen(PORT,'0.0.0.0',()=>console.log(`Soluciones Integrales DEMO en puerto ${PORT}`));
export {handler};
