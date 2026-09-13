# UAT matrix — few-society demo

Run after [setup](../README.md). Use **two societies** when checking cross-tenant (resource in society B must **404** for society A staff).

| Module | Checklist | Roles |
|--------|-----------|-------|
| [Auth & society select](auth.md) | Login OTP/password/PIN; select society; suspended blocked | All |
| [Complaints](complaints.md) | Raise, list, status, media | Admin + Resident |
| [Residents](residents.md) | Directory, onboard, invite | Admin |
| [Bills & payments](bills-payments.md) | Generate, UPI proof, credit/reject | Admin + Resident |
| [Notices & notifications](notices.md) | Publish, read, inbox | Admin + Resident |
| [Visitors](visitors.md) | Pre-register, check-in/out | Admin + Resident |
| [Parking & bookings](parking-bookings.md) | Assign lot; request/confirm booking | Admin + Resident |
| [Assets vendors events](assets-vendors-events.md) | CRUD + RSVP | Admin (+ Resident RSVP) |
| [Manage commercial](manage-commercial.md) | Plan, flags, platform bill, support | Super Admin |

**Pass rule:** no “Coming soon” and no “API isn’t live yet” on the demo path.
