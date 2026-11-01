// Fetch every page and its linked local assets from a production deployment.
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const base = process.env.BASE_URL || 'https://glorpies.sunrakerr.dev';
const paths=[];
function walk(dir,route='') {for(const item of readdirSync(dir,{withFileTypes:true})) {if(item.isDirectory())walk(join(dir,item.name),route+'/'+item.name);else if(/^page\.(tsx|mdx)$/.test(item.name))paths.push(route||'/')}}
walk('src/app');
const results=[],links=new Set(),assets=new Set();
for(const path of paths) {
 const response=await fetch(new URL(path,base));const html=await response.text();
 assert.equal(response.status,200,path);assert.match(html,/<h1[ >]/,path+' has a heading');assert.match(html,/<title>[^<]+<\/title>/,path+' has a title');
 assert.ok(!html.includes('glorpies.vercel.app'),path+' has no old domain');
 for(const [,url] of html.matchAll(/<a\b[^>]*href="([^"#]+)"/g))if(url.startsWith('/')&&!url.startsWith('//'))links.add(url.replace(/&amp;/g,'&').split('#')[0]);
 for(const [,url] of html.matchAll(/<(?:script|img|link)\b[^>]*(?:src|href)="([^"#]+)"/g))if(url.startsWith('/')&&!url.startsWith('//'))assets.add(url.replace(/&amp;/g,'&'));
 results.push({path,status:response.status,title:html.match(/<title>([^<]+)/)?.[1]});
}
for(const path of new Set([...links,...assets,...readdirSync('public/readme').map(name=>'/readme/'+name)])) {
 const response=await fetch(new URL(path,base));await response.arrayBuffer();assert.equal(response.status,path === '/no-such-photo.jpg' ? 404 : 200,path);
}
assert.equal((await fetch(new URL('/api/face?name=agent-47',base))).status,404,'the docs site does not host image rendering');
const home=await fetch(base).then(r=>r.text());assert.match(home,/data-theme="dark"/);assert.ok(home.includes('https://glorpies.sunrakerr.dev/opengraph-image.png'));
mkdirSync('media/release',{recursive:true});writeFileSync('media/release/site-audit.json',JSON.stringify({base,finishedAt:new Date().toISOString(),pages:results,links:links.size,assets:assets.size},null,2)+'\n');
console.log(`${results.length} pages, ${links.size} local links, ${assets.size} assets and README images passed at ${base}`);
