if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
}

if (!process.env.RABBITMQ_URL) {
  process.env.RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';
}
