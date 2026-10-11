# Manual Test Checklist

Use this checklist after starting the app locally. These are manual checks, not automated test results.

- [ ] `GET /health` returns `{"status":"ok","service":"placementos-api"}`.
- [ ] Seed script completes without error.
- [ ] Student can sign in using the demo account.
- [ ] Open jobs appear on the home page.
- [ ] Student can submit an application.
- [ ] Application initially appears as `PENDING`, then changes after the worker processes it.
- [ ] A repeated application for the same job does not create a second row.
- [ ] A request without a token to a protected endpoint returns `401`.
- [ ] A student trying to create a job receives `403`.
- [ ] Stop RabbitMQ and observe how the API handles an application submission; restart it afterward.
