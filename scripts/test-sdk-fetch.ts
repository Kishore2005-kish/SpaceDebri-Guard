// Test different URL formats to fetch CelesTrak data
import ZAI from 'z-ai-web-dev-sdk';

async function tryUrl(zai: any, label: string, url: string) {
  console.log(`\n=== ${label} ===`);
  console.log('URL:', url);
  try {
    const result = await zai.functions.invoke('page_reader', { url });
    console.log('Response URL:', result?.data?.url);
    console.log('HTML length:', result?.data?.html?.length);
    const html = result?.data?.html || '';
    console.log('HTML preview:', html.slice(0, 800));
  } catch (e: any) {
    console.error('Error:', e.message);
  }
}

async function main() {
  const zai = await ZAI.create();
  // Try various URL formats
  await tryUrl(zai, 'Plain URL with query', 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=JSON');
  await tryUrl(zai, 'URL-encoded query', 'https://celestrak.org/NORAD/elements/gp.php%3FGROUP%3Dstations%26FORMAT%3DJSON');
  await tryUrl(zai, 'Table.php endpoint', 'https://celestrak.org/NORAD/elements/table.php?FORMAT=json&GROUP=stations');
  await tryUrl(zai, 'Index.php', 'https://celestrak.org/NORAD/elements/index.php?FORMAT=json');
  await tryUrl(zai, 'Plain HTML page', 'https://celestrak.org/NORAD/elements/');
  await tryUrl(zai, 'Satcat search', 'https://celestrak.org/satcat/search.php?INTDES=25544');
}

main().catch(e => console.error(e));
