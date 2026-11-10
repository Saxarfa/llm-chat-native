// Rasterize the existing vector logo, without generating a different design.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ILYAS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'ios/App/App/Assets.xcassets');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:1024},deviceScaleFactor:1});
  const svg=fs.readFileSync(path.join(root,'css/icons/llm-chat.svg'),'utf8');
  await page.setContent(`<style>html,body{margin:0;background:#151515}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
  const set=path.join(assets,'AppIcon.appiconset');fs.mkdirSync(set,{recursive:true});
  const images=[];
  for(const [idiom,size,scales] of [['iphone',20,[2,3]],['iphone',29,[2,3]],['iphone',40,[2,3]],['iphone',60,[2,3]],['ipad',20,[1,2]],['ipad',29,[1,2]],['ipad',40,[1,2]],['ipad',76,[1,2]],['ipad',83.5,[2]],['ios-marketing',1024,[1]]]){
   for(const scale of scales){
    const pixels=size*scale,filename=`icon-${pixels}.png`;
    await page.setViewportSize({width:pixels,height:pixels});await page.screenshot({path:path.join(set,filename)});
    images.push({idiom,size:`${size}x${size}`,scale:`${scale}x`,filename});
   }
  }
  fs.writeFileSync(path.join(set,'Contents.json'),JSON.stringify({images,info:{version:1,author:'xcode'}},null,2));
  const splash=path.join(assets,'Splash.imageset');fs.mkdirSync(splash,{recursive:true});
  await page.setViewportSize({width:1024,height:1024});
  await page.addStyleTag({content:'body{display:grid;place-items:center;height:100vh}svg{width:160px;height:160px}'});
  await page.screenshot({path:path.join(splash,'splash.png')});
  fs.writeFileSync(path.join(splash,'Contents.json'),JSON.stringify({images:[{idiom:'universal',filename:'splash.png'}],info:{version:1,author:'xcode'}},null,2));
  console.log('Generated iOS icons from existing logo');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
