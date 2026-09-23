# Subir o CRM NewPay em container

Um serviço só: o mesmo processo serve a API e a interface. O que precisa
sobreviver a atualizações — banco, anexos de visita e backups — fica em um
volume montado em `/data`.

---

## No seu computador

```bash
docker compose up -d --build
```

O `docker compose` lê o arquivo `.env` da raiz, o mesmo que o `npm start` usa.
O mínimo lá dentro:

```bash
NEWPAY_SECRET=um-segredo-com-no-minimo-24-caracteres
```

Abra http://localhost:4000. Para acompanhar o log:

```bash
docker compose logs -f
```

Para parar:

```bash
docker compose down
```

`down` derruba o container e **mantém** o volume — os dados continuam lá para a
próxima subida. Só `docker compose down -v` apaga os dados.

---

## Levar os dados que já existem para o container

Quem já usou o CRM com `npm start` tem o banco em `server/data/`. Este comando
copia banco e anexos para dentro do volume, antes da primeira subida:

```bash
docker run --rm -v newpay-dados:/data -v "$PWD/server/data:/origem:ro" alpine sh -c "cp /origem/db.json /data/db.json; mkdir -p /data/uploads; cp -a /origem/uploads/. /data/uploads/"
```

No Windows (PowerShell), troque `$PWD/server/data` pelo caminho completo:
`"C:\Users\user\OneDrive\Desktop\crn\server\data:/origem:ro"`.

Faça isso com o servidor antigo **parado**, senão você copia um retrato de meio
segundo atrás. O arquivo `db.lock` não deve ser copiado.

---

## Na VPS

### 1. Instalar o Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### 2. Levar o projeto

```bash
git clone <url-do-repositorio> newpay-crm && cd newpay-crm
```

### 3. Criar o `.env`

```bash
NODE_ENV=production
NEWPAY_SECRET=<gere com: openssl rand -base64 48>
NEWPAY_ADMIN_NOME=Neto Braz
NEWPAY_ADMIN_EMAIL=voce@empresa.com.br
NEWPAY_ADMIN_SENHA=<senha do primeiro acesso>
NEWPAY_ADMIN_CIDADE=Mombaça
# Só o proxy fala com o container:
PORTA_PUBLICA=127.0.0.1:4000
```

Os `NEWPAY_ADMIN_*` valem apenas na primeira subida, quando o banco ainda não
existe: é assim que nasce o primeiro gestor, com troca de senha obrigatória.

### 4. Subir

```bash
docker compose up -d --build
```

### 5. HTTPS na frente

O container escuta só em `127.0.0.1`. Quem fala com a internet é o Caddy, que
resolve o certificado sozinho. Todo o `/etc/caddy/Caddyfile`:

```bash
crm.suaempresa.com.br {
    reverse_proxy localhost:4000
}
```

Sem HTTPS o navegador bloqueia GPS, câmera e microfone — ou seja, registro de
visita com foto, expediente com localização e instalação do app no celular só
funcionam depois desse passo.

---

## Rotina

**Atualizar depois de mexer no código:**

```bash
git pull && docker compose up -d --build
```

O volume não é tocado: os dados continuam.

**Repor o acesso de administração** (senha perdida, ou ninguém logado para
cadastrar pela tela). O servidor precisa sair do ar por um minuto — a trava do
banco não deixa dois processos gravando:

```bash
docker compose stop && docker compose run --rm crm node server/scripts/criar-admin.mjs --email=voce@empresa.com.br --senha="uma senha sua" && docker compose up -d
```

E-mail que já existe é promovido e tem a senha trocada, em vez de duplicar o
cadastro. Sem `--senha` o script sorteia uma e mostra na tela.

**Backup para fora do servidor** (o backup automático interno protege contra
arquivo corrompido, não contra perder a máquina):

```bash
docker run --rm -v newpay-dados:/data -v "$PWD:/saida" alpine tar czf /saida/newpay-$(date +%F).tar.gz -C /data .
```

**Restaurar:**

```bash
docker run --rm -v newpay-dados:/data -v "$PWD:/entrada" alpine sh -c "cd /data && tar xzf /entrada/newpay-2026-09-21.tar.gz"
```

**Ver o que está acontecendo:**

```bash
docker compose ps
```

A coluna de status mostra `healthy` quando o `/api/health` está respondendo — o
container tem verificação própria a cada 30 segundos.

---

## Detalhes da imagem

- Construção em duas etapas: a primeira compila o front com o Vite, a segunda
  fica só com o servidor e o resultado da compilação. A imagem final tem 257 MB
  e nenhuma ferramenta de build.
- Roda como usuário `node`, não como root.
- `HEALTHCHECK` embutido, para o Docker reiniciar sozinho se o processo travar.
- `restart: unless-stopped`: volta depois de reiniciar a máquina.
 