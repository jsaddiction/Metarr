# Git Workflow Guide

**Purpose**: Consistent development workflow across machines with clear "where am I?" tracking

---

## 🌳 Branch Strategy

### Branch Naming

```
master (production-ready code)
  ├── feature/stage-4-webhooks
  ├── feature/stage-5-kodi
  ├── feature/stage-6-polish
  └── docs/consolidate-roadmap (documentation updates)
```

**Pattern**: `<type>/<stage-number>-<description>`

**Types**:
- `feature/` - New functionality (stages)
- `fix/` - Bug fixes
- `docs/` - Documentation-only changes
- `refactor/` - Code refactoring
- `test/` - Test additions

### Branch Lifecycle

**IMPORTANT**: Feature branches are temporary and MUST be deleted after merging!

```
1. Create branch from master
2. Work on stage (commit frequently)
3. Complete stage (all tasks done)
4. Merge to master
5. Tag completion (git tag stage-X-complete)
6. Push master + tags
7. DELETE the merged branch (local and remote)
8. Create next stage branch
```

**Why Delete Branches?**
- ✅ Keeps `git branch` output clean and focused
- ✅ Prevents confusion about which branch is active
- ✅ Master contains all completed work (branches are redundant)
- ✅ Tags preserve stage completion history
- ✅ Follows industry best practices (feature branch workflow)

---

## 📝 Commit Message Convention

### Format

```
stage-X: <type>: <description>

<optional body>
```

### Types

- `backend:` - Backend code changes (services, controllers, routes)
- `frontend:` - Frontend code changes (components, pages, hooks)
- `db:` - Database schema changes (migrations)
- `docs:` - Documentation updates
- `test:` - Test additions or changes
- `fix:` - Bug fixes
- `refactor:` - Code refactoring (no behavior change)
- `WIP:` - Work in progress (checkpoint commit)

### Examples

```bash
# Good commit messages
git commit -m "stage-4: backend: add webhook receiver endpoints"
git commit -m "stage-4: frontend: add webhook config UI"
git commit -m "stage-4: db: create webhook_events table"
git commit -m "stage-4: docs: update WEBHOOKS.md with payload examples"
git commit -m "stage-4: test: add webhook validation tests"
git commit -m "stage-4: WIP: halfway through webhook processing logic"

# Short-form for small changes
git commit -m "stage-4: fix webhook URL validation"
git commit -m "stage-4: refactor webhook handler to use service layer"
```

### Why This Pattern?

- Easy to filter: `git log --oneline --grep="stage-4"`
- Clear ownership: Each stage is isolated in git history
- Machine switching: See exactly what was done in last session
- Documentation: Can track which docs were updated per stage

---

## 🔄 Development Workflow

### Starting a New Stage

```bash
# 1. Ensure you're on master with latest changes
git checkout master
git pull origin master

# 2. Check current status
cat docs/PROJECT_ROADMAP.md | head -20

# 3. Create stage branch
git checkout -b feature/stage-X-name

# 4. Update PROJECT_ROADMAP.md to reflect current work
nano docs/PROJECT_ROADMAP.md
# Update "Current Stage" section

# 5. Commit the start
git add docs/PROJECT_ROADMAP.md
git commit -m "stage-X: docs: start stage X work"
git push origin feature/stage-X-name

# 6. Begin implementation
```

### During Stage Work

```bash
# Commit frequently (every logical change)
git add <files>
git commit -m "stage-X: backend: implement feature Y"

# Push regularly (backup + sync between machines)
git push origin feature/stage-X-name

# Checkpoint commits (end of work session, mid-feature)
git add .
git commit -m "stage-X: WIP: completed webhook receiver, need to add validation"
git push origin feature/stage-X-name
```

### Completing a Stage

