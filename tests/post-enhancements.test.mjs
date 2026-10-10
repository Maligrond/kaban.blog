import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeVideo} from '../src/scripts/post-enhancements.js';
test('YouTube links support watch, short links and Shorts',()=>{
  for(const link of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30','https://youtu.be/dQw4w9WgXcQ','https://youtube.com/shorts/dQw4w9WgXcQ'])assert.equal(youtubeVideo(link),'dQw4w9WgXcQ');
});
test('untrusted hosts, protocols and invalid video IDs cannot become iframe URLs',()=>{
  for(const link of ['https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ','https://evil.test/dQw4w9WgXcQ','javascript:alert(1)','https://youtube.com/watch?v=../../evil','https://youtu.be/dQw4w9WgXcQ/extra','not a URL'])assert.equal(youtubeVideo(link),null);
});
