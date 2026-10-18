import https from 'node:https';
import fs from 'node:fs';
import forge from 'node-forge';
const U = 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx?wsdl';
const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(fs.readFileSync('badssl.p12').toString('binary')), 'badssl.com');
const cert = forge.pki.certificateToPem(p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag][0].cert);
const key = forge.pki.privateKeyToPem(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag][0].key);
const get = (nome, opts) => new Promise(res => {
  const r = https.request(U, { timeout: 20000, ...opts }, s => {
    let b = ''; s.on('data', c => b += c);
    s.on('end', () => res(`${nome}: HTTP ${s.statusCode} ${(b.match(/<(title|h2|h3)>[^<]*<\/\1>/g) || []).join(' | ')}`));
  });
  r.on('error', e => res(`${nome}: ERRO ${e.code ?? ''} ${e.message}`));
  r.end();
});
console.log(await get('SEFAZ SEM cert', {}));
console.log(await get('SEFAZ COM cert de teste', { cert, key }));
