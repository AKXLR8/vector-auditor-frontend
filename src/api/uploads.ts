import client from "./client";
import type { UploadProgress } from "../types";

export async function getUploadProgress(uploadId: string): Promise<UploadProgress> {
  const { data } = await client.get(`/uploads/${uploadId}`);
  return data;
}
