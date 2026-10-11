import 'dotenv/config';
import amqp from 'amqplib';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE = 'placementos.events';
const QUEUE = 'applications.process';
const RETRY = 'applications.retry';
const DLQ = 'applications.dlq';

async function main() {
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  await channel.assertExchange(EXCHANGE, 'direct', { durable: true });
  await channel.assertQueue(DLQ, { durable: true });
  await channel.assertQueue(RETRY, {
    durable: true,
    arguments: { 'x-message-ttl': 10000, 'x-dead-letter-exchange': EXCHANGE, 'x-dead-letter-routing-key': QUEUE }
  });
  await channel.assertQueue(QUEUE, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': DLQ }
  });
  await channel.bindQueue(QUEUE, EXCHANGE, QUEUE);
  channel.prefetch(10);
  console.log('PlacementOS worker listening for application jobs');

  channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    let payload: { applicationId: string; attempts?: number };
    try {
      payload = JSON.parse(msg.content.toString());
      if (!payload.applicationId) throw new Error('Missing applicationId');

      const result = await pool.query(
        `SELECT a.id,a.status,u.id AS student_id,u.institution_id AS student_institution,
                u.degree,u.cgpa,j.institution_id AS job_institution,j.min_cgpa,
                j.eligible_degrees,j.application_deadline,j.status AS job_status
         FROM applications a JOIN users u ON u.id=a.student_id JOIN jobs j ON j.id=a.job_id
         WHERE a.id=$1`,
        [payload.applicationId]
      );
      if (!result.rowCount) { channel.ack(msg); return; }
      const row = result.rows[0];
      if (row.status !== 'PENDING') { channel.ack(msg); return; }

      let reason = '';
      if (row.student_institution !== row.job_institution) reason = 'Student and job belong to different institutions';
      else if (row.job_status !== 'OPEN' || new Date(row.application_deadline) < new Date()) reason = 'Job is closed or past its deadline';
      else if (row.cgpa === null || Number(row.cgpa) < Number(row.min_cgpa)) reason = `Minimum CGPA required: ${row.min_cgpa}`;
      else if (row.eligible_degrees?.length && !row.eligible_degrees.includes(row.degree)) reason = `Eligible degrees: ${row.eligible_degrees.join(', ')}`;

      const status = reason ? 'REJECTED' : 'APPLIED';
      await pool.query('UPDATE applications SET status=$1,decision_reason=$2 WHERE id=$3 AND status=$4', [status, reason || null, row.id, 'PENDING']);
      await pool.query('INSERT INTO notifications(user_id,message) VALUES($1,$2)', [
        row.student_id,
        reason ? `Your placement application was not eligible. ${reason}` : 'Your placement application passed the eligibility check.'
      ]);
      channel.ack(msg);
    } catch (error) {
      console.error('Application processing failed:', error);
      const attempts = (payload!?.attempts ?? 0) + 1;
      if (attempts <= 3) {
        channel.sendToQueue(RETRY, Buffer.from(JSON.stringify({ ...payload!, attempts })), {
          persistent: true, contentType: 'application/json'
        });
        channel.ack(msg);
      } else {
        channel.sendToQueue(DLQ, msg.content, { persistent: true, contentType: 'application/json' });
        channel.ack(msg);
      }
    }
  });
}
main().catch((err) => { console.error('Worker failed to start', err); process.exit(1); });
