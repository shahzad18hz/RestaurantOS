import jwt, { type SignOptions } from "jsonwebtoken";

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret?.trim()) throw new Error("JWT_SECRET is missing. Set it in .env and restart the server.");
  return secret;
}


export function createToken(payload: object, expiresIn: SignOptions["expiresIn"] = "7d") {
  return jwt.sign(
    payload,
    jwtSecret(),
    {
      expiresIn,
    }
  );
}


export function verifyToken(token: string) {
  return jwt.verify(
    token,
    jwtSecret()
  );
}
