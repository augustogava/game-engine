# SimFlightPro - Player Guide

---

## Controls

### Keyboard (Desktop)

| Key | Action |
|-----|--------|
| **W** | Increase throttle |
| **S** | Decrease throttle |
| **Arrow Up** | Pitch down (nose down) |
| **Arrow Down** | Pitch up (nose up) |
| **Arrow Left** | Roll left |
| **Arrow Right** | Roll right |
| **Q** | Yaw left (rudder left) |
| **E** | Yaw right (rudder right) |
| **5** | Decrease flaps (one step) |
| **6** | Increase flaps (one step) |
| **R** | Reset / Respawn aircraft |

The camera follows the aircraft automatically. You can use the mouse to orbit the camera around the plane (click and drag).

### Flap Settings

Flaps have 6 positions. Use keys **5** and **6** to step through them:

| Position | Degrees | Typical Use |
|----------|---------|-------------|
| 0 | 0 (OFF) | Cruise flight |
| 1 | 5 | High speed descent |
| 2 | 15 | Default / approach |
| 3 | 25 | Final approach |
| 4 | 30 | Short final |
| 5 | 40 | Landing |

### Mobile / Touch Controls

On mobile devices, touch controls appear automatically:

- **Virtual Joystick** -- Touch and drag anywhere on the screen to control pitch and roll. The joystick appears where you touch.
  - Drag **up/down** to pitch
  - Drag **left/right** to roll
  - Release to center (inputs return to neutral)

- **Throttle Slider** -- Located on the bottom-left side. Drag up to increase power, drag down to decrease. The green fill shows current throttle level.

- **Flap Buttons** -- Two buttons above the throttle slider:
  - **F+** increases flaps one step
  - **F-** decreases flaps one step

### HUD Indicators

The flight display shows the following information:

| Indicator | Location | Description |
|-----------|----------|-------------|
| Speed (kts) | Left panel | Current airspeed in knots |
| Altitude (ft) | Right panel | Current altitude in feet |
| Throttle bar | Below speed | Green bar showing throttle percentage |
| Flap setting | Below throttle | Current flap angle or OFF |
| Attitude | Center | GROUND / CLIMB / DESC / LEVEL |
| Vertical speed | Right side | Climb or descent rate |
| Stall warning | Center | Red warning when speed is too low |
| FPS counter | Top area | Current frame rate |
| GPS minimap | Top-left corner | Satellite map with heading indicator |
| Coordinates | On minimap | Current latitude and longitude |
| UTC clock | Top area | Current UTC time and date |

---

## Points System

You earn points by flying and completing missions. Points contribute to your pilot profile and are displayed on your Dashboard and Flight Stats pages.

### How to Earn Points

| Source | How it works | Example |
|--------|-------------|---------|
| Distance flown | 1 point for every 10 km flown on a landed flight | A 250 km flight earns 25 points |
| Missions | Each mission has a fixed reward shown before you start | A challenge mission may reward 500 points |

- Points from distance and missions stack together.
- Only **landed** flights count. Cancelled or crashed flights do not earn distance points.
- Mission reward points are only granted when the mission status is **completed**.

### Points Breakdown

Your total points are calculated as:

```
Total Points = Distance Points + Mission Points

Distance Points = floor(total_distance_km * 0.1)
Mission Points  = sum of reward_points from all completed missions
```

---

## Pilot Ranks

Your rank progresses automatically based on your total flight hours and completed missions. Ranks are updated after every successful landing.

| Rank | Required Flight Hours | Required Missions Completed |
|------|----------------------|----------------------------|
| Student | 0 | 0 |
| Private Pilot | 10 | 2 |
| Commercial Pilot | 50 | 10 |
| Airline Pilot | 200 | 25 |
| Captain | 500 | 50 |
| Senior Captain | 1,000 | 100 |

Both conditions must be met to reach a rank. For example, to become a Commercial Pilot you need at least 50 flight hours **and** 10 completed missions.