```bash
# 1. Verify all stage tasks complete
cat docs/STAGE_DEFINITIONS.md | grep -A 20 "Stage X"

# 2. Update documentation
# - Mark stage complete in PROJECT_ROADMAP.md
# - Update STAGE_DEFINITIONS.md if needed
# - Update technical docs if architecture changed

# 3. Commit documentation
git add docs/
git commit -m "stage-X: docs: mark stage X as complete"

# 4. Push feature branch one final time
git push origin feature/stage-X-name

# 5. Merge to master
git checkout master
git pull origin master  # Get any changes from other work
git merge feature/stage-X-name

# 6. Resolve conflicts if any
# (Usually none if working linearly through stages)

# 7. Tag the completion
git tag stage-X-complete
git tag -l | tail -5  # Verify tag created

# 8. Push master and tags
git push origin master
git push origin --tags

# 9. DELETE the merged branch (IMPORTANT!)
git branch -d feature/stage-X-name              # Delete local branch
git push origin --delete feature/stage-X-name   # Delete remote branch

# 10. Verify branch is gone
git branch -a  # Should only show master locally

# 11. Create next stage branch
git checkout -b feature/stage-Y-name
```

### Switching Machines Mid-Stage

```bash
# On Machine A (before stopping work)
git add .
git commit -m "stage-X: WIP: current state description"
git push origin feature/stage-X-name

# On Machine B (resuming work)
cd /home/justin/Code/Metarr
git checkout master
git pull origin master
git checkout feature/stage-X-name
git pull origin feature/stage-X-name

# Read status to understand where you left off
cat docs/PROJECT_ROADMAP.md
git log --oneline -10

# Continue work
```

---

## 🏷️ Tagging Strategy

### Stage Completion Tags

**Format**: `stage-X-complete`

**Examples**:
- `stage-0-complete` - Planning & git workflow
- `stage-1-complete` - Monitored system
- `stage-2-complete` - Lock system
- `stage-3-complete` - Asset candidate caching

### Purpose

- Quick reference: "What stages are done?" → `git tag -l`
- Time travel: "Show me code at stage 2 completion" → `git checkout stage-2-complete`
- Documentation: Links in docs reference specific tags
- Progress tracking: Count tags = stages completed

### Creating Tags

```bash
# After merging stage to master
git tag stage-X-complete
git push origin stage-X-complete

# Or push all tags at once
git push origin --tags
```

### Viewing Tags

```bash
# List all tags
git tag -l

# List stage tags only
git tag -l "stage-*"

# Show tag details
git show stage-3-complete
```

---

## ⚠️ Critical Rules for Claude (AI Assistant)

### What Claude MUST NOT Do

**NEVER run these commands**:
```bash
npm run dev              # Starting backend server
npm run dev:frontend     # Starting frontend server
npm run dev:all          # Starting both servers
npm start                # Starting production server
pkill node               # Killing Node processes
killall node             # Killing Node processes
```

**Why**:
- You (the human) control all server processes
- Killing Node processes kills Claude's context
- Multiple concurrent servers cause confusion when troubleshooting

### What Claude CAN Do

**Safe operations**:
```bash
git status               # Check git status
git log                  # View git history
git diff                 # View changes
npm run build            # Build project
npm run typecheck        # Type checking
npm run lint             # Linting
npm test                 # Run tests
cat <file>               # Read files
grep <pattern> <file>    # Search files
```

### Server Management Protocol

**If code changes require server restart**:
```
Claude: "These changes require restarting the backend server.
         Please stop and restart: npm run dev:backend"

Human: [Restarts server in terminal]

Claude: [Continues with next task]
```

**If troubleshooting server issues**:
```
Claude: "Can you check the server logs?"
        "Is the backend server running?"
        "What port is the frontend running on?"

Human: [Provides information]

Claude: [Diagnoses issue without killing processes]
```

---

## 📋 Common Git Operations

### Viewing Project State

