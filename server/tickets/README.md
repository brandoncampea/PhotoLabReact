# Ticketing System API

- POST `/api/tickets/` — Create ticket
- GET `/api/tickets?studioId=...` — List tickets for studio
- GET `/api/tickets?escalated=true` — List escalated tickets (super admin)
- GET `/api/tickets/:id` — Get ticket details
- POST `/api/tickets/:id/comment` — Add comment
- PATCH `/api/tickets/:id` — Update status, escalate, assign

Add `server/tickets/routes.js` to your Express app:

```js
const ticketRoutes = require('./tickets/routes');
app.use('/api/tickets', ticketRoutes);
```
