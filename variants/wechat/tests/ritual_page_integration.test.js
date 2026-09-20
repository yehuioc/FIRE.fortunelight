const assert = require('assert');

global.wx = {
  getStorageSync() { return ''; }, setStorageSync() {}, removeStorageSync() {},
  setNavigationBarColor() {}, getWindowInfo() { return { pixelRatio: 2 }; },
  showToast() {}
};
let pageDefinition = null;
global.Page = def => { pageDefinition = def; };
['../pages/index/index'].forEach(p => { delete require.cache[require.resolve(p)]; require(p); });

function clone(v){ return JSON.parse(JSON.stringify(v)); }
function createPage(){
  const page = {};
  Object.keys(pageDefinition).forEach(k => { page[k] = k === 'data' ? clone(pageDefinition.data) : pageDefinition[k]; });
  page.setData = function(patch){ Object.assign(this.data, patch || {}); };
  return page;
}

(async () => {
  const page = createPage();
  page._theme = require('../utils/theme').getTheme('midnight');
  page._ritualAudio = { resetSequence(){}, playCell(){}, celebrateChord(){} };
  let firstStartObserved = false;
  const fakeEngine = {
    async run(config){
      config.onCellStart(0, 3, 'ignite');
      assert.strictEqual(page.data.ritualCurrent, '100', 'count must not move when the first cell merely starts');
      assert.strictEqual(page.data.ritualDirectionText, '自由时间正在一天天亮起');
      firstStartObserved = true;
      config.onProgress(0, 3, 100, 1);
      assert.strictEqual(page.data.ritualCurrent, '100');
      config.onProgress(1, 3, 101, 2);
      assert.strictEqual(page.data.ritualCurrent, '101', 'count moves only after a cell completes');
      assert(page.data.ritualDirectionText.includes('第 2 天'));
      assert.strictEqual(page.data.ritualProgressText, '已买回 1 / 3 天');
      config.onProgress(3, 3, 103, 3);
      assert.strictEqual(page.data.ritualDirectionText, '这段时间，已经属于你');
      return { skipped:false };
    },
    destroy(){}
  };
  page.initRitualCanvas = async () => fakeEngine;
  const before={lit_count:100,future_cells:1000};
  const after={lit_count:103,future_cells:1000};
  const result=await page.runRitual(before,after,{delta:3});
  assert(firstStartObserved);
  assert.strictEqual(result.played,true);

  const page2=createPage();
  page2._theme=require('../utils/theme').getTheme('midnight');
  page2._ritualAudio={resetSequence(){},playCell(){},celebrateChord(){}};
  const fake2={async run(config){config.onCellStart(0,2,'extinguish');assert.strictEqual(page2.data.ritualDirectionText,'未来自由正在一天天被交换');config.onProgress(1,2,102,2);assert(page2.data.ritualDirectionText.includes('正在被交换'));config.onProgress(2,2,101,2);assert.strictEqual(page2.data.ritualDirectionText,'新的自由边界已经落定');return {skipped:false}},destroy(){}};
  page2.initRitualCanvas=async()=>fake2;
  await page2.runRitual({lit_count:103,future_cells:1000},{lit_count:101,future_cells:1000},{delta:-2});
  console.log('ritual_page_integration.test.js: PASS');
})().catch(err=>{console.error(err);process.exit(1)});
