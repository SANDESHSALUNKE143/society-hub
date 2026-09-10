export type LegalPageId = "home" | "privacy" | "terms";

export const LEGAL_COPY: Record<LegalPageId, { title: string; body: string[] }> =
  {
    home: {
      title: "SocietyHub",
      body: [
        "SocietyHub helps housing societies raise and track complaints in one place.",
        "Residents sign in with mobile OTP, Google, email, or a PIN after they are onboarded by a society admin.",
        "Use Privacy Policy and Terms below when Google OAuth or the Play Store asks for public links.",
      ],
    },
    privacy: {
      title: "Privacy Policy",
      body: [
        "SocietyHub is operated for housing-society operations. This policy describes data the Client App, Manage portal, and native Android app collect when you use the service.",
        "Account data: we store your name, mobile number, email, Google account identifier (when you use Google Sign-In), society and flat membership, and a hashed PIN if you set one. Society admins onboard residents; you cannot create an account without that step.",
        "Authentication: we send a one-time OTP to your mobile number (MSG91). Google Sign-In sends an ID token to our API so we can match an onboarded email. Session tokens are stored on the device in secure storage (Android Keystore / iOS Keychain), not in plaintext preferences.",
        "Complaints: title, type, description, status, and optional photo or video attachments you upload. Media is stored so your society committee can review and resolve the complaint.",
        "We do not sell personal data. We use data to operate login, tenancy, and complaint tracking. Hosting and processors (database, file storage, SMS, Google) receive only what those features need.",
        "To correct or remove your account, ask a society admin. Platform operators can complete deletion after that request. Contact the support email published with the society or on the product domain.",
        "This policy applies to the web Client App and the SocietyHub Android app. Last updated August 2026.",
      ],
    },
    terms: {
      title: "Terms of Service",
      body: [
        "SocietyHub is provided for onboarded residents and society staff of a participating housing society.",
        "You must use only the identity (phone, email, or Google account) that your society admin linked to your flat. Do not share OTP codes, PIN, or login sessions.",
        "Complaint content and attachments must be accurate and lawful. Do not upload others’ personal documents or media without a legitimate society purpose.",
        "The service may be unavailable during maintenance or hosting limits. SocietyHub is not a substitute for emergency services.",
        "Society admins control onboarding and complaint status. SocietyHub platform staff operate the hosted software and may access logs to keep the system secure.",
        "These terms apply to the web apps and the SocietyHub Android app. Last updated August 2026.",
      ],
    },
  };
