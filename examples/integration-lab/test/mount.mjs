// Raw canvas lifecycle options have no framework wrapper, so exercise their callbacks directly.
import assert from 'node:assert/strict';
export async function runMountChecks(check,page) {
 const {evaluate,waitFor}=page;
 await check('mount','callbacks, maxPx, morph, poke and disposal',async()=>{
  await evaluate(`(async()=>{
    const {mount}=window.lab;
    window.probe={events:[]};
    const canvas=document.createElement('canvas');canvas.style.cssText='width:80px;height:80px;position:fixed;left:300px;top:100px';document.body.append(canvas);
    const handle=mount(canvas,{name:'lifecycle-one',look:'ink',alive:false,morph:false,maxPx:64,priority:7,
      beforePaint:first=>window.probe.events.push(['before',first]),onPaint:first=>window.probe.events.push(['after',first]),onError:e=>window.probe.error=String(e)});
    Object.assign(window.probe,{canvas,handle});
  })()`);
  await waitFor('window.probe.events.length===2');
  assert.deepEqual(await evaluate('window.probe.events'),[['before',true],['after',true]]);
  assert.equal(await evaluate('window.probe.canvas.width'),64);
  await evaluate("window.probe.handle.update({name:'lifecycle-two',background:'tomato'});window.probe.handle.poke()");
  await waitFor('window.probe.events.length===4');
  assert.deepEqual(await evaluate('window.probe.events.slice(2)'),[['before',false],['after',false]]);
  assert.equal(await evaluate('getComputedStyle(window.probe.canvas).backgroundColor'),'rgb(255, 99, 71)');
  await evaluate("window.probe.handle.update({name:'cancel-before-paint'});window.probe.handle.destroy();window.probe.handle.destroy();window.probe.canvas.remove()");
  await evaluate('new Promise(r=>setTimeout(r,250))');
  assert.equal(await evaluate('window.probe.events.length'),4);
 });
}
