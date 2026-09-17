# CRM NewPay — Vendas Externas

CRM para a equipe de vendas externas da NewPay (maquininhas de cartão), com o
módulo Calendário integrado. Feito para o vendedor abrir e saber na hora:
**quantos clientes visitar hoje, quem está mais perto de comprar, quanto falta
para a meta, quem precisa de retorno e quanto já ganhou de comissão.**

- **`server/`** — API REST em Node.js + Express (JavaScript, ESM)
- **`web/`** — interface em React + Vite (JavaScript), mobile-first

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

### Verificação da API

Com o servidor no ar, roda ~80 checagens de ponta a ponta:

```bash
npm --prefix server run smoke
```

---

## O que está implementado

### Dashboard inicial
Meta do mês (máquinas ativadas x meta, % e quanto falta), comissão acumulada
com a composição (máquinas + TPV + bônus), TPV, posição no ranking e nível.
Abaixo: atividades do dia (visitas agendadas, follow-ups pendentes, clientes
para retornar, propostas enviadas), funil completo e os leads mais perto de
comprar.

### Pipeline (quadro do funil)
Tela em formato de quadro: uma coluna por etapa do funil, um cartão por cliente
e o total de TPV no rodapé de cada coluna. O cartão fica **vermelho quando o
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

### Agenda inteligente e rota
O CRM ordena a carteira por oportunidade + tempo sem contato + distância da
base, agrupa por cidade ("Você possui 5 clientes quentes na região de Iguatu"),
monta a rota pelo trajeto mais curto, abre no Google Maps e transforma a rota em
visitas na agenda já com o tempo de deslocamento.

