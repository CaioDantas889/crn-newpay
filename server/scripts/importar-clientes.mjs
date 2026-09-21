// Importa a carteira real a partir de um CSV, pela própria API — ou seja,
// com as mesmas validações do cadastro feito no app.
//
//   node scripts/importar-clientes.mjs --arquivo=carteira.csv --email=gestor@... --senha=...
//
// Sem --aplicar ele só simula e mostra o que faria (padrão seguro).
// Colunas aceitas (nomes livres, com ou sem acento): empresa, nome, telefone,
// cidade, endereco, cnpj, segmento, etapa, lat, lng, vendedor, observacoes.

import fs from 'node:fs';

const args = process.argv.slice(2);
const arg = (nome, padrao = '') => {
  const achado = args.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : padrao;
};
const flag = (nome) => args.includes(`--${nome}`);

const BASE = arg('api', process.env.API_URL || 'http://127.0.0.1:4000');
const APLICAR = flag('aplicar');
const SEPARADOR_INTERNO = '\u0001';

const MODELO = [
  'empresa;nome;telefone;cidade;endereco;cnpj;segmento;etapa;vendedor;observacoes',
  'Mercadinho Boa Vista;Dona Lúcia;(88) 99999-0001;Iguatu;Rua do Comércio, 120;12345678000190;mercado;novo;carlos@newpay.com.br;Usa máquina do concorrente',
  '',
].join('\n');

if (flag('modelo')) {
  fs.writeFileSync('modelo-carteira.csv', MODELO, 'utf8');
  console.log('Modelo gravado em modelo-carteira.csv');
  process.exit(0);
}

/* ------------------------------------------------------------------ CSV */

function separarLinhas(texto) {
  const linhas = [];
  let campo = '';
  let linha = [];
  let aspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
      continue;
    }
    if (c === '"') { aspas = true; continue; }
    if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

const chave = (texto) =>
  String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, '_');

function lerCsv(caminho) {
  const bruto = fs.readFileSync(caminho, 'utf8').replace(/^\uFEFF/, '');
  const cabecalho = bruto.split(/\r?\n/)[0] ?? '';

  // O exportador de cada planilha usa um separador; fica com o que mais aparece.
  const separador = [';', ',', '\t']
    .map((s) => [s, cabecalho.split(s).length])
    .sort((a, b) => b[1] - a[1])[0][0];

  const normalizado = separarLinhas(bruto.split(separador).join(SEPARADOR_INTERNO))
    .map((linha) => linha.flatMap((celula) => celula.split(SEPARADOR_INTERNO)));

  const [cabecalhos = [], ...linhas] = normalizado;
  return {
    cabecalhos: cabecalhos.map(chave),
    // Guarda o número real da linha no arquivo: é por ele que a pessoa vai
    // achar o registro na planilha para corrigir.
    linhas: linhas
      .map((celulas, i) => ({ numero: i + 2, celulas }))
      .filter(({ celulas }) => celulas.some((c) => c.trim())),
  };
}

const ALIASES = {
  empresa: ['empresa', 'company', 'razao_social', 'estabelecimento', 'nome_fantasia', 'loja'],
  nome: ['nome', 'contato', 'proprietario', 'responsavel'],
  telefone: ['telefone', 'fone', 'celular', 'whatsapp', 'zap'],
  cidade: ['cidade', 'municipio'],
  endereco: ['endereco', 'logradouro', 'rua', 'end'],
  cnpj: ['cnpj', 'documento', 'cpf_cnpj'],
  segmento: ['segmento', 'ramo', 'categoria', 'tipo'],
  etapa: ['etapa', 'stage', 'funil', 'situacao'],
  lat: ['lat', 'latitude'],
  lng: ['lng', 'long', 'longitude'],
  vendedor: ['vendedor', 'consultor', 'carteira', 'dono'],
  observacoes: ['observacoes', 'obs', 'notas', 'notes', 'anotacoes'],
};

