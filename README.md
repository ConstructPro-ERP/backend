# ConstructPro ERP - Backend

## Project Description

This repository contains the server-side code (API, business logic, data access layer) for the **ConstructPro ERP** system, a cloud-based enterprise resource planning platform designed for Ishara Homes Pvt. Ltd. The system manages the complete lead-to-project lifecycle, including sales, project tracking, financial monitoring, and AI-based predictive analytics.

**Broader Project:** [ConstructPro ERP Organization](https://github.com/ConstructPro-ERP)

## Prerequisites

- Node.js 22+
- PostgreSQL (or Neon DB credentials)
- Environment Variables (see `.env.example`)

## Installation & Run Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ConstructPro-ERP/backend.git
   cd backend
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Set up environment variables:**
   Copy `.env.example` to `.env` and configure your database and authentication keys.
   ```bash
   cp .env.example .env
   ```
4. **Run the application (Development):**
   ```bash
   npm run start:dev
   ```

## Deployed Application

[ConstructPro ERP Backend (Staging)](https://api.staging.constructpro.com)
