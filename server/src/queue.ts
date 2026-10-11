import amqp from 'amqplib';
let connection: any;
let channel: any;
export const EXCHANGE = 'placementos.events';
export const APPLICATION_QUEUE = 'applications.process';
export const RETRY_QUEUE = 'applications.retry';
export const DLQ = 'applications.dlq';

export async function getChannel() {
  if (channel) return channel;
  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('RABBITMQ_URL is required');
  connection = await amqp.connect(url);
  channel = await connection.createChannel();
  await channel.assertExchange(EXCHANGE, 'direct', { durable: true });
  await channel.assertQueue(DLQ, { durable: true });
  await channel.assertQueue(RETRY_QUEUE, {
    durable: true,
    arguments: { 'x-message-ttl': 10000, 'x-dead-letter-exchange': EXCHANGE, 'x-dead-letter-routing-key': APPLICATION_QUEUE }
  });
  await channel.assertQueue(APPLICATION_QUEUE, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': DLQ }
  });
  await channel.bindQueue(APPLICATION_QUEUE, EXCHANGE, APPLICATION_QUEUE);
  return channel;
}
export async function publishApplication(applicationId: string) {
  const ch = await getChannel();
  ch.sendToQueue(APPLICATION_QUEUE, Buffer.from(JSON.stringify({ applicationId, attempts: 0 })), {
    persistent: true, contentType: 'application/json', messageId: applicationId
  });
}
