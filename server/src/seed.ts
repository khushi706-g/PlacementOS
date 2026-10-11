import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, initDb } from './db.js';

await initDb();
const institution = await pool.query(
  `INSERT INTO institutions(name,domain) VALUES('Demo Institute','demo.edu')
   ON CONFLICT(domain) DO UPDATE SET name=EXCLUDED.name RETURNING id`
);
const institutionId = institution.rows[0].id;
const hash = await bcrypt.hash('Password123!', 12);
for (const user of [
  { name: 'Demo Officer', email: 'officer@demo.edu', role: 'OFFICER', degree: null, cgpa: null },
  { name: 'Demo Student', email: 'student@demo.edu', role: 'STUDENT', degree: 'CSE', cgpa: 8.2 },
  { name: 'Demo Recruiter', email: 'recruiter@demo.edu', role: 'RECRUITER', degree: null, cgpa: null }
]) {
  await pool.query(
    `INSERT INTO users(name,email,password_hash,role,institution_id,degree,cgpa,graduation_year)
     VALUES($1,$2,$3,$4,$5,$6,$7,2027)
     ON CONFLICT(email) DO NOTHING`,
    [user.name, user.email, hash, user.role, institutionId, user.degree, user.cgpa]
  );
}
const recruiter = await pool.query(`SELECT id FROM users WHERE email='recruiter@demo.edu'`);
await pool.query(
  `INSERT INTO jobs(institution_id,recruiter_id,title,company,description,min_cgpa,eligible_degrees,application_deadline)
   SELECT $1,$2,'Software Engineer Intern','Example Technologies','Work on APIs, databases and distributed systems.',7.0,ARRAY['CSE','IT','ECE'],CURRENT_DATE + INTERVAL '90 days'
   WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE title='Software Engineer Intern' AND institution_id=$1)`,
  [institutionId, recruiter.rows[0].id]
);
console.log('Seed complete. Demo passwords: Password123!');
await pool.end();
