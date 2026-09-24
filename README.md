# CRM NewPay — Vendas Externas

CRM para a equipe de vendas externas da NewPay (maquininhas de cartão), com o
módulo Calendário integrado. Feito para o vendedor abrir e saber na hora:
**quantos clientes visitar hoje, quem está mais perto de comprar, quanto falta
para a meta e quem precisa de retorno.**

- **`server/`** — API REST em Node.js + Express (JavaScript, ESM)
- **`web/`** — interface em React + Vite (JavaScript), mobile-first
- **`Dockerfile` / `docker-compose.yml`** — para subir tudo em um comando

---

## Como rodar

```bash
npm run install:all
```

```bash
npm run dev
```

- Interface: http://localhost:5173
- API: http://localhost:4000

O banco é criado automaticamente na primeira execução, com uma operação
fictícia no interior do Ceará (Iguatu e região). Para recriar do zero:

```bash
npm run seed
```

### Contas de demonstração

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Vendedor externo (Iguatu) | `carlos@newpay.com.br` | `newpay123` |
| Vendedora externa (Icó) | `fernanda@newpay.com.br` | `newpay123` |
| Gerente comercial | `gestor@newpay.com.br` | `newpay123` |

Essas contas (e o atalho no login) só existem no banco de demonstração. Em
produção o banco nasce vazio, com um único gestor definido por variável de
ambiente — veja [Hospedagem](#hospedagem-em-produção).

### Verificação da API

Com o servidor no ar, roda ~130 checagens de ponta a ponta:

```bash
npm --prefix server run smoke
```

O PWA tem verificação própria, que não precisa de navegador (executa o service
worker num escopo simulado e confere o manifest contra as exigências do Chrome):

```bash
npm run teste:pwa
```

---

## O que está implementado

### Dashboard inicial
Meta do mês (máquinas ativadas x meta, % e quanto falta), máquinas vendidas,
visitas do mês, posição no ranking e nível.
Abaixo: atividades do dia (visitas agendadas, follow-ups pendentes, clientes
para retornar, propostas enviadas), funil completo e os leads mais perto de
comprar.

### Pipeline (quadro do funil)
Tela em formato de quadro: uma coluna por etapa do funil, um cartão por cliente
e a contagem de clientes no rodapé de cada coluna. O cartão fica **vermelho quando o
cliente está sem contato há mais de 7 dias** e verde quando fechado. Arrastar o
cartão muda a etapa (no celular, o botão ⇄ do cartão faz o mesmo). A busca
global da barra superior filtra o quadro em tempo real.

### Cadastro e diagnóstico comercial
Cadastro rápido em campo (com GPS do ponto de venda) e o diagnóstico que define
a prioridade: máquina atual, taxa que paga hoje, faturamento mensal, volume no
cartão, principais dores e interesse em trocar.

### Pontuação automática de oportunidade
Score de 0 a 100 calculado a partir do diagnóstico, com a régua da operação:

| Situação | Pontos |
| --- | --- |
| Possui máquina de concorrente | +10 |
| Reclama das taxas | +20 |
| Fatura acima de R$ 10 mil | +20 |
| Quer trocar imediatamente | +50 |
| Volume alto no cartão | +10 (médio: +5) |
| Outras dores declaradas | +5 cada (máx. +15) |

**0–30 Frio · 31–60 Morno · 61–100 Quente.** O vendedor vê a pontuação subir
enquanto responde, e a ficha do cliente mostra de onde veio cada ponto.

### Mapa de clientes
Clientes e leads posicionados por GPS, com filtro por raio ("Você tem 12 leads a
menos de 3 km"), centralização na posição atual do vendedor e lista dos mais
próximos.

### Registro de visita
Em dois toques: **Interessado · Não interessado · Fechado · Retornar depois**,
com foto (fachada, máquina atual, contrato), áudio gravado na hora e GPS.
Cada resultado move o cliente no funil; "retornar" já agenda o follow-up e
"fechado" já abre o negócio com as máquinas e a taxa ofertada.

O áudio depende de permissão do navegador, que vale **por endereço**: liberar o
microfone em `localhost:5173` não vale para `localhost:4000` nem para o domínio
publicado. Quando o navegador recusa, o app diz o motivo exato (bloqueado,
sem microfone, em uso por outro programa, ou endereço sem HTTPS) em vez de
falhar em silêncio.

### Calendário (módulo integrado)
- **Visão mensal** com uma cor por tipo: visita, cliente interessado,
  follow-up, treinamento, reunião obrigatória e aviso da diretoria
- **Visão diária** em timeline, com marcador de "agora", check-in dos
  compromissos e tarefas do dia
- **Agenda corporativa**: o gestor cria eventos para toda a equipe (ou para
  alguns), com confirmação de presença obrigatória
- **Agendar retorno** dentro da oportunidade: amanhã, 3 dias, 7 dias ou data
  personalizada
- **Quem visitar**: ao lado da agenda do dia, o CRM sugere os clientes que
  estão pedindo visita, com o motivo escrito do lado — "follow-up vencido",
  "23 dias sem contato", "proposta em aberto", "já vai a Icó". Um toque em
  **▤ Agendar** joga o cliente na primeira hora livre do dia, com endereço e
  telefone já preenchidos. Quem já está marcado naquele dia não aparece
- **Tarefas e lembretes** pessoais, com prazo e conclusão

### Central de notificações
Regras avaliadas a cada consulta, sem job em background: reunião em 1 hora,
visita em 30 minutos, follow-up vencido, cliente sem retorno há mais de 7 dias,
meta diária não alcançada, nova campanha disponível e presença pendente. Para o
gestor: vendedor sem agenda e comunicado sem leitura.

### Mural de avisos
Comunicados da diretoria com prioridade e categoria. O vendedor marca
**"✓ Li o comunicado"** e o gestor vê exatamente quem leu e quem não leu.

### Biblioteca comercial e central de objeções
Vídeos e PDFs oficiais (abordagem, demonstração, tabela de taxas, comparativo,
argumentário). Nas objeções, a resposta pronta vem **com os números do cliente
já calculados**: taxa atual x taxa NewPay, custo mensal de cada uma e a economia
por mês e por ano. Dá para copiar ou mandar no WhatsApp.
- **A gestão publica e tira material do ar** pela própria tela: link (vídeo,
  planilha, apresentação) ou arquivo enviado — PDF ou imagem de até 8 MB, que
  fica no diretório de dados junto com os anexos de visita
- Aceita **vídeo e áudio** também: o arquivo sobe em binário puro (até 64 MB) e
  fica no diretório de dados, junto com os anexos de visita
- Todo mundo tem o botão **⇩︎ Enviar**, que abre o WhatsApp com o link do
  material pronto para mandar ao lojista
- Apagar o material apaga o arquivo do servidor junto; vendedor só consome
- As objeções continuam com resposta e dicas, sem simulação de economia

### Ranking gamificado
Pódio, classificação por ativações, conversão e % da meta, com os
níveis ◔ Bronze · ◑ Prata · ◕ Ouro · ◆ Diamante · ★ Elite NewPay.

### KPI diário obrigatório
Fechamento do dia com os 5 números: visitas realizadas, novos leads, propostas
enviadas e máquinas vendidas. O CRM já pré-preenche com o que foi
registrado durante o dia — o vendedor confere e confirma. O histórico mostra
quais dias ficaram sem fechamento.

### Remoção de registros
Tudo que entra no CRM pode sair, sempre com um aviso do que será removido junto:

| O que | Onde | Regra |
| --- | --- | --- |
| Cliente | Ficha do cliente e menu do cartão no Pipeline | Leva visitas, propostas, compromissos, tarefas e anexos. **Cliente com máquina ativada é protegido** — só o gestor apaga, de propósito |
| Visita | Ficha do cliente | Apaga também as fotos e o áudio do disco |
| Proposta / venda | Ficha do cliente | Avisa quando a venda já está ativada e conta na meta do mês |
| Comunicado | Mural de avisos | Só gestor; leva junto o registro de leitura |
| Compromisso | Agenda (ao editar) | — |
| Tarefa | Tarefas | — |

### App instalável no celular (PWA)
- O vendedor instala na tela inicial e abre como aplicativo, sem barra de
  endereço: em **Mais** aparece o convite "Instalar na tela inicial" (no iPhone,
  o passo a passo do menu Compartilhar)
- **Abre sem internet**: a casca do app fica no aparelho. Os dados continuam
  vindo do servidor — CRM mostrando funil velho seria pior do que
  avisar que está sem conexão
- Atalhos ao segurar o ícone: *Registrar visita*, *Agenda de hoje* e *Pipeline*
- Ícones gerados por script (`npm --prefix web run icones`), sem dependência de
  ferramenta de design

### Expediente (entrada e saída)
- Um botão grande: **Iniciar expediente** / **Encerrar expediente**, com o
  relógio do tempo em campo e o histórico dos últimos 14 dias
- A **localização é gravada no momento da batida** — entrada e saída — e só
  nesse momento: o CRM não acompanha ninguém ao longo do dia
- A coordenada vira **nome de rua** ("Travessa José Severino — Mombaça"), e cada
  batida tem link para o mapa. A conversão acontece **depois** de registrar, no
  Nominatim (OpenStreetMap): a batida nunca espera pela internet, e se a
  consulta falhar o registro mantém latitude e longitude
- É a única chamada a serviço externo do sistema; `NEWPAY_GEOCODIFICAR=false`
  desliga e guarda só a coordenada
- Sem GPS disponível o expediente abre do mesmo jeito, marcado como "sem
  localização", porque travar o começo do dia por causa de sinal seria pior
- Não deixa abrir dois expedientes ao mesmo tempo nem encerrar o que não
  começou; jornada esquecida aberta por mais de 18h fica marcada para revisão
- O gestor acompanha e corrige tudo isso na aba **Ponto** do painel (abaixo)

### Cadastro da equipe (gestor)
- Admite vendedor, gestor ou diretoria com e-mail de acesso e **senha
  provisória gerada na hora** (aparece uma vez, para entregar à pessoa)
- Edita cargo, cidade, telefone e meta de visitas por dia. Quem entra herda a
  base de partida (usada na rota e no mapa) de quem cadastrou
- Reseta senha de quem esqueceu e inativa quem saiu, sem perder o histórico
- Regras que evitam tiro no pé: e-mail duplicado, senha fraca, inativar a
  própria conta ou deixar a operação sem nenhum gestor ativo

### Painel do gestor
- **Execução do dia**: quem está em reunião, em visita, em rota, atrasado ou sem
  agenda; meta de visitas de cada um; quem ainda não fechou o KPI
- **Resultado do mês**: leads gerados e trabalhados, visitas (produtivas e
  perdidas), propostas, vendas, ativações, taxa de conversão, ticket médio,
  vendas por cidade e por segmento
- **Ponto**: quem está em campo agora, quem não bateu o ponto, horas do dia e
  cada batida com horário, endereço e link do mapa. O gestor **corrige** horário
  errado e **lança** o expediente que ninguém bateu (celular sem bateria, sinal
  ruim) — os dois exigem motivo, que fica gravado no registro junto com o nome
  de quem mexeu. Lançamento manual aparece marcado como "lançado pela gestão",
  para nunca se confundir com batida do aparelho
- **Registro diário**: grade de disciplina de KPI por vendedor

---

## Hospedagem em produção

O mesmo processo Node serve a API e o front (`web/dist`), então basta **um
serviço** no ar.

### 1. Build do front

```bash
npm run build
```

### 2. Variáveis de ambiente

Copie `.env.example` para `.env` (ou configure no painel do host). O mínimo:

```bash
NODE_ENV=production
NEWPAY_SECRET=<gere o seu>
NEWPAY_DATA_DIR=/data
NEWPAY_ADMIN_EMAIL=voce@empresa.com.br
NEWPAY_ADMIN_SENHA=<senha do primeiro acesso>
```

Gere o segredo com:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

O servidor **se recusa a subir** se `NEWPAY_SECRET` faltar, for o valor de
desenvolvimento ou tiver menos de 24 caracteres.

### 3. Subir

```bash
npm start
```

Na primeira vez o banco nasce **vazio**, só com o gestor do `NEWPAY_ADMIN_*`
(que precisa trocar a senha no primeiro acesso). Nada de cliente fictício: a
base de demonstração só é gerada fora de produção.

### Em container (recomendado)

```bash
docker compose up -d --build
```

Sobe API e front em um serviço só, com os dados em um volume (`newpay-dados`)
que sobrevive a `up --build`. O passo a passo completo — migrar o banco que já
existe, subir na VPS, backup e atualização — está em **[DEPLOY.md](DEPLOY.md)**.

### 4. Onde hospedar

O banco e os anexos são arquivos em disco. **Host com disco efêmero (Vercel,
planos free de Render/Railway) apaga tudo a cada deploy.** O que serve:

- VPS (Hostinger, Contabo, DigitalOcean, EC2) com um diretório de dados fixo
- Container com **volume persistente** montado, e `NEWPAY_DATA_DIR` apontando
  para ele
- Nos dois casos: HTTPS na frente (nginx, Caddy ou o proxy do host). **Sem
  HTTPS o navegador bloqueia GPS e câmera** — ou seja, adeus registro de visita
  com foto, mapa e rota

Faça cópia do diretório de dados para fora do servidor (os backups automáticos
protegem contra corrupção, não contra perder a máquina).

### Sobre o app instalado

O service worker (`web/public/sw.js`) serve a casca do app e **nunca** guarda
`/api/` nem `/uploads/`. A navegação é sempre "rede primeiro": assim que um
deploy sobe, quem abrir o app com internet já pega a versão nova. Os arquivos
de `assets/` levam hash no nome e podem ficar em cache para sempre.

Se algum dia precisar invalidar tudo que está nos aparelhos, mude a constante
`VERSAO` no topo do `sw.js` — o service worker apaga os caches antigos ao ativar.

### Front separado da API

Se o front for para outro domínio (CDN, Vercel), desligue o serviço de
estáticos e libere a origem:

```bash
NEWPAY_SERVIR_FRONT=false
NEWPAY_ORIGINS=https://crm.suaempresa.com.br
```

---

## Colocar a operação real no ar

### Equipe
Entre com o gestor do primeiro acesso e cadastre todo mundo em **Equipe**. Cada
pessoa recebe uma senha provisória e troca no primeiro login.

### Acesso de administração pela linha de comando

Quando não há ninguém logado para cadastrar pela tela — banco recém-criado, ou
a senha do gestor se perdeu:

```bash
npm run criar:admin -- --email=voce@empresa.com.br --senha="uma senha sua"
```

- Sem `--email` cria o perfil de desenvolvimento `dev@newpay.com.br`; sem
  `--senha` sorteia uma e mostra no fim (nenhuma senha padrão fica no código)
- Nasce como **diretoria** e entra direto, sem troca obrigatória de senha;
  `--papel=gestor` e `--trocar-senha` mudam isso
- E-mail que já existe não vira cadastro novo: o script promove a conta,
  reativa e troca a senha — a sessão aberta nela cai junto
- O servidor precisa estar parado — a trava do banco recusa os dois juntos

### Tirar a demonstração do caminho

Quando a operação real começar, o banco ainda tem a carteira fictícia do seed
misturada com o que você já cadastrou. Para separar:

```bash
npm run limpar:demo
```

- **Simula por padrão**: mostra o que sairia, o que fica e para quem passam os
  registros órfãos. Só grava com `--aplicar`, e faz uma cópia do banco antes
- Reconhece o que é do seed pelo id sequencial dos clientes (`cli_01`…), então
  **cliente que você cadastrou pelo app fica**, mesmo que tenha usado uma conta
  de demonstração para criar
- Visitas, vendas e compromissos seguem o destino do cliente a que pertencem
- Os quatro vendedores fictícios saem da equipe; o que sobrou no nome deles
  passa para o gestor (`--transferir-para=email` escolhe outra pessoa)
- `--modo=tudo` zera a operação inteira (clientes, visitas, vendas, agenda,
  metas e KPIs) e mantém só a equipe, a biblioteca e as objeções
- O servidor precisa estar parado — a trava do banco recusa os dois juntos

### Carteira de clientes

Importa de uma planilha, pela própria API (mesmas validações do cadastro feito
no app):

```bash
npm run importar:clientes -- --modelo
```

Isso gera `modelo-carteira.csv` com as colunas esperadas. Depois:

```bash
npm run importar:clientes -- --arquivo=carteira.csv --email=gestor@empresa.com.br --senha=...
```

- **Por padrão só simula**: mostra o que criaria, o que é duplicado e o que foi
  recusado, sem gravar nada. Repita com `--aplicar` para valer
- Reconhece nomes de coluna livres (`empresa`, `razao_social`, `loja`;
  `telefone`, `celular`, `whatsapp`; `cidade`, `municipio`...), com ou sem
  acento, separados por `;`, `,` ou tabulação
- Cada linha pode dizer de quem é o cliente na coluna `vendedor` (e-mail); ou
  use `--vendedor=email` para a planilha inteira
- Não duplica: confere CNPJ e, na falta dele, empresa + cidade
- Avisa quando um segmento ou etapa da planilha não existe no CRM, em vez de
  jogar tudo em "Outros" calado

---

## Onde ajustar as regras

O vendedor externo da NewPay é **salário fixo**: o CRM não calcula comissão e
não acompanha TPV. O que ele mede é execução — visitas, propostas, máquinas
vendidas e ativadas — e é isso que alimenta meta, ranking e painel do gestor.


Tudo que é regra de negócio está em **`server/src/domain.js`**:

| O que | Constante |
| --- | --- |
| Faixas dos níveis do ranking | `NIVEIS` |
| Pesos da pontuação de oportunidade | `calcularScore` / `INTERESSES` |
| Segmentos, máquinas, faturamento, dores | `SEGMENTOS`, `MAQUINAS`, `FATURAMENTOS`, `DORES` |
| Etapas do funil | `FUNIL` |
| Peso de cada sinal na sugestão de visita | `avaliarVisita` |
| Cores e tipos do calendário | `EVENT_TYPES` |

Metas mensais por vendedor ficam na tabela `goals` (definidas no seed em
`server/src/seed.js`).

---

## Identidade visual e temas

A interface usa a marca da NewPay: o laranja `#e6712d` (o dos botões e do
"NewPay" no site), o `#ff6b00` como realce, e o preto `#04070b` do hero. Tudo
isso vive em **`web/src/styles/base.css`**, no bloco de tokens — mudar a cor da
marca é trocar duas linhas, e o app inteiro acompanha.

| O que | Token |
| --- | --- |
| Laranja da marca / realce | `--laranja`, `--laranja-forte` |
| Fundos e bordas | `--bg`, `--surface`, `--surface-2`, `--line` |
| Texto | `--text`, `--text-2`, `--text-3` |
| Moldura (rail, topbar, barra de baixo) | `--chrome*` |
| Ação forte (salvar, confirmar) | `--acao`, `--acao-text` |
| Estados (ok, erro, alerta, info) | `--ok-*`, `--erro-*`, `--alerta-*`, `--info-*` |

**Claro e escuro** são o mesmo conjunto de tokens redefinido em
`:root[data-tema="escuro"]`. Quem decide é o atributo `data-tema` do `<html>`:

- na primeira pintura, o script inline do `web/index.html` lê o que foi salvo
  no aparelho ou, na falta, o que o sistema prefere — sem isso a tela pisca
  branca antes do React montar;
- o botão ☀︎/☾ da topbar troca em uso (`web/src/lib/tema.js`) e grava a
  escolha no próprio aparelho: o vendedor usa o claro no sol da rua e o escuro
  ao fechar o dia, sem mexer no cadastro;
- `color-scheme` acompanha, então calendário, relógio e barra de rolagem
  nativos do celular vêm escuros também.

**Sem emoji colorido.** Os ícones da interface são glifos monocromáticos de
teclado (⌂ ▦ ▤ ◇ ★ ⚑ ✓ ✕ ▶ ◷ ⌖ ⌕ …), que herdam a cor do texto e do tema em
vez de trazer a paleta do sistema operacional para dentro do CRM. Alguns
levam `U+FE0E` colado — é o seletor que obriga o celular a desenhar o símbolo
em texto, senão o Android pinta de colorido mesmo assim.

**Grade responsiva.** As listas em cartão usam `.grid-auto` e
`.grid-auto-larga`, que multiplicam colunas conforme a tela cresce, sem
breakpoint fixo. A largura mínima da coluna vai dentro de um `min(..., 100%)`:
sem isso, numa tela de 360px a coluna continua valendo 360px e o cartão vaza
pela direita — a tela inteira anda de lado. Vale para qualquer
`repeat(auto-fit, minmax(Npx, 1fr))` que entrar depois.

**O logotipo** oficial fica em `web/public/`, em duas artes:

| Arquivo | Onde vale |
| --- | --- |
| `logo-npb.png` | fundos claros (a arte original, com o "p" preto) |
| `logo-npb-escuro.png` | fundos escuros — o mesmo desenho com o "p" claro, senão ele some no preto |

Quem escolhe entre as duas é o CSS, pela classe `.logo-npb` e pelo tema; a
variante `.sobre-preto` força a clara onde o fundo é preto nos dois temas
(abertura e login). Ele aparece em cinco lugares: **abertura** do app,
**login** (na vitrine no computador, em cima do cartão no celular), **rail**
do computador, pé do menu **Mais** e o **ícone do app instalado** — este
gerado por `npm --prefix web run icones`, que lê o próprio `logo-npb.png` e
monta os quatro PNGs (Android, maskable e iPhone). Trocou o logotipo? Ponha os
dois arquivos no lugar e rode esse comando.

---

## Estrutura

```
server/
  src/
    index.js          rotas montadas, /uploads, /api/meta, front em produção
    config.js         variáveis de ambiente e checagens de produção
    bootstrap.js      como o banco nasce (demo fora de produção, vazio nela)
    domain.js         vocabulário e regras de negócio
    metrics.js        funil, ranking, KPIs
    notifications.js  regras da central de notificações
    store.js          persistência (JSON, gravação atômica, backup e trava)
    auth.js           login, hash de senha, token e senha provisória
    seed.js           base de demonstração (e --vazio para produção)
    routes/           auth, users, dashboard, clients, visits, deals, kpi,
                      ranking, content, events, tasks, jornada,
                      announcements, notifications, manager
  scripts/
    smoke.mjs             verificação ponta a ponta da API
    importar-clientes.mjs importação da carteira por CSV
web/
  src/
    pages/            Início, Carteira, Cliente, Calendário, Agenda do dia,
                      Tarefas, Expediente, Ranking, Biblioteca,
                      Objeções, Avisos, Fechar o dia, Painel do gestor,
                      Equipe
    components/       AppShell, RegistrarVisita, DiagnosticoModal,
                      NovoCliente, MapaClientes, EventoModal, EventoCard,
                      AgendarRetorno, NotificacoesPainel, TrocarSenha, ui
    state/app.jsx     sessão, vocabulário, notificações e avisos
    api/client.js     cliente HTTP e lista de endpoints
    styles/           base.css, modules.css, crm.css
```

### Persistência

Os dados ficam em `db.json` e os anexos de visita em `uploads/`, ambos dentro
do diretório de dados (`server/data/` por padrão, ou `NEWPAY_DATA_DIR` em
produção). A camada de acesso está isolada em `server/src/store.js` — para
migrar para Postgres ou MySQL basta reimplementar esse módulo, sem tocar nas
rotas.

Três garantias desse arquivo único:

- **Gravação atômica**: escreve em `db.json.tmp` e renomeia. Queda de energia no
  meio da escrita não deixa o banco pela metade.
- **Backup rotativo** em `backups/`, a cada 30 minutos de atividade, guardando
  os 20 mais recentes (`NEWPAY_BACKUP_*`). Se o `db.json` aparecer ilegível, o
  servidor move o arquivo para `db.corrompido-<data>.json` e sobe a partir do
  backup mais novo, avisando no log — em vez de começar vazio por cima do que
  sobrou.
- **Trava de escrita** (`db.lock`): dois servidores no mesmo diretório de dados
  se sobrescreveriam, então o segundo se recusa a subir. Se o dono da trava
  morreu, o próximo assume.

### Autenticação e acessos

Token assinado com HMAC-SHA256 e senha com scrypt (`server/src/auth.js`), sem
dependências externas.

- **Em produção o servidor não sobe sem `NEWPAY_SECRET`** (mínimo de 24
  caracteres) — sem isso qualquer um que leia o código assinaria um token
  válido.
- Quem admite, edita, inativa e reseta senha é o gestor, na tela **Equipe**.
  Nada disso depende mais do seed.
- Senha nova (admissão ou reset) nasce **provisória**: aparece uma única vez
  para o gestor e o CRM exige a troca no primeiro acesso da pessoa.
- **A sessão dura 30 dias** (`NEWPAY_HORAS_SESSAO`, em horas): vendedor em campo
  entra uma vez por mês, não toda manhã.
- **Trocar ou resetar a senha derruba as sessões abertas** daquela pessoa (o
  token carrega a versão da senha). Quem acabou de trocar continua logado; os
  outros aparelhos caem no login. É o outro caminho para celular perdido.
- Inativar em **Equipe** tira o acesso na hora — inclusive de quem já estava
  logado, sem esperar a sessão vencer — mas mantém o histórico de visitas,
  vendas e metas da pessoa nos relatórios. É o caminho para celular perdido ou
  desligamento.
