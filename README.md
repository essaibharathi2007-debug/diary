# Cool Diary
Personal diary app: voice unlock ("hi cool"), diary/messages/activities with date-time, photos, profile, search, tags, pin, streaks, dark mode, JSON export.
Stack: Node + Express + MongoDB Atlas (Mongoose) + vanilla JS.

## Local run
1. `npm install`
2. `cp .env.example .env` -> MONGODB_URI (Atlas) & JWT_SECRET fill pannunga
3. `npm start` -> http://localhost:3000 (Chrome use pannunga; mic-ku localhost/HTTPS venum)

## MongoDB Atlas
Cluster create -> Database Access-la user -> Network Access-la 0.0.0.0/0 (or Render IP) allow -> Connect > Drivers > connection string copy.

## Cloudinary
cloudinary.com-la free account -> Dashboard-la Cloud name, API Key, API Secret copy panni `.env`-la podunga.
Photos `cool-diary/<user-id>/` folder-la upload aagum; MongoDB-la URL mattum save aagum. Entry/photo delete pannina Cloudinary-layum delete aagum.

## Deploy (Render / Railway)
GitHub-la push -> New Web Service -> Build: `npm install`, Start: `npm start` -> Env vars: MONGODB_URI, JWT_SECRET, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET. HTTPS automatic, so voice work aagum.
