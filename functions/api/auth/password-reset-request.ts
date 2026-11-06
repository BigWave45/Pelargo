import { Env, json } from "../../_lib/intents";
import { sha256Hex } from "../../_lib/database";
import { consumeAuthAttempt } from "../../_lib/auth-rate-limit";
import { sameOriginMutation } from "../../_lib/merchant-auth";
const PROVIDER="https://www.usetidepool.tech";
const MESSAGE="If an account matches that email, a reset link has been generated. Check the Cloudflare Preview logs for the one-time link.";
function enabled(request:Request,env:Env){try{const host=new URL(request.url).hostname;return env.INTENTS_API_BASE_URL===PROVIDER&&env.ALLOW_TESTNET_DEPOSITS==="true"&&(host.endsWith(".pages.dev")||host==="localhost")}catch{return false}}
export async function onRequest({request,env}:{request:Request;env:Env}):Promise<Response>{
 if(request.method!=="POST")return json({error:"Method not allowed"},405);
 if(!sameOriginMutation(request))return json({error:"Cross-origin request rejected"},403);
 if(!enabled(request,env))return json({error:"Preview-only password recovery is disabled"},404);
 if(!env.DB)return json({error:"Password recovery unavailable"},503);
 let body:Record<string,unknown>;try{body=await request.json() as Record<string,unknown>}catch{return json({error:"Invalid JSON body"},400)}
 const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
 if(!email||email.length>254)return json({message:MESSAGE});
 if(!(await consumeAuthAttempt(request,env,"password-reset",email,3,900)))return json({error:"Too many recovery attempts. Try again in 15 minutes."},429);
 const account=await env.DB.prepare("SELECT merchant_id FROM merchant_accounts WHERE email=? COLLATE NOCASE").bind(email).first<{merchant_id:string}>();
 if(account){
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
  const hash=await sha256Hex(token),now=new Date(),created=now.toISOString(),expires=new Date(now.getTime()+1800000).toISOString();
  await env.DB.batch([
   env.DB.prepare("DELETE FROM password_reset_tokens WHERE merchant_id=? AND used_at IS NULL").bind(account.merchant_id),
   env.DB.prepare("INSERT INTO password_reset_tokens(token_hash,merchant_id,created_at,expires_at) VALUES(?,?,?,?)").bind(hash,account.merchant_id,created,expires)
  ]);
  const url=new URL(request.url);url.search="";url.searchParams.set("password-reset",token);
  console.warn("[preview-password-reset] one-time link; expires in 30 minutes",url.toString());
 }
 return json({message:MESSAGE});
}
