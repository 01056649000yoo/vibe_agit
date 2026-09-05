// Offline artifact verification; never connects to an account or a live website.
// Requires Chrome/Chromium and a Python interpreter with pdfplumber.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAnthologyHtml } from '../src/modules/class-agit/anthology/print.js';
import { paginateAnthology } from '../src/modules/class-agit/anthology/pagination.js';
import { createClassAgitReleaseFixture } from '../src/dev/fixtures/classAgitReleaseFixture.js';
import { createBookPrintSettings, getBookPaper } from '../src/modules/class-agit/designs.js';
import { previewClass } from '../src/dev/fixtures/classAgitFixtures.js';
const dir = mkdtempSync(join(tmpdir(), 'class-agit-pdf-'));
const fixture = await createClassAgitReleaseFixture(); await fixture.controls.sampleBook100();
const workspace = await fixture.api.getBooks(previewClass.id);
const book = (await fixture.api.getBooks(previewClass.id, workspace.books[0].id)).book;
const edition = await fixture.api.getEdition(previewClass.id, book.editions[0].id);
edition.book.print = createBookPrintSettings({ paper_format: process.env.CLASS_AGIT_PAPER, design_id: process.env.CLASS_AGIT_DESIGN });
const paper = getBookPaper(edition.book.print.paper);
Object.assign(edition.book, {
    title: '우리들의 긴 제목 '.repeat(10).slice(0, 80), subtitle: '함께 만든 문집 이야기 '.repeat(12).slice(0, 120),
    class_label: '우리 반의 이름 '.repeat(12).slice(0, 80), term: '학기를 담은 이야기 '.repeat(5).slice(0, 40),
});
edition.book.works[0].title = '아주 긴 작품 제목 '.repeat(20).slice(0, 200);
edition.book.works[95].format = 'prose'; edition.book.works[95].blocks = ['한 문단으로 길게 이어 쓰는 이야기와 🌱. '.repeat(700)];
edition.book.works[96].format = 'poem'; edition.book.works[96].blocks = [Array.from({ length: 130 }, (_, i) => `${i + 1}번째 시의 행에서 만나는 봄 🌱`).join('\n'), '마지막 연\n다시 만날 우리'];
const html = (await buildAnthologyHtml(edition)).replace('</body>', `<script>document.fonts.ready.then(()=>{try { (${paginateAnthology.toString()})(document); document.title='QA:'+JSON.stringify(Array.from(document.querySelectorAll('[data-toc-row]')).map(r=>[Number(r.dataset.tocRow),Number(r.querySelector('[data-page]').textContent)])); } catch(e) { document.title='ERROR'; document.body.textContent=e.message+' '+JSON.stringify([...document.querySelectorAll('.anthology-page')].slice(-1).map(p=>({text:p.textContent,children:[...p.querySelector('.anthology-page-content').children].map(c=>({tag:c.tagName,height:c.getBoundingClientRect().height,text:c.textContent.slice(0,220)}))})));  }});</script></body>`);
writeFileSync(join(dir, 'anthology.html'), html);
writeFileSync(join(dir, 'expected.json'), JSON.stringify({ works: edition.book.works, paper }));
const file = join(dir, 'anthology.pdf');
const browser = spawn(process.env.CLASS_AGIT_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless', '--no-sandbox', '--no-pdf-header-footer', '--disable-gpu', '--disable-background-networking', `--user-data-dir=${join(dir, 'browser')}`, '--allow-file-access-from-files', '--virtual-time-budget=15000', `--print-to-pdf=${file}`, `file://${join(dir, 'anthology.html')}`], { stdio: 'ignore' });
let launchError = null; browser.on('error', (error) => { launchError = error; });
try {
    let previousSize = 0;
    for (let i = 0; i < 120; i++) {
        if (launchError) throw launchError;
        const size = existsSync(file) ? statSync(file).size : 0;
        if (size > 1000 && size === previousSize) break;
        previousSize = size; await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!existsSync(file)) throw new Error('PDF generation failed. Check CLASS_AGIT_CHROME.');
} finally { browser.kill('SIGTERM'); }
const result = spawnSync(process.env.CLASS_AGIT_PYTHON || 'python3', ['scripts/lib/verify-class-agit-pdf.py', file, join(dir, 'expected.json')], { encoding: 'utf8' });
if (result.status !== 0) { console.error(result.stderr || result.stdout); process.exitCode = 1; }
else console.log(result.stdout.trim());
console.log(`PDF verification artifacts: ${dir}`);
