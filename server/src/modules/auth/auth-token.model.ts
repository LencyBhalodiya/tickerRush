import { model, Schema, type Types } from "mongoose";

export const AUTH_TOKEN_TYPES = ["refresh", "password_reset", "email_verification"] as const;
export type AuthTokenType = (typeof AUTH_TOKEN_TYPES)[number];

export type AuthToken = {
  tokenHash: string;
  userId: Types.ObjectId;
  type: AuthTokenType;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent?: string;
  ipAddress?: string;
};

const authTokenSchema = new Schema<AuthToken>(
  {
    tokenHash: { type: String, required: true, unique: true, select: false },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "AuthAccount",
      required: true,
      index: true,
    },
    type: { type: String, enum: AUTH_TOKEN_TYPES, required: true, index: true },
    // `expires: 0` creates a TTL index; expiry is also checked in application logic.
    expiresAt: { type: Date, required: true, expires: 0 },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, maxlength: 512 },
    ipAddress: { type: String, maxlength: 45 },
  },
  { timestamps: true, versionKey: false },
);

authTokenSchema.index({ userId: 1, type: 1 });

export const AuthTokenModel = model<AuthToken>("AuthToken", authTokenSchema);
