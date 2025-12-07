Gym Tracker — Full Stack Web App

A role-based fitness program management system built with React + Node.js + PostgreSQL.
It supports clients, coaches, and super admins, each with tailored dashboards and permissions.

Features
* Authentication
  - Login using email or username
  - JWT token storage with auto-login
  - Deactivated user lockout handling with UI message
* Role-Based Access
  - Client
    - View assigned programs, mark workouts done, give feedback
  - Coach
    - Create programs, assign programs, view feedback, client stats
  - Super Admin
    - Manage users, reset passwords, toggle activation, view audit logs

Core Capabilities
* Assign programs & workouts
* Track workout progress
* Auto-complete program when all workouts are done
* Program feedback system
* Admin user management

Security & Admin Tools
* Users have an active/inactive state
* Login blocked if account is inactive
* Super Admin can:
  - Create users
  - Change roles
  - Activate/Deactivate accounts
  - Reset user passwords
Tech Stack
* Frontend
  - React
  - Axios
  - Bootstraps/Css
  - react-toastify
 
* Backend
  - Node.js
  - Express
  - PostgresSQL + pooling
  - JSON Web Token
  - Bcrpt for hashing
 
Setup Instructions

Backend
Install dependencies:
cd backend
npm install

Create .env:
PORT=5000
JWT_SECRET=your_secret
DATABASE_URL=postgres_connection_string

Start server:
npm start

Frontend
cd frontend
npm install
npm start

App runs at: Localhost 3000

NOTE!
This project is structured for beginner-friendly full-stack learning with clean role separation, real-world admin features, and responsive UI patterns.
