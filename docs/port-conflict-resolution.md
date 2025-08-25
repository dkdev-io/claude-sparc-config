# Port Conflict Resolution Plan

## Current Conflicts

### 1. Port 3000 Conflict
**Currently Running:** CaptureAI (Next.js)
**Also Configured In:**
- claude-productivity-tools/.env
- ScheduleMe/.env.example
- MorningBrief/.env.example

**Resolution:**
- Keep CaptureAI on 3000 (already running)
- Update claude-productivity-tools to use port 3004
- Update ScheduleMe frontend to use port 3005
- Update MorningBrief frontend to use port 3006

### 2. Port 3001 Conflict
**Currently Running:** pachacuti/shell-viewer backend
**Also Configured In:**
- SmartShopper backend configs
- crypto-campaign-unified/backend/.env
- ScheduleMe backend configs

**Resolution:**
- Keep pachacuti/shell-viewer on 3001 (already running)
- Update SmartShopper backend to use port 3101
- Update crypto-campaign-unified backend to use port 3102
- Update ScheduleMe backend to use port 3103

### 3. Port 5000 Conflict
**Currently Running:** ControlCenter
**Also Configured In:**
- ScheduleMe/backend/.env

**Resolution:**
- Keep ControlCenter on 5000 (system service)
- ScheduleMe backend already configured for 3103 (see above)

## Implementation Steps

### Step 1: Update Environment Files
```bash
# Update claude-productivity-tools
sed -i '' 's/PORT=3000/PORT=3004/' claude-productivity-tools/.env

# Update ScheduleMe
sed -i '' 's/PORT=3000/PORT=3005/' ScheduleMe/.env.example
sed -i '' 's/PORT=3001/PORT=3103/' ScheduleMe/backend/.env
sed -i '' 's/PORT=5000/PORT=3103/' ScheduleMe/backend/.env

# Update MorningBrief
sed -i '' 's/PORT=3000/PORT=3006/' MorningBrief/.env.example
sed -i '' 's/VITE_DEV_SERVER_PORT=3000/VITE_DEV_SERVER_PORT=3006/' MorningBrief/frontend/.env

# Update SmartShopper
sed -i '' 's/PORT=3001/PORT=3101/' SmartShopper/backend/.env
sed -i '' 's/VITE_API_URL=http:\/\/localhost:3001/VITE_API_URL=http:\/\/localhost:3101/' SmartShopper/frontend/.env

# Update crypto-campaign-unified
sed -i '' 's/PORT=3001/PORT=3102/' crypto-campaign-unified/backend/.env
```

### Step 2: Update Configuration Files
- Update vite.config.ts files for frontend ports
- Update package.json scripts if they hardcode ports
- Update any Docker or docker-compose files

### Step 3: Restart Services
```bash
# After updating configurations, restart affected services
# Only restart services that are not currently running correctly
```

## New Port Allocation Table

| Application | Frontend Port | Backend Port | Status |
|------------|--------------|--------------|--------|
| CaptureAI | 3000 | - | Running |
| SmartShopper | 3002 | 3101 | Frontend Running |
| crypto-campaign-unified | 5174 | 3102 | Frontend Running |
| claude-productivity-tools | 3004 | - | Configured |
| ScheduleMe | 3005 | 3103 | Configured |
| MorningBrief | 3006 | 3104 | Configured |
| pachacuti/shell-viewer | - | 3001 | Running |
| quick-capture-notes | 8081 | - | Running |
| voter-analytics-hub | 8082, 8083 | - | Running |

## Verification Commands

```bash
# Check if ports are available before starting services
~/bin/port-check 3004  # claude-productivity-tools
~/bin/port-check 3005  # ScheduleMe frontend
~/bin/port-check 3006  # MorningBrief frontend
~/bin/port-check 3101  # SmartShopper backend
~/bin/port-check 3102  # crypto-campaign backend
~/bin/port-check 3103  # ScheduleMe backend
~/bin/port-check 3104  # MorningBrief backend
```

## Monitoring Script

```bash
#!/bin/bash
# Save as ~/bin/port-monitor

echo "=== Port Status Monitor ==="
echo ""
echo "Core Services:"
~/bin/port-check 3000 | tail -1
~/bin/port-check 3001 | tail -1
~/bin/port-check 5000 | tail -1
echo ""
echo "Frontend Apps:"
for port in 3002 3004 3005 3006 5174 8081 8082 8083; do
    ~/bin/port-check $port | tail -1
done
echo ""
echo "Backend APIs:"
for port in 3101 3102 3103 3104; do
    ~/bin/port-check $port | tail -1
done
```

## Last Updated
- Date: 2025-08-25
- Time: 12:07 PM
- Status: Plan Created, Ready for Implementation