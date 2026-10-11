import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { z } from 'zod';
import { pool, initDb } from './db.js';
import { allowRoles, requireAuth, signToken } from './auth.js';
import { publishApplication } from './queue.js';

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { lazyConnect: true, maxRetriesPerRequest: 1 });
redis.on('error', () => {});
async function cacheGet(key: string) { try { if (redis.status === 'wait') await redis.connect(); return await redis.get(key); } catch { return null; } }
async function cacheSet(key: string, value: string) { try { if (redis.status === 'wait') await redis.connect(); await redis.set(key, value, 'EX', 30); } catch {} }
async function cacheDel(key: string) { try { if (redis.status === 'wait') await redis.connect(); await redis.del(key); } catch {} }

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', service: 'placementos-api' }); }
  catch { res.status(503).json({ status: 'unavailable' }); }
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const input = z.object({
      name: z.string().min(2).max(100), email: z.string().email(),
      password: z.string().min(10).max(72),
      role: z.enum(['STUDENT']).default('STUDENT'),
      institutionId: z.string().uuid().optional(),
      degree: z.string().max(30).optional(),
      cgpa: z.number().min(0).max(10).optional(),
      graduationYear: z.number().int().min(2020).max(2100).optional()
    }).parse(req.body);
    if (!input.institutionId) return res.status(400).json({ error: 'institutionId is required' });
    const hash = await bcrypt.hash(input.password, 12);
    const result = await pool.query(
      `INSERT INTO users(name,email,password_hash,role,institution_id,degree,cgpa,graduation_year)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id,name,email,role,institution_id AS "institutionId"`,
      [input.name, input.email.toLowerCase(), hash, input.role, input.institutionId || null, input.degree || null, input.cgpa ?? null, input.graduationYear ?? null]
    );
    const row = result.rows[0];
    const user = { id: row.id, email: row.email, role: row.role, institutionId: row.institutionId };
    res.status(201).json({ user: row, token: signToken(user) });
  } catch (e: any) { if (e.code === '23505') return res.status(409).json({ error: 'Email already registered' }); next(e); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const input = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const result = await pool.query('SELECT id,name,email,password_hash,role,institution_id FROM users WHERE email=$1', [input.email.toLowerCase()]);
    const row = result.rows[0];
    if (!row || !(await bcrypt.compare(input.password, row.password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
    const user = { id: row.id, email: row.email, role: row.role, institutionId: row.institution_id };
    res.json({ user: { id: row.id, name: row.name, email: row.email, role: row.role, institutionId: row.institution_id }, token: signToken(user) });
  } catch (e) { next(e); }
});

app.get('/api/jobs', async (req, res, next) => {
  try {
    const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : '';
    const key = `jobs:${institutionId || 'all'}`;
    const cached = await cacheGet(key);
    if (cached) return res.json(JSON.parse(cached));
    const result = institutionId
      ? await pool.query(`SELECT j.*, i.name AS institution_name FROM jobs j JOIN institutions i ON i.id=j.institution_id WHERE j.institution_id=$1 AND j.status='OPEN' ORDER BY j.created_at DESC`, [institutionId])
      : await pool.query(`SELECT j.*, i.name AS institution_name FROM jobs j JOIN institutions i ON i.id=j.institution_id WHERE j.status='OPEN' ORDER BY j.created_at DESC`);
    await cacheSet(key, JSON.stringify(result.rows));
    res.json(result.rows);
  } catch (e) { next(e); }
});

app.post('/api/jobs', requireAuth, allowRoles('RECRUITER','OFFICER','ADMIN'), async (req, res, next) => {
  try {
    const input = z.object({
      title: z.string().min(3).max(150), company: z.string().min(2).max(120),
      description: z.string().min(10).max(10000), minCgpa: z.number().min(0).max(10),
      eligibleDegrees: z.array(z.string().min(1).max(30)).max(20),
      institutionId: z.string().uuid(), applicationDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    }).parse(req.body);
    if (req.user!.role !== 'ADMIN' && req.user!.institutionId !== input.institutionId) return res.status(403).json({ error: 'You can only create jobs for your institution' });
    const result = await pool.query(
      `INSERT INTO jobs(institution_id,recruiter_id,title,company,description,min_cgpa,eligible_degrees,application_deadline)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [input.institutionId, req.user!.id, input.title, input.company, input.description, input.minCgpa, input.eligibleDegrees, input.applicationDeadline]
    );
    await cacheDel(`jobs:${input.institutionId}`); await cacheDel('jobs:all');
    res.status(201).json(result.rows[0]);
  } catch (e) { next(e); }
});

app.post('/api/applications', requireAuth, allowRoles('STUDENT'), async (req, res, next) => {
  try {
    const key = req.header('Idempotency-Key');
    if (!key || key.length < 8 || key.length > 128) return res.status(400).json({ error: 'Provide an Idempotency-Key header (8-128 chars)' });
    const input = z.object({ jobId: z.string().uuid() }).parse(req.body);
    const job = await pool.query('SELECT id,institution_id,status,application_deadline FROM jobs WHERE id=$1', [input.jobId]);
    if (!job.rowCount) return res.status(404).json({ error: 'Job not found' });
    if (job.rows[0].institution_id !== req.user!.institutionId) return res.status(403).json({ error: 'This job is not available to your institution' });
    if (job.rows[0].status !== 'OPEN' || new Date(job.rows[0].application_deadline) < new Date()) return res.status(400).json({ error: 'Applications are closed for this job' });
    const result = await pool.query(
      `INSERT INTO applications(job_id,student_id,idempotency_key,status)
       VALUES($1,$2,$3,'PENDING')
       ON CONFLICT DO NOTHING RETURNING *`,
      [input.jobId, req.user!.id, key]
    );
    if (!result.rowCount) {
      const existing = await pool.query('SELECT * FROM applications WHERE student_id=$1 AND (idempotency_key=$2 OR job_id=$3) ORDER BY created_at DESC LIMIT 1', [req.user!.id, key, input.jobId]);
      return res.status(200).json({ application: existing.rows[0], duplicate: true });
    }
    try { await publishApplication(result.rows[0].id); }
    catch {
      await pool.query('DELETE FROM applications WHERE id=$1 AND status=$2', [result.rows[0].id, 'PENDING']);
      return res.status(503).json({ error: 'Application queue unavailable; please retry with the same idempotency key' });
    }
    res.status(202).json({ application: result.rows[0], message: 'Application queued for eligibility evaluation' });
  } catch (e) { next(e); }
});

app.get('/api/applications/me', requireAuth, allowRoles('STUDENT'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT a.*, j.title, j.company FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.student_id=$1 ORDER BY a.created_at DESC`,
      [req.user!.id]
    );
    res.json(result.rows);
  } catch (e) { next(e); }
});

app.get('/api/applications', requireAuth, allowRoles('OFFICER','RECRUITER','ADMIN'), async (req, res, next) => {
  try {
    const result = req.user!.role === 'ADMIN'
      ? await pool.query(`SELECT a.*,j.title,j.company,u.name AS student_name,u.email AS student_email FROM applications a JOIN jobs j ON j.id=a.job_id JOIN users u ON u.id=a.student_id ORDER BY a.created_at DESC LIMIT 500`)
      : await pool.query(`SELECT a.*,j.title,j.company,u.name AS student_name,u.email AS student_email FROM applications a JOIN jobs j ON j.id=a.job_id JOIN users u ON u.id=a.student_id WHERE j.institution_id=$1 ORDER BY a.created_at DESC LIMIT 500`, [req.user!.institutionId]);
    res.json(result.rows);
  } catch (e) { next(e); }
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request', details: err.issues });
  if (err.code === '23503') return res.status(400).json({ error: 'Referenced institution or record does not exist' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT || 4000);
await initDb();
app.listen(port, () => console.log(`PlacementOS API listening on ${port}`));
