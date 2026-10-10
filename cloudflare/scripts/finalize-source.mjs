import fs from 'node:fs';
fs.writeFileSync('app/page.tsx',`import board from '../lib/forum.html?raw';
export const dynamic = 'force-dynamic';
export default function Forum(){ const body=board.split('<body>')[1].split('</body>')[0]; return <><link rel="stylesheet" href="/style.css"/><div dangerouslySetInnerHTML={{__html:body}}/><script src="/app.js" defer/></>; }
`);
