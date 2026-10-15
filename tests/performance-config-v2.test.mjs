// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setExtensionContext, clearExtensionContext } from '../src/context.ts';
import { commands, configureMappingStorage, controlMappings, getProjectConfigStatus } from '../src/live/mappings.ts';
import { validatePerformanceSettings } from '../src/live/project-config.ts';

const performance = {
  version:2,slots: Object.fromEntries(Array.from({length:8},(_,i)=>[`toggle-${i+1}`,{
    shape:i%2?'square':'triangle',mode:'C',syncMode:'free',subdivision:0,
    phaseOffset:-.5,rate:.3,depth:.7,count:2/3,swing:.2,
  }])),
  xy: {'xy-1':{behavior:'physics',friction:.004,bounce:.7,speed:2},
    'xy-2':{behavior:'static',friction:.04,bounce:.3,speed:.5}},
};
test('version 2 project and preset round-trip all eight slots and both independent XY configurations', async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rc-performance-v2-'));
  setExtensionContext({application:{song:{tempo:120,tracks:[],returnTracks:[],mainTrack:null}}});
  try {
    await fs.writeFile(path.join(dir,'mappings.json'),'legacy data left untouched');
    await configureMappingStorage(dir);controlMappings.clear();
    for(let i=1;i<=8;i++)controlMappings.set(`toggle-${i}`,[{type:'tempo',outMin:40+i,outMax:160+i}]);
    await commands.saveProjectClientState.handler({preferences:{performance}});
    await commands.savePreset.handler({name:'complete'});
    const presetPath=path.join(dir,'surface-v2','presets','complete.json');
    const saved=JSON.parse(await fs.readFile(presetPath,'utf8'));
    assert.equal(saved.version,2);assert.deepEqual(saved.performance,performance);
    assert.equal(Object.keys(saved.mappings).length,8);
    const exported=await commands.exportProjectConfig.handler({});
    const project=JSON.parse(exported.content);
    assert.equal(project.version,2);assert.deepEqual(project.preferences.performance,performance);
    await commands.saveProjectClientState.handler({preferences:{performance:{version:2,slots:{}}}});
    await commands.loadPreset.handler({name:'complete'});
    assert.deepEqual(getProjectConfigStatus().preferences.performance,performance);
    assert.equal(controlMappings.get('toggle-8')[0].outMin,48);
    assert.equal(await fs.readFile(path.join(dir,'mappings.json'),'utf8'),'legacy data left untouched');
    await assert.rejects(commands.importProjectConfig.handler({content:{...project,version:1}}),/Invalid .rcsurface/);
    await fs.writeFile(path.join(dir,'surface-v2','presets','old.json'),JSON.stringify({'button-1':[{type:'tempo'}]}));
    await assert.rejects(commands.loadPreset.handler({name:'old'}),/Unsupported preset/);
    assert.deepEqual(getProjectConfigStatus().preferences.performance,performance);
  } finally {
    await configureMappingStorage(null);controlMappings.clear();clearExtensionContext();
    await fs.rm(dir,{recursive:true,force:true});
  }
});
test('performance schema rejects retired slot IDs, unsupported versions and invalid XY parameters',()=>{
  assert.throws(()=>validatePerformanceSettings({...performance,version:9}),/Unsupported/);
  assert.throws(()=>validatePerformanceSettings({version:2,slots:{'button-1':{shape:'square'}}}),/Invalid modulator slot/);
  assert.throws(()=>validatePerformanceSettings({...performance,xy:{'xy-1':{...performance.xy['xy-1'],speed:99}}}),/Invalid XY speed/);
});
