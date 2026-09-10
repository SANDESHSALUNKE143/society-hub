export const env = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl:
    process.env.DATABASE_URL ??
    "mysql://root:1900Summer%40@127.0.0.1:3306/societyhub",
  jwtSecret:
    process.env.JWT_SECRET ?? "dev-change-me-society-hub-jwt-secret-32chars",
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
  // Live getters so integration tests can set GOOGLE_* for one case.
  get googleClientId() {
    return process.env.GOOGLE_CLIENT_ID ?? "";
  },
  get googleTokeninfoUrl() {
    return process.env.GOOGLE_TOKENINFO_URL ?? "https://oauth2.googleapis.com/tokeninfo";
  },
};
