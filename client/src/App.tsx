import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
type User = { id: string; name: string; email: string; role: string; institutionId: string };
type Job = { id: string; title: string; company: string; description: string; min_cgpa: number; eligible_degrees: string[]; application_deadline: string; institution_id: string; institution_name: string };
type Application = { id: string; title: string; company: string; status: string; decision_reason?: string; created_at: string };

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('placementos_token') || '');
  const [user, setUser] = useState<User | null>(() => {
    try { return JSON.parse(localStorage.getItem('placementos_user') || 'null'); } catch { return null; }
  });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [email, setEmail] = useState('student@demo.edu');
  const [password, setPassword] = useState('Password123!');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  async function loadJobs() {
    try { setJobs(await request('/api/jobs')); } catch (e) { setMessage((e as Error).message); }
  }
  async function loadApplications() {
    if (!token || user?.role !== 'STUDENT') return;
    try { setApplications(await request('/api/applications/me')); } catch (e) { setMessage((e as Error).message); }
  }
  useEffect(() => { void loadJobs(); }, []);
  useEffect(() => { void loadApplications(); }, [token, user?.role]);

  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const data = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setToken(data.token); setUser(data.user);
      localStorage.setItem('placementos_token', data.token); localStorage.setItem('placementos_user', JSON.stringify(data.user));
      setMessage(`Welcome, ${data.user.name}!`);
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }

  async function apply(job: Job) {
    setMessage('');
    try {
      const key = crypto.randomUUID();
      const data = await request('/api/applications', {
        method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ jobId: job.id })
      });
      setMessage(data.message || (data.duplicate ? 'Application already exists.' : 'Application submitted.'));
      await loadApplications();
    } catch (e) { setMessage((e as Error).message); }
  }

  function logout() {
    setToken(''); setUser(null); setApplications([]);
    localStorage.removeItem('placementos_token'); localStorage.removeItem('placementos_user');
    setMessage('You have signed out.');
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark">P</span><span>Placement<span className="brand-light">OS</span></span></a>
      <nav><a href="#opportunities">Opportunities</a><a href="#workflow">How it works</a></nav>
      {user ? <div className="user-chip"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><span>{user.name}<small>{user.role}</small></span><button className="btn btn-quiet" onClick={logout}>Sign out</button></div> : <a className="btn btn-primary" href="#login">Sign in <span>↗</span></a>}
    </header>

    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse"></span> ONE PLATFORM. MANY CAMPUSES.</div>
          <h1>Your next chapter<br />starts <span>right here.</span></h1>
          <p>A smarter placement experience for students, recruiters, and campus teams. Discover opportunities, check eligibility, and manage every step in one place.</p>
          <div className="hero-actions"><a className="btn btn-primary btn-large" href="#opportunities">Explore opportunities <span>↗</span></a><a className="text-link" href="#workflow">See how it works <span>→</span></a></div>
          <div className="trust-row"><div className="avatar-stack"><i>K</i><i>A</i><i>R</i><i>+</i></div><span>Built for campus-to-career journeys</span></div>
        </div>
        <div className="hero-art" aria-label="Placement analytics illustration">
          <div className="orb orb-one"></div><div className="orb orb-two"></div>
          <div className="dashboard-card">
            <div className="dash-head"><div><small>PLACEMENT OVERVIEW</small><h3>Career dashboard</h3></div><span className="live-tag">● LIVE</span></div>
            <div className="metric-row"><div className="metric"><span>Open roles</span><strong>{jobs.length || '—'}</strong><small>Across institutions</small></div><div className="metric"><span>Your status</span><strong>{user ? 'Active' : 'Ready'}</strong><small>Keep moving forward</small></div></div>
            <div className="chart-area"><div className="chart-label"><span>Recruitment activity</span><span>Illustrative</span></div><div className="bars">{[38,57,45,74,59,88,66,96,72,83,61,100].map((h,i)=><span key={i} style={{height:`${h}%`}} />)}</div><div className="chart-axis"><span>WEEK 01</span><span>WEEK 06</span><span>WEEK 12</span></div></div>
            <div className="dash-foot"><span className="checkmark">✓</span><span>One clear path from application to outcome</span></div>
          </div>
          <div className="floating-note"><span className="note-icon">✦</span><span><b>Built for momentum</b><small>Less friction. More opportunity.</small></span></div>
        </div>
      </section>

      <section className="stats-strip"><div><strong>01</strong><span>Unified placement workspace</span></div><div><strong>RBAC</strong><span>Role-based access control</span></div><div><strong>ASYNC</strong><span>Background processing</span></div><div><strong>API</strong><span>Workflow-ready architecture</span></div></section>

      <section className="section" id="opportunities">
        <div className="section-heading"><div><div className="eyebrow">FIND YOUR FIT</div><h2>Opportunities worth<br /><span>showing up for.</span></h2></div><p>Explore open roles, review eligibility requirements, and take your next step with confidence.</p></div>
        {message && <div className="notice" role="status">{message}</div>}
        {!user && <form className="login-card" id="login" onSubmit={login}><div><div className="eyebrow">WELCOME BACK</div><h3>Sign in to PlacementOS</h3><p>Use a seeded demo account or your registered account.</p></div><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label><button className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <span>↗</span></button><small>Demo: student@demo.edu / Password123!</small></form>}
        <div className="job-grid">
          {jobs.map(job=><article className="job-card" key={job.id}><div className="job-card-top"><div className="company-icon">{job.company.slice(0,1).toUpperCase()}</div><span className="open-label"><i></i> OPEN</span></div><div className="company-name">{job.company}</div><h3>{job.title}</h3><p>{job.description}</p><div className="job-meta"><span>◈ Min CGPA {Number(job.min_cgpa).toFixed(1)}</span><span>⌁ {job.eligible_degrees?.join(', ') || 'All degrees'}</span></div><div className="job-bottom"><span className="deadline">Deadline {new Date(job.application_deadline).toLocaleDateString()}</span>{user?.role === 'STUDENT' ? <button className="btn btn-primary" onClick={()=>apply(job)}>Apply <span>↗</span></button> : <span className="institution">{job.institution_name || 'Campus role'}</span>}</div></article>)}
          {jobs.length===0 && <div className="empty-state"><span>✧</span><h3>Good things are on the way.</h3><p>No open roles are available right now. Seed the demo data or check back later.</p></div>}
        </div>
      </section>

      {user?.role === 'STUDENT' && <section className="section application-section"><div className="section-heading"><div><div className="eyebrow">YOUR JOURNEY</div><h2>Application <span>tracker.</span></h2></div><button className="btn btn-outline" onClick={loadApplications}>Refresh status ↻</button></div><div className="application-list">{applications.map(a=><div className="application-row" key={a.id}><div><b>{a.title}</b><small>{a.company} · {new Date(a.created_at).toLocaleDateString()}</small>{a.decision_reason && <small>{a.decision_reason}</small>}</div><span className={`status status-${a.status.toLowerCase()}`}>{a.status}</span></div>)}{applications.length===0&&<p className="muted">Your submitted applications will appear here.</p>}</div></section>}

      <section className="workflow-section" id="workflow"><div className="eyebrow">SIMPLE BY DESIGN</div><h2>From campus to career,<br /><span>without the chaos.</span></h2><div className="workflow-grid"><article><span>01</span><h3>Discover</h3><p>Find opportunities posted for your institution and review the requirements.</p></article><article><span>02</span><h3>Apply</h3><p>Submit once. A background worker checks eligibility and processes your application.</p></article><article><span>03</span><h3>Move forward</h3><p>Follow your application status while placement teams coordinate the recruitment process.</p></article></div></section>
    </main>
    <footer><a className="brand" href="#"><span className="brand-mark">P</span><span>Placement<span className="brand-light">OS</span></span></a><span>Built for better campus hiring.</span><span>React · Node · PostgreSQL · RabbitMQ · Redis</span></footer>
  </div>;
}