const valorDe = (linha, cabecalhos, campo) => {
  for (const alias of ALIASES[campo]) {
    const idx = cabecalhos.indexOf(alias);
    if (idx >= 0) return String(linha[idx] ?? '').trim();
  }
  return '';
};

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const numeroOuIndefinido = (v) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};

/* ------------------------------------------------------------------ API */

let token = '';
async function api(caminho, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${caminho}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }
  if (!res.ok) throw new Error(dados?.error ?? `HTTP ${res.status}`);
  return dados;
}

/* --------------------------------------------------------------- roteiro */

const caminho = arg('arquivo');
if (!caminho || !fs.existsSync(caminho)) {
  console.error('Informe o CSV: --arquivo=carteira.csv   (ou gere um exemplo com --modelo)');
  process.exit(1);
}

const email = arg('email', process.env.NEWPAY_ADMIN_EMAIL || '');
const senha = arg('senha', process.env.NEWPAY_ADMIN_SENHA || '');
if (!email || !senha) {
  console.error('Informe o acesso do gestor: --email= e --senha=');
  process.exit(1);
}

const sessao = await api('/api/auth/login', { method: 'POST', body: { email, password: senha } })
  .catch((e) => {
    console.error(`Não consegui entrar na API (${BASE}): ${e.message}`);
    process.exit(1);
  });
token = sessao.token;

if (sessao.user.role === 'vendedor') {
  console.error('Use o acesso de um gestor: só a gestão importa para a carteira de terceiros.');
  process.exit(1);
}

const [meta, equipe, existentes] = await Promise.all([
  api('/api/meta'),
  api('/api/users'), // traz e-mail e inativos; /api/auth/equipe é enxuta de propósito
  api('/api/clients?userId=todos'),
]);

const porEmail = new Map(
  equipe.filter((u) => u.active !== false).map((u) => [String(u.email ?? '').toLowerCase(), u])
);
const vendedorPadrao = arg('vendedor').toLowerCase();
if (vendedorPadrao && !porEmail.has(vendedorPadrao)) {
  console.error(`Vendedor padrão não encontrado: ${vendedorPadrao}`);
  console.error(`Equipe disponível: ${equipe.map((u) => u.email).filter(Boolean).join(', ')}`);
  process.exit(1);
}

const segmentos = Object.entries(meta.segmentos ?? {});
const etapas = Object.keys(meta.funil ?? {});

const jaTemCnpj = new Set(existentes.map((c) => soDigitos(c.cnpj)).filter(Boolean));
const jaTemNome = new Set(existentes.map((c) => `${c.company}|${c.city}`.toLowerCase()));

const { cabecalhos, linhas } = lerCsv(caminho);
console.log(`\nArquivo: ${caminho}`);
console.log(`Colunas reconhecidas: ${cabecalhos.join(', ')}`);
console.log(`Linhas com conteúdo: ${linhas.length}\n`);

const criar = [];
const duplicados = [];
const recusados = [];
// Valor que a planilha traz e o CRM não conhece vira "Outros"/"Lead novo" em
// silêncio — então é avisado no fim para dar chance de corrigir a origem.
const segmentosDesconhecidos = new Set();
const etapasDesconhecidas = new Set();

