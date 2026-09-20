/* Deterministic 1920×1080 / 30 fps renderer. No real-time screen recording drift. */
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const cp=require('node:child_process');
const {once}=require('node:events');
const demo=__dirname,work=path.join(demo,'.work'),output=path.join(demo,'output');
fs.mkdirSync(work,{recursive:true});fs.mkdirSync(output,{recursive:true});
process.env.TEMP=process.env.TMP=process.env.TMPDIR=work;
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const ffmpeg=process.env.FFMPEG||'ffmpeg';
const story=JSON.parse(fs.readFileSync(path.join(demo,'story.json'),'utf8'));
const stillsOnly=process.argv.includes('--stills');
let browser,server,encoder;
async function exec(args){return new Promise((resolve,reject)=>cp.execFile(ffmpeg,args,{windowsHide:true,maxBuffer:5e6},(err,out,stderr)=>err?reject(Error(stderr)):resolve(out)))}
async function prepareFrames(){
  const frames=path.join(work,'frames');fs.mkdirSync(frames,{recursive:true});const media={};
  for(const name of ['income','expense']){
    await exec(['-hide_banner','-loglevel','error','-y','-i',path.join(demo,'assets',name+'.mp4'),'-vf','fps=30','-q:v','2',path.join(frames,name+'-%04d.jpg')]);
    media[name]={frames:fs.readdirSync(frames).filter(f=>f.startsWith(name+'-')&&f.endsWith('.jpg')).length};
  }fs.writeFileSync(path.join(work,'media.json'),JSON.stringify(media));
}
async function main(){
  await prepareFrames();
  server=http.createServer((req,res)=>{
    let file;try{const decoded=decodeURIComponent(new URL(req.url,'http://local').pathname);file=path.resolve(demo,'.'+decoded);if(!file.startsWith(demo+path.sep))throw Error();}catch{res.writeHead(403);return res.end();}
    const type={'.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg'}[path.extname(file)]||'application/octet-stream';
    fs.readFile(file,(err,body)=>{if(err){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':type});res.end(body)});
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,executablePath:process.env.FORTUNE_BROWSER||chromium.executablePath()});
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/stage.html`);await page.evaluate(()=>window.ready);
  const frames=[1.8,4.8,9.4,16.5,20.5,23.2,27.5,31.5,34.5,37.8,41.5,46,49.8,55.4,58.5];
  for(const t of frames){await page.evaluate(t=>window.renderAt(t),t);await page.screenshot({path:path.join(output,`frame-${t.toFixed(1)}.png`)});}
  if(stillsOnly){console.log('STILLS COMPLETE');return;}
  const target=path.join(work,'picture.mp4');
  encoder=cp.spawn(ffmpeg,['-hide_banner','-loglevel','warning','-y','-f','image2pipe','-vcodec','mjpeg','-r',String(story.fps),'-i','pipe:0','-an','-vf','scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p,sidedata=mode=delete','-c:v','libx264','-preset','medium','-crf','17','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-r',String(story.fps),'-frames:v',String(story.duration*story.fps),'-movflags','+faststart',target],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let encoderErrors='';encoder.stderr.on('data',x=>encoderErrors+=x);const finished=new Promise((resolve,reject)=>{encoder.on('error',reject);encoder.on('close',code=>code===0?resolve():reject(Error(encoderErrors)))});
  for(let i=0;i<story.duration*story.fps;i++){
    await page.evaluate(t=>window.renderAt(t),i/story.fps);
    const image=await page.screenshot({type:'jpeg',quality:96});if(!encoder.stdin.write(image))await once(encoder.stdin,'drain');
    if(i%150===0)console.log(`Rendered ${i}/${story.duration*story.fps} frames (${(i/story.fps).toFixed(0)}s)`);
  }encoder.stdin.end();await finished;if(errors.length)throw Error(errors.join('\n'));
  await exec(['-hide_banner','-loglevel','error','-y','-i',target,'-i',path.join(work,'soundtrack.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-metadata','title=Fortune Light · 把钱翻译成时间','-metadata','comment=真实产品界面；合成账本；Windows 本地合成配音与原创合成配乐。','-t','60','-movflags','+faststart',path.join(output,'Fortune-Light-60s-1080p.mp4')]);
  await page.evaluate(()=>window.renderAt(9.4));await page.screenshot({path:path.join(output,'Fortune-Light-cover.png')});
  fs.writeFileSync(path.join(work,'render-evidence.json'),JSON.stringify({frames:1800,fps:30,duration:60,width:1920,height:1080,page_errors:errors},null,2));
  console.log('VIDEO COMPLETE: '+path.join(output,'Fortune-Light-60s-1080p.mp4'));
}
main().catch(e=>{console.error(e.stack);if(encoder)encoder.kill();process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close();});
