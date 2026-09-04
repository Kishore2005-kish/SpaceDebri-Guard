// Tests for the CelesTrak parser.
// Run with: bun run scripts/test-parser.ts
//
// Test cases:
//   - valid JSON
//   - malformed JSON
//   - missing fields
//   - 6-digit catalog ID
//   - stale epoch

import { parseJsonPayload, parseCelesTrakHtml, extractJsonFromHtml } from '@/lib/data/celestrak/parser';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

console.log('=== CelesTrak parser tests ===\n');

console.log('1. Valid JSON:');
{
  const json = JSON.stringify([
    {
      OBJECT_NAME: 'ISS (ZARYA)', OBJECT_ID: '1998-067A', EPOCH: '2026-08-18T19:47:11.368896',
      MEAN_MOTION: 15.49494626, ECCENTRICITY: 0.0007621, INCLINATION: 51.6332,
      RA_OF_ASC_NODE: 350.0835, ARG_OF_PERICENTER: 60.8158, MEAN_ANOMALY: 299.3593,
      NORAD_CAT_ID: 25544, BSTAR: 0.00015811966,
    },
  ]);
  const result = parseJsonPayload(json);
  assert(result.records.length === 1, 'should parse 1 record');
  assert(result.records[0].OBJECT_NAME === 'ISS (ZARYA)', 'name should match');
  assert(result.records[0].NORAD_CAT_ID === 25544, 'NORAD ID should be 25544');
  assert(result.rejected === 0, 'should reject 0 records');
  assert(result.errors.length === 0, 'should have no errors');
}

console.log('\n2. Malformed JSON:');
{
  const json = '[{"OBJECT_NAME":"ISS",';  // truncated
  const result = parseJsonPayload(json);
  assert(result.records.length === 0, 'should parse 0 records');
  assert(result.errors.length > 0, 'should have errors');
}

console.log('\n3. Missing required fields:');
{
  const json = JSON.stringify([
    { OBJECT_NAME: 'Bad Object', EPOCH: '2026-08-18T19:47:11' },  // missing MEAN_MOTION, etc.
  ]);
  const result = parseJsonPayload(json);
  assert(result.records.length === 0, 'should reject record with missing fields');
  assert(result.rejected === 1, 'should reject 1');
  assert(result.errors.length > 0, 'should report the missing field');
}

console.log('\n4. 6-digit catalog ID:');
{
  const json = JSON.stringify([
    {
      OBJECT_NAME: 'NEW OBJECT', OBJECT_ID: '2025-999A', EPOCH: '2026-08-18T19:47:11',
      MEAN_MOTION: 15.0, ECCENTRICITY: 0.001, INCLINATION: 51.0,
      RA_OF_ASC_NODE: 100.0, ARG_OF_PERICENTER: 50.0, MEAN_ANOMALY: 25.0,
      NORAD_CAT_ID: 600000,  // 6-digit ID — must NOT be truncated
    },
  ]);
  const result = parseJsonPayload(json);
  assert(result.records.length === 1, 'should parse 1 record');
  assert(result.records[0].NORAD_CAT_ID === 600000, '6-digit ID should be preserved (not truncated)');
}

console.log('\n5. Invalid epoch:');
{
  const json = JSON.stringify([
    {
      OBJECT_NAME: 'BAD EPOCH', EPOCH: 'not-a-date',
      MEAN_MOTION: 15.0, ECCENTRICITY: 0.001, INCLINATION: 51.0,
      RA_OF_ASC_NODE: 100.0, ARG_OF_PERICENTER: 50.0, MEAN_ANOMALY: 25.0,
      NORAD_CAT_ID: 12345,
    },
  ]);
  const result = parseJsonPayload(json);
  assert(result.records.length === 0, 'should reject record with invalid epoch');
  assert(result.errors.length > 0, 'should report invalid epoch');
}

console.log('\n6. Out-of-range eccentricity:');
{
  const json = JSON.stringify([
    {
      OBJECT_NAME: 'BAD ECC', EPOCH: '2026-08-18T19:47:11',
      MEAN_MOTION: 15.0, ECCENTRICITY: 1.5, INCLINATION: 51.0,
      RA_OF_ASC_NODE: 100.0, ARG_OF_PERICENTER: 50.0, MEAN_ANOMALY: 25.0,
      NORAD_CAT_ID: 12345,
    },
  ]);
  const result = parseJsonPayload(json);
  assert(result.records.length === 0, 'should reject record with eccentricity > 1');
}

console.log('\n7. Extract JSON from HTML wrapper:');
{
  const html = '<html><head></head><body><pre style="...">[{"OBJECT_NAME":"TEST"}]</pre></body></html>';
  const json = extractJsonFromHtml(html);
  assert(json !== null, 'should extract JSON');
  assert(json!.includes('"OBJECT_NAME"'), 'should contain OBJECT_NAME');
}

console.log('\n8. parseCelesTrakHtml end-to-end:');
{
  const html = '<html><body><pre>[{"OBJECT_NAME":"TEST","EPOCH":"2026-08-18T19:47:11","MEAN_MOTION":15.0,"ECCENTRICITY":0.001,"INCLINATION":51.0,"RA_OF_ASC_NODE":100.0,"ARG_OF_PERICENTER":50.0,"MEAN_ANOMALY":25.0,"NORAD_CAT_ID":12345}]</pre></body></html>';
  const result = parseCelesTrakHtml(html);
  assert(result.records.length === 1, 'should parse 1 record from HTML');
}

console.log('\n=== All parser tests complete ===');
