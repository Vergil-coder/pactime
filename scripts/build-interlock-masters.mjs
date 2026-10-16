import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const brand = join(root, 'assets/brand');
// Interlock's cubic contours preserve the asymmetric counter, diagonal seam
// and lower-left terminal notch. Coordinates use a 1254px design canvas.
const upper = 'M257 769C196 738 160 681 151 613C140 539 168 474 220 418L392 257C459 203 507 185 578 186C647 187 704 215 756 257L891 396C904 409 906 430 895 448L782 559L647 423C626 405 600 408 576 423L299 679C277 702 263 735 257 769Z';
const lower = 'M941 453C1000 457 1057 520 1087 577C1115 651 1113 743 1086 771C1075 820 1051 844 1017 872L872 1001C823 1042 777 1067 705 1068C631 1070 573 1042 534 994L488 932C479 915 461 907 444 918L418 935C411 939 402 938 397 931L328 869C298 841 286 786 297 754C300 735 306 725 312 720L435 599L654 821C670 840 697 842 709 836C723 833 735 826 742 821L859 718C871 705 877 688 873 672C872 660 868 650 857 638L807 586Z';
const contours = `<path d="${upper}"/><path d="${lower}"/>`;
// Tiny monochrome uses the same outlines. Move each mass by 12 reference pixels on both axes
// in opposite directions, then trim empty canvas to keep the mark readable.
const smallContours = `<path transform="translate(-12 -12)" d="${upper}"/><path transform="translate(12 12)" d="${lower}"/>`;
function mark(body, viewBox, color, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" color="${color}" fill="currentColor" role="img"><title>${title}</title><g transform="scale(${64 / 1254})">${body}</g></svg>\n`;
}
for (const [suffix, color] of [['', '#292521'], ['-inverse', '#FFF6EC']]) {
  writeFileSync(join(brand, `mark${suffix}.svg`), mark(contours, '0 0 64 64', color, 'Pactime — Interlock'));
  writeFileSync(join(brand, `mark-small${suffix}.svg`), mark(smallContours, '4 4 56 56', color, 'Pactime — Interlock optical small'));
}
for (const [name, radius] of [['app-icon-rounded', 230], ['app-icon-square', 0]]) {
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img"><title>Pactime — Interlock app icon</title><rect width="1024" height="1024" rx="${radius}" fill="#CF542D"/><g transform="scale(${1024 / 1254})" fill="#FFF6EC">${contours}</g></svg>\n`;
  writeFileSync(join(brand, `${name}.svg`), source);
}
console.log('Pactime Interlock SVG masters generated.');
