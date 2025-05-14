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
  await ch.prefetch(1);

  console.log('🛠️  Worker ready, waiting for tasks…');

  ch.consume(QUEUE, msg => {
    if (!msg) return;

    const { id, complexity } = JSON.parse(msg.content.toString());
    console.log(`↻  Task ${id} picked by ${process.pid}. Processing ${complexity}s…`);

    setTimeout(() => {
      console.log(`✓  Task ${id} done by ${process.pid}`);
      ch.ack(msg);
    }, complexity * 1000);
  }, { noAck: false });
})();

