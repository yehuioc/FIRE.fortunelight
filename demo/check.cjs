/* Verify actual encoded media in Chromium, including seek and end-to-end playback. */
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const work=path.join(__dirname,'.work');
process.env.TEMP=process.env.TMP=process.env.TMPDIR=work;
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const videoFile=path.join(__dirname,'output','Fortune-Light-60s-1080p.mp4');
let browser,server;
async function main(){
  const size=fs.statSync(videoFile).size;
  server=http.createServer((req,res)=>{
    if(req.url!=='/video.mp4'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      return res.end('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#080d15}video{display:block;width:1920px;height:1080px}</style><video id="video" preload="auto" muted src="/video.mp4"></video>');
    }
    let start=0,end=size-1;const range=req.headers.range;
    if(range){const parsed=/bytes=(\d+)-(\d*)/.exec(range);if(parsed){start=Number(parsed[1]);end=parsed[2]?Number(parsed[2]):end;}res.writeHead(206,{'Content-Type':'video/mp4','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1,'Accept-Ranges':'bytes'});}
    else res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':size,'Accept-Ranges':'bytes'});
    fs.createReadStream(videoFile,{start,end}).pipe(res);
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,executablePath:process.env.FORTUNE_BROWSER||chromium.executablePath()});
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
  const properties=await page.evaluate(()=>{const v=document.querySelector('video');return {duration:v.duration,width:v.videoWidth,height:v.videoHeight,error:v.error}});
  assert(Math.abs(properties.duration-60)<.05);assert.equal(properties.width,1920);assert.equal(properties.height,1080);assert.equal(properties.error,null);
  for(const time of [4.8,9.4,16.8,23.2,27.5,31.9,34.5,38.4,41.8,46,49.8,55.4,59.25]){
    await page.evaluate(t=>new Promise(resolve=>{const v=document.querySelector('video');v.addEventListener('seeked',()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)),{once:true});v.currentTime=t}),time);
    await page.screenshot({path:path.join(work,`encoded-${time.toFixed(1)}.png`)});
  }
  await page.evaluate(()=>{const v=document.querySelector('video');v.currentTime=0;v.playbackRate=4;return v.play()});
  await page.waitForFunction(()=>document.querySelector('video').ended,{},{timeout:25000});
  const playback=await page.evaluate(()=>{const v=document.querySelector('video');return {ended:v.ended,time:v.currentTime,error:v.error,audioDecodedBytes:v.webkitAudioDecodedByteCount,quality:v.getVideoPlaybackQuality().totalVideoFrames}});
  assert.equal(playback.ended,true);assert.equal(playback.error,null);
  fs.writeFileSync(path.join(work,'playback-evidence.json'),JSON.stringify({properties,playback},null,2));console.log(JSON.stringify({properties,playback}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close();});
