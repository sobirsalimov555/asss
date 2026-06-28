# AS Academy

> **Open-source, non-profit SAT prep for students worldwide.**

AS Academy is a free, full-length SAT practice platform built with TanStack Start and Supabase. It offers timed mock tests, a topic-based question bank, study resources, and a leaderboard — all at no cost.

**Live site:** [asacademy.xyz](https://asacademy.xyz)

## Features

- **Full-length mock tests** — Timed SAT mocks with official module timing (32/32/35/35 minutes), auto-scored with section and total SAT scores
- **Question bank** — Browse and practice individual questions by subject, topic, and difficulty
- **Leaderboard** — Track your average SAT score across mocks
- **Study resources** — Curated notes and links for SAT prep
- **Admin console** — Manage questions, mocks, and resources (admin role required)

## Tech stack

- **Framework:** [TanStack Start](https://tanstack.com/start) (React + SSR + file-based routing)
- **Database:** [Supabase](https://supabase.com) (PostgreSQL + RLS + Auth + Storage)
- **Deployment:** Vercel (via Build Output API / Nitro preset)

## Project structure

```
src/
  routes/          — TanStack Start file-based routes
  components/      — Shared UI components
  hooks/           — Custom React hooks (useAuth, etc.)
  integrations/    — Supabase client and types
  styles.css       — Global styles, fonts, animations
  lib/             — Utilities
supabase/
  migrations/      — Database schema migrations
  seed.sql         — Seed script for questions, mocks, admin role
```

## License

This project is open source and provided for educational purposes. Built with the goal of making high-quality SAT preparation accessible to everyone, everywhere.
