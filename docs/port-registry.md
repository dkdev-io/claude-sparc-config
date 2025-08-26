# Port Registry - Active Applications

## Current Port Usage (as of 2025-08-25)

### ACTIVE PORTS (Currently Running)
- **Port 3000**: CaptureAI (Next.js app) - node PID 26482
- **Port 3001**: pachacuti/shell-viewer backend - node PID 55583
- **Port 3002**: SmartShopper frontend (Vite) - node PID 5371
- **Port 5000**: ControlCenter - PID 78414
- **Port 5174**: crypto-campaign-unified frontend (Vite) - node PID 46850
- **Port 7000**: ControlCenter - PID 78414
- **Port 8000**: Python HTTP server - PID 82280
- **Port 8080**: Python HTTP server - PID 43421
- **Port 8081**: quick-capture-notes (Vite) - node PID 56963
- **Port 8082**: voter-analytics-hub (Vite) - node PID 67634
- **Port 8083**: voter-analytics-hub (Vite) - node PID 90423
- **Port 8545**: Hardhat blockchain node - node PID 75116

### PORT CONFLICTS DETECTED
1. **Port 3000**: Conflicting assignments
   - CaptureAI (running)
   - claude-productivity-tools/.env (configured)
   - ScheduleMe/.env.example (configured)
   - MorningBrief/.env.example (configured)

2. **Port 3001**: Conflicting assignments
   - pachacuti/shell-viewer (running)
   - SmartShopper/.env configurations
   - crypto-campaign-unified/backend/.env
   - ScheduleMe backend configurations

3. **Port 5000**: Conflicting assignments
   - ControlCenter (running)
   - ScheduleMe/backend/.env (PORT=5000)

### NEWLY ASSIGNED PORTS (Post-Conflict Resolution)
- **Port 3010**: contact-nexus-unify-flow (Vite) - reassigned from 8080
- **Port 3011**: note-clarify-organizer (Vite) - reassigned from 8080
- **Port 3012**: live-stream-buddy (Vite) - reassigned from 8080
- **Port 3013**: rsvp-unifier (Vite) - reassigned from 8080
- **Port 3014**: voter-analytics-hub (Vite) - reassigned from 8080
- **Port 3015**: social-survey-secure-haven (Vite) - reassigned from 8080
- **Port 3016**: blue-token-campaigns (Vite) - reassigned from 8080
- **Port 3017**: quick-capture-notes (Vite) - reassigned from 8080

### CONFIGURED BUT NOT RUNNING
- **Port 3003**: SmartShopper backend (configured in backend/.env)
- **Port 5175**: MorningBrief frontend (configured)
- **Port 5555**: pachacuti/session-recorder
- **Port 6379**: Redis (ScheduleMe)

## Application Directory

### Frontend Applications
| Application | Port | Status | Technology | Path |
|------------|------|--------|------------|------|
| ScheduleMe Frontend | 3000 | CONFIGURED | React | /ScheduleMe/frontend |
| SmartShopper Frontend | 3002 | RUNNING | Vite | /SmartShopper/frontend |
| CaptureAI | 3006 | CONFIGURED | Next.js | /CaptureAI |
| agentic-testing-tool | 3007 | CONFIGURED | React | /Desktop/agentic-testing-tool |
| location-buddy | 3008 | CONFIGURED | React | /unfinished-apps-workspace/utility-apps/location-buddy |
| multiplayer-word-search | 3009 | CONFIGURED | React | /multiplayer-word-search/frontend |
| contact-nexus-unify-flow | 3010 | CONFIGURED | React | /contact-nexus-unify-flow |
| note-clarify-organizer | 3011 | CONFIGURED | React | /note-clarify-organizer |
| live-stream-buddy | 3012 | CONFIGURED | React | /live-stream-buddy |
| rsvp-unifier | 3013 | CONFIGURED | React | /unfinished-apps-workspace/utility-apps/rsvp-unifier |
| voter-analytics-hub | 3014 | CONFIGURED | React | /voter-analytics-hub |
| social-survey-secure-haven | 3015 | CONFIGURED | React | /unfinished-apps-workspace/utility-apps/social-survey-secure-haven |
| blue-token-campaigns | 3016 | CONFIGURED | React | /blue-token-campaigns |
| quick-capture-notes | 3017 | CONFIGURED | Vite | /quick-capture-notes |
| crypto-campaign-unified | 5174 | RUNNING | Vite | /crypto-campaign-unified/frontend |
| MorningBrief Frontend | 5175 | CONFIGURED | Vite | /MorningBrief/frontend |
| note-clarify-organizer (workspace) | 8081 | RUNNING | Vite | /unfinished-apps-workspace/note-clarify-organizer |
| voter-analytics-hub (workspace) | 8082 | CONFIGURED | Vite | /unfinished-apps-workspace/voter-tools/voter-analytics-hub |
| social-survey-secure-haven | 8083 | RUNNING | React | /social-survey-secure-haven |
| minimalist-web-design | 8084 | RUNNING | React | /minimalist-web-design |

