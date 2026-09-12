import { mainPrisma, demoPrisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function tickets(restaurantId:number, prisma: typeof mainPrisma){
 return prisma.order.findMany({where:{restaurantId,status:{in:["PENDING","CONFIRMED","PREPARING","READY"]}},include:{table:{select:{id:true,name:true}},items:{where:{status:{not:"CANCELLED"}},include:{menuItem:{select:{id:true,name:true,preparationTime:true}}},orderBy:{createdAt:"asc"}}},orderBy:{createdAt:"asc"}});
}

export async function GET(request: Request){
 const c=await requireRestaurantContext();
 const prisma=c.user?.isDemo?demoPrisma:mainPrisma;
 if(c.errorStatus) return new Response(JSON.stringify({success:false,message:c.errorMessage}),{status:c.errorStatus,headers:{"Content-Type":"application/json"}});
 if(!c.user || !["SUPER_ADMIN","OWNER","MANAGER","CHEF"].includes(c.user.role)) return new Response(JSON.stringify({success:false,message:"Your role cannot access the kitchen display."}),{status:403,headers:{"Content-Type":"application/json"}});
 const encoder=new TextEncoder(); let timer:ReturnType<typeof setInterval>|undefined; let expiryTimer:ReturnType<typeof setTimeout>|undefined; let closed=false;
 const stream=new ReadableStream({
   async start(controller){
     const close=(expired=false)=>{if(closed)return;closed=true;if(timer)clearInterval(timer);if(expiryTimer)clearTimeout(expiryTimer);try{if(expired)controller.enqueue(encoder.encode(`event: demo-expired\ndata: {"code":"DEMO_EXPIRED"}\n\n`));controller.close()}catch{}};
     const active=async()=>{
       if(!c.user!.isDemo) return true;
       const session=await prisma.demoSession.findFirst({where:{id:c.user!.demoSessionId!,status:"ACTIVE",expiresAt:{gt:new Date()}},select:{id:true}});
       return Boolean(session);
     };
     const send=async()=>{ if(closed) return; try{if(!(await active())){close(true);return}const data=await tickets(c.restaurantId!,prisma);if(!closed)controller.enqueue(encoder.encode(`event: tickets\ndata: ${JSON.stringify(data)}\n\n`));}catch{if(!closed)controller.enqueue(encoder.encode(`event: heartbeat\ndata: {}\n\n`));} };
     await send(); timer=setInterval(send,2500);
     if(c.user!.isDemo&&c.user!.demoExpiresAt) expiryTimer=setTimeout(()=>close(true),Math.max(0,c.user!.demoExpiresAt.getTime()-Date.now()));
     request.signal.addEventListener("abort",()=>close(),{once:true});
   },
   cancel(){closed=true;if(timer)clearInterval(timer);if(expiryTimer)clearTimeout(expiryTimer)}
 });
 return new Response(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-cache, no-transform","Connection":"keep-alive","X-Accel-Buffering":"no"}});
}
