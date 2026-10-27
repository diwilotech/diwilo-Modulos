// De dónde escribe una persona: el país sale del indicativo del teléfono (WhatsApp) o del que manda la web (chats web); el dispositivo, del navegador.
// Instagram y Messenger no entregan ubicación, así que ahí queda vacío.
const CODIGOS = {
  7: 'RU', 20: 'EG', 27: 'ZA', 30: 'GR', 31: 'NL', 32: 'BE', 33: 'FR', 34: 'ES', 36: 'HU', 39: 'IT', 40: 'RO', 41: 'CH', 43: 'AT', 44: 'GB', 45: 'DK', 46: 'SE', 47: 'NO', 48: 'PL', 49: 'DE',
  51: 'PE', 52: 'MX', 53: 'CU', 54: 'AR', 55: 'BR', 56: 'CL', 57: 'CO', 58: 'VE', 60: 'MY', 61: 'AU', 62: 'ID', 63: 'PH', 64: 'NZ', 65: 'SG', 66: 'TH', 81: 'JP', 82: 'KR', 84: 'VN', 86: 'CN',
  90: 'TR', 91: 'IN', 92: 'PK', 93: 'AF', 94: 'LK', 95: 'MM', 98: 'IR', 212: 'MA', 213: 'DZ', 216: 'TN', 218: 'LY', 233: 'GH', 234: 'NG', 254: 'KE', 255: 'TZ', 256: 'UG',
  351: 'PT', 352: 'LU', 353: 'IE', 354: 'IS', 358: 'FI', 370: 'LT', 371: 'LV', 372: 'EE', 380: 'UA', 385: 'HR', 386: 'SI', 420: 'CZ', 421: 'SK',
  502: 'GT', 503: 'SV', 504: 'HN', 505: 'NI', 506: 'CR', 507: 'PA', 509: 'HT', 591: 'BO', 592: 'GY', 593: 'EC', 595: 'PY', 598: 'UY',
  961: 'LB', 962: 'JO', 964: 'IQ', 965: 'KW', 966: 'SA', 968: 'OM', 971: 'AE', 972: 'IL', 973: 'BH', 974: 'QA',
};
const DO = ['809', '829', '849'], PR = ['787', '939'];
const CA = new Set('204 226 236 249 250 289 306 343 365 403 416 418 431 437 438 450 506 514 519 548 579 581 587 604 613 639 647 672 705 709 778 780 807 819 825 867 873 902 905'.split(' '));

// País (ISO de 2 letras) por el indicativo de un número internacional, solo dígitos (ej. 573001112233 → CO). null si no se reconoce.
export function paisDeTelefono(digitos) {
  const d = String(digitos || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  if (d[0] === '1') {
    const a = d.slice(1, 4);
    return DO.includes(a) ? 'DO' : PR.includes(a) ? 'PR' : a === '876' ? 'JM' : CA.has(a) ? 'CA' : 'US';
  }
  for (const n of [3, 2, 1]) { const c = CODIGOS[Number(d.slice(0, n))]; if (c && String(Number(d.slice(0, n))) === d.slice(0, n)) return c; }
  return null;
}
export const paisValido = (p) => (/^[A-Za-z]{2}$/.test(String(p || '')) && !/^(xx|t1)$/i.test(p) ? String(p).toUpperCase() : null);
// 'móvil' | 'escritorio' a partir de lo que mande la web (dispositivo, o el user-agent completo)
export function dispositivoDe({ dispositivo, ua } = {}) {
  const t = String(dispositivo || '').toLowerCase();
  if (/mov|mobile|phone|tablet|android|ios/.test(t)) return 'móvil';
  if (/escrit|desktop|pc|laptop/.test(t)) return 'escritorio';
  if (ua) return /mobile|android|iphone|ipad/i.test(String(ua)) ? 'móvil' : 'escritorio';
  return null;
}