linhas.forEach(({ numero, celulas: linha }) => {
  const empresa = valorDe(linha, cabecalhos, 'empresa');
  const nome = valorDe(linha, cabecalhos, 'nome');
  if (!empresa && !nome) return recusados.push({ numero, motivo: 'sem empresa nem nome' });

  const cidade = valorDe(linha, cabecalhos, 'cidade');
  const cnpj = soDigitos(valorDe(linha, cabecalhos, 'cnpj'));
  const identidade = `${(empresa || nome).trim()}|${cidade}`.toLowerCase();

  if (cnpj && jaTemCnpj.has(cnpj)) {
    return duplicados.push({ numero, alvo: empresa || nome, motivo: 'CNPJ já cadastrado' });
  }
  if (jaTemNome.has(identidade)) {
    return duplicados.push({ numero, alvo: empresa || nome, motivo: 'mesma empresa na mesma cidade' });
  }

  const emailVendedor = (valorDe(linha, cabecalhos, 'vendedor') || vendedorPadrao).toLowerCase();
  const dono = emailVendedor ? porEmail.get(emailVendedor) : null;
  if (emailVendedor && !dono) {
    return recusados.push({ numero, motivo: `vendedor "${emailVendedor}" não existe` });
  }

  const segmentoBruto = chave(valorDe(linha, cabecalhos, 'segmento'));
  const segmento =
    segmentos.find(([k]) => k === segmentoBruto)?.[0] ??
    segmentos.find(([, label]) => chave(label) === segmentoBruto)?.[0] ??
    'outros';
  if (segmentoBruto && segmento === 'outros' && segmentoBruto !== 'outros') {
    segmentosDesconhecidos.add(segmentoBruto);
  }

  const etapaBruta = chave(valorDe(linha, cabecalhos, 'etapa'));
  const etapa = etapas.includes(etapaBruta) ? etapaBruta : 'novo';
  if (etapaBruta && etapa === 'novo' && etapaBruta !== 'novo') etapasDesconhecidas.add(etapaBruta);

  const telefone = valorDe(linha, cabecalhos, 'telefone');
  const cliente = {
    company: empresa || nome,
    name: nome,
    phone: telefone,
    whatsapp: telefone,
    city: cidade,
    address: valorDe(linha, cabecalhos, 'endereco'),
    cnpj: valorDe(linha, cabecalhos, 'cnpj'),
    segment: segmento,
    stage: etapa,
    notes: valorDe(linha, cabecalhos, 'observacoes'),
    lat: numeroOuIndefinido(valorDe(linha, cabecalhos, 'lat')),
    lng: numeroOuIndefinido(valorDe(linha, cabecalhos, 'lng')),
    ownerId: dono?.id,
  };

  if (cnpj) jaTemCnpj.add(cnpj);
  jaTemNome.add(identidade);
  criar.push({ numero, cliente, vendedor: dono?.name ?? sessao.user.name });
});

for (const r of recusados) console.log(`  recusado  linha ${r.numero}: ${r.motivo}`);
for (const d of duplicados) console.log(`  já existe linha ${d.numero}: ${d.alvo} — ${d.motivo}`);

if (segmentosDesconhecidos.size) {
  console.log(`\n  aviso: segmento(s) fora do vocabulário, entram como "Outros": ${[...segmentosDesconhecidos].join(', ')}`);
  console.log(`         valores aceitos: ${segmentos.map(([k]) => k).join(', ')}`);
}
if (etapasDesconhecidas.size) {
  console.log(`\n  aviso: etapa(s) desconhecida(s), entram como "Lead novo": ${[...etapasDesconhecidas].join(', ')}`);
  console.log(`         valores aceitos: ${etapas.join(', ')}`);
}

console.log(`\nResumo: ${criar.length} para criar · ${duplicados.length} duplicados · ${recusados.length} recusados`);

if (APLICAR) {
  let ok = 0;
  for (const item of criar) {
    try {
      await api('/api/clients', { method: 'POST', body: item.cliente });
      ok++;
    } catch (erro) {
      console.error(`  falhou linha ${item.numero} (${item.cliente.company}): ${erro.message}`);
    }
  }
  console.log(`\n${ok} de ${criar.length} clientes importados.`);
} else {
  // Sem process.exit() no fim: no Windows ele derruba os sockets do fetch pela metade
  console.log('\nSimulação: nada foi gravado. Repita com --aplicar para importar de verdade.');
  for (const item of criar.slice(0, 10)) {
    console.log(`  + ${item.cliente.company} (${item.cliente.city || 'sem cidade'}) -> ${item.vendedor}`);
  }
  if (criar.length > 10) console.log(`  ... e mais ${criar.length - 10}`);
}
