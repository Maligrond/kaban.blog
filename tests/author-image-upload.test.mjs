import test from 'node:test';
import assert from 'node:assert/strict';
import {photoSize, validatePhoto, preparePhoto} from '../src/scripts/author-image-upload.js';

test('large landscape and portrait photos shrink proportionally; small files are never enlarged',()=>{
  assert.deepEqual(photoSize(6000,4000),{width:2560,height:1707});
  assert.deepEqual(photoSize(3000,4000),{width:1920,height:2560});
  assert.deepEqual(photoSize(400,200),{width:400,height:200});
  assert.throws(()=>photoSize(0,200));
});
test('input permits large camera photos but rejects unsupported and empty files',()=>{
  validatePhoto({type:'image/jpeg',size:30*1024*1024});
  assert.throws(()=>validatePhoto({type:'image/svg+xml',size:10}));
  assert.throws(()=>validatePhoto({type:'image/png',size:0}));
  assert.throws(()=>validatePhoto({type:'image/jpeg',size:41*1024*1024}));
});
test('photo preparation always re-encodes oriented pixels and releases bitmap memory',async()=>{
  const options=[];const encodings=[];const dimensions=[];let closed=0;
  globalThis.createImageBitmap=async(_file,option)=>{options.push(option);return {width:3000,height:4000,close(){closed++;}};};
  globalThis.document={createElement:()=>({width:0,height:0,getContext(){return {drawImage(_img,_x,_y,w,h){dimensions.push([w,h]);}};},toBlob(callback,type,quality){encodings.push({type,quality});callback(new Blob(['clean pixels'],{type}));}})};
  const input={type:'image/jpeg',size:20_000_000,name:'camera.jpg'};
  const output=await preparePhoto(input);
  assert.equal(output.extension,'jpg');
  assert.deepEqual(options,[{imageOrientation:'from-image'}]);
  assert.deepEqual(dimensions,[[1920,2560]]);
  assert.deepEqual(encodings,[{type:'image/jpeg',quality:0.9}]);
  assert.equal(atob(output.content),'clean pixels');
  assert.equal(closed,1);
  const screenshot=await preparePhoto({...input,type:'image/png'});
  assert.equal(screenshot.blob.type,'image/png');
  assert.equal(closed,2);
});
test('undecodable photo gives useful filename and never returns original metadata',async()=>{
  globalThis.createImageBitmap=async()=>{throw new Error('Decode error');};
  await assert.rejects(preparePhoto({type:'image/jpeg',size:100,name:'broken.jpg'}),/broken.jpg/);
});
