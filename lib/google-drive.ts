import { google } from "googleapis";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !privateKey) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY not configured");
  }

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

function getDriveClient() {
  return google.drive({ version: "v3", auth: getAuth() });
}

/** Finds a subfolder by exact name under a given parent folder id. */
export async function findSubfolder(parentId: string, name: string): Promise<string | null> {
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
  });
  return res.data.files?.[0]?.id ?? null;
}

/** Lists non-folder files directly inside a folder. */
export async function listFilesInFolder(folderId: string): Promise<DriveFile[]> {
  const drive = getDriveClient();
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageToken,
      pageSize: 100,
    });
    for (const f of res.data.files ?? []) {
      if (f.id && f.name && f.mimeType) files.push({ id: f.id, name: f.name, mimeType: f.mimeType });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

/** Downloads a file's raw bytes (works for PDF/DOCX and other binary formats). */
export async function downloadFileBuffer(fileId: string): Promise<Buffer> {
  const drive = getDriveClient();
  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  return Buffer.from(res.data as ArrayBuffer);
}
