# Contributing to Proof of Build

Thank you for your interest in making hackathons fairer!

## How to Contribute

### Reporting Issues
- Use GitHub Issues to report bugs or suggest features
- Include steps to reproduce, expected and actual behavior
- Attach logs, screenshots or transaction signatures where relevant

### Submitting Pull Requests
1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes with clear, conventional commit messages
4. Make sure all checks pass (see below)
5. Open a Pull Request against `main`

### Checks
```bash
npm test                                   # contract: anchor build + 53 bankrun tests
cd backend && npm run typecheck && npm test   # backend: 41 tests
cd frontend && npm run build                  # frontend: typecheck + build
```

### Program changes
- Error codes are append-only: never renumber existing errors, add new ones at the end.
- After changing the program, copy the new IDL from `target/idl/` and `target/types/` into `idl/`, `backend/src/idl/` and `frontend/src/idl/`.
- Keep `Cargo.lock`: it pins crate versions that build with Solana platform-tools.

### Commit Convention
We use [Conventional Commits](https://www.conventionalcommits.org/):
```
feat: add sponsor bounties
fix: count fires by push time
docs: update architecture diagram
test: cover sweep after claim window
```

### Development Setup
See [Quick Start](README.md#quick-start) in the README and the full guide in [docs/setup.ru.md](docs/setup.ru.md).

## Security
Never commit `.env`, `oracle.json`, `*.pem` or keypair files. If you find a vulnerability in the program, please report it privately instead of opening a public issue.

## Code of Conduct
Be respectful and constructive. We're building in public on Solana — let's keep it collaborative.