### Mapa de clientes
Clientes e leads posicionados por GPS, com filtro por raio ("Você tem 12 leads a
menos de 3 km"), centralização na posição atual do vendedor e lista dos mais
próximos.

### Registro de visita
Em dois toques: **Interessado · Não interessado · Fechado · Retornar depois**,
com foto (fachada, máquina atual, contrato), áudio gravado na hora e GPS.
Cada resultado move o cliente no funil; "retornar" já agenda o follow-up e
"fechado" já abre o negócio com máquinas e TPV previsto.

### Calendário (módulo integrado)
- **Visão mensal** com cores por tipo: 🔵 visita · 🟢 cliente interessado ·
  🟡 follow-up · 🟣 treinamento · 🔴 reunião obrigatória · ⚫ aviso da diretoria
- **Visão diária** em timeline, com marcador de "agora", check-in dos
  compromissos e tarefas do dia
- **Agenda corporativa**: o gestor cria eventos para toda a equipe (ou para
  alguns), com confirmação de presença obrigatória
- **Agendar retorno** dentro da oportunidade: amanhã, 3 dias, 7 dias ou data
  personalizada
- **Tarefas e lembretes** pessoais, com prazo e conclusão

### Central de notificações
Regras avaliadas a cada consulta, sem job em background: reunião em 1 hora,
visita em 30 minutos, follow-up vencido, cliente sem retorno há mais de 7 dias,
meta diária não alcançada, nova campanha disponível e presença pendente. Para o
gestor: vendedor sem agenda e comunicado sem leitura.

### Mural de avisos
Comunicados da diretoria com prioridade e categoria. O vendedor marca
**"✅ Li o comunicado"** e o gestor vê exatamente quem leu e quem não leu.

### Biblioteca comercial e central de objeções
Vídeos e PDFs oficiais (abordagem, demonstração, tabela de taxas, comparativo,
argumentário). Nas objeções, a resposta pronta vem **com os números do cliente
já calculados**: taxa atual x taxa NewPay, custo mensal de cada uma e a economia
por mês e por ano. Dá para copiar ou mandar no WhatsApp.

### Ranking gamificado
Pódio, classificação por ativações, comissão, conversão e % da meta, com os
níveis 🥉 Bronze · 🥈 Prata · 🥇 Ouro · 💎 Diamante · 👑 Elite NewPay.

### KPI diário obrigatório
Fechamento do dia com os 5 números: visitas realizadas, novos leads, propostas
enviadas, máquinas vendidas e TPV previsto. O CRM já pré-preenche com o que foi
registrado durante o dia — o vendedor confere e confirma. O histórico mostra
quais dias ficaram sem fechamento.

### Remoção de registros
Tudo que entra no CRM pode sair, sempre com um aviso do que será removido junto:

| O que | Onde | Regra |
| --- | --- | --- |
| Cliente | Ficha do cliente e menu do cartão no Pipeline | Leva visitas, propostas, compromissos, tarefas e anexos. **Cliente com máquina ativada é protegido** — só o gestor apaga, de propósito |
| Visita | Ficha do cliente | Apaga também as fotos e o áudio do disco |
| Proposta / venda | Ficha do cliente | Avisa quando a venda já está ativada e conta na comissão |
| Comunicado | Mural de avisos | Só gestor; leva junto o registro de leitura |
| Compromisso | Agenda (ao editar) | — |
| Tarefa | Tarefas | — |

### Painel do gestor
- **Execução do dia**: quem está em reunião, em visita, em rota, atrasado ou sem
  agenda; meta de visitas de cada um; quem ainda não fechou o KPI
- **Resultado do mês**: leads gerados e trabalhados, visitas (produtivas e
  perdidas), propostas, vendas, ativações, TPV, taxa de conversão, custo por
  venda, ticket médio, vendas por cidade e por segmento
- **Registro diário**: grade de disciplina de KPI por vendedor

---

## Onde ajustar as regras

Tudo que é regra de negócio está em **`server/src/domain.js`**:

| O que | Constante |
| --- | --- |
| Comissão (R$ por máquina, % do TPV, bônus de meta) | `COMISSAO` |
| Faixas dos níveis do ranking | `NIVEIS` |
| Pesos da pontuação de oportunidade | `calcularScore` / `INTERESSES` |
| Segmentos, máquinas, faturamento, dores | `SEGMENTOS`, `MAQUINAS`, `FATURAMENTOS`, `DORES` |
| Etapas do funil | `FUNIL` |
| Cores e tipos do calendário | `EVENT_TYPES` |

Metas mensais por vendedor ficam na tabela `goals` (definidas no seed em
`server/src/seed.js`).

---

## Estrutura

```
server/
  src/
    index.js          rotas montadas, /uploads, /api/meta
    domain.js         vocabulário e regras de negócio
    metrics.js        funil, comissão, ranking, KPIs
    notifications.js  regras da central de notificações
    store.js          persistência (JSON em server/data/db.json)
    auth.js           login, hash de senha e token
    seed.js           base de demonstração
    routes/           auth, dashboard, clients, visits, deals, kpi,
                      ranking, content, events, tasks, agenda,
                      announcements, notifications, manager
  scripts/smoke.mjs   verificação ponta a ponta da API
web/
  src/
    pages/            Início, Carteira, Cliente, Calendário, Agenda do dia,
                      Agenda inteligente, Tarefas, Ranking, Biblioteca,
                      Objeções, Avisos, Fechar o dia, Painel do gestor
    components/       AppShell, RegistrarVisita, DiagnosticoModal,
                      NovoCliente, MapaClientes, EventoModal, EventoCard,
                      AgendarRetorno, NotificacoesPainel, ui
    state/app.jsx     sessão, vocabulário, notificações e avisos
    api/client.js     cliente HTTP e lista de endpoints
    styles/           base.css, modules.css, crm.css
```

### Persistência

Os dados ficam em `server/data/db.json` e os anexos de visita em
`server/data/uploads/`. A camada de acesso está isolada em
`server/src/store.js` — para migrar para Postgres ou MySQL basta reimplementar
esse módulo, sem tocar nas rotas.

### Autenticação

Token assinado com HMAC-SHA256 e senha com scrypt (`server/src/auth.js`), sem
dependências externas. Em produção, defina a variável `NEWPAY_SECRET`.
