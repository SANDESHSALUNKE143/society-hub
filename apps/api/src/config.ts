export const env = {
  port: Number(process.env.PORT ?? 3000),
  get databaseUrl() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("DATABASE_URL is required in production");
      }
      return "mysql://root:1900Summer%40@127.0.0.1:3306/societyhub";
    }
    return url;
  },
  get jwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("JWT_SECRET is required in production");
      }
      return "dev-change-me-society-hub-jwt-secret-32chars";
    }
    return secret;
  },
  isProduction: process.env.NODE_ENV === "production",
  corsOrigin: (
    process.env.CORS_ORIGIN ??
    [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://app.localhost:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
      "http://manage.localhost:5174",
    ].join(",")
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  publicApiUrl: process.env.PUBLIC_API_URL ?? "http://localhost:3000",
  devAuth: process.env.DEV_AUTH === "true",
  devOtpCode: process.env.DEV_OTP_CODE ?? "123456",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  // Live getters so integration tests can set GOOGLE_* for one case.
  get googleClientId() {
    return process.env.GOOGLE_CLIENT_ID ?? "";
  },
  get googleTokeninfoUrl() {
    return process.env.GOOGLE_TOKENINFO_URL ?? "https://oauth2.googleapis.com/tokeninfo";
  },
};