```bash
# What branch am I on?
git branch

# What's my current status?
git status

# What stages are complete?
git tag -l "stage-*"

# What was done recently?
git log --oneline --graph -20

# What changed in this stage?
git log --oneline --grep="stage-4"
```

### Undoing Mistakes

```bash
# Undo last commit (keep changes)
git reset --soft HEAD~1

# Discard all uncommitted changes
git reset --hard HEAD

# Discard changes to specific file
git checkout -- <file>

# Undo merge (not pushed yet)
git reset --merge ORIG_HEAD
```

### Syncing Between Machines

```bash
# Machine A: Save work
git add .
git commit -m "stage-X: WIP: progress update"
git push origin feature/stage-X-name

# Machine B: Get latest
git fetch origin
git checkout feature/stage-X-name
git pull origin feature/stage-X-name

# Verify sync
git log --oneline -5
```

### Cleaning Up Branches (REQUIRED After Every Merge!)

**IMPORTANT**: Always delete feature branches immediately after merging to master!

```bash
# After merging stage to master, ALWAYS do this:

# 1. Delete local branch
git branch -d feature/stage-X-name

# 2. Delete remote branch
git push origin --delete feature/stage-X-name

# 3. Prune deleted remote branch references
git fetch --prune

# 4. Verify cleanup
git branch -a  # Should only show master locally
```

**Why This Matters**:
- Keeps repository clean and focused
- Prevents confusion about which branches are active
- Master + tags contain all history (branches are redundant)
- Standard industry practice for feature branch workflow

---

## 🔍 Troubleshooting

### "I don't know what stage I'm on"

```bash
# Check current branch
git branch

# Read roadmap
cat docs/PROJECT_ROADMAP.md | head -10

# Check recent commits
git log --oneline -10
```

### "I forgot to create a stage branch"

```bash
# Create branch from current state
git checkout -b feature/stage-X-name

# Push to remote
git push origin feature/stage-X-name
```

### "I committed to master instead of feature branch"

```bash
# Move commits to new branch
git branch feature/stage-X-name
git reset --hard origin/master
git checkout feature/stage-X-name
```

### "Merge conflict when merging stage to master"

```bash
# View conflicts
git status

# Edit conflicting files
nano <file>

# Mark resolved
git add <file>
git commit -m "stage-X: resolve merge conflicts"

# Continue merge
git merge --continue
```

### "I have too many old branches cluttering my repo"

```bash
# List all branches
git branch -a

# Delete multiple local branches at once
git branch -D branch1 branch2 branch3

# Delete remote branches (WARNING: only delete merged branches!)
git push origin --delete branch1 branch2 branch3

# Prune tracking references to deleted remote branches
git fetch --prune

# Verify cleanup
git branch -a  # Should only show master and current stage branch
```

**Best Practice**: After merging each stage to master, immediately delete the feature branch (both local and remote). This prevents branch clutter and keeps your workflow clean.

---

## 📚 Related Documentation

- [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md) - Current stage and progress
- [STAGE_DEFINITIONS.md](STAGE_DEFINITIONS.md) - Detailed stage plans
- [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) - Why we made specific choices

---

## 🎯 Quick Reference

### Daily Workflow

```bash
# Start of day
git checkout master && git pull
git checkout feature/stage-X-name && git pull
cat docs/PROJECT_ROADMAP.md | head -20

# During work
git add . && git commit -m "stage-X: <message>"
git push

# End of day
git add . && git commit -m "stage-X: WIP: <state>"
git push
```

### Stage Completion

```bash
# Update docs, merge, tag, DELETE branch
git add docs/ && git commit -m "stage-X: docs: mark complete"
git push origin feature/stage-X-name
git checkout master && git merge feature/stage-X-name
git tag stage-X-complete && git push origin master --tags
git branch -d feature/stage-X-name
git push origin --delete feature/stage-X-name
git checkout -b feature/stage-Y-name
```

---

**Remember**: Git is your safety net. Commit early, commit often, push regularly!
