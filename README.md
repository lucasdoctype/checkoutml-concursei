# Concursei Webhook Payment

## Requisitos
- Node.js 18+
- npm

## Setup rapido
1) Copie `.env.example` para `.env`.
2) Preencha as variaveis obrigatorias:
   - `DATABASE_URL` (ou `SUPABASE_DB_URL`)
   - `MERCADOPAGO_WEBHOOK_SECRET` (opcional, mas recomendado)
   - `MERCADOPAGO_ACCESS_TOKEN` (obrigatorio para Pix/assinaturas)
3) Instale as dependencias:
   - `npm install`
4) Rode em dev:
   - `npm run dev`

## Variaveis de ambiente
- `DATABASE_URL`: usa o adapter Postgres.
- `SUPABASE_DB_URL`: alias para `DATABASE_URL`.
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`: usados quando `DATABASE_URL` nao estiver setado.
- `API_BASE_PATH`: prefixo base das rotas (default `/functions/v1`).
- `MERCADOPAGO_ACCESS_TOKEN`: token para chamadas diretas (quando necessario).
- `MERCADOPAGO_WEBHOOK_SECRET`: segredo para validar assinatura do webhook.
- `MERCADOPAGO_WEBHOOK_TOLERANCE_SEC`: tolerancia em segundos para o timestamp do webhook (default 300).
- `MERCADOPAGO_WEBHOOK_STRICT_SIGNATURE`: valida assinatura (default true).
- `MERCADOPAGO_BASE_URL`: base da API do Mercado Pago.
- `MERCADOPAGO_NOTIFICATION_URL`: URL padrao de notificacao para Pix/assinaturas.
- `MERCADOPAGO_TIMEOUT_MS`: timeout das chamadas HTTP para o Mercado Pago.
- `RABBITMQ_DEFAULT_USER` / `RABBITMQ_DEFAULT_PASS`: credenciais do RabbitMQ no docker.

## Endpoints
- Healthcheck: `GET /health`
- Readiness: `GET /ready`
- Webhook: `POST /webhooks/mercadopago`
- Assinaturas: `POST /subscriptions`
- Assinaturas (cancel): `POST /subscriptions/:id/cancel`
- Assinaturas (pause): `POST /subscriptions/:id/pause`
- Assinaturas (resume): `POST /subscriptions/:id/resume`
- Pix: `POST /pix/payments`

> Com `API_BASE_PATH=/functions/v1`, o endpoint fica `POST /functions/v1/webhooks/mercadopago`.

## Webhook Mercado Pago
- Configure a URL no painel do Mercado Pago apontando para o endpoint acima.
- O corpo precisa ser JSON (raw). A assinatura sera validada se `MERCADOPAGO_WEBHOOK_SECRET` estiver setado.
- O payload e os headers sao persistidos em `mercadopago_webhook_events`.

## Assinaturas (Preapproval)
- Criar: `POST /subscriptions` (repasse o payload esperado pelo Mercado Pago).
- Cancelar: `POST /subscriptions/:id/cancel` (status=cancelled).
- Pausar: `POST /subscriptions/:id/pause` (status=paused).
- Retomar: `POST /subscriptions/:id/resume` (status=authorized).

## Pix
- Criar pagamento Pix: `POST /pix/payments`.
- Retorna `qr_code`, `qr_code_base64` e `ticket_url` quando disponiveis.

## Docker (RabbitMQ)
1) Defina `RABBITMQ_DEFAULT_USER` e `RABBITMQ_DEFAULT_PASS` no `.env`.
2) Suba o RabbitMQ:
   - `docker compose up -d rabbitmq`
3) Painel:
   - `http://localhost:15672`

## Curl (exemplos)
Webhook:
```bash
curl -X POST http://localhost:3005/functions/v1/webhooks/mercadopago \
  -H "Content-Type: application/json" \
  -d '{"id":"123","data":{"id":"123"},"type":"payment","live_mode":false}'
```

Assinatura:
```bash
curl -X POST http://localhost:3005/functions/v1/subscriptions \
  -H "Content-Type: application/json" \
  -d '{"reason":"Plano Mensal","payer_email":"user@email.com","auto_recurring":{"frequency":1,"frequency_type":"months","transaction_amount":29.9,"currency_id":"BRL"}}'
```

Pix:
```bash
curl -X POST http://localhost:3005/functions/v1/pix/payments \
  -H "Content-Type: application/json" \
  -d '{"transaction_amount":29.9,"description":"Plano Mensal","payer_email":"user@email.com"}'
```

## SQL (Supabase)
A tabela de webhooks deve existir no schema `presenq_mvp`. O SQL completo esta no arquivo `schema atualizado.sql` (projeto presenq-server).

## Build e start
- `npm run build`
- `npm start`
