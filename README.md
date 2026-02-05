# Collaborative Sudoku

A real-time collaborative Sudoku web app where players join with an x.com-style profile and solve the same puzzle together.

## Features

- Create a game with a configurable **maximum player count** (2-8).
- Unique game link per instance for sharing.
- Social-style sign-in flow labeled **Login with X** with profile image support.
- Real-time board synchronization via Server-Sent Events.
- Cell edit locks while a player is picking a number.
- Circular 1-9 number picker with hover growth/push-out animation.
- Any player can reset editable cells.
- Placed numbers are color-coded by player.
- Player avatar frames are tinted to match player color.
- Win summary showing how many numbers each player entered.

## Run

```bash
npm start
```

Open `http://localhost:3000`.