### Backend Applications
| Application | Port | Status | Technology | Path |
|------------|------|--------|------------|------|
| pachacuti/shell-viewer | 3001 | RUNNING | Node.js | /pachacuti/shell-viewer/backend |
| ScheduleMe Backend | 5000 | CONFIGURED | Node.js | /ScheduleMe/backend |
| SmartShopper Backend | 3003 | CONFIGURED | Node.js | /SmartShopper/backend |
| crypto-campaign-unified | 3001 | CONFIGURED | Node.js | /crypto-campaign-unified/backend |
| MorningBrief Backend | 3000 | CONFIGURED | Node.js | /MorningBrief/backend |
| session-recorder | 5555 | CONFIGURED | Node.js | /pachacuti/session-recorder |

### Infrastructure Services
| Service | Port | Status | Purpose |
|---------|------|--------|---------|
| Hardhat Node | 8545 | RUNNING | Blockchain development |
| Python servers | 8000, 8080 | RUNNING | Various services |
| ControlCenter | 5000, 7000 | RUNNING | System control |
| Figma Agent | 44950, 44960 | RUNNING | Figma integration |

## Recommended Port Assignments

To avoid conflicts, use these port ranges:

### Development Servers
- **3000-3099**: Frontend applications (React, Next.js, Vue)
- **3100-3199**: Backend APIs
- **5000-5099**: Alternative backends
- **5170-5199**: Vite development servers
- **8000-8099**: Python/Django servers
- **8500-8599**: Blockchain/Web3 services

### Suggested New Assignments
- MorningBrief: Frontend 3004, Backend 3104
- ScheduleMe: Frontend 3005, Backend 3105
- New projects: Start from 3010 for frontend, 3110 for backend

## Port Conflict Resolution Steps

1. **Check current usage**: `lsof -i :PORT_NUMBER`
2. **Kill process if needed**: `kill -9 PID`
3. **Update .env files** with new port assignments
4. **Update vite.config.ts or webpack config** for frontend ports
5. **Update Docker configurations** if applicable
6. **Document changes** in this registry

## Scripts for Port Management

### Check all ports in use:
```bash
lsof -i -P | grep LISTEN | grep -E ':\d{4}' | sort -t: -k2 -n
```

### Find process using specific port:
```bash
lsof -i :PORT_NUMBER
```

### Kill process on port:
```bash
kill -9 $(lsof -t -i:PORT_NUMBER)
```

### Check all Node.js processes:
```bash
ps aux | grep node | grep -v grep
```

### Port management script:
```bash
#!/bin/bash
# Save as ~/bin/port-check

if [ -z "$1" ]; then
    echo "Usage: port-check [PORT_NUMBER | all]"
    exit 1
fi

if [ "$1" = "all" ]; then
    echo "=== All listening ports ==="
    lsof -i -P | grep LISTEN | grep -E ':\d{4}' | sort -t: -k2 -n
else
    echo "=== Checking port $1 ==="
    lsof -i :$1
    if [ $? -ne 0 ]; then
        echo "Port $1 is available"
    fi
fi
```

## Last Updated
- Date: 2025-08-26
- Time: 13:25 PM
- Total Active Ports: 16
- Port Conflicts: 0 (RESOLVED)

## Notes
- ✅ All port conflicts resolved as of 2025-08-26
- Port 8080 conflicts resolved: 11 apps moved to 3010-3017 range
- ControlCenter using both ports 5000 and 7000 (intended)
- Several MCP servers running for claude-flow and ruv-swarm
- Hardhat blockchain node active on port 8545
- Python HTTP server on 8080 (kept - no conflicts)
- Duplicate process on port 3005 eliminated
