# Calendar service tests

Run from the backend directory:

```sh
npm run test:unit -- --runInBand test/calender-service
npx jest --config test/calender-service/jest-e2e.json --runInBand
```

The directory spelling matches `apps/calender-service`.

Unit tests cover OAuth state, encrypted token storage and reconnects, event payloads, date constraints, provider error mapping, and disconnect cleanup. Encryption tests check random IVs, round trips, tamper detection, and invalid keys.

The HTTP E2E suite boots `CalendarModule` and uses its real controller, authentication guard, validation pipe, service, JWT signing, and encryption. It exercises the complete connect → callback → status → event CRUD → disconnect lifecycle, plus authentication failures, user isolation, invalid requests, expired state, and provider failures.

Google Calendar and auth-service calls are mocked; the connection repository uses an in-memory fake and Prisma is disabled. No credentials, network services, or database are required. These tests do not verify live Google consent, database persistence, or API gateway routing. The dedicated E2E config intentionally avoids the repository-wide setup that requires `DATABASE_URL_TEST`.
