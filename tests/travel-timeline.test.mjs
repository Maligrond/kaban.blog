import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTripsByYear } from '../src/lib/travel-timeline.js';
import { shelfValues } from '../src/scripts/author-entries.js';

test('trip years determine chronology; publication dates never fill missing trip years', () => {
  const city=(id,title,visitedYear,date)=>({id,data:{title,visitedYear,date:new Date(date)}});
  const cities=[city('jasper','Джаспер',2022,'2026-01-01'),city('rapallo','Рапалло',2025,'2024-01-01'),city('paris','Париж',undefined,'2030-01-01'),city('bologna','Болонья',2025,'2026-01-01')];
  const groups=groupTripsByYear(cities);
  assert.deepEqual(groups.map(group=>group.year),[2025,2022,null]);
  assert.deepEqual(groups.map(group=>group.cities.map(city=>city.id)),[['bologna','rapallo'],['jasper'],['paris']]);
  assert.deepEqual(cities.map(city=>city.id),['jasper','rapallo','paris','bologna']);
  assert.deepEqual(groupTripsByYear([]),[]);
});

test('the city editor accepts an optional trip year and rejects incomplete or invalid years', () => {
  const fields={country:'Канада',flag:'🇨🇦',rating:'5'};
  assert.equal(shelfValues('countries',{...fields,visitedYear:'2022'}).visitedYear,2022);
  for(const visitedYear of ['', ' ', undefined])assert.equal('visitedYear' in shelfValues('countries',{...fields,visitedYear}),false);
  for(const visitedYear of ['22','2022.5','2101','abc'])assert.throws(()=>shelfValues('countries',{...fields,visitedYear}));
});
