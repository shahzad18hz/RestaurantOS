import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getSessionUser } from "@/lib/auth";

const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
const purposes = new Set(["avatar", "restaurant-logo", "restaurant-cover"]);

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const purpose = formData.get("purpose");
    if (!(file instanceof File) || typeof purpose !== "string" || !purposes.has(purpose)) return NextResponse.json({ success: false, message: "A valid image and purpose are required." }, { status: 400 });
    if (!allowed.has(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) return NextResponse.json({ success: false, message: "Only JPEG, PNG, or WebP images up to 5 MB are allowed." }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const validSignature = (file.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) || (file.type === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) || (file.type === "image/webp" && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP");
    if (!validSignature) return NextResponse.json({ success: false, message: "The uploaded file is not a valid image." }, { status: 400 });
    const uploadDir = path.resolve(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const fileName = `${crypto.randomUUID()}.${extension}`;
    const target = path.resolve(uploadDir, fileName);
    if (!target.startsWith(`${uploadDir}${path.sep}`)) return NextResponse.json({ success: false, message: "Invalid upload path." }, { status: 400 });
    await fs.writeFile(target, bytes, { flag: "wx" });
    return NextResponse.json({ success: true, url: `/uploads/${fileName}`, purpose });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Upload failed." }, { status: 500 });
  }
}
