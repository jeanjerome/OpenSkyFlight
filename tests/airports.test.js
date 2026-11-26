import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCsv, runwaysInTile, searchAirports } from '../scripts/airports.js';
import { offsetPosition, tileOf } from '../js/airports/Airports.js';

const AIRPORTS = `"id","ident","type","name","latitude_deg","longitude_deg","elevation_ft","continent","iso_country","iso_region","municipality","scheduled_service","icao_code","iata_code","gps_code","local_code","home_link","wikipedia_link","keywords"
4490,"LSGG","large_airport","Geneva International Airport",46.238098,6.10895,1411,"EU","CH","CH-GE","Geneva","yes","LSGG","GVA","LSGG",,,,"Cointrin, ""Genève"""
1,"LSGP","small_airport","La Côte Airport",46.406399,6.25806,1352,"EU","CH","CH-VD","Prangins","no",,,"LSGP",,,,
2,"XHEL","heliport","Some Heliport",46.2,6.1,1300,"EU","CH","CH-GE","Geneva","no",,,,,,,
`;
const RUNWAYS = `"id","airport_ref","airport_ident","length_ft","width_ft","surface","lighted","closed","le_ident","le_latitude_deg","le_longitude_deg","le_elevation_ft","le_heading_degT","le_displaced_threshold_ft","he_ident","he_latitude_deg","he_longitude_deg","he_elevation_ft","he_heading_degT","he_displaced_threshold_ft"
239116,4490,"LSGG",12795,164,"CON",1,0,"04",46.2258,6.09092,1411,46,1082,"22",46.250401,6.12699,1365,226,
239117,4490,"LSGG",2700,98,"GRS",0,1,"04L",46.234798,6.0995,1378,46,613,"22R",46.239899,6.10722,1393,226,994
3,1,"LSGP",500,60,"ASP",0,0,"04",46.4,6.25,,,,"22",,,,,
4,1,"LSGP",800,60,"ASP",0,0,"H1",46.40,6.25,,,,"H2",46.4005,6.2505,,,,
5,2,"XHEL",80,80,"ASP",0,0,"H1",46.2,6.1,,,,"H2",46.2,6.1001,,,,
`;

const cache = await mkdtemp(join(tmpdir(), 'osf-airports-'));
await mkdir(join(cache, 'ourairports'));
await writeFile(join(cache, 'ourairports', 'airports.csv'), AIRPORTS);
await writeFile(join(cache, 'ourairports', 'runways.csv'), RUNWAYS);

test('CSV fields may be quoted, hold commas and doubled quotes', () => {
  const [row] = parseCsv('a,b,c\n"x, y","say ""hi""",\n');
  assert.deepEqual(row, { a: 'x, y', b: 'say "hi"', c: '' });
});

test('airports are found by code, by name or town words, and by keywords without accents', async () => {
  assert.deepEqual(
    (await searchAirports(cache, 'gva')).map((a) => a.ident),
    ['LSGG'],
  );
  assert.deepEqual(
    (await searchAirports(cache, 'geneva international')).map((a) => a.ident),
    ['LSGG'],
  );
  assert.deepEqual(
    (await searchAirports(cache, 'geneve')).map((a) => a.ident),
    ['LSGG'],
  );
});

test('only open runways of 300 m or more with both ends located are kept, at aeroplane airports', async () => {
  const [geneva] = await searchAirports(cache, 'LSGG');
  assert.equal(geneva.runways.length, 1, 'the closed grass runway is dropped');
  const [runway] = geneva.runways;
  assert.equal(runway.ends[0].ident, '04');
  assert.ok(Math.abs(runway.ends[0].heading - 45.6) < 1, `heading ${runway.ends[0].heading}`);
  assert.ok(Math.abs(runway.length - 3900) < 1);
  assert.ok(Math.abs(runway.ends[0].displaced - 330) < 1);
  assert.deepEqual(await searchAirports(cache, 'LSGP'), [], 'no located runway: not offered');
  assert.deepEqual(await searchAirports(cache, 'heliport'), []);
});

test('the runways of a map tile are those whose middle lies in it', async () => {
  const { x, y } = tileOf(46.238, 6.109, 7);
  assert.equal((await runwaysInTile(cache, 7, x, y)).length, 1);
  assert.equal((await runwaysInTile(cache, 7, x + 1, y)).length, 0);
});

test('a position offset along a heading', () => {
  const p = offsetPosition(46, 6, 90, 1000);
  assert.ok(Math.abs(p.lat - 46) < 1e-9);
  assert.ok(Math.abs((p.lon - 6) * 111195 * Math.cos((46 * Math.PI) / 180) - 1000) < 1);
});
