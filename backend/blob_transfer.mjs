import { del, get, put } from "@vercel/blob";
import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const [command, pathname, localPath, extra] = process.argv.slice(2);
if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is missing.");

if (command === "download") {
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) throw new Error("The uploaded video was not found.");
  if (result.blob.size <= 0 || result.blob.size > 45_000_000) throw new Error("Video exceeds the 45 MB limit.");
  await pipeline(Readable.fromWeb(result.stream), createWriteStream(localPath));
} else if (command === "upload") {
  const result = await put(pathname, await readFile(localPath), {
    access: "private", contentType: "video/mp4", addRandomSuffix: false,
  });
  if (!result.pathname) throw new Error("Could not save the finished Short.");
} else if (command === "status") {
  await put(pathname, JSON.stringify(JSON.parse(extra)), {
    access: "private", contentType: "application/json", allowOverwrite: true,
  });
} else if (command === "delete") {
  await del(pathname, { access: "private" });
} else {
  throw new Error("Unknown Blob transfer command.");
}
