import { model, Schema } from "mongoose";
import { USER_ROLES, type UserRole } from "./auth.types.js";

export type AuthAccount = {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
};

const authAccountSchema = new Schema<AuthAccount>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: "user", required: true },
  },
  { timestamps: true, versionKey: false },
);

export const AuthAccountModel = model<AuthAccount>("AuthAccount", authAccountSchema);
