const amqp = require('amqplib');
const AMQP_URL = process.env.AMQP_URL || 'amqp://localhost:5672';
const QUEUE = 'tareas_distribuidas';

// Retry logic for connection
async function connectWithRetry(url, retries = 0) {
  try {
    return await amqp.connect(url);
  } catch (err) {
    console.log(`RabbitMQ not ready (attempt #${retries + 1}), retrying in 1s…`);
    await new Promise(r => setTimeout(r, 1000));
    return connectWithRetry(url, retries + 1);
  }
}

(async () => {
  const conn = await connectWithRetry(AMQP_URL);
  const ch = await conn.createChannel();
  await ch.assertQueue(QUEUE, { durable: true });

  for (let i = 1; i <= 10; i++) {
    const complexity = 1 + (i % 5); // Values 1 to 5
    const msg = JSON.stringify({ id: i, complexity });
    ch.sendToQueue(QUEUE, Buffer.from(msg), { persistent: true });
    console.log(`→ Sent task ${i} (complexity ${complexity}s)`);
  }

  setTimeout(() => { conn.close(); process.exit(0); }, 500);
})();


