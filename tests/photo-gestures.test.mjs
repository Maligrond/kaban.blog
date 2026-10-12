import test from 'node:test';
import assert from 'node:assert/strict';
import {photoTransform,photoSwipe} from '../src/scripts/photo-gestures.js';
test('zoom and pan stay within the image and reset at natural size',()=>{
 assert.deepEqual(photoTransform(1,500,-500,400,300),{scale:1,x:0,y:0});
 assert.deepEqual(photoTransform(2,500,-500,400,300),{scale:2,x:200,y:-150});
 assert.equal(photoTransform(10,0,0,400,300).scale,4);
});
test('only deliberate unzoomed single finger horizontal swipes change photos',()=>{
 assert.equal(photoSwipe(-90,10,200,1),1);assert.equal(photoSwipe(90,10,200,1),-1);
 for(const args of [[-90,100,200,1],[-20,0,200,1],[-90,0,800,1],[-90,0,200,2],[-90,0,200,1,true]])assert.equal(photoSwipe(...args),0);
});