---

## Missions

Missions are structured flights with specific goals. They range from beginner to expert difficulty.

### Mission Types

| Type | Description |
|------|-------------|
| Free Flight | Fly freely with no specific destination |
| Scheduled | Fly a defined route between two airports |
| Challenge | Complete a flight under specific constraints (altitude, aircraft, etc.) |
| Milestone | Achievement-based missions unlocked by reaching career goals |

### Mission Difficulty

- **Beginner** -- Short routes, no special requirements
- **Intermediate** -- Longer routes, may require specific aircraft
- **Advanced** -- Complex routes with altitude or timing constraints
- **Expert** -- Long-haul flights with strict requirements

### Mission Flow

1. Browse available missions from the Missions page
2. Select a mission and click **Start Mission**
3. The mission status becomes **Started**
4. Take off from the departure airport -- status changes to **In Progress**
5. Fly the route following the mission constraints
6. Land at the destination airport:
   - **Correct airport** -- mission is automatically **Completed** and you receive the reward points
   - **Wrong airport** -- mission is **Failed**
7. If you disconnect or crash, the mission is **Failed**

You can retry a failed mission at any time.

---

## Flight Logs

Every flight session is automatically recorded from the moment you connect.

### What Gets Tracked

- Departure and arrival airports (detected automatically)
- Flight duration
- Distance flown (km and nautical miles)
- Maximum altitude reached
- Average speed
- Landing rate (vertical speed at touchdown, in feet per minute)
- Route path (GPS coordinates sampled every 10 seconds)
- Aircraft type

### Flight Status

| Status | Meaning |
|--------|---------|
| Departed | You started a flight but haven't taken off yet |
| In Flight | You are airborne |
| Landed | You touched down successfully |
| Cancelled | You disconnected before landing |

### Viewing Your Logs

- **Recent Flights** shows your last 10 flights
- **Flight History** shows all flights with pagination

---

## Flight Stats

Your pilot statistics are recalculated after every successful landing.

### Stats Tracked

| Stat | Description |
|------|-------------|
| Total Flights | Number of successfully landed flights |
| Total Flight Hours | Accumulated time in the air |
| Total Distance | Kilometers and nautical miles flown |
| Missions Completed | Number of missions finished successfully |
| Missions Failed | Number of missions that were failed |
| Total Reward Points | Combined points from distance and missions |
| Best Landing Rate | Your softest landing (closest to 0 fpm) |
| Average Landing Rate | Average vertical speed at touchdown |
| Favorite Airport | Airport you depart from most often |
| Most Used Aircraft | Aircraft type you fly most frequently |
| Pilot Rank | Your current rank (see Pilot Ranks above) |

### Leaderboard

The leaderboard ranks the top 20 pilots by total flight hours. Keep flying to climb the ranks.

---

## Marketplace

The marketplace lets you acquire aircraft and airports.

### Listing Types

| Type | Description |
|------|-------------|
| Airport | Acquire ownership of an airport |
| Aircraft | Acquire an aircraft for your hangar |
| License | Acquire a special license or certification |

### How to Acquire

1. Browse the marketplace listings
2. Select an item and click **Acquire**
3. The item is added to your inventory
4. For airports, ownership is automatically registered

### Viewing Your Inventory

- **My Purchases** shows all items you have acquired
- **My Airports** shows airports you own, with details like ICAO code and location

---

## Multiplayer

When you fly, your position is shared with other pilots in real time. You can see other players on the map and in the 3D world.

### What Other Pilots See

- Your position (latitude, longitude, altitude)
- Your heading and speed
- Your aircraft type
- Your pitch and roll attitude

---

## Tips

- Land at airports to get your flights recorded properly -- distance points only count for landed flights
- Complete missions to earn bonus points and progress your rank faster
- Check the leaderboard to see how you compare with other pilots
- Your stats update automatically after every landing -- no action needed
