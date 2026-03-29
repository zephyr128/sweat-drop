# Legal + Privacy + Terms Compliance Checklist (Mobile)

**Goal:** Ensure SWEATDROP meets practical app store and user trust requirements for pilot launch.

## Required Documents

- Privacy Policy (public HTTPS URL)
- Terms of Service (public HTTPS URL)
- Contact/support email and response SLA

## In-App Surfaces (Must Exist)

- Onboarding auth screen: links to Privacy and Terms.
- Settings/Profile screen: persistent links to Privacy and Terms.
- Account deletion/help path in-app.
- Notification preferences screen (marketing vs operational).

## Store Surfaces (Must Match In-App)

### App Store Connect
- Privacy policy URL
- Support URL
- Data collection disclosures aligned with app behavior

### Google Play Console
- Privacy policy URL
- Data safety form completed and accurate
- Permissions declaration matches runtime usage

## Permission Transparency Checklist

- Camera permission rationale (QR scanning)
- Location permission rationale (check-in verification)
- Bluetooth permission rationale (sensor/machine integration)
- Notification permission rationale (reminders/campaigns)

No blind permission prompt without contextual explanation.

## Data Governance Checklist

- [ ] Collect only data needed for pilot operations.
- [ ] Define retention period for logs and user activity.
- [ ] Define account/data deletion workflow.
- [ ] Ensure no sensitive secret/token is logged client-side.
- [ ] Ensure policy text reflects actual data usage.

## Production Evidence Pack (Attach to Launch Ticket)

- Screenshots of in-app legal links
- Screenshots of store listing legal fields
- Versioned URLs of current policy docs
- QA confirmation that links resolve correctly on device

## Ownership

- Product/Legal owner: policy content
- Mobile owner: in-app placement
- Admin/Web owner: hosted policy pages and support links
- Reviewer: final compliance gate signoff
